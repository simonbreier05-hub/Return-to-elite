"use client";

/**
 * Fortschrittsring für „Listen" (nur Mobil): vier Viertel, eines je Liste. Ein Viertel füllt sich per Opacity —
 * so bewegt sich nur `opacity`. Die ganze Fläche ist ein Button (Antippen startet); die Zahl steht auch als Text.
 */
export default function ProgressRing({
  done, total, pulse, label, hint, onClick, disabled,
}: { done: number; total: number; pulse: boolean; label: string; hint: string; onClick: () => void; disabled?: boolean }) {
  const R = 86, C = 2 * Math.PI * R, GAP = 10;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="relative mx-auto my-5 h-[13.5rem] w-[13.5rem] md:hidden">
      {pulse && !disabled && <span aria-hidden className="pl-ring pointer-events-none absolute inset-2 rounded-full border-2 border-brass-light" />}
      <button type="button" onClick={onClick} disabled={disabled} aria-label={`${label}: ${hint}`}
        className="relative flex h-full w-full items-center justify-center rounded-full bg-night-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-light focus-visible:ring-offset-2 focus-visible:ring-offset-night-700 disabled:cursor-not-allowed">
        <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full" aria-hidden>
          <circle cx="100" cy="100" r={R} fill="none" strokeWidth="12" className="stroke-line-1" />
          {Array.from({ length: total }, (_, i) => (
            <circle key={i} cx="100" cy="100" r={R} fill="none" strokeWidth="12" strokeLinecap="round"
              strokeDasharray={`${C / total - GAP} ${C}`} transform={`rotate(${-90 + (360 / total) * i + GAP / 2 * (360 / C)} 100 100)`}
              className="stroke-brass-light" style={{ opacity: i < done ? 1 : 0, transition: "opacity 400ms ease" }} />
          ))}
        </svg>
        <span className="relative text-center">
          <span className="block font-serif text-5xl font-semibold leading-none">{pct}%</span>
          <span className="mt-1 block text-xs text-pl-muted">{hint}</span>
        </span>
      </button>
    </div>
  );
}
