"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";
import { getSocket, RESYNC_EVENT, useSocket } from "@/components/useSocket";
import { useCoalescedRefetch } from "@/components/useCoalescedRefetch";
import { asChatMessage, useChat } from "@/components/chat/ChatContext";
import { channelTitle } from "@/components/chat/labels";
import { useLocale } from "@/lib/i18n/LocaleContext";
import {
  chatNeedsToast, freshFor, isUnreadMine, OFFLINE_HINT_DELAY_MS, pushToasts, shouldResync, soundFor, targetFor, toastsFor,
  type NotifyMe, type NotifyNotification, type NotifyToast, type SoundPref,
} from "@/lib/ui/notify";
import { playNotifySound, readSoundPref, unlockSound, writeSoundPref } from "@/lib/ui/notifySound";

export interface NotificationRow extends NotifyNotification {
  message: string;
  messageKey?: string | null;
  createdAt: string;
  acknowledged: boolean;
}

interface NotifyState {
  me: NotifyMe;
  notifications: NotificationRow[];
  unread: number;
  panelOpen: boolean;
  setPanelOpen: (v: boolean | ((o: boolean) => boolean)) => void;
  ackAll: () => Promise<void>;
  /** Meldung antippen: Ziel öffnen (Zimmer/Chat/Auftrag/Liste) und als gelesen markieren. */
  openNotification: (n: NotificationRow) => void;
  toasts: NotifyToast[];
  openToast: (t: NotifyToast) => void;
  dismissToast: (id: string) => void;
  /** Ungelesene, die beim Wiederöffnen/Neuverbinden dazukamen — Banner „N neue Meldungen“, bis geöffnet. */
  resyncCount: number;
  openResync: () => void;
  offline: boolean;
  soundPref: SoundPref;
  setSound: (v: "on" | "off") => void;
}

const Ctx = createContext<NotifyState | null>(null);
export const useNotify = () => useContext(Ctx);

const SEEN_KEY = "stayclean.notify.seen";
function readSeen(): Set<string> {
  try {
    const raw = window.sessionStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
function writeSeen(s: Set<string>) {
  try {
    window.sessionStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-300)));
  } catch {
    /* privates Fenster: dann nur im Speicher */
  }
}

/**
 * Meldungs-Zentrum (Paket O1) für alle Rollen — in AppShell und im Planungstool. Quelle: `notification:new` + `chat:message`;
 * der Server filtert (GET /api/notifications), der Client zeigt nur „meine“ (`src/lib/ui/notify.ts`).
 * Pop-up + Ton bei neuen Meldungen; beim Wiederöffnen (sichtbar/online/Reconnect) neu laden, `app:resync` senden und
 * Banner „N neue Meldungen“. `onOpenRoom` öffnet ein Zimmerfenster (AppShell); ohne ihn öffnet Antippen die Liste.
 */
