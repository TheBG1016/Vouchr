import { randomUUID } from "node:crypto";
import { get } from "@vercel/blob";
import { db } from "../../../../../lib/db";
import { api, HttpError } from "../../../../../lib/http";
import { requireSession } from "../../../../../lib/session";

export const runtime = "nodejs";

export const GET = api(async (_request, { params }) => {
  const id = (await params).id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, "Invalid attachment ID");
  const session = await requireSession();
  const [attachment] = await db()`SELECT id, owner_address, blob_path FROM attachments
    WHERE id = ${id} AND deleted_at IS NULL`;
  if (!attachment) throw new HttpError(404, "File not found");
  if (session.role !== "admin" && attachment.owner_address !== session.address) {
    throw new HttpError(403, "This file belongs to another user");
  }
  const result = await get(attachment.blob_path, { access: "private", useCache: false });
  if (!result) throw new HttpError(404, "Encrypted file is unavailable");
  await db()`INSERT INTO access_audit (id, actor_address, attachment_id, action)
    VALUES (${randomUUID()}, ${session.address}, ${id}, 'ciphertext_download')`;
  return new Response(result.stream, { headers: {
    "Content-Type": "application/octet-stream",
    "Content-Disposition": "attachment; filename=encrypted-document.bin",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
  } });
});
