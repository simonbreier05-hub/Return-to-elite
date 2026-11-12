"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import CloseButton from "@/components/CloseButton";
import { useEscapeKey } from "@/components/useEscapeKey";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { cx, FOCUS_RING, Glyph } from "@/components/ui/primitives";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { notificationText, notificationTypeLabel } from "@/lib/i18n/notificationText";
import type { TKey } from "@/lib/i18n/translations";
import { isMine, isUnreadMine, toastDuration, type NotifyToast } from "@/lib/ui/notify";
import { useNotify, type NotificationRow } from "./NotifyContext";

/** Meldungs-Stufen — eigenes System, nie mit Zimmerstatus verwechselbar; immer mit Typ-Text daneben. */
const LEVEL_STYLES: Record<string, string> = {
  info: "border-s-status-info-fg",
  warning: "border-s-status-warning-fg",
  critical: "border-s-status-danger-fg",
};

/** Schließen-Knopf auf Glas, mindestens 48 px hoch. */
const CLOSE_GLASS = "h-12! min-w-12! justify-center border-border-subtle! bg-surface-card-raised! text-text-primary! hover:bg-surface-card!";

/** „Dringend“: Symbol + Wort, nie nur Farbe. */
function UrgentPill() {
  const { t } = useLocale();
  return (
    <Pill tone="danger">
      <Glyph name="triangle-alert" size={16} className="me-1" />
      {t("notifyCenter.urgent")}
    </Pill>
  );
}

function ToastCard({ toast }: { toast: NotifyToast }) {
  const { t } = useLocale();
  const ctx = useNotify()!;
  const ms = toastDuration(toast);
  useEffect(() => {
    if (ms === null) return;
    const id = setTimeout(() => ctx.dismissToast(toast.id), ms);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.id, ms]);

  const level = toast.kind === "notification" ? toast.notification.level : toast.urgent ? "warning" : "info";
  let head: string;
  let body: string;
  if (toast.kind === "notification") {
    head = notificationTypeLabel(toast.notification.type, t);
    body = notificationText(toast.notification as NotificationRow, t);
  } else if (toast.kind === "chat") {
    head = toast.title;
    body = toast.text;
  } else {
    head = t("appShell.notifications");
    body = toast.count === 1 ? t("notifyCenter.newOne") : t("notifyCenter.newMany", { n: toast.count });
  }

  return (
    <div
      role={toast.urgent ? "alert" : "status"}
      data-notify-toast={toast.kind}
      className={cx("glass animate-in-up pointer-events-auto flex w-full items-start gap-2 rounded-(--glass-radius-md) border-s-4 p-2", LEVEL_STYLES[level] ?? LEVEL_STYLES.info)}
    >
      <button type="button" onClick={() => ctx.openToast(toast)} className={cx("press flex min-h-12 min-w-0 flex-1 flex-col items-start gap-1 rounded-(--glass-radius-sm) px-2 py-1 text-start", FOCUS_RING)}>
        <span className="flex flex-wrap items-center gap-2">
          {toast.urgent && <UrgentPill />}
          <span className="text-label text-text-secondary">{head}</span>
        </span>
        <span className="text-body-16 line-clamp-2 text-text-primary">{body}</span>
      </button>
      <CloseButton onClick={() => ctx.dismissToast(toast.id)} className={CLOSE_GLASS} />
    </div>
  );
}

/** Banner oben: „Ton aktivieren“ (einmal, bis entschieden), „N neue Meldungen“ (bis geöffnet), „Verbindung weg“. */
function TopBanners() {
  const { t } = useLocale();
  const ctx = useNotify()!;
  return (
    <>
      {ctx.offline && (
        <div role="status" data-notify-offline className="glass pointer-events-auto flex min-h-12 items-center gap-2 rounded-pill px-4 text-body-16 text-text-primary">
          <Glyph name="wifi-off" size={20} className="text-status-warning-fg" />
          {t("notifyCenter.offline")}
        </div>
      )}
      {ctx.resyncCount > 0 && (
        <button
          type="button"
          data-notify-resync
          onClick={ctx.openResync}
          className={cx("glass press pointer-events-auto flex min-h-12 w-full items-center gap-3 rounded-(--glass-radius-md) border-s-4 border-s-status-warning-fg px-4 py-2 text-start", FOCUS_RING)}
        >
          <Glyph name="bell" size={24} className="text-accent-text" />
          <span className="text-body-18 flex-1 text-text-primary">
            {ctx.resyncCount === 1 ? t("notifyCenter.newOne") : t("notifyCenter.newMany", { n: ctx.resyncCount })}
          </span>
          <span className="text-label text-text-secondary">{t("notifyCenter.open")}</span>
        </button>
      )}
      {ctx.soundPref === null && (
        <div data-notify-sound-banner className="glass pointer-events-auto flex w-full flex-wrap items-center gap-2 rounded-(--glass-radius-md) p-2 ps-4">
          <Glyph name="volume" size={22} className="text-accent-text" />
          <span className="text-body-16 min-w-[12rem] flex-1 text-text-primary">{t("notifyCenter.soundAsk")}</span>
          <Button className="min-h-12!" onClick={() => ctx.setSound("on")}>{t("notifyCenter.soundEnable")}</Button>
          <Button variant="secondary" className="min-h-12!" onClick={() => ctx.setSound("off")}>{t("notifyCenter.soundNo")}</Button>
        </div>
      )}
    </>
  );
}

