"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";

const DEMO_USERS = [
  { email: "maria@hotel.test", label: "Maria · Room Attendant" },
  { email: "supervisor@hotel.test", label: "Sofia · Supervisor" },
  { email: "frontoffice@hotel.test", label: "Felix · Front Office" },
  { email: "concierge@hotel.test", label: "Claire · Concierge" },
  { email: "engineering@hotel.test", label: "Erik · Engineering" },
  { email: "manager@hotel.test", label: "Diana · Duty Manager" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const login = async (mail = email, pass = password) => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", { body: { email: mail, password: pass } });
      router.push("/");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-charcoal p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center text-ivory">
          <h1 className="font-serif text-6xl tracking-[0.04em] text-gold-soft">StayClean</h1>
          <div className="mx-auto my-4 h-px w-24 bg-gradient-to-r from-transparent via-gold-line to-transparent" />
          <p className="text-[0.7rem] uppercase tracking-[0.32em] text-ivory/55">Housekeeping &amp; Room Release</p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            login();
          }}
          className="rounded-2xl bg-ivory p-6 shadow-2xl"
        >
          <label className="mb-1 block text-sm font-medium">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mb-4 h-12 w-full rounded-lg border border-charcoal/20 bg-white px-4 text-base outline-none focus:border-gold"
            placeholder="you@hotel.test"
            autoComplete="username"
          />
          <label className="mb-1 block text-sm font-medium">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-4 h-12 w-full rounded-lg border border-charcoal/20 bg-white px-4 text-base outline-none focus:border-gold"
            placeholder="stayclean123"
            autoComplete="current-password"
          />
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="h-12 w-full rounded-lg bg-charcoal text-base font-medium text-ivory hover:bg-graphite disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>

          <div className="mt-6 border-t border-charcoal/10 pt-4">
            <p className="mb-2 text-xs uppercase tracking-wider text-graphite/60">Demo users (password: stayclean123)</p>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_USERS.map((u) => (
                <button
                  key={u.email}
                  type="button"
                  onClick={() => login(u.email, "stayclean123")}
                  className="h-11 rounded-lg border border-charcoal/15 bg-parchment px-2 text-xs hover:border-gold"
                >
                  {u.label}
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
