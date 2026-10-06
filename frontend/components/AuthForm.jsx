"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, walletSignIn } from "../lib/client-api";
import { createVault } from "../lib/vault";

export default function AuthForm({ mode }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isSignup = mode === "signup";
  const isAdmin = mode === "admin";

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      let extra = {};
      if (isSignup) {
        if (password !== confirm) throw new Error("Vault passwords do not match.");
        extra = { displayName: name.trim(), ...await createVault(password) };
      }
      const result = await walletSignIn(isSignup ? "signup" : "login", extra);
      if (isAdmin && result.role !== "admin") {
        await apiFetch("/api/auth/logout", { method: "POST" });
        throw new Error("This wallet is not the configured admin account.");
      }
      router.push(result.role === "admin" ? "/admin" : "/");
      router.refresh();
    } catch (cause) {
      setError(cause.message || "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-canvas p-5 flex items-center justify-center">
      <div className="w-full max-w-md rounded-3xl bg-card border border-line p-8 shadow-2xl">
        <Link href="/" className="text-sm font-semibold text-shell-800">← Vouchr</Link>
        <h1 className="mt-5 text-3xl font-extrabold text-ink">
          {isSignup ? "Create your account" : isAdmin ? "Admin sign in" : "Sign in"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {isSignup
            ? "Your wallet signs you in. A separate vault password protects your private document key."
            : "Confirm a sign-in message in MetaMask on Sepolia. No gas is charged."}
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          {isSignup && <>
            <label className="block text-sm font-semibold">Display name
              <input required minLength={2} maxLength={80} value={name}
                onChange={event => setName(event.target.value)}
                className="mt-2 w-full rounded-xl border border-line bg-white p-3" />
            </label>
            <label className="block text-sm font-semibold">Vault password
              <input required type="password" minLength={12} value={password}
                onChange={event => setPassword(event.target.value)}
                className="mt-2 w-full rounded-xl border border-line bg-white p-3" />
            </label>
            <label className="block text-sm font-semibold">Confirm vault password
              <input required type="password" minLength={12} value={confirm}
                onChange={event => setConfirm(event.target.value)}
                className="mt-2 w-full rounded-xl border border-line bg-white p-3" />
            </label>
            <p className="text-xs text-muted">You will enter this password every time you open a file. The site cannot retrieve it for you.</p>
          </>}
          <button disabled={busy} className="w-full rounded-xl bg-shell-900 px-4 py-3 font-bold text-white disabled:opacity-50">
            {busy ? "Waiting for MetaMask…" : isSignup ? "Sign up with MetaMask" : "Sign in with MetaMask"}
          </button>
          {error && <p role="alert" className="rounded-xl bg-seal-light p-3 text-sm text-seal">{error}</p>}
        </form>
        {!isSignup && !isAdmin && <p className="mt-5 text-sm text-muted">
          New to Vouchr? <Link href="/signup" className="font-bold text-shell-900 underline">Create an account</Link>
        </p>}
        {isSignup && <p className="mt-5 text-sm text-muted">
          Already registered? <Link href="/login" className="font-bold text-shell-900 underline">Sign in</Link>
        </p>}
      </div>
    </main>
  );
}