/** Liste aller Meldungen (Glocke). Duty Manager sieht alle Rollen; quittieren kann jede Kraft nur ihre eigenen. */
function NotifyPanel() {
  const { t, fmt } = useLocale();
  const ctx = useNotify()!;
  const open = ctx.panelOpen;
  const setOpen = ctx.setPanelOpen;
  useEscapeKey(() => setOpen(false), open);
  if (!open) return null;
  return (
    <div role="dialog" aria-label={t("appShell.notifications")} className="glass animate-in-up pointer-events-auto fixed inset-x-2 top-24 z-50 mx-auto max-w-lg rounded-(--glass-radius-lg) sm:start-auto sm:end-6 sm:w-[26rem]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
        <span className="text-title-22 text-text-primary">{t("appShell.notifications")}</span>
        <div className="ms-auto flex items-center gap-2">
          <Button variant="secondary" className="min-h-12! whitespace-nowrap px-3! text-label!" onClick={() => void ctx.ackAll()}>
            {t("appShell.markAllRead")}
          </Button>
          <CloseButton onClick={() => setOpen(false)} className={CLOSE_GLASS} />
        </div>
      </div>
      <div className="max-h-[60dvh] overflow-y-auto p-2">
        {ctx.notifications.length === 0 && <p className="text-body-16 p-4 text-text-muted">{t("appShell.noNotifications")}</p>}
        {ctx.notifications.map((n, i) => {
          const unread = isUnreadMine(n, ctx.me);
          const foreign = !isMine(n, ctx.me);
          return (
            <button
              type="button"
              key={n.id}
              data-notify-item={unread ? "unread" : "read"}
              onClick={() => ctx.openNotification(n)}
              style={{ "--i": Math.min(i, 8) } as React.CSSProperties}
              className={cx("animate-in-up press mb-2 block min-h-12 w-full rounded-(--glass-radius-sm) border-s-4 bg-surface-card-raised p-3 text-start", FOCUS_RING, LEVEL_STYLES[n.level], !unread && "opacity-65")}
            >
              <span className="text-label flex flex-wrap items-center gap-2 text-text-muted">
                {unread && <span className="font-semibold text-accent-text">{t("notifyCenter.unread")}</span>}
                {notificationTypeLabel(n.type, t)} · {fmt.time(n.createdAt)}
                {foreign && <span>· {t(`role.${n.targetRole}` as TKey)}</span>}
              </span>
              <span className="text-body-16 mt-1 block text-text-primary">{notificationText(n, t)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Ebene über allem (Portal an `document.body`): Banner, bis zu 3 Pop-ups, Meldungsliste. Eigene `theme-glass`-Hülle,
 * weil das Portal außerhalb der Seiten-Token liegt. Kein Blur, nur transform/opacity (`animate-in-up`, reduced-motion aus).
 */
export function NotifyLayer() {
  const ctx = useNotify();
  const { t } = useLocale();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Esc schließt das oberste Pop-up (die Liste hat ihr eigenes Esc).
  useEscapeKey(() => { if (ctx?.toasts[0]) ctx.dismissToast(ctx.toasts[0].id); }, !!ctx?.toasts.length && !ctx.panelOpen);
  if (!mounted || !ctx) return null;
  return createPortal(
    <div className="theme-glass">
      <div aria-live="polite" aria-label={t("appShell.notifications")} className="pointer-events-none fixed inset-x-0 top-0 z-[90] mx-auto flex max-w-lg flex-col items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <TopBanners />
        {ctx.toasts.map((x) => <ToastCard key={x.id} toast={x} />)}
      </div>
      <NotifyPanel />
    </div>,
    document.body,
  );
}

/** Glocke mit Zahl ungelesener Meldungen (Zahl + Wort im Namen, nicht nur ein Farbpunkt). */
export function NotifyBell({ className }: { className?: string }) {
  const { t } = useLocale();
  const ctx = useNotify();
  if (!ctx) return null;
  const label = ctx.unread > 0 ? `${t("appShell.notifications")} (${ctx.unread})` : t("appShell.notifications");
  return (
    <button
      type="button"
      onClick={() => ctx.setPanelOpen((o) => !o)}
      aria-label={label}
      title={label}
      aria-expanded={ctx.panelOpen}
      data-notify-bell={ctx.unread}
      className={cx("press relative flex size-(--size-touch-min) shrink-0 items-center justify-center rounded-pill text-text-primary", FOCUS_RING, className)}
    >
      <Glyph name="bell" size={28} />
      {ctx.unread > 0 && (
        <span aria-hidden="true" className="bg-champagne text-label absolute -end-1 -top-1 inline-flex h-6 min-w-6 items-center justify-center rounded-pill px-1.5 text-text-on-accent">
          {ctx.unread > 99 ? "99+" : ctx.unread}
        </span>
      )}
    </button>
  );
}

/** Schalter „Ton an/aus“ fürs Profil-Menü (Einstellung je Gerät). */
export function SoundToggle() {
  const { t } = useLocale();
  const ctx = useNotify();
  if (!ctx) return null;
  const on = ctx.soundPref === "on";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      data-notify-sound-toggle={on ? "on" : "off"}
      onClick={() => ctx.setSound(on ? "off" : "on")}
      className={cx("press glass-fill text-body-16 flex min-h-12 w-full items-center gap-3 rounded-(--glass-radius-md) border border-border-subtle px-4 text-text-primary", FOCUS_RING)}
    >
      <Glyph name={on ? "volume" : "volume-off"} size={20} />
      <span className="flex-1 text-start">{t("notifyCenter.sound")}</span>
      <span className="text-label text-text-secondary">{on ? t("notifyCenter.on") : t("notifyCenter.off")}</span>
    </button>
  );
}
