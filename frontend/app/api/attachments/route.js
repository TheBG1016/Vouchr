import { randomUUID } from "node:crypto";
import { del, put } from "@vercel/blob";
import { ALLOWED_MIME_TYPES, CHAIN_ID, CONTRACT_ADDRESS, MAX_FILE_BYTES } from "../../../lib/config";
import { requireCertificateOwner } from "../../../lib/chain";
import { db, limitRequest } from "../../../lib/db";
import { api, assertOrigin, HttpError, noStoreJson } from "../../../lib/http";
import { requireSession, requireUser } from "../../../lib/session";
import { isBase64, requireId, requireWrappedKey } from "../../../lib/validation";

export const runtime = "nodejs";

export const GET = api(async request => {
  const session = await requireSession();
  const id = requireId(new URL(request.url).searchParams.get("certId"));
  const [attachment] = await db()`
    SELECT id, cert_id, owner_address, original_name, mime_type, plain_size, iv,
      owner_wrapped_key, admin_wrapped_key, created_at
    FROM attachments
    WHERE chain_id = ${CHAIN_ID} AND contract_address = ${CONTRACT_ADDRESS}
      AND cert_id = ${id.toString()} AND deleted_at IS NULL
  `;
  if (!attachment) throw new HttpError(404, "No file is attached to this certificate");
  if (session.role !== "admin" && attachment.owner_address !== session.address) {
    throw new HttpError(403, "This file belongs to another user");
  }
  return noStoreJson({ attachment: {
    id: attachment.id,
    certId: attachment.cert_id,
    name: attachment.original_name,
    mimeType: attachment.mime_type,
    plainSize: attachment.plain_size,
    iv: attachment.iv,
    wrappedKey: session.role === "admin"
      ? attachment.admin_wrapped_key : attachment.owner_wrapped_key,
    createdAt: attachment.created_at,
  } });
});

export const POST = api(async request => {
  assertOrigin(request);
  const user = await requireUser();
  if (!await limitRequest(`upload:${user.address}`, 20)) {
    throw new HttpError(429, "Upload limit reached; try again later");
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_FILE_BYTES + 30_000) {
    throw new HttpError(413, "File is too large");
  }
  const form = await request.formData();
  const id = requireId(form.get("certId"));
  const file = form.get("ciphertext");
  const mimeType = form.get("mimeType");
  const plainSize = Number(form.get("plainSize"));
  const originalName = String(form.get("originalName") || "")
    .replace(/[/\\\x00-\x1f]/g, "_").slice(0, 128);
  const iv = form.get("iv");
  const ownerWrappedKey = requireWrappedKey(form.get("ownerWrappedKey"));
  const adminWrappedKey = requireWrappedKey(form.get("adminWrappedKey"));
  const adminKeyVersion = Number(form.get("adminKeyVersion"));
  if (!file || typeof file.arrayBuffer !== "function" ||
      !Number.isSafeInteger(plainSize) || plainSize < 1 || plainSize > MAX_FILE_BYTES ||
      file.size !== plainSize + 16 || !ALLOWED_MIME_TYPES.has(mimeType) ||
      !originalName || !isBase64(iv, 12)) {
    throw new HttpError(400, "Invalid encrypted file or metadata");
  }
  const [admin] = await db()`SELECT key_version FROM admin_crypto WHERE id = 1`;
  if (!admin || admin.key_version !== adminKeyVersion) {
    throw new HttpError(409, "Admin document key changed; encrypt the file again");
  }
  await requireCertificateOwner(id, user.address);
  const pendingRecovery = await db()`SELECT id FROM recovery_requests
    WHERE owner_address = ${user.address} AND status = 'pending' AND expires_at > now()
    LIMIT 1`;
  if (pendingRecovery.length) throw new HttpError(409, "Finish vault recovery before adding a file");
  const existing = await db()`SELECT id FROM attachments
    WHERE chain_id = ${CHAIN_ID} AND contract_address = ${CONTRACT_ADDRESS}
      AND cert_id = ${id.toString()} AND deleted_at IS NULL`;
  if (existing.length) throw new HttpError(409, "This certificate already has an attachment");
  const attachmentId = randomUUID();
  const path = `attachments/${attachmentId}.bin`;
  const blob = await put(path, file, {
    access: "private",
    addRandomSuffix: false,
    contentType: "application/octet-stream",
  });
  try {
    await db()`INSERT INTO attachments
      (id, chain_id, contract_address, cert_id, owner_address, blob_path,
       original_name, mime_type, plain_size, iv, owner_wrapped_key,
       admin_wrapped_key, admin_key_version)
      VALUES (${attachmentId}, ${CHAIN_ID}, ${CONTRACT_ADDRESS}, ${id.toString()},
        ${user.address}, ${blob.url}, ${originalName}, ${mimeType}, ${plainSize},
        ${iv}, ${ownerWrappedKey}, ${adminWrappedKey}, ${adminKeyVersion})`;
  } catch (error) {
    await del(blob.url).catch(() => {});
    if (error.code === "23505") throw new HttpError(409, "This certificate already has an attachment");
    throw error;
  }
  return noStoreJson({ id: attachmentId, certId: id.toString() }, 201);
});
