"use client";

import type { ReactNode } from "react";
import { IconBan, IconCheckCircle, IconClock, IconWarning } from "./icons";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { useGlassMode } from "@/components/shell/GlassMode";
import { cx, FOCUS_RING, Glyph } from "@/components/ui/primitives";
import type { IconName } from "@/lib/ui/icons";

export interface PriorityItem {
  count: number;
  label: string;
  icon: "warning" | "clock" | "ban";
  /** urgent = needs action now (red); watch = worth knowing, not on fire (brass). */
  tone: "urgent" | "watch";
  /** When set, the chip becomes a button that jumps to the matching filtered view. */
  onClick?: () => void;
}

const ICONS = { warning: IconWarning, clock: IconClock, ban: IconBan } as const;

/**
 * The "what's important now" panel every role screen opens with. Position
 * does the priority signalling, not colour alone: this sits above
 * everything else on the page, and every chip pairs an icon with a text
 * label so the urgency reads even in grayscale or for colour-blind users.
 *
 * An empty `items` list (nothing above zero) renders a calm, explicit
 * "all clear" state instead of just... nothing — an empty area reads as
 * "is this broken?", not "you're caught up".
 */
/** `children`: optional unter den Zählern (Supervisor: Ereignis-Feed) — ohne bleibt das Banner wie in allen anderen Rollen. */
export default function PriorityBanner({ items, children }: { items: PriorityItem[]; children?: ReactNode }) {
  const { t } = useLocale();
  const active = items.filter((i) => i.count > 0);
  const glass = useGlassMode();
  if (glass) {
    // Glas (D3b): Zähler als Chips mit Symbol + Text, Ton dringend = Gefahr, beobachten = Warnung (nie nur Farbe).
    const GLYPH: Record<PriorityItem["icon"], IconName> = { warning: "triangle-alert", clock: "clock", ban: "x" };
    return (
      <section aria-label={t("priority.importantNow")} className="glass flex flex-col gap-3 rounded-(--glass-radius-lg) p-4 sm:p-6">
        <h2 className="flex items-center gap-3">
          <Glyph name="zap" size={22} className="text-accent-text" />
          <span className="text-section text-text-muted">{t("priority.importantNow")}</span>
        </h2>
        {active.length === 0 ? (
          <p className="text-body-16 flex items-center gap-2 text-status-success-fg">
            <Glyph name="check" size={20} />
            {t("priority.allClear")}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {active.map((item, i) => {
              const cls = cx(
                "text-body-16 inline-flex min-h-(--size-touch-min) items-center gap-2 rounded-pill px-4",
                item.tone === "urgent" ? "bg-status-danger-bg text-status-danger-fg" : "bg-status-warning-bg text-status-warning-fg",
                item.onClick && "press",
                FOCUS_RING,
              );
              const content = (<><Glyph name={GLYPH[item.icon]} size={18} />{item.count} {item.label}</>);
              return item.onClick ? <button key={i} type="button" onClick={item.onClick} className={cls}>{content}</button> : <span key={i} className={cls}>{content}</span>;
            })}
          </div>
        )}
        {children}
      </section>
    );
  }

  return (
    <div className="mb-5 animate-rise rounded-2xl border border-charcoal/10 bg-linen p-4 shadow-card">
      <p className="mb-2.5 text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-gold-soft">
        {t("priority.importantNow")}
      </p>
      {active.length === 0 ? (
        <div className="flex items-center gap-2 text-status-clean">
          <IconCheckCircle className="h-5 w-5 shrink-0" />
          <span className="text-sm font-medium">{t("priority.allClear")}</span>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {active.map((item, i) => {
            const Icon = ICONS[item.icon];
            const className = `flex min-h-11 items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold ${
              item.tone === "urgent"
                ? "border-status-out-of-order/35 bg-status-out-of-order/10 text-status-out-of-order"
                : "border-gold/40 bg-gold/10 text-gold-soft"
            } ${item.onClick ? "cursor-pointer transition hover:brightness-95 active:scale-[0.98]" : ""}`;
            const content = (
              <>
                <Icon className="h-4 w-4 shrink-0" />
                {item.count} {item.label}
              </>
            );
            return item.onClick ? (
              <button key={i} onClick={item.onClick} className={className}>
                {content}
              </button>
            ) : (
              <span key={i} className={className}>
                {content}
              </span>
            );
          })}
        </div>
      )}
      {children}
    </div>
  );
}
