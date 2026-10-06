import { db } from "../../../../lib/db";
import { api, HttpError, noStoreJson } from "../../../../lib/http";
import { requireUser } from "../../../../lib/session";

export const runtime = "nodejs";

export const GET = api(async () => {
  const user = await requireUser();
  const [admin] = await db()`SELECT encryption_public_key, key_version FROM admin_crypto WHERE id = 1`;
  if (!admin) throw new HttpError(503, "Admin document key is not set up yet");
  return noStoreJson({
    userPublicKey: user.encryptionPublicKey,
    adminPublicKey: admin.encryption_public_key,
    adminKeyVersion: admin.key_version,
  });
});
