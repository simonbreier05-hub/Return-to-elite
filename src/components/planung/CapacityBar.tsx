"use client";

/** Bedarf gegen Besetzung (D2, Schritt „Team"). Die Aussage steht im Text („reicht" / „zu knapp"), nie nur in der Farbe. */
export default function CapacityBar({
  need, have, needLabel, haveLabel, verdict, ok,
}: { need: number; have: number; needLabel: string; haveLabel: string; verdict: string; ok: boolean }) {
  const max = Math.max(need, have, 1);
  return (
    <div role="group" aria-label={`${needLabel}, ${haveLabel}, ${verdict}`}>
      {[{ label: needLabel, v: need, tone: "bg-line-2" }, { label: haveLabel, v: have, tone: ok ? "bg-brass-light" : "bg-badge-2" }].map((r) => (
        <div key={r.label} className="mb-2">
          <div className="mb-1 flex justify-between text-xs text-pl-muted"><span>{r.label}</span><span>{Math.round(r.v * 10) / 10}</span></div>
          <div className="h-2.5 overflow-hidden rounded-full bg-line-1/70">
            <div className={`pl-bar h-full w-full rounded-full ${r.tone}`} style={{ transform: `scaleX(${r.v / max})` }} />
          </div>
        </div>
      ))}
      <p className={`mt-1 text-sm font-medium ${ok ? "text-brass-light" : "text-pl-text"}`}>{ok ? "✓ " : "⚠ "}{verdict}</p>
    </div>
  );
}
