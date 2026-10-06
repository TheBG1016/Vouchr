import { apiFetch } from "./client-api";
import { encryptAttachment } from "./vault";

const MIME = new Set(["application/pdf", "image/jpeg", "image/png"]);
const MAX_BYTES = 3 * 1024 * 1024;

export async function uploadAttachment(certId, file) {
  if (!MIME.has(file.type)) throw new Error("Choose a PDF, JPEG, or PNG file.");
  if (file.size < 1 || file.size > MAX_BYTES) throw new Error("The file must be 3 MB or smaller.");
  const keys = await apiFetch("/api/crypto/keys");
  const encrypted = await encryptAttachment(file, keys.userPublicKey, keys.adminPublicKey);
  const form = new FormData();
  form.set("certId", String(certId));
  form.set("ciphertext", encrypted.ciphertext, "encrypted.bin");
  form.set("originalName", file.name);
  form.set("mimeType", file.type);
  form.set("plainSize", String(file.size));
  form.set("iv", encrypted.iv);
  form.set("ownerWrappedKey", encrypted.ownerWrappedKey);
  form.set("adminWrappedKey", encrypted.adminWrappedKey);
  form.set("adminKeyVersion", String(keys.adminKeyVersion));
  return apiFetch("/api/attachments", { method: "POST", body: form });
}
