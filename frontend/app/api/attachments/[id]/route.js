import { randomUUID } from "node:crypto";
import { del } from "@vercel/blob";
import { db } from "../../../../lib/db";
import { api, assertOrigin, HttpError, noStoreJson } from "../../../../lib/http";
import { requireUser } from "../../../../lib/session";

export const runtime = "nodejs";

export const DELETE = api(async (request, { params }) => {
  assertOrigin(request);
  const user = await requireUser();
  const id = (await params).id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, "Invalid attachment ID");
  const [attachment] = await db()`SELECT owner_address, blob_path FROM attachments
    WHERE id = ${id} AND deleted_at IS NULL`;
  if (!attachment) throw new HttpError(404, "File not found");
  if (attachment.owner_address !== user.address) {
    throw new HttpError(403, "Only the file owner can remove it");
  }
  const pendingRecovery = await db()`SELECT id FROM recovery_requests
    WHERE owner_address = ${user.address} AND status = 'pending' AND expires_at > now()
    LIMIT 1`;
  if (pendingRecovery.length) throw new HttpError(409, "Finish vault recovery before removing a file");
  await del(attachment.blob_path);
  await db()`UPDATE attachments SET deleted_at = now() WHERE id = ${id}`;
  await db()`INSERT INTO access_audit (id, actor_address, attachment_id, action)
    VALUES (${randomUUID()}, ${user.address}, ${id}, 'attachment_deleted')`;
  return noStoreJson({ deleted: true });
});
