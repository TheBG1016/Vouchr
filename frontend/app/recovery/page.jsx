"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, postJson, walletSignIn } from "../../lib/client-api";
import { createVault } from "../../lib/vault";

export default function RecoveryPage() {
  const [session, setSession] = useState(undefined);
  const [requests, setRequests] = useState([]);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    const data = await apiFetch("/api/recovery");
    setRequests(data.requests);
  }

  useEffect(() => {
    apiFetch("/api/auth/session")
      .then(data => {
        setSession(data.session);
        if (data.session?.role === "user") refresh().catch(cause => setError(cause.message));
      })
      .catch(cause => { setSession(null); setError(cause.message); });
  }, []);

  async function requestRecovery(event) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      if (password !== confirm) throw new Error("New vault passwords do not match.");
      const login = await walletSignIn("login");
      if (login.address !== session.address) {
        throw new Error("Use the same wallet that owns this account.");
      }
      const vault = await createVault(password);
      await postJson("/api/recovery", {
        newPublicKey: vault.encryptionPublicKey,
        newEncryptedPrivateKey: vault.encryptedPrivateKey,
      });
      setPassword(""); setConfirm("");
      setMessage("Recovery requested. The admin must rewrap each file key. Return here to check progress.");
      await refresh();
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  if (session === undefined) return <main className="min-h-screen bg-canvas p-8">Loading account…</main>;
  if (session?.role !== "user") return <main className="min-h-screen bg-canvas p-8">
    <Link href="/login" className="font-bold underline">Sign in to your user account first</Link>
  </main>;

  return <main className="min-h-screen bg-canvas p-5">
    <div className="mx-auto max-w-2xl rounded-2xl bg-card p-6 shadow-xl">
      <Link href="/" className="text-sm font-semibold text-shell-900">← Vouchr</Link>
      <h1 className="mt-4 text-3xl font-extrabold">Recover vault access</h1>
      <p className="mt-3 text-sm text-muted">If you forgot the vault password, sign again with the same MetaMask wallet and choose a new one. The admin then uses a separate document key to restore access to your encrypted files. Losing the wallet itself cannot be recovered here.</p>
      <form onSubmit={requestRecovery} className="mt-6 space-y-3">
        <label className="block text-sm font-semibold">New vault password
          <input required type="password" minLength={12} value={password}
            onChange={event => setPassword(event.target.value)}
            className="mt-1 w-full rounded-xl border border-line bg-white p-3" />
        </label>
        <label className="block text-sm font-semibold">Confirm new password
          <input required type="password" minLength={12} value={confirm}
            onChange={event => setConfirm(event.target.value)}
            className="mt-1 w-full rounded-xl border border-line bg-white p-3" />
        </label>
        <button disabled={busy} className="rounded-xl bg-shell-900 px-4 py-3 font-bold text-white disabled:opacity-50">
          {busy ? "Preparing recovery…" : "Sign wallet and request recovery"}
        </button>
      </form>
      {message && <p className="mt-4 rounded-xl bg-patina-light p-3 text-sm text-patina">{message}</p>}
      {error && <p role="alert" className="mt-4 rounded-xl bg-seal-light p-3 text-sm text-seal">{error}</p>}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold">Your requests</h2>
          <button onClick={() => refresh().catch(cause => setError(cause.message))} className="text-sm font-semibold underline">Refresh</button>
        </div>
        {requests.map(item => <p key={item.id} className="mt-2 rounded-xl border border-line bg-white p-3 text-sm">
          {item.status === "pending" && new Date(item.expires_at) < new Date() ? "Expired" : item.status}
          <span className="ml-2 text-muted">— requested {new Date(item.created_at).toLocaleString()}</span>
        </p>)}
      </div>
    </div>
  </main>;
}
