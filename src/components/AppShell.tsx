"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";
import { useSocket } from "./useSocket";

interface Notification {
  id: string;
  type: string;
  level: string;
  message: string;
  targetRole: string;
  acknowledged: boolean;
  createdAt: string;
}

const LEVEL_STYLES: Record<string, string> = {
  info: "border-l-emerald-500",
  warning: "border-l-amber-500",
  critical: "border-l-red-600",
};

/**
 * Shared shell: elegant header, live notification bell (Socket.IO), logout.
 * Tablet-first: 48px+ touch targets throughout.
 */
export default function AppShell({
  title,
  userName,
  role,
  children,
}: {
  title: string;
  userName: string;
  role: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [devUsers, setDevUsers] = useState<{ email: string; name: string; role: string }[] | null>(null);

  // Quick role switching, dev only. The endpoint 404s when it is disabled, so
  // nothing renders on a locked-down deployment.
  useEffect(() => {
    fetch("/api/auth/dev-login")
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => setDevUsers(d.enabled ? d.users : null))
      .catch(() => setDevUsers(null));
  }, []);

  const switchTo = async (email: string) => {
    if (!email) return;
    await api("/api/auth/dev-login", { body: { email } });
    // A hard navigation, not router.push: the App Router caches rendered
    // segments per client, and after an identity change that cache still
    // belongs to the previous user. Reloading drops it along with any state
    // the old role's views were holding.
    window.location.assign("/");
  };

  const load = () =>
    api<{ notifications: Notification[] }>("/api/notifications")
      .then((d) => setNotifications(d.notifications))
      .catch(() => {});

  useEffect(() => {
    load();
  }, []);

  useSocket({
    // The payload carries the full notification, so prepend it instead of
    // refetching the list on every alert. Socket events reach every connected
    // client, so the role filter that /api/notifications applies server-side
    // has to be repeated here — otherwise front office would see supervisor
    // alerts. The server remains the authority; this only decides display.
    "notification:new": (p: { notification: Notification }) => {
      const n = p?.notification;
      if (!n) return;
      if (role !== "duty_manager" && n.targetRole !== role) return;
      setNotifications((prev) => (prev.some((x) => x.id === n.id) ? prev : [n, ...prev].slice(0, 50)));
    },
  });

  const unread = notifications.filter((n) => !n.acknowledged).length;

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const ackAll = async () => {
    await api("/api/notifications", { method: "PATCH", body: { all: true } });
    load();
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* A slim navy edge — the house's own accent, kept to this one line;
          border rather than a second sticky element, so scrolling never
          risks a gap or a stacking mismatch between the two. */}
      <header className="sticky top-0 z-40 border-t-[3px] border-navy-line bg-charcoal text-ivory shadow-lift">
        <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-baseline gap-4">
            <span className="font-serif text-[1.7rem] tracking-[0.06em] text-gold-soft">StayClean</span>
            <span className="hidden h-4 w-px bg-ivory/20 sm:block" />
            <span className="hidden text-[0.72rem] uppercase tracking-[0.24em] text-ivory/55 sm:inline">{title}</span>
          </div>
          <div className="flex items-center gap-2">
            {devUsers && (
              <select
                aria-label="Switch role (dev)"
                value=""
                onChange={(e) => switchTo(e.target.value)}
                className="hidden h-12 max-w-[11rem] rounded-xl border border-gold-line/40 bg-white/10 px-3 text-sm text-ivory outline-none md:block"
                title="Development: switch role without signing out"
              >
                <option value="" className="text-charcoal">
                  Switch role…
                </option>
                {devUsers.map((u) => (
                  <option key={u.email} value={u.email} className="text-charcoal">
                    {u.name} · {u.role.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => setOpen((o) => !o)}
              className="relative flex h-12 w-12 items-center justify-center rounded-full hover:bg-white/10"
              aria-label="Notifications"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
              {unread > 0 && (
                <span className="absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold">
                  {unread}
                </span>
              )}
            </button>
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium">{userName}</div>
              <div className="text-[0.68rem] uppercase tracking-[0.16em] text-gold-soft">{role.replace(/_/g, " ")}</div>
            </div>
            <button
              onClick={logout}
              className="ml-2 h-12 rounded-xl border border-white/20 px-4 text-sm transition hover:bg-white/10"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {open && (
        <div className="fixed inset-x-2 top-20 z-50 mx-auto max-w-lg rounded-2xl border border-charcoal/10 bg-white shadow-2xl sm:right-6 sm:left-auto sm:w-[26rem]">
          <div className="flex items-center justify-between border-b border-charcoal/10 px-4 py-3">
            <span className="font-serif text-lg">Notifications</span>
            <div className="flex gap-2">
              <button onClick={ackAll} className="h-10 rounded-lg px-3 text-sm text-gold hover:bg-parchment">
                Mark all read
              </button>
              <button onClick={() => setOpen(false)} className="h-10 w-10 rounded-lg hover:bg-parchment">✕</button>
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto p-2">
            {notifications.length === 0 && <p className="p-4 text-sm text-graphite/60">No notifications.</p>}
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`mb-2 rounded-lg border border-charcoal/5 border-l-4 bg-ivory p-3 ${LEVEL_STYLES[n.level] ?? ""} ${
                  n.acknowledged ? "opacity-50" : ""
                }`}
              >
                <div className="text-xs uppercase tracking-wider text-graphite/60">
                  {n.type.replace(/_/g, " ")} · {new Date(n.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
                <div className="mt-1 text-sm">{n.message}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="h-px w-full bg-gradient-to-r from-gold-line/70 via-gold-line/20 to-transparent" />

      <main className="mx-auto w-full max-w-7xl flex-1 px-3 py-6 sm:px-6">{children}</main>
    </div>
  );
}
