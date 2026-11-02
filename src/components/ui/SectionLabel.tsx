import type { IconName } from "@/lib/ui/icons";
import { cx, Glyph } from "./primitives";

export interface SectionLabelProps {
  title: string;
  icon?: IconName;
  /** Zähler hinter dem Titel (z. B. Anzahl Zimmer). */
  count?: number | string;
  /** Überschrift-Ebene für Vorleseprogramme (Standard h2). */
  as?: "h2" | "h3" | "h4";
  className?: string;
}

/** Abschnittstitel über Listen (Aktuell in Arbeit, Erledigt, Offen, DND). Figma `29:432`. */
export function SectionLabel({ title, icon, count, as: Tag = "h2", className }: SectionLabelProps) {
  return (
    <Tag className={cx("flex items-center gap-3", className)}>
      {icon && <Glyph name={icon} size={22} className="text-accent-text" />}
      <span className="text-section text-text-muted">{title}</span>
      {count !== undefined && <span className="text-label text-accent-text">{count}</span>}
    </Tag>
  );
}
