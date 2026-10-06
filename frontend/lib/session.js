import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { ADMIN_ADDRESS } from "./config";
import { db } from "./db";
import { HttpError } from "./http";

const COOKIE = "vouchr_session";
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const hashToken = token => createHash("sha256").update(token).digest("hex");

export async function createSession(address) {
  const token = randomBytes(32).toString("hex");
  await db()`INSERT INTO sessions (token_hash, address, expires_at)
    VALUES (${hashToken(token)}, ${address.toLowerCase()}, now() + interval '7 days')`;
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db()`DELETE FROM sessions WHERE token_hash = ${hashToken(token)}`;
  jar.delete(COOKIE);
}

export async function getSession() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const rows = await db()`
    SELECT s.address, s.created_at, u.display_name, u.encryption_public_key,
           u.encrypted_private_key
    FROM sessions s LEFT JOIN users u ON u.address = s.address
    WHERE s.token_hash = ${hashToken(token)} AND s.expires_at > now()
  `;
  if (!rows.length) return null;
  return {
    address: rows[0].address,
    role: rows[0].address === ADMIN_ADDRESS ? "admin" : "user",
    signedInAt: rows[0].created_at,
    displayName: rows[0].display_name,
    encryptionPublicKey: rows[0].encryption_public_key,
    encryptedPrivateKey: rows[0].encrypted_private_key,
  };
}

export async function requireSession() {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Sign in first");
  return session;
}

export async function requireUser() {
  const session = await requireSession();
  if (session.role !== "user" || !session.encryptionPublicKey) {
    throw new HttpError(403, "A registered user account is required");
  }
  return session;
}

export async function requireFreshUser() {
  const session = await requireUser();
  if (Date.now() - new Date(session.signedInAt).getTime() > 5 * 60_000) {
    throw new HttpError(401, "Sign your wallet in again before recovering the vault");
  }
  return session;
}

export async function requireAdmin() {
  const session = await requireSession();
  if (session.role !== "admin") throw new HttpError(403, "Admin access required");
  return session;
}
