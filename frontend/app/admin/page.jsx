"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, postJson, signOut } from "../../lib/client-api";
import { makeAdminKeyFile } from "../../lib/vault";
import AdminFileViewer from "../../components/AdminFileViewer";
import AdminRecovery from "../../components/AdminRecovery";

function AdminKeySetup({ onReady }) {
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [keyFile, setKeyFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setError(""); setBusy(true);
    try {
      if (passphrase !== confirm) throw new Error("Passphrases do not match.");
      const generated = await makeAdminKeyFile(passphrase);
      const url = URL.createObjectURL(new Blob([JSON.stringify(generated, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url; link.download = "vouchr-admin-document-key.json"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setKeyFile(generated);
      setPassphrase(""); setConfirm("");
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  async function activate() {
    setError(""); setBusy(true);
    try {
      await postJson("/api/admin/key", { publicKey: keyFile.encryptionPublicKey });
      setKeyFile(null);
      onReady();
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  async function importExisting(event) {
    try {
      const parsed = JSON.parse(await event.target.files[0].text());
      if (parsed.type !== "vouchr-admin-document-key" || parsed.version !== 1) {
        throw new Error("Choose a Vouchr admin document key file.");
      }
      setKeyFile(parsed); setError("");
    } catch (cause) { setError(cause.message); }
  }

  return <section className="rounded-2xl border border-brass-border bg-brass-light p-5">
    <h2 className="text-xl font-extrabold">Set up the admin document key</h2>
    <p className="mt-2 text-sm text-brass">Generate and download a separate encrypted key file. Keep an offline backup. The private key is never sent to Vouchr or stored in MetaMask.</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <input type="password" minLength={12} value={passphrase} onChange={event => setPassphrase(event.target.value)}
        placeholder="Key file passphrase (12+ characters)" className="rounded-xl border border-line p-3" />
      <input type="password" minLength={12} value={confirm} onChange={event => setConfirm(event.target.value)}
        placeholder="Confirm passphrase" className="rounded-xl border border-line p-3" />
    </div>
    <button onClick={generate} disabled={busy || passphrase.length < 12}
      className="mt-3 rounded-xl bg-shell-900 px-4 py-2 font-bold text-white disabled:opacity-50">
      Generate and download key file
    </button>
    <p className="mt-4 text-xs text-muted">If you already downloaded a key file but setup was interrupted, select it here to finish activation:</p>
    <input type="file" accept=".json,application/json" onChange={importExisting} className="mt-2 block w-full text-sm" />
    {keyFile && <button onClick={activate} disabled={busy}
      className="mt-4 block rounded-xl bg-patina px-4 py-2 font-bold text-white disabled:opacity-50">
      I saved the key file — activate its public key
    </button>}
    {error && <p role="alert" className="mt-3 text-sm text-seal">{error}</p>}
  </section>;
}

export default function AdminPage() {
  const [session, setSession] = useState(undefined);
  const [key, setKey] = useState(undefined);
  const [search, setSearch] = useState("");
  const [certificates, setCertificates] = useState([]);
  const [progress, setProgress] = useState(null);
  const [verification, setVerification] = useState({});
  const [openFileId, setOpenFileId] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (query = "") => {
    setBusy(true); setError("");
    try {
      const data = await apiFetch(`/api/admin/certificates?search=${encodeURIComponent(query)}`);
      setCertificates(data.certificates); setProgress(data.progress);
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => {
    apiFetch("/api/auth/session")
      .then(data => {
        setSession(data.session);
        if (data.session?.role === "admin") {
          apiFetch("/api/admin/key").then(setKey).catch(cause => setError(cause.message));
          load();
        }
      })
      .catch(cause => { setSession(null); setError(cause.message); });
  }, [load]);

  async function verify(id) {
    setError("");
    try {
      const result = await apiFetch(`/api/certificates/${id}/verify`);
      setVerification(previous => ({ ...previous, [id]: result }));
    } catch (cause) { setError(cause.message); }
  }

  async function logout() {
    await signOut();
    window.location.href = "/admin/login";
  }

  if (session === undefined) return <main className="min-h-screen bg-canvas p-8">Loading admin account…</main>;
  if (session?.role !== "admin") return <main className="min-h-screen bg-canvas p-8">
    <div className="mx-auto max-w-xl rounded-2xl bg-card p-6">
      <h1 className="text-2xl font-bold">Admin sign in required</h1>
      <Link href="/admin/login" className="mt-4 inline-block font-bold underline">Sign in with the configured admin wallet</Link>
      {error && <p role="alert" className="mt-3 text-seal">{error}</p>}
    </div>
  </main>;

  return <main className="min-h-screen bg-canvas p-4 sm:p-8">
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-card p-5 shadow">
        <div>
          <Link href="/" className="text-sm font-semibold text-muted">← Vouchr</Link>
          <h1 className="mt-1 text-3xl font-extrabold">Admin dashboard</h1>
          <p className="mt-1 font-mono text-xs text-muted">{session.address}</p>
        </div>
        <button onClick={logout} className="rounded-xl border border-line bg-white px-4 py-2 font-semibold">Sign out</button>
      </header>
      {key && !key.configured && <AdminKeySetup onReady={() => apiFetch("/api/admin/key").then(setKey)} />}
      <section className="rounded-2xl bg-card p-5 shadow">
        <h2 className="text-xl font-extrabold">All Sepolia certificates</h2>
        <p className="mt-1 text-sm text-muted">Search the public name index. Verify reads the contract again for current status.</p>
        <form onSubmit={event => { event.preventDefault(); load(search); }} className="mt-4 flex gap-2">
          <input aria-label="Search by subject name" value={search} onChange={event => setSearch(event.target.value)}
            placeholder="Search by name" className="min-w-0 flex-1 rounded-xl border border-line bg-white p-3" />
          <button disabled={busy} className="rounded-xl bg-shell-900 px-4 py-2 font-bold text-white disabled:opacity-50">Search</button>
        </form>
        {progress && <p className="mt-2 text-xs text-muted">Indexed {progress.indexedThrough} of {progress.total} certificates. {progress.indexedThrough < progress.total && <button onClick={() => load(search)} className="underline">Load next batch</button>}</p>}
        <div className="mt-5 space-y-3">
          {certificates.map(c => <article key={c.cert_id} className="rounded-xl border border-line bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <strong className="text-lg">No. {c.cert_id} — {c.subject_name}</strong>
                <p className="mt-1 break-all font-mono text-xs text-muted">{c.owner_address}</p>
                <p className="mt-1 text-xs text-muted">Expires {new Date(c.expires_at).toLocaleDateString()}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => verify(c.cert_id)} className="rounded-lg bg-shell-900 px-3 py-2 text-sm font-bold text-white">Verify</button>
                {c.attachment_id && <button onClick={() => setOpenFileId(openFileId === c.cert_id ? null : c.cert_id)}
                  className="rounded-lg border border-line px-3 py-2 text-sm font-bold">Private file</button>}
              </div>
            </div>
            {verification[c.cert_id] && <p className={`mt-3 text-sm font-bold ${verification[c.cert_id].valid ? "text-patina" : "text-seal"}`}>
              On-chain status: {verification[c.cert_id].status}
            </p>}
            {openFileId === c.cert_id && <AdminFileViewer certId={c.cert_id} onClose={() => setOpenFileId(null)} />}
          </article>)}
          {certificates.length === 0 && !busy && <p className="text-sm text-muted">No certificates found in the current index.</p>}
        </div>
      </section>
      <AdminRecovery />
      {error && <p role="alert" className="rounded-xl bg-seal-light p-3 text-seal">{error}</p>}
    </div>
  </main>;
}
