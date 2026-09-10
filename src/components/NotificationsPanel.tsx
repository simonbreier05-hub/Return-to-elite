"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import { useSocket } from "./useSocket";
import WindowPanel from "./WindowPanel";
import { useLocale } from "@/lib/i18n/LocaleContext";

interface Notification {
  id: string;
  type: string;
  level: string;
  message: string;
  targetRole: string;
  acknowledged: boolean;
  createdAt: string;
}

/** Alert *levels* — kept in the same muted register as AppShell's own bell
 * dropdown, so the two never disagree about what "urgent" looks like. */
const LEVEL_STYLES: Record<string, string> = {
  info: "border-l-navy-line",
  warning: "border-l-gold",
  critical: "border-l-status-out-of-order",
};

/**
 * A fixed, always-visible notifications area for a role's own hub —
 * distinct from AppShell's header bell, which is a dropdown opened on
 * demand and shared by every role. This sits in-flow on the page itself,
 * first used by the Housekeeper-Hub's focus mode: "just the room list plus
 * a message window" only holds together if the messages are actually on
 * the page, not one tap away behind an icon.
 *
 * `targetRole` mirrors the same client-side filter AppShell applies to
 * live pushes (the socket broadcasts to every connected client — the
 * server-side GET already scopes the initial fetch, but a realtime
 * "notification:new" has to be filtered here too).
 */
export default function NotificationsPanel({ targetRole }: { targetRole: string }) {
  const { t } = useLocale();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const load = () =>
    api<{ notifications: Notification[] }>("/api/notifications")
      .then((d) => setNotifications(d.notifications))
      .catch(() => {});

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useSocket({
    "notification:new": (p: { notification: Notification }) => {
      const n = p?.notification;
      if (!n || n.targetRole !== targetRole) return;
      setNotifications((prev) => (prev.some((x) => x.id === n.id) ? prev : [n, ...prev].slice(0, 50)));
    },
  });

  const unread = notifications.filter((n) => !n.acknowledged).length;

  const ackAll = async () => {
    await api("/api/notifications", { method: "PATCH", body: { all: true } });
    load();
  };

  return (
    <WindowPanel
      title={t("appShell.notifications")}
      right={
        unread > 0 && (
          <button onClick={ackAll} className="h-8 rounded-sm px-2 text-xs font-medium text-gold-soft hover:bg-parchment">
            {t("appShell.markAllRead")} ({unread})
          </button>
        )
      }
    >
      {notifications.length === 0 && <p className="text-sm text-graphite/60">{t("appShell.noNotifications")}</p>}
      <div className="max-h-64 space-y-1.5 overflow-y-auto">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`rounded-lg border border-charcoal/5 border-l-4 bg-ivory p-2.5 text-sm ${LEVEL_STYLES[n.level] ?? ""} ${
              n.acknowledged ? "opacity-50" : ""
            }`}
          >
            <div className="text-[0.68rem] uppercase tracking-wider text-graphite/60">
              {n.type.replace(/_/g, " ")} · {new Date(n.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
            <div className="mt-0.5">{n.message}</div>
          </div>
        ))}
      </div>
    </WindowPanel>
  );
}
