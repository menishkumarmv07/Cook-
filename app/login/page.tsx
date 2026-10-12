"use client";

import { useEffect, useState, type FormEvent } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [setupRequired, setSetupRequired] = useState(false);
  const [returnTo, setReturnTo] = useState("/");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setSetupRequired(query.get("setup") === "1");
    const candidate = query.get("returnTo");
    if (candidate && candidate.startsWith("/") && !candidate.startsWith("//") && !candidate.includes("\\")) {
      setReturnTo(candidate);
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result: unknown = await response.json().catch(() => null);
      const error = typeof result === "object" && result !== null && "error" in result
        && typeof (result as { error?: unknown }).error === "string"
        ? (result as { error: string }).error
        : "Sign-in failed. Please try again.";
      if (!response.ok) {
        setNotice(error);
        return;
      }
      window.location.replace(returnTo);
    } catch {
      setNotice("Could not contact the local/server sign-in endpoint. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-mark" aria-hidden="true">cc</div>
        <p className="login-eyebrow">PRIVATE CREATOR WORKSPACE</p>
        <h1 id="login-title">Cooking Creator</h1>
        <p className="login-description">Sign in with the owner password to open your workspace.</p>
        {setupRequired && (
          <p className="login-warning" role="alert">
            Owner-only access is not configured, so the workspace remains locked. Set OWNER_PASSWORD (at least 16 characters) and AUTH_SECRET (at least 32 random bytes) in the server environment. Never paste these secrets into chat or client-side code.
          </p>
        )}
        <form className="login-form" onSubmit={submit}>
          <label htmlFor="owner-password">Owner password</label>
          <input
            id="owner-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            maxLength={1024}
            required
            disabled={setupRequired || busy}
          />
          <button type="submit" disabled={setupRequired || busy || password.length === 0}>
            {busy ? "Checking…" : "Unlock workspace"}
          </button>
        </form>
        {notice && <p className="login-notice" role="status">{notice}</p>}
        <p className="login-footnote">One owner · no public sign-up · no third-party account required.</p>
      </section>
    </main>
  );
}
