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
    ? "bg-btn text-btn-text hover:brightness-110"
    : "bg-navy text-white hover:bg-navy-line";
  return (
    <button
      type="button"
      {...rest}
      className={`relative inline-flex h-14 min-w-[9rem] items-center justify-center rounded-full px-4 text-[15px] text-center leading-tight lg:px-8 lg:text-base font-semibold transition-[filter,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-light focus-visible:ring-offset-2 focus-visible:ring-offset-night-700 disabled:cursor-not-allowed disabled:opacity-45 ${tone} ${pulse && !rest.disabled ? "pl-ring" : ""} ${className}`}
    >
      {children}
    </button>
  );
}
