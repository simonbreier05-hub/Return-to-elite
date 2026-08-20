"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/components/api";

interface Handover {
  headline: string;
  body: string;
  bullets: string[];
  provider: "local" | "anthropic";
  providerLabel: string;
  model?: string;
  warning?: string;
}

interface Facts {
  windowHours: number;
  progress: {
    released: number;
    sellable: number;
    percentReleased: number;
    stillDirty: number;
    inProgress: number;
    waitingForInspection: number;
  };
  attention: { blocked: unknown[]; rework: unknown[]; outOfOrder: unknown[] };
  arrivals: { expected: number; readyNow: number; atRisk: unknown[] };
  engineering: { openWorkOrders: number };
}

const WINDOWS = [4, 8, 12];

export default function HandoverView() {
  const [hours, setHours] = useState(8);
  const [data, setData] = useState<{ handover: Handover; facts: Facts } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showFacts, setShowFacts] = useState(false);

  const load = useCallback(async (h: number) => {
    setBusy(true);
    setError(null);
    try {
      setData(await api<{ handover: Handover; facts: Facts }>(`/api/handover?hours=${h}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load(hours);
  }, [load, hours]);

  const copy = async () => {
    if (!data) return;
    await navigator.clipboard.writeText(`${data.handover.headline}\n\n${data.handover.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const h = data?.handover;
  const f = data?.facts;

  return (
    <div className="animate-rise pb-16">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-4xl leading-none">Shift Handover</h2>
          <div className="rule-gold my-2 w-40" />
          <p className="text-sm text-graphite/70">Everything the incoming supervisor needs, in about thirty seconds.</p>
        </div>
        <Link
          href="/supervisor"
          className="flex h-12 items-center rounded-xl border border-charcoal/15 bg-linen px-5 text-sm font-medium hover:border-gold-line"
        >
          ← Live board
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm text-graphite/60">Cover the last</span>
        {WINDOWS.map((w) => (
          <button
            key={w}
            onClick={() => setHours(w)}
            className={`h-12 rounded-xl border px-5 text-sm transition ${
              hours === w ? "border-gold-line bg-parchment font-semibold" : "border-charcoal/15 bg-white"
            }`}
          >
            {w} h
          </button>
        ))}
        <button
          onClick={() => load(hours)}
          disabled={busy}
          className="h-12 rounded-xl border border-charcoal/15 bg-white px-5 text-sm disabled:opacity-40"
        >
          {busy ? "Writing…" : "Regenerate"}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-status-out-of-order/30 bg-status-out-of-order/10 p-4 text-sm text-status-out-of-order">
          {error}
        </div>
      )}

      {h && f && (
        <>
          <article className="mb-4 rounded-2xl border border-charcoal/10 bg-linen p-6 shadow-card">
            <h3 className="font-serif text-3xl leading-tight">{h.headline}</h3>
            <div className="rule-gold my-3 w-full" />
            <div className="space-y-3 text-[0.95rem] leading-relaxed text-charcoal/90">
              {h.body.split("\n\n").map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-charcoal/10 pt-4">
              <button
                onClick={copy}
                className="h-12 rounded-xl bg-navy px-5 text-sm font-medium text-ivory transition hover:bg-navy-line"
              >
                {copied ? "✓ Copied" : "Copy for the shift book"}
              </button>
              <span className="text-xs text-graphite/55">
                {h.providerLabel}
                {h.model ? ` · ${h.model}` : ""}
              </span>
            </div>

            {h.warning && (
              <p className="mt-3 rounded-lg border border-gold/40 bg-gold/10 p-3 text-sm text-gold-soft">
                {h.warning}
              </p>
            )}
          </article>

          {/* The point of this panel: every number above is verifiable. */}
          <section className="rounded-2xl border border-charcoal/10 bg-linen p-5 shadow-card">
            <button
              onClick={() => setShowFacts((s) => !s)}
              className="flex w-full items-center justify-between text-left"
            >
              <span className="font-serif text-xl">The facts behind this text</span>
              <span className="text-sm text-gold">{showFacts ? "hide ▲" : "show ▼"}</span>
            </button>
            <p className="mt-1 text-sm text-graphite/60">
              Counted by the system from the board and the audit trail. The writer receives exactly these lines and may
              not add anything to them — no number in the handover comes from a language model.
            </p>

            {showFacts && (
              <ul className="mt-3 space-y-1.5 rounded-xl border border-gold-line/40 bg-ivory p-4 text-sm text-graphite">
                {h.bullets.map((b, i) => (
                  <li key={i}>· {b}</li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {!h && !error && <p className="text-sm text-graphite/60">Collecting the shift…</p>}
    </div>
  );
}
