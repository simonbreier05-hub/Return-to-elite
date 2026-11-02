import type { IconName } from "@/lib/ui/icons";
import { Pill } from "./Pill";
import { Glyph, Interactive, type InteractiveProps } from "./primitives";
import { RowDecor, rowClasses, type PillData, type RowState } from "./rowShared";

export interface ListRowCompactProps extends Omit<InteractiveProps, "aria-current" | "aria-pressed"> {
  icon: IconName;
  title: string;
  subtitle?: string;
  pill?: PillData;
  state?: RowState;
  className?: string;
}

/** Listenzeile fürs Handy (Aufgaben, Aufträge, Anreisen, Ausflüge). Figma `39:1979`. */
export function ListRowCompact({ icon, title, subtitle, pill, state = "default", className, ...action }: ListRowCompactProps) {
  return (
    <Interactive {...action} aria-current={state === "selected" ? "true" : undefined} className={rowClasses(state, `gap-3 ${className ?? ""}`)}>
      <span className="glass-disc flex size-11 shrink-0 items-center justify-center text-text-secondary">
        <Glyph name={icon} size={22} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-body-18 truncate text-text-primary">{title}</span>
        {subtitle && <span className="text-label truncate text-text-secondary">{subtitle}</span>}
      </span>
      {pill && <Pill tone={pill.tone}>{pill.label}</Pill>}
      <RowDecor state={state} compact />
    </Interactive>
  );
}
