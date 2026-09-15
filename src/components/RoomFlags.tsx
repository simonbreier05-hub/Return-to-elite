"use client";

import { IconBroom, IconPerson } from "./icons";
import { useLocale } from "@/lib/i18n/LocaleContext";

/**
 * The two occupancy-related room flags, rendered identically wherever a room
 * card appears (Supervisor, Attendant, the global quick search) so a
 * person-icon always means "guest currently in the room" and a broom-icon
 * always means "checks out today", regardless of screen.
 *
 * Deliberately a plain `<span>`, not a button: every call site already sits
 * inside its own tap target (a card/tile/row that opens the room's detail),
 * so a nested interactive control here would be invalid HTML and would steal
 * that tap. `title` gives the hover tooltip; `aria-label` covers screen
 * readers; tapping the card itself opens the detail view, which spells the
 * same status out in full text — see RoomDetailModal.
 */
export function RoomFlagIcons({
  occupancy,
  isCheckoutToday,
  className = "",
  iconClassName = "h-3 w-3",
  badgeClassName = "h-5 w-5",
}: {
  occupancy?: string | null;
  isCheckoutToday?: boolean;
  className?: string;
  iconClassName?: string;
  /** Size of the round icon backdrop — shrink it to fit a small tile alongside other corner badges. */
  badgeClassName?: string;
}) {
  const { t } = useLocale();
  const occupied = occupancy === "OCCUPIED";
  if (!occupied && !isCheckoutToday) return null;

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {occupied && (
        <span
          role="img"
          aria-label={t("roomFlags.occupied")}
          title={t("roomFlags.occupied")}
          className={`flex shrink-0 items-center justify-center rounded-full border border-navy/30 bg-navy/10 text-navy ${badgeClassName}`}
        >
          <IconPerson className={iconClassName} />
        </span>
      )}
      {isCheckoutToday && (
        <span
          role="img"
          aria-label={t("roomFlags.checkoutToday")}
          title={t("roomFlags.checkoutToday")}
          className={`flex shrink-0 items-center justify-center rounded-full border border-gold-line/60 bg-gold-soft/40 text-gold ${badgeClassName}`}
        >
          <IconBroom className={iconClassName} />
        </span>
      )}
    </span>
  );
}
