"use client";

import { IconBan, IconCheckCircle, IconClock, IconWarning } from "./icons";
import { useLocale } from "@/lib/i18n/LocaleContext";

export interface PriorityItem {
  count: number;
  label: string;
  icon: "warning" | "clock" | "ban";
  /** urgent = needs action now (red); watch = worth knowing, not on fire (brass). */
  tone: "urgent" | "watch";
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
export default function PriorityBanner({ items }: { items: PriorityItem[] }) {
  const { t } = useLocale();
  const active = items.filter((i) => i.count > 0);

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
            return (
              <span
                key={i}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold ${
                  item.tone === "urgent"
                    ? "border-status-out-of-order/35 bg-status-out-of-order/10 text-status-out-of-order"
                    : "border-gold/40 bg-gold/10 text-gold-soft"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.count} {item.label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
