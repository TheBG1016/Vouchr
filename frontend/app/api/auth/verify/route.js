import { SiweMessage } from "siwe";
import { ADMIN_ADDRESS, CHAIN_ID } from "../../../../lib/config";
import { db, limitRequest } from "../../../../lib/db";
import { api, assertOrigin, HttpError, jsonBody, noStoreJson } from "../../../../lib/http";
import { createSession } from "../../../../lib/session";
import { requirePublicKey, requireSealedKey } from "../../../../lib/validation";

export const runtime = "nodejs";

export const POST = api(async request => {
  assertOrigin(request);
  const body = await jsonBody(request);
  if (typeof body.message !== "string" || body.message.length > 2048 ||
      typeof body.signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(body.signature) ||
      !["signup", "login"].includes(body.intent)) {
    throw new HttpError(400, "Invalid sign-in request");
  }
  let parsed;
  try { parsed = new SiweMessage(body.message); }
  catch { throw new HttpError(400, "Invalid sign-in message"); }
  const address = parsed.address.toLowerCase();
  const origin = new URL(request.url).origin;
  if (parsed.chainId !== CHAIN_ID || parsed.uri !== origin ||
      parsed.domain !== new URL(origin).host) {
    throw new HttpError(400, "Sign-in message has the wrong site or network");
  }
  if (!await limitRequest(`verify:${address}`, 20)) {
    throw new HttpError(429, "Too many sign-in attempts");
  }
  const [challenge] = await db()`
    SELECT message FROM auth_nonces WHERE nonce = ${parsed.nonce}
      AND address = ${address} AND used_at IS NULL AND expires_at > now()
  `;
  if (!challenge || challenge.message !== body.message) {
    throw new HttpError(401, "Sign-in challenge expired or already used");
  }
  let result;
  try {
    result = await parsed.verify({
      signature: body.signature,
      domain: new URL(origin).host,
      nonce: parsed.nonce,
    });
  } catch {
    throw new HttpError(401, "Wallet signature could not be verified");
  }
  if (!result.success) throw new HttpError(401, "Wallet signature could not be verified");
  const consumed = await db()`
    UPDATE auth_nonces SET used_at = now()
    WHERE nonce = ${parsed.nonce} AND used_at IS NULL AND expires_at > now()
    RETURNING nonce
  `;
  if (!consumed.length) throw new HttpError(401, "Sign-in challenge already used");

  if (body.intent === "signup") {
    if (address === ADMIN_ADDRESS) throw new HttpError(403, "Admin accounts cannot sign up here");
    const name = String(body.displayName || "").trim();
    if (name.length < 2 || name.length > 80) throw new HttpError(400, "Name must be 2–80 characters");
    const publicKey = requirePublicKey(body.encryptionPublicKey);
    const sealedKey = requireSealedKey(body.encryptedPrivateKey);
    const existing = await db()`SELECT address FROM users WHERE address = ${address}`;
    if (existing.length) throw new HttpError(409, "This wallet is already registered");
    await db()`INSERT INTO users (address, display_name, encryption_public_key, encrypted_private_key)
      VALUES (${address}, ${name}, ${JSON.stringify(publicKey)}, ${JSON.stringify(sealedKey)})`;
  } else if (address !== ADMIN_ADDRESS) {
    const existing = await db()`SELECT address FROM users WHERE address = ${address}`;
    if (!existing.length) throw new HttpError(404, "Create an account for this wallet first");
  }

  await createSession(address);
  return noStoreJson({ address, role: address === ADMIN_ADDRESS ? "admin" : "user" });
});
