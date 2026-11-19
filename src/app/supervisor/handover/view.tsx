"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { errorText } from "@/lib/i18n/errorText";
import { Banner, Button, FilterChip, GlassCard, SectionLabel } from "@/components/ui";
import { cx, FOCUS_RING, Glyph } from "@/components/ui/primitives";

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
  attention: { blocked: unknown[]; rework: unknown[]; outOfOrder: unknown[]; deferred: unknown[] };
  arrivals: { expected: number; readyNow: number; atRisk: unknown[] };
  engineering: { openWorkOrders: number };
}

const WINDOWS = [4, 8, 12];

/** Schichtübergabe (Supervisor). Simon-Feedback 19.11.2026: im Design der App („Glas & Premium“), Inhalt unverändert. */
export default function HandoverView() {
  const { t, locale } = useLocale();
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
      setData(await api<{ handover: Handover; facts: Facts }>(`/api/handover?hours=${h}&lang=${locale}`));
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  }, [t, locale]);

  useEffect(() => { void load(hours); }, [load, hours]);

  const copy = async () => {
    if (!data) return;
    await navigator.clipboard.writeText(`${data.handover.headline}\n\n${data.handover.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const h = data?.handover;
  const f = data?.facts;

  return (
    <div className="theme-glass flex flex-col gap-4 pb-16 sm:gap-6" data-testid="handover">
      <GlassCard as="section" aria-label={t("handover.title")} className="flex flex-col gap-3">
        <SectionLabel as="h2" icon="file-text" title={t("handover.title")} />
        <p className="text-body-16 text-text-muted">{t("handover.subtitle")}</p>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("handover.coverLast")}>
          <span className="text-label text-text-muted">{t("handover.coverLast")}</span>
          {WINDOWS.map((w) => (
            <FilterChip key={w} active={hours === w} onClick={() => setHours(w)}>{t("handover.hours", { n: w })}</FilterChip>
          ))}
          <Button variant="secondary" icon="refresh" disabled={busy} onClick={() => void load(hours)}>
            {busy ? t("handover.writing") : t("handover.regenerate")}
          </Button>
        </div>
      </GlassCard>

      {error && <Banner tone="warning" title={error} />}

      {h && f && (
        <>
          {f.attention.deferred.length > 0 && (
            <Banner tone="accent" icon="clock" title={t("handover.deferredBadge", { count: f.attention.deferred.length })} />
          )}
          <GlassCard as="article" className="flex flex-col gap-4">
            <h3 className="text-title-28 text-text-primary">{h.headline}</h3>
            <div className="text-body-18 flex flex-col gap-3 text-text-secondary">
              {h.body.split("\n\n").map((p, i) => <p key={i}>{p}</p>)}
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle pt-4">
              <Button icon={copied ? "check" : "file-text"} onClick={() => void copy()}>
                {copied ? t("handover.copied") : t("handover.copyForShiftBook")}
              </Button>
              <span className="text-label text-text-muted">
                {h.providerLabel}
                {h.model ? ` · ${h.model}` : ""}
              </span>
            </div>
            {h.warning && <Banner tone="warning" title={h.warning} />}
          </GlassCard>

          {/* Jede Zahl oben ist nachprüfbar — die Fakten dahinter zum Aufklappen */}
          <GlassCard as="section" className="flex flex-col gap-2">
            <button type="button" onClick={() => setShowFacts((s) => !s)} aria-expanded={showFacts}
              className={cx("press flex min-h-(--size-touch-min) w-full items-center justify-between gap-3 text-start", FOCUS_RING)}>
              <span className="text-title-22 text-text-primary">{t("handover.factsTitle")}</span>
              <Glyph name="chevron-down" size={20} className={cx("text-text-secondary transition-transform duration-150", showFacts && "rotate-180")} />
            </button>
            <p className="text-body-16 text-text-muted">{t("handover.factsExplain")}</p>
            {showFacts && (
              <ul className="text-body-16 flex flex-col gap-2 rounded-(--glass-radius-md) bg-surface-card-raised p-4 text-text-secondary">
                {h.bullets.map((b, i) => <li key={i}>· {b}</li>)}
              </ul>
            )}
          </GlassCard>
        </>
      )}

      {!h && !error && <p className="text-body-16 text-text-muted">{t("handover.collecting")}</p>}
    </div>
  );
}
