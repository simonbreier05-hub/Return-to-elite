"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/components/api";

interface DevUser {
  id: string;
  email: string;
  name: string;
  role: string;
  section?: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  room_attendant: "Attendant",
  supervisor: "Supervisor",
  front_office: "Front Office",
  concierge: "Concierge",
  engineering: "Engineering",
  duty_manager: "Duty Manager",
};

/** Order the roles the way a shift is run, not alphabetically. */
const ROLE_ORDER = ["supervisor", "duty_manager", "front_office", "concierge", "engineering", "room_attendant"];

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [devUsers, setDevUsers] = useState<DevUser[] | null>(null);

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

  // One tile per POSITION, not per person — ten named attendants on one
  // screen was the clutter being complained about. Anyone who needs a
  // specific attendant (not just "an" attendant) still reaches them from
  // the header's "Switch role" selector once signed in.
  const positions = useMemo(() => {
    if (!devUsers) return [];
    return ROLE_ORDER.map((role) => {
      const people = devUsers.filter((u) => u.role === role).sort((a, b) => a.name.localeCompare(b.name));
      if (people.length === 0) return null;
      // Maria is the attendant every other quick-login shortcut in this app
      // already defaults to (see POSITION_HANDLES server-side) — keep that
      // one consistent rather than picking whoever sorts first.
      const representative = people.find((u) => u.name.startsWith("Maria")) ?? people[0];
      return { role, label: ROLE_LABELS[role] ?? role, user: representative, count: people.length };
    }).filter((p): p is { role: string; label: string; user: DevUser; count: number } => p !== null);
  }, [devUsers]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-charcoal p-4">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center text-ivory">
          <h1 className="font-serif text-6xl tracking-[0.04em] text-gold-soft">StayClean</h1>
          {/* Navy at the front door, gold everywhere else inside — the one
              deliberate brand touch, kept to where a mark would sit anyway. */}
          <div className="mx-auto my-4 h-px w-24 bg-gradient-to-r from-transparent via-navy-line to-transparent" />
          <p className="text-[0.7rem] uppercase tracking-[0.32em] text-ivory/55">Housekeeping &amp; Room Release</p>
        </div>

        {error && (
          <p className="mx-auto mb-4 max-w-md rounded-lg bg-red-900/40 p-3 text-center text-sm text-red-100">{error}</p>
        )}

        {devUsers ? (
          <div className="rounded-2xl bg-ivory p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-serif text-2xl">Choose your position</h2>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wider text-amber-800">
                Dev mode · no password
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {positions.map(({ role, label, user, count }) => (
                <button
                  key={role}
                  onClick={() => quickLogin(user.email)}
                  disabled={busy}
                  className="flex h-20 flex-col items-center justify-center rounded-xl border border-charcoal/15 bg-linen px-3 text-center transition hover:border-navy-line hover:bg-parchment disabled:opacity-40"
                >
                  <div className="text-sm font-semibold">{label}</div>
                  {count > 1 && <div className="text-xs text-graphite/60">as {user.name}</div>}
                </button>
              ))}
            </div>

            <p className="mt-5 text-center text-xs text-graphite/55">
              Password sign-in is hidden while quick login is on. Need it back? Set{" "}
              <code className="rounded bg-charcoal/5 px-1 py-0.5">ALLOW_DEV_LOGIN</code> off, or ask for a specific
              attendant via the role switcher in the header after signing in.
            </p>
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
    >
      <label className="mb-1 block text-sm font-medium">Email</label>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="mb-3 h-12 w-full rounded-lg border border-charcoal/20 bg-white px-4 text-base outline-none focus:border-gold"
        placeholder="name@hotel.test"
        autoComplete="username"
      />
      <label className="mb-1 block text-sm font-medium">Password</label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="mb-4 h-12 w-full rounded-lg border border-charcoal/20 bg-white px-4 text-base outline-none focus:border-gold"
        autoComplete="current-password"
      />
      <button
        type="submit"
        disabled={busy}
        className="h-12 w-full rounded-lg bg-charcoal text-base font-medium text-ivory transition hover:bg-espresso disabled:opacity-50"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
