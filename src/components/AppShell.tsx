"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { api } from "./api";
import { useSocket } from "./useSocket";
import { STATUS_STYLES } from "./status";
import { STATUS_LABELS } from "@/lib/domain";
import NoteCountBadge from "./NoteCountBadge";
import { RoomFlagIcons } from "./RoomFlags";
import RoomDetailModal, { type SearchedRoom } from "./RoomDetailModal";
import ErrorBoundary from "./ErrorBoundary";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";
import LanguageSwitcher from "./LanguageSwitcher";

interface Notification {
  id: string;
  type: string;
  level: string;
  message: string;
  targetRole: string;
  acknowledged: boolean;
  createdAt: string;
}

/** Alert *levels* — a separate semantic system from room status colours,
 * kept in the same muted register so it never reads as a room-status hue. */
const LEVEL_STYLES: Record<string, string> = {
  info: "border-l-navy-line",
  warning: "border-l-gold",
  critical: "border-l-status-out-of-order",
};

/**
 * Shared shell: elegant header, live notification bell (Socket.IO), logout.
 * Tablet-first: 48px+ touch targets throughout.
 *
 * `title` is a translation key (e.g. "nav.myRooms"), not literal text — the
 * page.tsx wrappers that render this are server components and cannot call
 * useLocale() themselves, so the key travels down and is resolved here.
 *
 * `backHref` shows a back chevron to that parent screen. Role dashboards
 * leave it unset — they are the home screen, so there is nothing to go back to.
 */
