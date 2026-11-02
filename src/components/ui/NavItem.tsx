import type { IconName } from "@/lib/ui/icons";
import { CountBadge, cx, Glyph, Interactive, type InteractiveProps } from "./primitives";

export interface NavItemProps extends Omit<InteractiveProps, "aria-current" | "aria-label" | "aria-pressed"> {
  icon: IconName;
  label: string;
  /** `wide` = Seitenleiste 264 px (≥ 1280), `rail` = Icon-Leiste 80 px (640–1279, nur Symbol). */
  mode?: "wide" | "rail";
  active?: boolean;
  /** Zähler (z. B. ungelesene Nachrichten); nur in `wide` sichtbar, in `rail` im Vorlesetext. */
  count?: number;
  className?: string;
}

/** Menüeintrag der Seitenleiste. Figma `20:71`. */
export function NavItem({ icon, label, mode = "wide", active = false, count, className, ...action }: NavItemProps) {
  const rail = mode === "rail";
  return (
    <Interactive
      {...action}
      aria-current={active ? "page" : undefined}
      aria-label={rail ? (count ? `${label} (${count})` : label) : undefined}
      className={cx(
        "relative flex h-14 items-center rounded-(--glass-radius-sm)",
        rail ? "w-16 justify-center" : "w-full gap-4 px-4",
        active ? "glass text-text-primary" : "text-text-secondary",
        className,
      )}
    >
      <Glyph name={icon} size={rail ? 28 : 24} className={active ? "text-accent-text" : undefined} />
      {!rail && <span className="text-body-18 min-w-0 flex-1 truncate">{label}</span>}
      {!rail && count ? <CountBadge value={count} /> : null}
      {rail && count ? <span aria-hidden="true" className="bg-champagne absolute end-2 top-2 size-2.5 rounded-pill" /> : null}
    </Interactive>
  );
}
