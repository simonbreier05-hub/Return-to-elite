"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";
import { useSocket } from "./useSocket";
import NoteCountBadge from "./NoteCountBadge";
import { RoomFlagIcons } from "./RoomFlags";
import RoomDetailModal, { type SearchedRoom } from "./RoomDetailModal";
import ErrorBoundary from "./ErrorBoundary";
import { ChatProvider } from "./chat/ChatContext";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";
import { notificationText, notificationTypeLabel } from "@/lib/i18n/notificationText";
import LanguageButton, { LanguageQualityBadge, LanguageSuggestion } from "./LanguagePicker";
import CloseButton from "./CloseButton";
import { useEscapeKey } from "./useEscapeKey";
import { roleHome, type Role } from "@/lib/domain";
import { firstName, greetingKey, initials } from "@/lib/ui/greeting";
import { STATUS_UI, uiStatusForRoom } from "@/lib/ui/status";
import { Pill } from "./ui/Pill";
import { Button } from "./ui/Button";
import { cx, FOCUS_RING, Glyph } from "./ui/primitives";
import { GlassIconButton } from "./shell/GlassIconButton";
import { HeaderPhoto } from "./shell/HeaderPhoto";
import { Rail, Sidebar, TabBar } from "./shell/ShellNav";

interface Notification {
  id: string;
  type: string;
  level: string;
  message: string;
  messageKey?: string | null;
  messageVars?: string | null;
  targetRole: string;
  targetUserId?: string | null;
  acknowledged: boolean;
  createdAt: string;
}

/** Meldungs-Stufen — eigenes System, nie mit Zimmerstatus verwechselbar; immer mit Typ-Text daneben. */
const LEVEL_STYLES: Record<string, string> = {
  info: "border-s-status-info-fg",
  warning: "border-s-status-warning-fg",
  critical: "border-s-status-danger-fg",
};

/** Schließt ein Aufklapp-Feld bei Klick daneben. */
function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open, close]);
  return ref;
}