export default function AppShell({
  title,
  userName,
  role,
  backHref,
  children,
}: {
  title: TKey;
  userName: string;
  role: string;
  backHref?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { t } = useLocale();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [devUsers, setDevUsers] = useState<{ email: string; name: string; role: string }[] | null>(null);

  // Global room quick search — lives here so it's reachable from every
  // dashboard, without each page needing its own copy.
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<SearchedRoom[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<SearchedRoom | null>(null);

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

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setMatches([]);
      return;
    }
    const t = setTimeout(() => {
      api<{ rooms: SearchedRoom[] }>(`/api/rooms?q=${encodeURIComponent(q)}`)
        .then((d) => setMatches(d.rooms))
        .catch(() => setMatches([]));
    }, 280);
    return () => clearTimeout(t);
  }, [query]);

  const openRoom = (room: SearchedRoom) => {
    setSelectedRoom(room);
    setSearchOpen(false);
    setQuery("");
  };

  const searchEnter = () => {
    const q = query.trim();
    if (!q) return;
    const exact = matches.find((r) => r.number === q);
    if (exact) return openRoom(exact);
    if (matches.length === 1) openRoom(matches[0]);
  };

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

  const roleKey = `role.${role}` as TKey;

  return (
    <div className="min-h-screen flex flex-col">
      {/* A slim navy edge — the house's own accent, kept to this one line —
          over a light, paper-toned bar carrying the real crest. Border
          rather than a second sticky element, so scrolling never risks a
          gap or a stacking mismatch between the two. */}
      <header className="sticky top-0 z-40 border-t-[3px] border-navy bg-linen text-charcoal shadow-lift">
        <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3.5">
            {backHref && (
              <button
                onClick={() => router.push(backHref)}
                className="-ml-2 flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-navy transition hover:bg-parchment"
                aria-label={t("appShell.back")}
                title={t("appShell.back")}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
            )}
            <Image src="/brand/crest.png" alt="" width={34} height={27} className="h-[1.7rem] w-auto shrink-0" priority />
            <div className="flex items-baseline gap-4">
              <div className="leading-tight">
                <p className="text-[0.62rem] uppercase tracking-[0.24em] text-gold-soft">{t("appShell.hotelBerlin")}</p>
                <p className="font-serif text-xl tracking-[0.01em] text-navy">{t(title)}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/floor-plan"
              className="hidden h-10 items-center rounded-sm border border-charcoal/15 px-3 text-xs font-medium uppercase tracking-wider text-charcoal/85 transition hover:bg-parchment sm:flex"
              title={t("appShell.floorPlanTitle")}
            >
              🗺️ {t("appShell.floorPlan")}
            </Link>
            <div className="relative hidden md:block">
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                onKeyDown={(e) => e.key === "Enter" && searchEnter()}
                placeholder={t("appShell.findRoom")}
                aria-label={t("appShell.findRoom")}
                className="h-11 w-40 rounded-sm border border-charcoal/15 bg-parchment/60 px-3 text-sm text-charcoal outline-none transition-all placeholder:text-charcoal/40 focus:w-56 focus:border-gold"
              />
              {searchOpen && matches.length > 0 && (
                <div className="absolute left-0 top-12 z-50 w-64 overflow-hidden rounded-xl border border-charcoal/10 bg-linen text-charcoal shadow-2xl">
                  {matches.slice(0, 8).map((r) => (
                    <button
                      key={r.id}
                      onClick={() => openRoom(r)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-parchment"
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="font-serif">{r.number}</span>
                        <RoomFlagIcons occupancy={r.occupancy} isCheckoutToday={r.isCheckoutToday} iconClassName="h-2.5 w-2.5" />
                        <NoteCountBadge openCount={r.openNotesCount} totalCount={r.notes.length} />
                      </span>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.68rem] ${STATUS_STYLES[r.status].chip}`}>
                        {STATUS_LABELS[r.status]}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="hidden sm:inline-flex">
              <LanguageSwitcher />
            </div>
            {devUsers && (
              <select
                aria-label={t("appShell.devSwitchLabel")}
                value=""
                onChange={(e) => switchTo(e.target.value)}
                className="hidden h-12 max-w-[11rem] rounded-sm border border-charcoal/15 bg-parchment/60 px-3 text-sm text-charcoal outline-none focus:border-gold md:block"
                title={t("appShell.devSwitchTitle")}
              >
                <option value="">{t("common.switchRole")}</option>
                {devUsers.map((u) => (
                  <option key={u.email} value={u.email}>
                    {u.name} · {t(`role.${u.role}` as TKey)}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => setOpen((o) => !o)}
              className="relative flex h-12 w-12 items-center justify-center rounded-full hover:bg-parchment"
              aria-label={t("appShell.notifications")}
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
              {unread > 0 && (
                <span className="absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-status-out-of-order px-1 text-xs font-bold text-linen">
                  {unread}
                </span>
              )}
            </button>
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium">{userName}</div>
              <div className="text-[0.68rem] uppercase tracking-[0.16em] text-gold-soft">{t(roleKey)}</div>
            </div>
            <button
              onClick={logout}
              className="ml-2 h-12 rounded-sm border border-charcoal/15 px-4 text-sm transition hover:bg-parchment hover:border-charcoal/25"
            >
              {t("common.signOut")}
            </button>
          </div>
        </div>
      </header>

      {open && (
        <div className="fixed inset-x-2 top-20 z-50 mx-auto max-w-lg animate-sheet rounded-2xl border border-charcoal/10 bg-linen shadow-2xl sm:right-6 sm:left-auto sm:w-[26rem]">
          <div className="flex items-center justify-between border-b border-charcoal/10 px-4 py-3">
            <span className="font-serif text-lg text-navy">{t("appShell.notifications")}</span>
            <div className="flex items-center gap-2">
              <div className="sm:hidden">
                <LanguageSwitcher />
              </div>
              <button onClick={ackAll} className="h-10 rounded-sm px-3 text-sm text-gold-soft hover:bg-parchment">
                {t("appShell.markAllRead")}
              </button>
              <button onClick={() => setOpen(false)} className="h-10 w-10 rounded-sm hover:bg-parchment">✕</button>
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto p-2">
            {notifications.length === 0 && <p className="p-4 text-sm text-graphite/70">{t("appShell.noNotifications")}</p>}
            {notifications.map((n, i) => (
              <div
                key={n.id}
                style={{ "--stagger-i": i } as React.CSSProperties}
                className={`mb-2 animate-stagger rounded-lg border border-charcoal/5 border-l-4 bg-ivory p-3 ${LEVEL_STYLES[n.level] ?? ""} ${
                  n.acknowledged ? "opacity-50" : ""
                }`}
              >
                <div className="text-xs uppercase tracking-wider text-graphite/70">
                  {n.type.replace(/_/g, " ")} · {new Date(n.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
                <div className="mt-1 text-sm">{n.message}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedRoom && <RoomDetailModal room={selectedRoom} onClose={() => setSelectedRoom(null)} />}

      <div className="h-px w-full bg-gradient-to-r from-gold-line/70 via-gold-line/20 to-transparent" />

      <main className="mx-auto w-full max-w-7xl flex-1 px-3 py-6 sm:px-6">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
    </div>
  );
}
