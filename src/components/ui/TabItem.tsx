import type { IconName } from "@/lib/ui/icons";
import { CountBadge, cx, Glyph } from "./primitives";
import { Interactive, type InteractiveProps } from "./Interactive";

export interface TabItemProps extends Omit<InteractiveProps, "aria-current" | "aria-label" | "aria-pressed"> {
  icon: IconName;
  label: string;
  active?: boolean;
  /** Zähler-Badge oben rechts am Symbol. */
  count?: number;
  className?: string;
}

/** Eintrag der unteren Tab-Leiste (Handy, max. 4 Einträge). Figma `39:1870`. */
export function TabItem({ icon, label, active = false, count, className, ...action }: TabItemProps) {
  return (
    <Interactive
      {...action}
      aria-current={active ? "page" : undefined}
      aria-label={count ? `${label} (${count})` : undefined}
      className={cx(
        "relative flex h-15 min-w-22 flex-col items-center justify-center gap-1 rounded-(--glass-radius-md) px-2",
        active ? "glass text-text-primary" : "text-text-muted",
        className,
      )}
    >
      <Glyph name={icon} size={26} className={active ? "text-accent-text" : "text-text-secondary"} />
      <span className="text-label whitespace-nowrap">{label}</span>
      {count ? <CountBadge value={count} className="absolute top-0 start-[calc(50%+6px)]" /> : null}
    </Interactive>
  );
}
