"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

function ChefHatLogo() {
  return (
    <svg className="chef-hat-logo" viewBox="0 0 64 64" role="img" aria-label="Cooking Creator chef hat" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="chef-hat-cream" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFEF9" />
          <stop offset="1" stopColor="#F5DDC9" />
        </linearGradient>
        <linearGradient id="chef-hat-band" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F9EBDD" />
          <stop offset="1" stopColor="#E9C6AE" />
        </linearGradient>
      </defs>
      <path className="chef-hat-shadow" d="M10 34c-3.4-2-5-5.2-4.5-8.8.6-4.2 4.1-7.1 8.2-7.1 1.1-7.1 7.2-11.2 13.7-9.1C31 1.5 42.6 3.1 45.2 12.5c6.2-.4 11 4.4 11 10.1 0 4.7-2.6 8.4-6.3 10.1v15.1H14V34z" />
      <path className="chef-hat-body" d="M10 32c-3.4-1.8-5-5-4.5-8.6.6-4.2 4.1-7.1 8.2-7.1 1.1-7.1 7.2-11.2 13.7-9.1C31 1.5 42.6 3.1 45.2 12.5c6.2-.4 11 4.4 11 10.1 0 4.7-2.6 8.4-6.3 10.1v15.1H14V32z" />
      <path className="chef-hat-highlight" d="M12 24c.4-3.3 2.7-5.2 5.6-5.2M21 13.3c2.3-2.5 5.4-3.2 8.3-2.2" />
      <path className="chef-hat-band" d="M12 39.5h40v8.2c0 2.1-1.7 3.8-3.8 3.8H15.8c-2.1 0-3.8-1.7-3.8-3.8z" />
      <path className="chef-hat-band-line" d="M14 41h36" />
      <circle className="chef-hat-eye" cx="25" cy="31" r="1.65" />
      <circle className="chef-hat-eye" cx="39" cy="31" r="1.65" />
      <path className="chef-hat-smile" d="M28.5 35.2c2.1 2.5 5.9 2.5 8 0" />
      <ellipse className="chef-hat-blush" cx="19.5" cy="35.1" rx="3.1" ry="1.7" />
      <ellipse className="chef-hat-blush" cx="44.5" cy="35.1" rx="3.1" ry="1.7" />
      <path className="chef-hat-sparkle" d="M51.5 2.5l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z" />
    </svg>
  );
}

export default function LoginPage() {
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const popupHistoryRef = useRef(false);
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

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (event.key !== "Escape" || !accountMenuOpen) return;
      event.preventDefault();
      closeAccountMenu();
    }
    function handlePopstate() {
      if (!popupHistoryRef.current) return;
      popupHistoryRef.current = false;
      setAccountMenuOpen(false);
    }
    window.addEventListener("keydown", handleKeydown);
    window.addEventListener("popstate", handlePopstate);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("popstate", handlePopstate);
    };
  }, [accountMenuOpen]);

  function openAccountMenu() {
    if (!popupHistoryRef.current) {
      try {
        window.history.pushState({ cookingCreatorLoginPopup: true }, "", window.location.href);
        popupHistoryRef.current = true;
      } catch {
        // The menu remains usable even when a host browser blocks history state changes.
      }
    }
    setAccountMenuOpen(true);
  }

  function closeAccountMenu() {
    setAccountMenuOpen(false);
    if (popupHistoryRef.current) {
      popupHistoryRef.current = false;
      window.history.back();
    }
  }

  function chooseLogin() {
    closeAccountMenu();
    window.requestAnimationFrame(() => passwordInputRef.current?.focus());
  }

  function chooseSettings() {
    closeAccountMenu();
    setReturnTo("/?settings=1");
    setNotice("Sign in to open Settings. You’ll be taken there after sign-in.");
    window.requestAnimationFrame(() => passwordInputRef.current?.focus());
  }

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
      {accountMenuOpen && <button className="login-popup-dismiss" type="button" aria-label="Close account menu" onClick={closeAccountMenu} />}
      <header className="login-topbar" onPointerDown={(event) => { if (accountMenuOpen && !(event.target as HTMLElement).closest(".login-logo-anchor")) closeAccountMenu(); }}>
        <span className="login-brand">
          <strong>Cooking Creator</strong>
          <small>AI COOKING CONTENT APP</small>
        </span>
        <div className="login-logo-anchor">
          <button className="login-assistant-mark" type="button" aria-label="Open settings and account menu" aria-expanded={accountMenuOpen} onClick={() => accountMenuOpen ? closeAccountMenu() : openAccountMenu()}>
            <ChefHatLogo />
          </button>
          <div className={accountMenuOpen ? "login-logo-popover is-open" : "login-logo-popover"} aria-hidden={!accountMenuOpen}>
            <button type="button" onClick={chooseSettings}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2" /><path d="m19.2 13.7 1.1 1.9-2 3.4-2.2-.5a7.8 7.8 0 0 1-1.8 1l-.8 2h-3.9l-.8-2a7.8 7.8 0 0 1-1.8-1l-2.2.5-2-3.4 1.1-1.9a7.8 7.8 0 0 1 0-2.1L3 9.7l2-3.4 2.2.5a7.8 7.8 0 0 1 1.8-1l.8-2h3.9l.8 2a7.8 7.8 0 0 1 1.8 1l2.2-.5 2 3.4-1.1 1.9a7.8 7.8 0 0 1 0 2.1z" /></svg>
              Settings
            </button>
            <button type="button" onClick={chooseLogin}>
              <span className="login-account-dot" aria-hidden="true" />
              Log in
            </button>
          </div>
        </div>
      </header>
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-mark" aria-hidden="true"><ChefHatLogo /></div>
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
            ref={passwordInputRef}
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
