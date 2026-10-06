"use client";

import type { ButtonHTMLAttributes } from "react";

/**
 * Hauptbutton des Planungstools: Pille, 56 px hoch (≥ 44 px Touch-Fläche), sichtbarer Messing-Fokus.
 * `pulse` = sanfter Ring-Puls nur bei der wichtigsten nächsten Aktion (1,7 s Schleife, Opacity/Transform).
 */
export default function PrimaryButton({
  variant = "brass", pulse = false, className = "", children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "brass" | "navy"; pulse?: boolean }) {
  const tone = variant === "brass"
    ? "bg-brass-light text-night-900 hover:brightness-105 text-night-900"
    : "bg-navy text-white hover:bg-navy-line";
  return (
    <button
      type="button"
      {...rest}
      className={`relative inline-flex h-14 min-w-[11rem] items-center justify-center rounded-full px-8 text-base font-semibold transition-[filter,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-light focus-visible:ring-offset-2 focus-visible:ring-offset-night-700 disabled:cursor-not-allowed disabled:opacity-45 ${tone} ${pulse && !rest.disabled ? "pl-ring" : ""} ${className}`}
    >
      {children}
    </button>
  );
}
