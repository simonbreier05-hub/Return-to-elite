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

  const load = () =>
    api<{ notifications: Notification[] }>("/api/notifications")
      .then((d) => setNotifications(d.notifications))
      .catch(() => {});

  useEffect(() => {
    load();
  }, []);

  useSocket({
    "notification:new": () => load(),
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
      <header className="sticky top-0 z-40 bg-charcoal text-ivory shadow-lg">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-baseline gap-3">
            <span className="font-serif text-2xl tracking-wide text-gold-soft">StayClean</span>
            <span className="hidden text-sm uppercase tracking-[0.2em] text-ivory/60 sm:inline">{title}</span>
          </div>
          <div className="flex items-center gap-2">
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
              <div className="text-xs uppercase tracking-wider text-gold-soft">{role.replace(/_/g, " ")}</div>
            </div>
            <button
              onClick={logout}
              className="ml-2 h-12 rounded-lg border border-white/20 px-4 text-sm hover:bg-white/10"
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

      <main className="mx-auto w-full max-w-7xl flex-1 px-3 py-4 sm:px-6">{children}</main>
    </div>
  );
}
