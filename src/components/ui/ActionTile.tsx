import type { IconName } from "@/lib/ui/icons";
import { cx, FOCUS_RING, Glyph } from "./primitives";

export interface ActionTileProps {
  icon: IconName;
  title: string;
  /** `active` = Einstellung an (z. B. DND an). */
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

/** Große Aktionsfläche der Gäste-Startseite (DND, Reinigung, Mangel, Abteilung). Figma `39:2010`. */
export function ActionTile({ icon, title, active = false, onClick, disabled, className }: ActionTileProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "glass press flex w-full flex-col items-center justify-center gap-3 rounded-(--radius-tile) px-4 py-6",
        "disabled:cursor-not-allowed disabled:opacity-40",
        active && "glass-selected",
        FOCUS_RING,
        className,
      )}
    >
      <span
        className={cx(
          "flex size-16 shrink-0 items-center justify-center rounded-pill",
          active ? "bg-champagne border border-border-subtle text-text-on-accent" : "glass-disc text-text-primary",
        )}
      >
        <Glyph name={icon} size={30} />
      </span>
      <span className="text-body-18 text-center text-text-primary">{title}</span>
    </button>
  );
}
