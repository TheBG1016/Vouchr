import { randomUUID } from "node:crypto";
import { db } from "../../../lib/db";
import { api, assertOrigin, jsonBody, noStoreJson } from "../../../lib/http";
import { requireFreshUser, requireUser } from "../../../lib/session";
import { requirePublicKey, requireSealedKey } from "../../../lib/validation";

export const runtime = "nodejs";

export const GET = api(async () => {
  const user = await requireUser();
  const rows = await db()`SELECT id, status, created_at, expires_at, completed_at
    FROM recovery_requests WHERE owner_address = ${user.address}
    ORDER BY created_at DESC LIMIT 10`;
  return noStoreJson({ requests: rows });
});

export const POST = api(async request => {
  assertOrigin(request);
  const user = await requireFreshUser();
  const body = await jsonBody(request);
  const publicKey = requirePublicKey(body.newPublicKey);
  const sealedKey = requireSealedKey(body.newEncryptedPrivateKey);
  await db()`UPDATE recovery_requests SET status = 'cancelled'
    WHERE owner_address = ${user.address} AND status = 'pending'`;
  const id = randomUUID();
  await db()`INSERT INTO recovery_requests
    (id, owner_address, new_public_key, new_encrypted_private_key, expires_at)
    VALUES (${id}, ${user.address}, ${JSON.stringify(publicKey)},
      ${JSON.stringify(sealedKey)}, now() + interval '48 hours')`;
  return noStoreJson({ id, status: "pending" }, 201);
});
