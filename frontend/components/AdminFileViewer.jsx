"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/client-api";
import { decryptAttachment, unlockAdminKeyFile } from "../lib/vault";

export default function AdminFileViewer({ certId, onClose }) {
  const input = useRef(null);
  const [attachment, setAttachment] = useState(null);
  const [keyFile, setKeyFile] = useState(null);
  const [passphrase, setPassphrase] = useState("");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch(`/api/attachments?certId=${certId}`)
      .then(data => setAttachment(data.attachment))
      .catch(cause => setError(cause.message));
  }, [certId]);
  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url); }, [preview]);

  async function open() {
    setBusy(true); setError("");
    try {
      const keyData = JSON.parse(await keyFile.text());
      const privateKey = await unlockAdminKeyFile(keyData, passphrase);
      const response = await fetch(`/api/attachments/${attachment.id}/content`, { cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Could not retrieve encrypted file.");
      }
      const clear = await decryptAttachment(
        await response.arrayBuffer(), attachment.wrappedKey,
        privateKey, attachment.iv, attachment.mimeType
      );
      setPreview({ url: URL.createObjectURL(clear), mimeType: attachment.mimeType });
      setKeyFile(null); setPassphrase("");
      if (input.current) input.current.value = "";
    } catch (cause) {
      setError(cause.message || "Could not open the file.");
    } finally { setBusy(false); }
  }

  return <div className="mt-3 rounded-xl border border-line bg-white p-4">
    <div className="flex justify-between gap-3">
      <strong>Private file for certificate No. {certId}</strong>
      <button onClick={onClose} className="font-semibold text-muted underline">Close</button>
    </div>
    {attachment && <>
      <p className="mt-1 break-all text-sm text-muted">{attachment.name}</p>
      <p className="mt-2 text-xs text-muted">Import your separate document key file and enter its passphrase for this opening. Neither is uploaded.</p>
      <input ref={input} type="file" accept=".json,application/json"
        onChange={event => setKeyFile(event.target.files?.[0] || null)}
        className="mt-3 block w-full text-sm" />
      <input type="password" value={passphrase} onChange={event => setPassphrase(event.target.value)}
        placeholder="Key file passphrase" autoComplete="off"
        className="mt-2 w-full rounded-lg border border-line p-2 text-sm" />
      <button onClick={open} disabled={busy || !keyFile || !passphrase}
        className="mt-3 rounded-lg bg-shell-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
        {busy ? "Opening…" : "Open file"}
      </button>
    </>}
    {error && <p role="alert" className="mt-3 text-sm text-seal">{error}</p>}
    {preview && <div role="dialog" aria-modal="true" aria-label="Private file preview"
      className="fixed inset-0 z-50 flex flex-col bg-shell-900/95 p-4">
      <button onClick={() => setPreview(null)} className="mb-3 self-end rounded-lg bg-white px-4 py-2 font-bold">Close file</button>
      {preview.mimeType === "application/pdf"
        ? <iframe title="Private PDF preview" src={preview.url} className="h-full w-full rounded-xl bg-white" />
        : <img alt="Private attachment" src={preview.url} className="min-h-0 flex-1 object-contain" />}
    </div>}
  </div>;
}
