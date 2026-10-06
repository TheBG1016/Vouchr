import { db } from "../../../../lib/db";
import { api, noStoreJson } from "../../../../lib/http";
import { requireAdmin } from "../../../../lib/session";

export const runtime = "nodejs";

export const GET = api(async () => {
  await requireAdmin();
  const rows = await db()`
    SELECT r.id, r.owner_address, r.created_at, r.expires_at,
      (SELECT count(*) FROM attachments a
       WHERE a.owner_address = r.owner_address AND a.deleted_at IS NULL)::integer AS file_count,
      (SELECT count(*) FROM recovery_wraps w
       WHERE w.request_id = r.id)::integer AS wrapped_count
    FROM recovery_requests r
    WHERE r.status = 'pending' AND r.expires_at > now()
    ORDER BY r.created_at ASC LIMIT 100
  `;
  return noStoreJson({ requests: rows });
});
