"use client";

import type { OfflineState } from "./useOfflineQueue";

/**
 * Tells the attendant the truth about their taps: whether the last one reached
 * the house system, and what is still waiting. Silence would be worse than a
 * warning — the whole point is that nobody discovers a lost tap at handover.
 */
export default function OfflineBar({ state }: { state: OfflineState }) {
  const { online, pending, rejected, dismissRejected, flush } = state;

  if (online && pending.length === 0 && rejected.length === 0) return null;

  return (
    <div className="sticky top-[4.5rem] z-30 space-y-2 pb-2">
      {pending.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400 bg-amber-50 px-4 py-3 shadow-card">
          <div>
            <p className="font-semibold text-amber-900">
              {online ? "Sending…" : "No connection"} · {pending.length}{" "}
              {pending.length === 1 ? "action waiting" : "actions waiting"}
            </p>
            <p className="text-sm text-amber-800">
              Your taps are saved on this device and will go through by themselves.
            </p>
            <ul className="mt-1 text-xs text-amber-800/90">
              {pending.slice(0, 4).map((a) => (
                <li key={a.id}>· {a.label}</li>
              ))}
              {pending.length > 4 && <li>· and {pending.length - 4} more</li>}
            </ul>
          </div>
          <button
            onClick={() => flush()}
            className="h-12 shrink-0 rounded-xl border-2 border-amber-500 px-5 text-sm font-semibold text-amber-900"
          >
            Try now
          </button>
        </div>
      )}

      {!online && pending.length === 0 && (
        <div className="rounded-xl border border-charcoal/15 bg-parchment px-4 py-2 text-sm text-graphite">
          No connection — you can keep working, everything is saved on this device.
        </div>
      )}

      {rejected.length > 0 && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-red-900">
                {rejected.length === 1 ? "One action was not accepted" : `${rejected.length} actions were not accepted`}
              </p>
              <ul className="mt-1 space-y-0.5 text-sm text-red-800">
                {rejected.map((r, i) => (
                  <li key={i}>
                    · {r.label} — {r.error}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-red-800/80">
                The room may have changed while you were offline. Please check it.
              </p>
            </div>
            <button
              onClick={dismissRejected}
              className="h-11 w-11 shrink-0 rounded-lg text-red-900 hover:bg-red-100"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
