import type { IconName } from "@/lib/ui/icons";
import { cx, Glyph, Interactive, type InteractiveProps } from "./primitives";

export type KpiTone = "default" | "attention";

export interface KpiTileProps extends Omit<InteractiveProps, "aria-pressed"> {
  label: string;
  value: string | number;
  icon: IconName;
  /** `attention` = warmer Lichtreflex, nur bei Handlungsbedarf. */
  tone?: KpiTone;
  className?: string;
}

/** Tageskennzahl mit Symbolscheibe (Tablet/Desktop). Antippen kann eine Detailliste öffnen. Figma `21:57`. */
export function KpiTile({ label, value, icon, tone = "default", className, ...action }: KpiTileProps) {
  return (
    <Interactive
      {...action}
      className={cx("glass flex w-full items-center gap-4 rounded-(--radius-tile) px-6 py-4", tone === "attention" && "glass-warm", className)}
    >
      <span className="glass-disc flex size-14 shrink-0 items-center justify-center text-text-secondary">
        <Glyph name={icon} size={28} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-body-16 truncate text-text-secondary">{label}</span>
        <span className="text-number text-text-primary">{value}</span>
      </span>
    </Interactive>
  );
}