/** Datum + Uhrzeit Berlin für den Kopf, minutengenau; erst nach dem Mounten (Server und Browser gleich). */
function HeaderDate() {
  const { fmt } = useLocale();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (!now) return <span className="text-label block h-5" aria-hidden />;
  const date = fmt.date(now, { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  return (
    <p className="text-label text-text-secondary" role="timer">
      {date} · {fmt.time(now)}
    </p>
  );
}

/**
 * App-Rahmen „Glas & Premium“ (Design D1, docs/design/glass-spec.md Abschnitt 10):
 * - ab 1280 px schwebende Seitenleiste 264 px, 640–1279 px Icon-Leiste 80 px, darunter Tab-Leiste unten;
 *   Menü nur aus `src/lib/nav.ts`.
 * - Kopf mit Datum, Begrüßung (bzw. Titel + Zurück auf Unterseiten), Suche, Glocke, Avatar; Kopf-Foto
 *   aus `src/lib/branding.ts`.
 *
 * `title` ist ein Übersetzungsschlüssel (die page.tsx sind Server-Komponenten). `backHref` zeigt einen
 * Zurück-Knopf zur Elternseite; Rollen-Startseiten lassen ihn weg und zeigen die Begrüßung.
 * `legacy` (Standard): der Seiteninhalt ist noch im alten hellen Design und bekommt eine helle Fläche,
 * bis D2–D5 die Seite umstellen und `legacy={false}` setzen.
 */
export default function AppShell({
  title,
  userName,
  role,
  backHref,
  subtitle,
  legacy = true,
  children,
}: {
  title: TKey;
  userName: string;
  role: string;
  backHref?: string;
  /** Untertitel unter der Begrüßung; Standard ist der Seitentitel. */
  subtitle?: string;
  legacy?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { t, fmt } = useLocale();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [devUsers, setDevUsers] = useState<{ email: string; name: string; role: string }[] | null>(null);
  const [greetingAt, setGreetingAt] = useState<Date | null>(null);
  useEffect(() => setGreetingAt(new Date()), []);

  // Globale Zimmer-Schnellsuche — im Rahmen, damit sie von jeder Seite erreichbar ist.
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<SearchedRoom[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<SearchedRoom | null>(null);

  // Rollenwechsel nur im Testmodus. Der Endpunkt antwortet sonst mit 404, dann erscheint nichts.
  useEffect(() => {
    fetch("/api/auth/dev-login")
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => setDevUsers(d.enabled ? d.users : null))
      .catch(() => setDevUsers(null));
  }, []);

  const switchTo = async (email: string) => {
    if (!email) return;
    await api("/api/auth/dev-login", { body: { email } });
    // Harte Navigation: der App-Router-Cache gehört nach dem Identitätswechsel noch dem alten Nutzer.
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
    const timer = setTimeout(() => {
      api<{ rooms: SearchedRoom[] }>(`/api/rooms?q=${encodeURIComponent(q)}`)
        .then((d) => setMatches(d.rooms))
        .catch(() => setMatches([]));
    }, 280);
    return () => clearTimeout(timer);
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
    // Socket-Ereignisse erreichen jeden Client — den Rollenfilter von /api/notifications hier wiederholen.
    // Der Server bleibt maßgeblich; das hier entscheidet nur die Anzeige.
    "notification:new": (p: { notification: Notification }) => {
      const n = p?.notification;
      if (!n) return;
      if (role !== "duty_manager" && n.targetRole !== role) return;
      if (n.targetUserId) { load(); return; } // an eine Person gerichtet: der Server entscheidet, ob es meine ist
      setNotifications((prev) => (prev.some((x) => x.id === n.id) ? prev : [n, ...prev].slice(0, 50)));
    },
  });

  useEscapeKey(() => setOpen(false), open);
  useEscapeKey(() => setProfileOpen(false), profileOpen);
  useEscapeKey(() => setSearchOpen(false), searchOpen);
  const searchRef = useOutsideClose(searchOpen, () => setSearchOpen(false));
  const profileRef = useOutsideClose(profileOpen, () => setProfileOpen(false));

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
  const home = roleHome(role as Role) ?? "/";
  const myInitials = initials(userName);

  /** Profil: Name, Rolle, Sprache, Abmelden (Seitenleiste unten und Avatar-Menü). */
  const profileBlock = (
    <>
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="bg-champagne text-body-18 flex size-10 shrink-0 items-center justify-center rounded-pill text-text-on-accent">
          {myInitials}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-body-16 truncate text-text-primary">{userName}</span>
          <span className="text-label truncate text-text-muted">{t(roleKey)}</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <LanguageButton className="h-12! border-border-subtle! bg-surface-card-raised! text-text-primary! hover:bg-surface-card!" />
        <LanguageQualityBadge className="hidden 2xl:inline" />
        <button
          type="button"
          onClick={logout}
          className={cx("press glass-fill text-body-16 flex min-h-(--size-touch-min) flex-1 items-center justify-center gap-2 rounded-(--glass-radius-md) border border-border-subtle px-4 text-text-primary", FOCUS_RING)}
        >
          <Glyph name="log-out" size={20} className="rtl:-scale-x-100" />
          {t("common.signOut")}
        </button>
      </div>
    </>
  );

  return (
    <ChatProvider>
      <div className="theme-glass bg-atmosphere min-h-dvh">
        <Sidebar role={role} home={home} profile={profileBlock} />
        <Rail
          role={role}
          home={home}
          monogram="S"
          footer={<GlassIconButton icon="user" label={t("appShell.profile")} onClick={() => setProfileOpen(true)} expanded={profileOpen} />}
        />

        <div className="relative min-h-dvh sm:ps-[calc(var(--size-sidebar-rail)+8px)] xl:ps-[calc(var(--size-sidebar-wide)+8px)]">
          <HeaderPhoto />

          <header className="relative z-20 px-4 pt-6 sm:px-6">
            {/* Zeile 1: Datum bzw. Zurück links, Aktionen rechts. Zeile 2: Begrüßung/Titel über die volle Breite (auch auf dem Handy einzeilig). */}
            <div className="flex min-h-(--size-touch-min) items-start justify-between gap-4">
              {backHref ? (
                <button
                  onClick={() => router.push(backHref)}
                  className={cx("press -ms-2 flex h-12 min-w-11 shrink-0 items-center justify-center gap-1 rounded-pill px-2 text-body-16 text-text-secondary sm:pe-3", FOCUS_RING)}
                  aria-label={t("appShell.back")}
                  title={t("appShell.back")}
                >
                  <Glyph name="arrow-left" size={22} className="rtl:-scale-x-100" />
                  <span className="hidden sm:inline">{t("appShell.back")}</span>
                </button>
              ) : (
                <HeaderDate />
              )}
            <div className="flex shrink-0 items-center gap-2">
              <div ref={searchRef} className="relative">
                <GlassIconButton icon="search" label={t("appShell.findRoom")} onClick={() => setSearchOpen((o) => !o)} expanded={searchOpen} />
                {searchOpen && (
                  <div className="glass animate-in-up absolute end-0 top-14 z-50 flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-2 rounded-(--glass-radius-md) p-3">
                    <input
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && searchEnter()}
                      placeholder={t("appShell.findRoom")}
                      aria-label={t("appShell.findRoom")}
                      inputMode="numeric"
                      className={cx("text-body-16 min-h-(--size-touch-min) w-full rounded-(--glass-radius-md) border border-border-subtle bg-surface-progress-track px-4 text-text-primary placeholder:text-text-muted", FOCUS_RING)}
                    />
                    {matches.slice(0, 8).map((r) => {
                      const s = STATUS_UI[uiStatusForRoom(r.status)];
                      return (
                        <button
                          key={r.id}
                          onClick={() => openRoom(r)}
                          className={cx("press flex min-h-(--size-touch-min) w-full items-center justify-between gap-2 rounded-(--glass-radius-sm) px-3 text-start hover:bg-surface-selected", FOCUS_RING)}
                        >
                          <span className="flex items-center gap-1.5">
                            <span className="text-title-22 text-text-primary">{r.number}</span>
                            <RoomFlagIcons occupancy={r.occupancy} isCheckoutToday={r.isCheckoutToday} iconClassName="h-2.5 w-2.5" />
                            <NoteCountBadge openCount={r.openNotesCount} totalCount={r.notes.length} />
                          </span>
                          <Pill tone={s.tone}>
                            <Glyph name={s.icon} size={16} className="me-1" />
                            {t(`status.${r.status}` as TKey)}
                          </Pill>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <GlassIconButton
                icon="bell"
                label={unread > 0 ? `${t("appShell.notifications")} (${unread})` : t("appShell.notifications")}
                onClick={() => setOpen((o) => !o)}
                dot={unread > 0}
                expanded={open}
              />
              <div ref={profileRef} className="relative">
                <button
                  type="button"
                  onClick={() => setProfileOpen((o) => !o)}
                  aria-label={`${t("appShell.profile")}: ${userName}`}
                  title={userName}
                  aria-expanded={profileOpen}
                  className={cx("press bg-champagne text-body-18 flex size-(--size-touch-min) items-center justify-center rounded-pill text-text-on-accent", FOCUS_RING)}
                >
                  {myInitials}
                </button>
                {profileOpen && (
                  <div className="glass animate-in-up absolute end-0 top-14 z-50 flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-3 rounded-(--glass-radius-md) p-4">
                    {profileBlock}
                    {devUsers && (
                      <select
                        aria-label={t("appShell.devSwitchLabel")}
                        value=""
                        onChange={(e) => switchTo(e.target.value)}
                        className={cx("text-body-16 min-h-(--size-touch-min) rounded-(--glass-radius-md) border border-border-subtle bg-surface-card-raised px-3 text-text-primary", FOCUS_RING)}
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
                  </div>
                )}
              </div>
            </div>
            </div>
            {backHref ? (
              <h1 className="text-title-28 sm:text-display -mt-2 truncate text-text-primary">{t(title)}</h1>
            ) : (
              <div className="-mt-2">
                <h1 className="text-title-28 sm:text-display text-text-primary">
                  {greetingAt ? t(greetingKey(greetingAt), { name: firstName(userName) }) : t(title)}
                </h1>
                <p className="text-body-16 text-text-secondary">{subtitle ?? t(title)}</p>
              </div>
            )}
          </header>

          {open && (
            <div role="dialog" aria-label={t("appShell.notifications")} className="theme-glass glass animate-in-up fixed inset-x-2 top-24 z-50 mx-auto max-w-lg rounded-(--glass-radius-lg) sm:start-auto sm:end-6 sm:w-[26rem]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
                <span className="text-title-22 text-text-primary">{t("appShell.notifications")}</span>
                <div className="ms-auto flex items-center gap-2">
                  <Button variant="secondary" className="min-h-11! whitespace-nowrap px-3! text-label!" onClick={ackAll}>
                    {t("appShell.markAllRead")}
                  </Button>
                  <CloseButton onClick={() => setOpen(false)} className="border-border-subtle! bg-surface-card-raised! text-text-primary! hover:bg-surface-card!" />
                </div>
              </div>
              <div className="max-h-96 overflow-y-auto p-2">
                {notifications.length === 0 && <p className="text-body-16 p-4 text-text-muted">{t("appShell.noNotifications")}</p>}
                {notifications.map((n, i) => (
                  <div
                    key={n.id}
                    style={{ "--i": i } as React.CSSProperties}
                    className={cx("animate-in-up mb-2 rounded-(--glass-radius-sm) border-s-4 bg-surface-card-raised p-3", LEVEL_STYLES[n.level], n.acknowledged && "opacity-65")}
                  >
                    <div className="text-label text-text-muted">
                      {notificationTypeLabel(n.type, t)} · {fmt.time(n.createdAt)}
                    </div>
                    <div className="text-body-16 mt-1 text-text-primary">{notificationText(n, t)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedRoom && <RoomDetailModal room={selectedRoom} onClose={() => setSelectedRoom(null)} />}

          <main className="relative z-10 mx-auto w-full max-w-7xl px-3 pt-6 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
            <ErrorBoundary>
              {legacy ? (
                // Alter Seiteninhalt (helle Palette) bis zur Umstellung in D2–D5 auf heller Fläche — sonst wäre Navy-Text auf Dunkel unlesbar.
                <div className="rounded-(--glass-radius-lg) bg-ivory p-3 font-sans text-charcoal sm:p-6">
                  <LanguageSuggestion />
                  {children}
                </div>
              ) : (
                <>
                  <LanguageSuggestion glass />
                  {children}
                </>
              )}
            </ErrorBoundary>
          </main>
        </div>

        <TabBar role={role} />
      </div>
    </ChatProvider>
  );
}
