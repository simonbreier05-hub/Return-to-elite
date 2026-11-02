import type { ReactNode } from "react";
import { cx, FOCUS_RING } from "./primitives";

export interface FilterChipProps {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

/** Filter-Schalter (Alle, Turn, Tidy, VIP): `default` Glas / `active` Champagner, Höhe ≥ 48. Figma `20:31`. */
export function FilterChip({ children, active = false, onClick, disabled, className }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "press text-body-16 inline-flex min-h-(--size-touch-min) shrink-0 items-center justify-center whitespace-nowrap rounded-pill border px-6 py-2",
        "disabled:cursor-not-allowed disabled:opacity-40",
        active ? "bg-champagne border-border-accent text-text-on-accent" : "glass-fill border-border-subtle text-text-primary",
        FOCUS_RING,
        className,
      )}
    >
      {children}
    </button>
  );
}
