"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, postJson } from "../lib/client-api";
import { rewrapForRecovery, unlockAdminKeyFile } from "../lib/vault";

function RecoveryFile({ file, recovery, onSaved }) {
  const input = useRef(null);
  const [keyFile, setKeyFile] = useState(null);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function rewrap() {
    setBusy(true); setError("");
    try {
      const adminKey = await unlockAdminKeyFile(JSON.parse(await keyFile.text()), passphrase);
      const wrappedKey = await rewrapForRecovery(
        file.admin_wrapped_key, adminKey, recovery.newPublicKey
      );
      await postJson(`/api/admin/recovery/${recovery.id}/wrap`, {
        attachmentId: file.id,
        wrappedKey,
      });
      setKeyFile(null); setPassphrase("");
      if (input.current) input.current.value = "";
      await onSaved();
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  return <div className="rounded-xl border border-line bg-white p-3 text-sm">
    <strong>Certificate No. {file.cert_id}</strong>
    {file.done ? <span className="ml-3 font-bold text-patina">Key rewrapped</span> : <>
      <p className="mt-1 text-xs text-muted">Import the admin key file for this file. It stays in your browser.</p>
      <input ref={input} type="file" accept=".json,application/json"
        onChange={event => setKeyFile(event.target.files?.[0] || null)} className="mt-2 block w-full text-xs" />
      <input type="password" value={passphrase} onChange={event => setPassphrase(event.target.value)}
        placeholder="Admin key passphrase" autoComplete="off"
        className="mt-2 w-full rounded-lg border border-line p-2" />
      <button disabled={busy || !keyFile || !passphrase} onClick={rewrap}
        className="mt-2 rounded-lg bg-shell-900 px-3 py-2 font-semibold text-white disabled:opacity-50">
        {busy ? "Rewrapping…" : "Rewrap this file"}
      </button>
    </>}
    {error && <p role="alert" className="mt-2 text-seal">{error}</p>}
  </div>;
}

export default function AdminRecovery() {
  const [requests, setRequests] = useState([]);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refreshList = useCallback(async () => {
    const data = await apiFetch("/api/admin/recovery");
    setRequests(data.requests);
  }, []);

  useEffect(() => {
    refreshList().catch(cause => setError(cause.message));
  }, [refreshList]);

  async function select(id) {
    setError("");
    try { setDetail((await apiFetch(`/api/admin/recovery/${id}`)).recovery); }
    catch (cause) { setError(cause.message); }
  }

  async function complete() {
    setBusy(true); setError("");
    try {
      await postJson(`/api/admin/recovery/${detail.id}/complete`, {});
      setDetail(null);
      await refreshList();
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  return <section className="mt-8 rounded-2xl border border-line bg-card p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-xl font-extrabold">Vault recovery requests</h2>
        <p className="mt-1 text-sm text-muted">The owner must re-sign with the original wallet. You rewrap each file key using your separate admin key.</p>
      </div>
      <button onClick={() => refreshList().catch(cause => setError(cause.message))}
        className="rounded-lg border border-line px-3 py-2 text-sm font-semibold">Refresh</button>
    </div>
    {!detail && <div className="mt-4 space-y-2">
      {requests.length === 0 && <p className="text-sm text-muted">No pending requests.</p>}
      {requests.map(item => <button key={item.id} onClick={() => select(item.id)}
        className="block w-full rounded-xl border border-line bg-white p-3 text-left text-sm">
        <strong className="font-mono">{item.owner_address}</strong>
        <span className="ml-2 text-muted">{item.wrapped_count}/{item.file_count} files ready</span>
      </button>)}
    </div>}
    {detail && <div className="mt-5 space-y-3">
      <button onClick={() => setDetail(null)} className="text-sm font-semibold underline">← All requests</button>
      <p className="break-all text-sm">Owner: <strong className="font-mono">{detail.ownerAddress}</strong></p>
      <p className="text-xs text-muted">Expires {new Date(detail.expiresAt).toLocaleString()}</p>
      {detail.files.map(file => <RecoveryFile key={file.id} file={file} recovery={detail}
        onSaved={() => select(detail.id)} />)}
      {detail.files.every(file => file.done) && <button onClick={complete} disabled={busy}
        className="rounded-lg bg-patina px-4 py-2 font-bold text-white disabled:opacity-50">
        Complete recovery
      </button>}
    </div>}
    {error && <p role="alert" className="mt-3 text-sm text-seal">{error}</p>}
  </section>;
}
