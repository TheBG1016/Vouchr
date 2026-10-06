"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../lib/client-api";
import { uploadAttachment } from "../lib/attachments-client";
import { decryptAttachment, unlockVault } from "../lib/vault";

export default function AttachmentPanel({ certId, session, owner }) {
  const [attachment, setAttachment] = useState(null);
  const [file, setFile] = useState(null);
  const [password, setPassword] = useState("");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const isOwner = session?.role === "user" && session.address === owner?.toLowerCase();

  const refresh = useCallback(async () => {
    if (!isOwner) return;
    try {
      const data = await apiFetch(`/api/attachments?certId=${certId}`);
      setAttachment(data.attachment);
    } catch (cause) {
      if (!cause.message.includes("No file is attached")) setError(cause.message);
      setAttachment(null);
    } finally { setLoaded(true); }
  }, [certId, isOwner]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url); }, [preview]);

  if (!session) return <p className="mt-3 text-xs text-muted"><Link href="/login" className="underline">Sign in</Link> to manage private files.</p>;
  if (!isOwner) return null;

  async function upload() {
    if (!file) return;
    setError(""); setBusy(true);
    try { await uploadAttachment(certId, file); setFile(null); await refresh(); }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  async function openFile() {
    setError(""); setBusy(true);
    try {
      const privateKey = await unlockVault(session.encryptedPrivateKey, password);
      const response = await fetch(`/api/attachments/${attachment.id}/content`, { cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Could not get the encrypted file.");
      }
      const clear = await decryptAttachment(
        await response.arrayBuffer(), attachment.wrappedKey,
        privateKey, attachment.iv, attachment.mimeType
      );
      setPreview({ url: URL.createObjectURL(clear), mimeType: attachment.mimeType });
      setPassword("");
    } catch (cause) { setError(cause.message || "Could not open the file."); }
    finally { setBusy(false); }
  }

  async function removeFile() {
    if (!window.confirm("Remove this attachment? The on-chain certificate will remain.")) return;
    setError(""); setBusy(true);
    try {
      await apiFetch(`/api/attachments/${attachment.id}`, { method: "DELETE" });
      setAttachment(null);
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  return <div className="mt-3 rounded-xl border border-line bg-white p-3 text-sm">
    <strong className="text-ink">Private attachment</strong>
    {!loaded ? <p className="mt-1 text-muted">Checking…</p> : attachment ? <>
      <p className="mt-1 break-all text-muted">{attachment.name}</p>
      <label className="mt-2 block text-xs font-semibold">Vault password, required each time
        <input type="password" value={password} onChange={event => setPassword(event.target.value)}
          autoComplete="off" className="mt-1 w-full rounded-lg border border-line p-2" />
      </label>
      <div className="mt-2 flex gap-2">
        <button disabled={busy || !password} onClick={openFile} className="rounded-lg bg-shell-900 px-3 py-2 font-semibold text-white disabled:opacity-50">Open file</button>
        <button disabled={busy} onClick={removeFile} className="rounded-lg border border-line px-3 py-2 font-semibold text-seal">Remove</button>
      </div>
    </> : <>
      <p className="mt-1 text-xs text-muted">PDF, JPEG, or PNG, up to 3 MB. Encrypted in your browser.</p>
      <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={event => setFile(event.target.files?.[0] || null)}
        className="mt-2 block w-full text-xs" />
      <button disabled={busy || !file} onClick={upload} className="mt-2 rounded-lg bg-shell-900 px-3 py-2 font-semibold text-white disabled:opacity-50">
        {busy ? "Uploading…" : "Attach file"}
      </button>
    </>}
    {error && <p role="alert" className="mt-2 text-xs text-seal">{error}</p>}
    {preview && <div role="dialog" aria-modal="true" aria-label="Private file preview"
      className="fixed inset-0 z-50 flex flex-col bg-shell-900/95 p-4">
      <button onClick={() => setPreview(null)} className="mb-3 self-end rounded-lg bg-white px-4 py-2 font-bold">Close file</button>
      {preview.mimeType === "application/pdf"
        ? <iframe title="Private PDF preview" src={preview.url} className="h-full w-full rounded-xl bg-white" />
        : <img alt="Private attachment" src={preview.url} className="min-h-0 flex-1 object-contain" />}
    </div>}
  </div>;
}
