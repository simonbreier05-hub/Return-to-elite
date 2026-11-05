import type { IconName } from "@/lib/ui/icons";
import type { KpiTone } from "./KpiTile";
import { cx, Glyph } from "./primitives";
import { Interactive, type InteractiveProps } from "./Interactive";

export interface KpiTileCompactProps extends Omit<InteractiveProps, "aria-pressed"> {
  label: string;
  value: string | number;
  icon: IconName;
  tone?: KpiTone;
  className?: string;
}

/** Kennzahl fürs Handy (2 nebeneinander, je ca. 171 px). Figma `39:1999`. */
export function KpiTileCompact({ label, value, icon, tone = "default", className, ...action }: KpiTileCompactProps) {
  return (
    <Interactive
      {...action}
      className={cx("glass flex w-full items-center gap-3 rounded-(--radius-tile) px-4 py-3", tone === "attention" && "glass-warm", className)}
    >
      <span className="glass-disc flex size-10 shrink-0 items-center justify-center text-text-secondary">
        <Glyph name={icon} size={22} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-label truncate text-text-secondary">{label}</span>
        <span className="text-title-28 text-text-primary">{value}</span>
      </span>
    </Interactive>
  );
}
