"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/api";

interface DevUser {
  id: string;
  email: string;
  name: string;
  role: string;
  section?: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  room_attendant: "Housekeeping",
  supervisor: "Supervisor",
  front_office: "Front Office",
  concierge: "Concierge",
  engineering: "Engineering",
  duty_manager: "Duty Manager",
};

/** Order the roles the way a shift is run, not alphabetically. */
const ROLE_ORDER = ["supervisor", "room_attendant", "front_office", "concierge", "engineering", "duty_manager"];

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [devUsers, setDevUsers] = useState<DevUser[] | null>(null);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  useEffect(() => {
    fetch("/api/auth/dev-login")
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => setDevUsers(d.enabled ? d.users : null))
      .catch(() => setDevUsers(null));
  }, []);

  // Hard navigation so the App Router cannot serve segments cached for a
  // previous session — see the same note in AppShell.
  const go = () => window.location.assign("/");

  const quickLogin = async (userEmail: string) => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/dev-login", { body: { email: userEmail } });
      go();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const passwordLogin = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", { body: { email, password } });
      go();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const byRole = (role: string) => (devUsers ?? []).filter((u) => u.role === role);

  return (
    <div className="flex min-h-screen items-center justify-center bg-charcoal p-4">
      <div className="w-full max-w-3xl">
        <div className="mb-8 text-center text-ivory">
          <h1 className="font-serif text-6xl tracking-[0.04em] text-gold-soft">StayClean</h1>
          <div className="mx-auto my-4 h-px w-24 bg-gradient-to-r from-transparent via-gold-line to-transparent" />
          <p className="text-[0.7rem] uppercase tracking-[0.32em] text-ivory/55">Housekeeping &amp; Room Release</p>
        </div>

        {error && (
          <p className="mx-auto mb-4 max-w-md rounded-lg bg-red-900/40 p-3 text-center text-sm text-red-100">{error}</p>
        )}

        {devUsers ? (
          <div className="rounded-2xl bg-ivory p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-serif text-2xl">Choose a role</h2>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wider text-amber-800">
                Dev mode · no password
              </span>
            </div>

            <div className="space-y-4">
              {ROLE_ORDER.filter((role) => byRole(role).length > 0).map((role) => (
                <div key={role}>
                  <div className="mb-1.5 text-[0.68rem] uppercase tracking-[0.16em] text-graphite/55">
                    {ROLE_LABELS[role] ?? role}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {byRole(role).map((u) => (
                      <button
                        key={u.id}
                        onClick={() => quickLogin(u.email)}
                        disabled={busy}
                        className="h-14 min-w-[9rem] rounded-xl border border-charcoal/15 bg-linen px-4 text-left transition hover:border-gold-line hover:bg-parchment disabled:opacity-40"
                      >
                        <div className="text-sm font-semibold">{u.name}</div>
                        <div className="text-xs text-graphite/60">
                          {u.section ? `prefers ${u.section}` : ROLE_LABELS[u.role] ?? u.role}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowPasswordForm((s) => !s)}
              className="mt-5 text-sm text-gold underline-offset-4 hover:underline"
            >
              {showPasswordForm ? "Hide password sign-in" : "Sign in with a password instead"}
            </button>

            {showPasswordForm && (
              <PasswordForm
                {...{ email, setEmail, password, setPassword, busy, onSubmit: passwordLogin }}
              />
            )}
          </div>
        ) : (
          <div className="mx-auto max-w-md rounded-2xl bg-ivory p-6 shadow-2xl">
            <PasswordForm
              {...{ email, setEmail, password, setPassword, busy, onSubmit: passwordLogin }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function PasswordForm({
  email,
  setEmail,
  password,
  setPassword,
  busy,
  onSubmit,
}: {
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  busy: boolean;
  onSubmit: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="mt-4 border-t border-charcoal/10 pt-4"
    >
      <label className="mb-1 block text-sm font-medium">Email or handle</label>
      {/* Deliberately type="text": the development handle "123" is not an
          address, and type="email" would have the browser reject it. */}
      <input
        type="text"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="mb-3 h-12 w-full rounded-lg border border-charcoal/20 bg-white px-4 text-base outline-none focus:border-gold"
        placeholder="123"
        autoComplete="username"
      />
      <label className="mb-1 block text-sm font-medium">Password</label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="mb-4 h-12 w-full rounded-lg border border-charcoal/20 bg-white px-4 text-base outline-none focus:border-gold"
        placeholder="123"
        autoComplete="current-password"
      />
      <button
        type="submit"
        disabled={busy}
        className="h-12 w-full rounded-lg bg-charcoal text-base font-medium text-ivory transition hover:bg-espresso disabled:opacity-50"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <p className="mt-2 text-center text-xs text-graphite/60">
        Development: type a <strong>position</strong> — supervisor, front office, concierge, engineering, attendant,
        manager — password <strong>123</strong>. Any seeded address also works, same password.
      </p>
    </form>
  );
}
