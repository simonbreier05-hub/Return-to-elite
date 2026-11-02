import type { ButtonHTMLAttributes } from "react";
import type { IconName } from "@/lib/ui/icons";
import { cx, FOCUS_RING, Glyph } from "./primitives";

export type ButtonVariant = "primary" | "secondary";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  variant?: ButtonVariant;
  /** Symbol links vom Text. */
  icon?: IconName;
  /** Volle Breite (z. B. im Detailpanel). */
  block?: boolean;
  className?: string;
}

const VARIANT: Record<ButtonVariant, string> = {
  // Champagner, dunkler Text, Rand in Akzent — bewusst ohne Glow (Spezifikation Abschnitt 8)
  primary: "bg-champagne border border-border-accent text-text-on-accent",
  // Glas mit hellem Verlaufs-Rand
  secondary: "glass text-text-primary",
};

/** Hauptaktion (primary, pro Ansicht nur eine) und Nebenaktion (secondary). Figma `20:48`. */
export function Button({ variant = "primary", icon, block, className, type = "button", children, ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        "press text-body-18 inline-flex min-h-(--size-button-height) items-center justify-center gap-3 rounded-(--glass-radius-md) px-8 py-3",
        "disabled:cursor-not-allowed disabled:opacity-40",
        VARIANT[variant],
        FOCUS_RING,
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {icon && <Glyph name={icon} size={24} />}
      <span>{children}</span>
    </button>
  );
}
