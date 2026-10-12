"use client";

import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        setError(result.error ?? "Unable to sign in.");
        return;
      }
      const requested = searchParams.get("from") ?? "/";
      const destination = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";
      window.location.replace(destination);
    } catch {
      setError("Connection failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="owner-login-page">
      <section className="owner-login-card" aria-labelledby="owner-login-title">
        <div className="owner-login-mark" aria-hidden="true">C</div>
        <p className="owner-login-eyebrow">PRIVATE WORKSPACE</p>
        <h1 id="owner-login-title">Cooking Creator Studio</h1>
        <p className="owner-login-copy">Sign in with your owner password to open your personal workspace.</p>
        <form onSubmit={submit}>
          <label htmlFor="owner-password">Owner password</label>
          <input id="owner-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required maxLength={1024} />
          {error && <p className="owner-login-error" role="alert">{error}</p>}
          <button type="submit" disabled={busy || password.length === 0}>{busy ? "Checking…" : "Unlock workspace"}</button>
        </form>
        <p className="owner-login-note">Use only over HTTPS when hosted. This gate does not encrypt recipes already stored in your browser.</p>
      </section>
    </main>
  );
}
