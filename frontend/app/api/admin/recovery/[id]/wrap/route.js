import { randomUUID } from "node:crypto";
import { db } from "../../../../../../lib/db";
import { api, assertOrigin, HttpError, jsonBody, noStoreJson } from "../../../../../../lib/http";
import { requireAdmin } from "../../../../../../lib/session";
import { requireWrappedKey } from "../../../../../../lib/validation";

export const runtime = "nodejs";

export const POST = api(async (request, { params }) => {
  assertOrigin(request);
  const admin = await requireAdmin();
  const id = (await params).id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, "Invalid request ID");
  const body = await jsonBody(request);
  if (!/^[0-9a-f-]{36}$/i.test(body.attachmentId || "")) {
    throw new HttpError(400, "Invalid attachment ID");
  }
  const wrappedKey = requireWrappedKey(body.wrappedKey);
  const [match] = await db()`SELECT a.id FROM recovery_requests r
    JOIN attachments a ON a.owner_address = r.owner_address
    WHERE r.id = ${id} AND r.status = 'pending' AND r.expires_at > now()
      AND a.id = ${body.attachmentId} AND a.deleted_at IS NULL`;
  if (!match) throw new HttpError(404, "Attachment is not part of this recovery request");
  await db()`INSERT INTO recovery_wraps (request_id, attachment_id, wrapped_key)
    VALUES (${id}, ${body.attachmentId}, ${wrappedKey})
    ON CONFLICT (request_id, attachment_id)
    DO UPDATE SET wrapped_key = excluded.wrapped_key`;
  await db()`INSERT INTO access_audit (id, actor_address, attachment_id, action)
    VALUES (${randomUUID()}, ${admin.address}, ${body.attachmentId}, 'recovery_rewrap')`;
  return noStoreJson({ saved: true });
});
