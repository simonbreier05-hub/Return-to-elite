"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { api } from "@/components/api";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";
import LanguageSwitcher from "@/components/LanguageSwitcher";

interface DevUser {
  id: string;
  email: string;
  name: string;
  role: string;
  section?: string | null;
}

/** Order the roles the way a shift is run, not alphabetically. */
const ROLE_ORDER = ["supervisor", "duty_manager", "front_office", "concierge", "engineering", "room_attendant"];

export default function LoginPage() {
  const { t } = useLocale();
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
  // the header's "Switch role" selector once signed in. Role labels come
  // from the same central role.* dictionary AppShell uses, so "Room
  // Attendant" reads identically everywhere in the app.
  const positions = useMemo(() => {
    if (!devUsers) return [];
    return ROLE_ORDER.map((role) => {
      const people = devUsers.filter((u) => u.role === role).sort((a, b) => a.name.localeCompare(b.name));
      if (people.length === 0) return null;
      // Maria is the attendant every other quick-login shortcut in this app
      // already defaults to (see POSITION_HANDLES server-side) — keep that
      // one consistent rather than picking whoever sorts first.
      const representative = people.find((u) => u.name.startsWith("Maria")) ?? people[0];
      return { role, user: representative, count: people.length };
    }).filter((p): p is { role: string; user: DevUser; count: number } => p !== null);
  }, [devUsers]);

  return (
    // Light, paper-toned throughout — no dark panel behind the door, the
    // same "quiet luxury" register the whole app now carries.
    <div className="relative flex min-h-screen items-center justify-center bg-ivory p-4">
      <LanguageSwitcher className="absolute right-4 top-4" />
      <div className="w-full max-w-2xl">
        <div className="mb-9 text-center">
          <Image
            src="/brand/wordmark.png"
            alt="Hotel de Rome Berlin"
            width={666}
            height={383}
            priority
            className="mx-auto h-auto w-full max-w-[260px]"
          />
          <p className="mt-5 text-[0.68rem] uppercase tracking-[0.28em] text-graphite">{t("login.appName")}</p>
        </div>

        {error && (
          <p className="mx-auto mb-4 max-w-md animate-rise rounded-sm border border-status-out-of-order/30 bg-status-out-of-order/10 p-3 text-center text-sm text-status-out-of-order">
            {error}
          </p>
        )}

        {devUsers ? (
          <div className="rounded-xl border border-charcoal/10 bg-linen p-6 shadow-card">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-serif text-2xl text-navy">{t("login.choosePosition")}</h2>
              <span className="rounded-full bg-gold/10 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-wider text-gold-soft">
                {t("common.devMode")}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {positions.map(({ role, user, count }, i) => (
                <button
                  key={role}
                  onClick={() => quickLogin(user.email)}
                  disabled={busy}
                  style={{ "--stagger-i": i } as React.CSSProperties}
                  className="flex h-20 animate-stagger flex-col items-center justify-center rounded-lg border border-charcoal/15 bg-ivory px-3 text-center transition hover:-translate-y-0.5 hover:border-gold hover:bg-parchment hover:shadow-card disabled:opacity-40 disabled:hover:translate-y-0"
                >
                  <div className="text-sm font-semibold">{t(`role.${role}` as TKey)}</div>
                  {count > 1 && <div className="text-xs text-graphite">{t("login.asName", { name: user.name })}</div>}
                </button>
              ))}
            </div>

            <p className="mt-5 text-center text-xs text-graphite">{t("login.devModeNote")}</p>
          </div>
        ) : (
          <div className="mx-auto max-w-md rounded-xl border border-charcoal/10 bg-linen p-7 shadow-card">
            <PasswordForm
              {...{ email, setEmail, password, setPassword, busy, onSubmit: passwordLogin }}
            />
          </div>
        )}

        <p className="mt-8 text-center text-[0.68rem] tracking-[0.04em] text-graphite/70">{t("login.address")}</p>
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
  const { t } = useLocale();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label className="mb-2 block text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-graphite">
        {t("login.email")}
      </label>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="mb-5 h-11 w-full border-0 border-b border-charcoal/20 bg-transparent px-0.5 text-base outline-none placeholder:text-charcoal/25 focus:border-gold"
        placeholder="name@hotel.test"
        autoComplete="username"
      />
      <label className="mb-2 block text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-graphite">
        {t("login.password")}
      </label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="mb-7 h-11 w-full border-0 border-b border-charcoal/20 bg-transparent px-0.5 text-base outline-none focus:border-gold"
        autoComplete="current-password"
      />
      <button
        type="submit"
        disabled={busy}
        className="h-[3.1rem] w-full rounded-sm bg-navy text-[0.78rem] font-semibold uppercase tracking-[0.1em] text-ivory transition hover:-translate-y-px hover:bg-navy-line hover:shadow-lift disabled:opacity-50 disabled:hover:translate-y-0"
      >
        {busy ? t("login.signingIn") : t("login.signIn")}
      </button>
    </form>
  );
}
