/**
 * The app's one small icon vocabulary. Same shape everywhere it appears —
 * a status chip, a priority banner, a legend — so "warning triangle" always
 * means the same thing regardless of screen. Colour carries none of the
 * meaning alone: every icon here is paired with a text label at its call
 * site, so the app still reads correctly for colour-blind users or in
 * grayscale print.
 *
 * Stroke style matches the existing notification bell in AppShell
 * (viewBox 24x24, stroke=currentColor, strokeWidth ~1.6) for visual unity.
 */
type IconProps = { className?: string };

export function IconWarning({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v4m0 3.5h.01M10.29 3.86 1.82 18a1.5 1.5 0 0 0 1.3 2.25h17.76a1.5 1.5 0 0 0 1.3-2.25L13.71 3.86a1.5 1.5 0 0 0-2.62 0Z"
      />
    </svg>
  );
}

export function IconClock({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
      <circle cx="12" cy="12" r="9" strokeLinecap="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3.5 2" />
    </svg>
  );
}

export function IconBan({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
      <circle cx="12" cy="12" r="9" strokeLinecap="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m5.6 5.6 12.8 12.8" />
    </svg>
  );
}

export function IconCheckCircle({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
      <circle cx="12" cy="12" r="9" strokeLinecap="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m8 12.3 2.6 2.6L16.2 9" />
    </svg>
  );
}

export function IconWrench({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.7 6.3a4 4 0 0 0-5.4 4.7L3 17.3V21h3.7l6.3-6.3a4 4 0 0 0 4.7-5.4l-2.6 2.6-2-2 2.6-2.6Z"
      />
    </svg>
  );
}

export function IconPerson({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
      <circle cx="12" cy="7.5" r="3.2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.8 20.2c0-3.7 3.2-6.2 7.2-6.2s7.2 2.5 7.2 6.2" />
    </svg>
  );
}

export function IconBroom({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 4 10.5 13.5" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m10.5 13.5-3.8 1.1a1.6 1.6 0 0 0-1 2.3l.4.7a1.6 1.6 0 0 0 2.3.6l3.4-2.1M4.5 20.5l2.3-3.2"
      />
    </svg>
  );
}

export function IconSuitcase({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
      <rect x="3.5" y="7.5" width="17" height="12" rx="2" />
      <path strokeLinecap="round" d="M9 7.5V5.8a1.8 1.8 0 0 1 1.8-1.8h2.4A1.8 1.8 0 0 1 15 5.8V7.5" />
      <path strokeLinecap="round" d="M3.5 12.5h17" />
    </svg>
  );
}

export function IconMoon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20 14.2A8.2 8.2 0 1 1 9.8 4a6.6 6.6 0 0 0 10.2 10.2Z"
      />
    </svg>
  );
}

export function IconLaundry({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
      <rect x="4" y="3.5" width="16" height="17" rx="2" />
      <circle cx="12" cy="13" r="4.3" />
      <path strokeLinecap="round" d="M9.3 10.3a3.9 3.9 0 0 1 5.4 0M7.5 6.5h.01M10.2 6.5h.01" />
    </svg>
  );
}

/** Guest screen "Bitte nicht stören" request active (Prompt G2 Teil 4) — a bell, crossed out. */
export function IconBellSlash({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7 8.2A5 5 0 0 1 15.8 5M18 10.5V13c0 1.7.5 3 1.5 4.2H8.3M10.5 17.2v.3a1.9 1.9 0 0 0 3.8 0v-.3"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 3.5l17 17" />
    </svg>
  );
}

/** Maps status.ts's `iconKey` string to the actual glyph, so status.ts stays
 * a plain, framework-agnostic data module and only this one place needs to
 * know which SVG a key resolves to. */
export function StatusIcon({ iconKey, className }: { iconKey: "warning" | "clock" | "ban" | "check"; className?: string }) {
  switch (iconKey) {
    case "warning":
      return <IconWarning className={className} />;
    case "clock":
      return <IconClock className={className} />;
    case "ban":
      return <IconBan className={className} />;
    case "check":
      return <IconCheckCircle className={className} />;
  }
}