export function NotifyProvider({ role, onOpenRoom, children }: { role: string; onOpenRoom?: (roomId: string, number: string | null) => void; children: ReactNode }) {
  const router = useRouter();
  const { t } = useLocale();
  const chat = useChat();
  const [me, setMe] = useState<NotifyMe>({ role, userId: null });
  const meRef = useRef(me);
  meRef.current = me;
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [toasts, setToasts] = useState<NotifyToast[]>([]);
  const [resyncCount, setResyncCount] = useState(0);
  const [offline, setOffline] = useState(false);
  const [soundPref, setSoundPref] = useState<SoundPref>("off");
  const seen = useRef<Set<string> | null>(null);
  const lastResync = useRef(0);

  useEffect(() => setSoundPref(readSoundPref()), []);

  const sound = useCallback((items: Pick<NotifyToast, "urgent">[]) => {
    const kind = soundFor(items);
    if (kind) playNotifySound(kind);
  }, []);

  /** live = Pop-ups für Neues; resync = Banner „N neue Meldungen“ (+ Ton); silent = nur Liste aktualisieren. */
  const load = useCallback(async (mode: "live" | "resync" | "silent") => {
    let d: { notifications?: NotificationRow[]; me?: NotifyMe };
    try {
      d = await api<{ notifications?: NotificationRow[]; me?: NotifyMe }>("/api/notifications");
    } catch {
      return;
    }
    const list = Array.isArray(d.notifications) ? d.notifications : [];
    const who: NotifyMe = d.me?.userId ? { role: d.me.role, userId: d.me.userId } : meRef.current;
    setMe(who);
    meRef.current = who;
    setNotifications(list);
    if (!seen.current) seen.current = readSeen();
    const fresh = freshFor(list, seen.current, who);
    if (!fresh.length) return;
    for (const n of fresh) seen.current.add(n.id);
    writeSeen(seen.current);
    if (mode === "silent") return;
    if (mode === "resync") {
      setResyncCount((c) => c + fresh.length);
      sound(fresh.map((n) => ({ urgent: n.level === "warning" || n.level === "critical" })));
      return;
    }
    // Chat-Meldungen kommen schon als Chat-Pop-up (chat:message) — nicht doppelt zeigen, nur in der Glocke zählen.
    const add = toastsFor(fresh.filter((n) => n.type !== "CHAT"));
    if (!add.length) return;
    setToasts((cur) => pushToasts(cur, add));
    sound(add);
  }, [sound]);

  const resync = useCallback(() => {
    const now = Date.now();
    if (!shouldResync(lastResync.current, now)) return;
    lastResync.current = now;
    void load("resync");
    chat.refresh();
    window.dispatchEvent(new Event(RESYNC_EVENT));
  }, [load, chat]);

  // Erster Aufruf: App (wieder) geöffnet — was ungelesen und noch nicht gesehen ist, erscheint im Banner.
  useEffect(() => { void load("resync"); }, [load]);

  const liveSoon = useCoalescedRefetch(() => { void load("live"); }, 250);

  useSocket({
    // Socket-Ereignisse erreichen jeden Client: nur Kandidaten für mich nachladen; der Server entscheidet, was meins ist.
    "notification:new": (p: { notification?: NotifyNotification }) => {
      const n = p?.notification;
      if (!n) return;
      if (meRef.current.role !== "duty_manager" && n.targetRole !== meRef.current.role) return;
      if (n.targetUserId && meRef.current.userId && n.targetUserId !== meRef.current.userId) return;
      liveSoon();
    },
    "chat:message": (p: unknown) => {
      const m = asChatMessage(p);
      if (!m) return;
      const meNow = { role: meRef.current.role, userId: meRef.current.userId ?? chat.me?.id ?? null };
      if (!chatNeedsToast({ authorId: m.author.id, channelId: m.channelId }, meNow, chat.activeChannel(), chat.activeChannel() !== null)) return;
      const ch = chat.channels.find((c) => c.id === m.channelId);
      const toast: NotifyToast = {
        id: `chat:${m.id}`, kind: "chat", urgent: m.urgent, channelId: m.channelId,
        title: `${ch ? channelTitle(ch, t) : t("chat.title")} · ${m.author.name}`, text: m.body.slice(0, 90),
      };
      setToasts((cur) => pushToasts(cur, [toast]));
      sound([toast]);
    },
  });

  // Wiederöffnen: Socket neu verbunden, Tab/App wieder sichtbar, wieder online. Dazu der Hinweis „Verbindung weg“.
  useEffect(() => {
    const s = getSocket();
    let first = !s.connected;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const markOffline = () => { if (!timer) timer = setTimeout(() => setOffline(true), OFFLINE_HINT_DELAY_MS); };
    const markOnline = () => { if (timer) { clearTimeout(timer); timer = null; } setOffline(false); };
    const onConnect = () => { markOnline(); if (first) { first = false; return; } resync(); };
    const onDisconnect = () => markOffline();
    const onVisible = () => { if (document.visibilityState === "visible") resync(); };
    const onOnline = () => { markOnline(); resync(); };
    const onOffline = () => markOffline();
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    if (typeof navigator !== "undefined" && navigator.onLine === false) markOffline();
    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      if (timer) clearTimeout(timer);
    };
  }, [resync]);

  // Ton ist an: Safari gibt die Ausgabe nach jedem Laden erst nach einer Berührung frei — die erste Berührung entsperrt.
  useEffect(() => {
    if (soundPref !== "on") return;
    const once = () => unlockSound();
    document.addEventListener("pointerdown", once, { once: true, capture: true });
    document.addEventListener("keydown", once, { once: true, capture: true });
    return () => {
      document.removeEventListener("pointerdown", once, { capture: true });
      document.removeEventListener("keydown", once, { capture: true });
    };
  }, [soundPref]);

  const setSound = useCallback((v: "on" | "off") => {
    writeSoundPref(v);
    setSoundPref(v);
    if (v === "on") {
      unlockSound(); // läuft im Tipp selbst — Safari erlaubt den Ton danach
      setTimeout(() => playNotifySound("normal"), 60); // kurze Hörprobe
    }
  }, []);

  const ack = useCallback(async (id: string) => {
    setNotifications((list) => list.map((n) => (n.id === id && isUnreadMine(n, meRef.current) ? { ...n, acknowledged: true } : n)));
    try { await api("/api/notifications", { method: "PATCH", body: { id } }); } catch { /* beim nächsten Laden wieder offen */ }
  }, []);

  const ackAll = useCallback(async () => {
    try { await api("/api/notifications", { method: "PATCH", body: { all: true } }); } catch { /* egal */ }
    await load("silent");
  }, [load]);

  const dismissToast = useCallback((id: string) => setToasts((cur) => cur.filter((x) => x.id !== id)), []);

  const go = useCallback((toast: NotifyToast) => {
    const target = targetFor(toast, meRef.current);
    if (target.kind === "room" && onOpenRoom) onOpenRoom(target.roomId, target.number);
    else if (target.kind === "chat") router.push(`/chat?c=${encodeURIComponent(target.channelId)}`);
    else if (target.kind === "href") router.push(target.href);
    else setPanelOpen(true);
  }, [onOpenRoom, router]);

  const openToast = useCallback((toast: NotifyToast) => {
    dismissToast(toast.id);
    if (toast.kind === "notification") void ack(toast.notification.id);
    go(toast);
  }, [ack, dismissToast, go]);

  const openNotification = useCallback((n: NotificationRow) => {
    setPanelOpen(false);
    if (isUnreadMine(n, meRef.current)) void ack(n.id);
    go({ id: n.id, kind: "notification", urgent: false, notification: n });
  }, [ack, go]);

  useEffect(() => { if (panelOpen) setResyncCount(0); }, [panelOpen]);

  const openResync = useCallback(() => { setResyncCount(0); setPanelOpen(true); }, []);

  const value = useMemo<NotifyState>(() => ({
    me, notifications, unread: notifications.filter((n) => isUnreadMine(n, me)).length,
    panelOpen, setPanelOpen, ackAll, openNotification, toasts, openToast, dismissToast,
    resyncCount, openResync, offline, soundPref, setSound,
  }), [me, notifications, panelOpen, ackAll, openNotification, toasts, openToast, dismissToast, resyncCount, openResync, offline, soundPref, setSound]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
