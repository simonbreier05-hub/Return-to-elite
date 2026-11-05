import type { IconName } from "@/lib/ui/icons";
import { Pill } from "./Pill";
import { Glyph } from "./primitives";
import { Interactive, type InteractiveProps } from "./Interactive";
import { RowDecor, rowClasses, type PillData, type RowState } from "./rowShared";

export interface ListRowProps extends Omit<InteractiveProps, "aria-current" | "aria-pressed"> {
  icon: IconName;
  title: string;
  subtitle?: string;
  pill?: PillData;
  /** Rechte Angabe, z. B. Uhrzeit „14:00“. */
  meta?: string;
  state?: RowState;
  className?: string;
}

/** Allgemeine Listenzeile (Techniker-Auftrag, Hausmann-Aufgabe, Anreise, Ausflug). Figma `29:516`. */
export function ListRow({ icon, title, subtitle, pill, meta, state = "default", className, ...action }: ListRowProps) {
  const interactive = Boolean(action.href || action.onClick);
  return (
    <Interactive {...action} aria-current={state === "selected" ? "true" : undefined} className={rowClasses(state, `gap-4 ${className ?? ""}`)}>
      <span className="glass-disc flex size-12 shrink-0 items-center justify-center text-text-secondary">
        <Glyph name={icon} size={24} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-body-18 truncate text-text-primary">{title}</span>
        {subtitle && <span className="text-body-16 truncate text-text-secondary">{subtitle}</span>}
      </span>
      {pill && <Pill tone={pill.tone}>{pill.label}</Pill>}
      {meta && <span className="text-body-16 shrink-0 whitespace-nowrap text-text-secondary">{meta}</span>}
      {interactive && <Glyph name="chevron-right" size={24} className="text-text-secondary rtl:-scale-x-100" />}
      <RowDecor state={state} />
    </Interactive>
  );
}
