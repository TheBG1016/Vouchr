import { db } from "../../../../../lib/db";
import { api, HttpError, noStoreJson } from "../../../../../lib/http";
import { requireAdmin } from "../../../../../lib/session";

export const runtime = "nodejs";

export const GET = api(async (_request, { params }) => {
  await requireAdmin();
  const id = (await params).id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, "Invalid request ID");
  const [recovery] = await db()`SELECT id, owner_address, new_public_key, expires_at
    FROM recovery_requests WHERE id = ${id} AND status = 'pending' AND expires_at > now()`;
  if (!recovery) throw new HttpError(404, "Active recovery request not found");
  const files = await db()`SELECT a.id, a.cert_id, a.admin_wrapped_key,
      a.admin_key_version, (w.attachment_id IS NOT NULL) AS done
    FROM attachments a
    LEFT JOIN recovery_wraps w ON w.attachment_id = a.id AND w.request_id = ${id}
    WHERE a.owner_address = ${recovery.owner_address} AND a.deleted_at IS NULL
    ORDER BY a.cert_id`;
  return noStoreJson({ recovery: {
    id: recovery.id,
    ownerAddress: recovery.owner_address,
    newPublicKey: recovery.new_public_key,
    expiresAt: recovery.expires_at,
    files,
  } });
});
