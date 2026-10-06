import { db } from "../../../../lib/db";
import { api, assertOrigin, HttpError, jsonBody, noStoreJson } from "../../../../lib/http";
import { requireAdmin } from "../../../../lib/session";
import { requirePublicKey } from "../../../../lib/validation";

export const runtime = "nodejs";

export const GET = api(async () => {
  await requireAdmin();
  const [key] = await db()`SELECT encryption_public_key, key_version FROM admin_crypto WHERE id = 1`;
  return noStoreJson({ configured: !!key, publicKey: key?.encryption_public_key || null,
    keyVersion: key?.key_version || null });
});

export const POST = api(async request => {
  assertOrigin(request);
  await requireAdmin();
  const { publicKey } = await jsonBody(request);
  const sanitized = requirePublicKey(publicKey);
  const rows = await db()`INSERT INTO admin_crypto (id, encryption_public_key)
    VALUES (1, ${JSON.stringify(sanitized)}) ON CONFLICT (id) DO NOTHING RETURNING id`;
  if (!rows.length) throw new HttpError(409, "Admin document key is already configured");
  return noStoreJson({ configured: true }, 201);
});
