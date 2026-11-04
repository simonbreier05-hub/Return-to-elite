"use client";

import { ProgressBar } from "@/components/ui";

/** Bedarf gegen Besetzung (D2, Schritt „Team"; Glas-Stil D4). Die Aussage steht im Text („reicht" / „zu knapp"), nie nur in der Farbe. */
export default function CapacityBar({
  need, have, needLabel, haveLabel, verdict, ok,
}: { need: number; have: number; needLabel: string; haveLabel: string; verdict: string; ok: boolean }) {
  const max = Math.max(need, have, 1);
  return (
    <div role="group" aria-label={`${needLabel}, ${haveLabel}, ${verdict}`}>
      {[{ label: needLabel, v: need }, { label: haveLabel, v: have }].map((r) => (
        <div key={r.label} className="mb-3">
          <div className="text-label mb-1 flex justify-between text-text-secondary"><span>{r.label}</span><span>{Math.round(r.v * 10) / 10}</span></div>
          <ProgressBar value={r.v} max={max} label={`${r.label}: ${Math.round(r.v * 10) / 10}`} />
        </div>
      ))}
      <p className={`text-body-16 mt-1 ${ok ? "text-status-success-fg" : "text-status-warning-fg"}`}>{ok ? "✓ " : "⚠ "}{verdict}</p>
    </div>
  );
}
