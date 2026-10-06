import { randomBytes } from "node:crypto";
import { isAddress } from "ethers";
import { SiweMessage } from "siwe";
import { CHAIN_ID } from "../../../../lib/config";
import { db, limitRequest } from "../../../../lib/db";
import { api, assertOrigin, HttpError, jsonBody, noStoreJson } from "../../../../lib/http";

export const runtime = "nodejs";

export const POST = api(async request => {
  assertOrigin(request);
  const { address } = await jsonBody(request);
  if (!isAddress(address)) throw new HttpError(400, "Invalid wallet address");
  const wallet = address.toLowerCase();
  if (!await limitRequest(`challenge:${wallet}`, 20)) {
    throw new HttpError(429, "Too many sign-in requests");
  }
  const origin = new URL(request.url).origin;
  const nonce = randomBytes(16).toString("hex");
  const message = new SiweMessage({
    domain: new URL(origin).host,
    address,
    statement: "Sign in to Vouchr on Ethereum Sepolia.",
    uri: origin,
    version: "1",
    chainId: CHAIN_ID,
    nonce,
    issuedAt: new Date().toISOString(),
    expirationTime: new Date(Date.now() + 10 * 60_000).toISOString(),
  }).prepareMessage();
  await db()`INSERT INTO auth_nonces (nonce, address, message, expires_at)
    VALUES (${nonce}, ${wallet}, ${message}, now() + interval '10 minutes')`;
  return noStoreJson({ message });
});
