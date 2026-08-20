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
