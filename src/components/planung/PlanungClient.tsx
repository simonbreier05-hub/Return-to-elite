"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/components/api";
import { useSocket } from "@/components/useSocket";
import PurgeBanner from "@/components/PurgeBanner";
import DayPlanPanel from "@/app/import/DayPlanPanel";
import { IMPORT_TYPES, type ImportType } from "@/lib/domain";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { buildPreview } from "@/lib/import/preview";
import type { DateFormatId, ParseResult } from "@/lib/import/types";
import { dateLabel, fileStatus, listsReady, type HouseData, type StepId } from "@/lib/planung/model";
import FileDropCard from "./FileDropCard";
import HouseMap from "./HouseMap";
import PlanungShell from "./PlanungShell";
import PrimaryButton from "./PrimaryButton";
import Stepper from "./Stepper";
import { useImportSession, type ImportItem } from "./useImportSession";

const SLOTS: ImportType[] = ["FORECAST", "DEPARTURES", "ARRIVALS", "TRACES"];
const READ_MS = 850;

/** Planungstool: Gerüst, Schritt 1 „Listen" und Haus-Ansicht. Schritte 2–4 folgen in D2 (hier Platzhalter). */
export default function PlanungClient({ initialHouse }: { initialHouse: HouseData }) {
  const { t } = useLocale();
  const [step, setStep] = useState<StepId>(1);
  const [reached, setReached] = useState<StepId>(1);
  const [house, setHouse] = useState<HouseData>(initialHouse);
  const [animateKey, setAnimateKey] = useState(0);
  const [highlight, setHighlight] = useState<Set<string>>(new Set());
  const [changedNote, setChangedNote] = useState<number>(0);
  const [over, setOver] = useState(false);
  const [merging, setMerging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const hadData = useRef(initialHouse.hasData);
  const refreshHouse = useCallback(async (opts: { wave?: boolean; changed?: string[] } = {}) => {
    const h = await api<HouseData>("/api/planung/house").catch(() => null);
    if (!h) return;
    // Erster Import: alles ist neu, also nichts hervorheben (nur ein Nachimport markiert geänderte Zimmer)
    const highlightChanged = hadData.current;
    hadData.current = h.hasData;
    setHouse(h);
    if (opts.wave) setAnimateKey((k) => k + 1);
    if (highlightChanged && opts.changed?.length) {
      setHighlight(new Set(opts.changed)); setChangedNote(opts.changed.length);
      setTimeout(() => setHighlight(new Set()), 2200);
    }
  }, []);

  // Nach dem Übernehmen: Tagesplan berechnen (idempotent) und das Haus füllen — Kachel-Welle, dann Etagenbalken
  const session = useImportSession(async () => {
    setMerging(true);
    try {
      const st = await api<{ status: Record<string, { businessDate: string } | null> }>("/api/import/status");
      const date = st.status.DEPARTURES?.businessDate;
      if (date) await api("/api/dayplan/merge", { body: { date } }).catch(() => null);
      await refreshHouse({ wave: true });
    } finally { setMerging(false); }
  }, { minReadMs: READ_MS });
  const { items, status, addFiles, reparse, discard, applyAll, issuesOf, isCritical, ready } = session;

  // Live bei Nachimport / geändertem Tagesplan
  useSocket({
    "dayplan:updated": (p: { changedRooms?: string[] }) => { void refreshHouse({ changed: p?.changedRooms }); },
    "import:applied": () => { session.loadStatus(); },
  });
  useEffect(() => { void refreshHouse(); }, [refreshHouse]);

  const appliedMap: Record<string, boolean> = {};
  for (const ty of IMPORT_TYPES) appliedMap[ty] = !!status?.[ty] || items.some((i) => i.type === ty && i.phase === "applied");
  const reading = items.some((i) => i.phase === "reading" || i.phase === "waiting");
  const itemFor = (ty: ImportType): ImportItem | undefined => [...items].reverse().find((i) => i.type === ty && i.phase !== "discarded");
  const unknown = items.filter((i) => i.phase === "read" && !i.type);
  const failed = items.filter((i) => i.phase === "error" && !i.type);

  const canNext = listsReady(appliedMap) && ready.length === 0 && !reading && !merging;
  const mode: "read" | "apply" | "next" = ready.length > 0 ? "apply" : canNext ? "next" : "read";
  const main = () => {
    if (mode === "apply") void applyAll();
    else if (mode === "next") { setStep(2); setReached((r) => (r < 2 ? 2 : r)); }
    else input.current?.click();
  };
  const goStep = (s: StepId) => setStep(s);
  const labels = { 1: t("planungTool.step1"), 2: t("planungTool.step2"), 3: t("planungTool.step3"), 4: t("planungTool.step4") } as Record<StepId, string>;

  const slotText = (ty: ImportType) => ({ title: t(`planungTool.slot${ty}` as "planungTool.slotFORECAST"), sub: t(`planungTool.slot${ty}sub` as "planungTool.slotFORECASTsub") });
  const statusLabel = (s: ReturnType<typeof fileStatus>) => t(({ waiting: "planungTool.stWaiting", reading: "planungTool.stReading", read: "planungTool.stRead", warning: "planungTool.stWarning", error: "planungTool.stError", applied: "planungTool.stApplied" } as const)[s]);

  const panel = (
    <>
      <div className="mb-8">
        <Stepper current={step} reached={reached} labels={labels} onSelect={goStep} ariaLabel={t("planungTool.stepsLabel")} />
        <div className="mt-3 flex items-center justify-between text-xs text-pl-muted">
          <span>{t("planungTool.stepOf", { n: step })}</span>
          <Link href="/supervisor" className="rounded-full px-3 py-2 hover:text-pl-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-light">{t("planungTool.liveBoard")} →</Link>
        </div>
      </div>

      <div key={step} className="flex flex-1 flex-col" onDragOver={(e) => { if (step === 1) { e.preventDefault(); setOver(true); } }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { if (step === 1) { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); } }}>
        <h1 className="pl-rise font-serif text-4xl font-semibold leading-tight sm:text-[2.6rem]" style={{ ["--i" as string]: 0 }}>
          {step === 1 ? t("planungTool.s1Title") : labels[step]}
        </h1>

        {step === 1 ? (
          <>
            <p className="pl-rise mb-5 mt-2 max-w-md text-[15px] text-pl-muted" style={{ ["--i" as string]: 1 }}>{t("planungTool.s1Intro")}</p>
            <PurgeBanner refreshKey={JSON.stringify(status ?? {})} />
            <div className="space-y-2.5">
              {SLOTS.map((ty, idx) => {
                const it = itemFor(ty);
                const issues = it ? issuesOf(it) : [];
                const st = it ? fileStatus({ phase: it.phase, severities: issues.map((i) => i.severity) }) : appliedMap[ty] ? "applied" : "waiting";
                const pv = it?.result ? buildPreview(it.result as unknown as ParseResult<unknown>) : null;
                const stand = status?.[ty]?.businessDate;
                const resultText = it?.phase === "error" ? it.error
                  : pv ? `${t("importPage.rowCount", { count: pv.count })}${pv.periodFrom ? ` · ${t("importPage.period", { from: pv.periodFrom, to: pv.periodTo ?? "—" })}` : ""}`
                  : stand ? t("planungTool.asOf", { date: stand }) : undefined;
                const { title, sub } = slotText(ty);
                return (
                  <FileDropCard key={ty} index={idx + 2} title={title} subtitle={sub} status={st} statusLabel={statusLabel(st)} resultText={resultText} issues={issues}>
                    {pv?.dateFormat.via === "ambiguous" && pv.dateFormat.readings && it && (
                      <div className="mt-2 rounded-xl border border-line-2 bg-night-800 p-2 text-xs">
                        <div className="mb-1.5">{t("planungTool.dateUnclear")}</div>
                        <div className="flex flex-wrap gap-2">
                          {(Object.keys(pv.dateFormat.readings) as DateFormatId[]).map((f) => (
                            <button key={f} type="button" onClick={() => reparse(it, ty, f)} className="min-h-11 rounded-full border border-line-2 px-3 hover:border-brass-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-light">
                              {t("importPage.dateReading", { format: t(`importPage.format${f}` as "importPage.formatMDY"), min: pv.dateFormat.readings![f].min, max: pv.dateFormat.readings![f].max })}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {it && (it.phase === "read" || it.phase === "error") && (
                      <button type="button" onClick={() => discard(it)} className="mt-1.5 min-h-11 rounded-full px-1 text-xs text-pl-muted underline-offset-2 hover:text-pl-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-light">{t("planungTool.discard")}</button>
                    )}
                  </FileDropCard>
                );
              })}
              {items.filter((i) => !i.type && (i.phase === "waiting" || i.phase === "reading")).map((it) => (
                <FileDropCard key={it.id} title={it.name} subtitle="" status="reading" statusLabel={statusLabel("reading")} />
              ))}
              {unknown.map((it) => (
                <FileDropCard key={it.id} title={it.name} subtitle={t("planungTool.unknownType")} status="read" statusLabel={t("planungTool.stRead")}>
                  <select defaultValue="" onChange={(e) => e.target.value && reparse(it, e.target.value as ImportType)} className="mt-2 h-11 rounded-full border border-line-2 bg-night-800 px-3 text-sm" aria-label={t("planungTool.unknownType")}>
                    <option value="" disabled>{t("planungTool.chooseType")}</option>
                    {SLOTS.map((ty) => <option key={ty} value={ty}>{slotText(ty).title}</option>)}
                  </select>
                </FileDropCard>
              ))}
              {failed.map((it) => (
                <FileDropCard key={it.id} title={it.name} subtitle="" status="error" statusLabel={t("planungTool.stError")} resultText={it.error} />
              ))}
            </div>

            <div className={`pl-rise mt-4 flex min-h-[8.5rem] flex-1 flex-col items-center justify-center gap-2 rounded-[18px] border-2 border-dashed p-4 text-center transition-colors ${over ? "border-brass-light bg-night-600" : "border-line-2"}`} style={{ ["--i" as string]: 6 }}>
              <div className="font-serif text-xl font-semibold">{t("planungTool.dropTitle")}</div>
              <div className="text-xs text-pl-muted">{t("planungTool.dropHint")}</div>
              <button type="button" onClick={() => input.current?.click()} className="min-h-11 rounded-full border border-line-2 px-5 text-sm font-medium hover:border-brass-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-light">{t("planungTool.chooseFiles")}</button>
              <input ref={input} type="file" multiple accept=".pdf,.xlsx,.csv,.txt" className="hidden" aria-label={t("planungTool.chooseFiles")}
                onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
            </div>
            {items.some((i) => i.phase === "applied") && <p className="mt-3 text-xs text-pl-muted">{t("planungTool.deleteFiles")}</p>}
            {changedNote > 0 && <p role="status" className="mt-2 text-xs text-brass-light">{t("planungTool.changedRooms", { n: changedNote })}</p>}
            {!listsReady(appliedMap) && items.length > 0 && !reading && <p className="mt-2 text-xs text-pl-muted">{t("planungTool.needDepartures")}</p>}
          </>
        ) : (
          <div className="mt-3 space-y-4">
            <p className="pl-rise max-w-md text-[15px] text-pl-muted" style={{ ["--i" as string]: 1 }}>{t("planungTool.comingD2")}</p>
            {step === 4 && (
              <div className="rounded-[18px] bg-ivory p-3 text-charcoal">
                <h2 className="mb-1 font-serif text-xl">{t("planungTool.dayPlanTitle")}</h2>
                <DayPlanPanel date={status?.DEPARTURES?.businessDate ?? null} refreshKey={JSON.stringify(status ?? {})} />
                <Link href="/supervisor/planning" className="mt-2 inline-block min-h-11 py-2 text-sm font-medium text-brass-text hover:underline">{t("planungTool.toPlanningHub")}</Link>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <button type="button" disabled={step === 1} onClick={() => goStep((step - 1) as StepId)}
          className="inline-flex h-14 items-center rounded-full border border-line-2 px-7 text-base text-pl-muted transition-colors enabled:hover:border-pl-text enabled:hover:text-pl-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-light disabled:cursor-not-allowed disabled:opacity-50">
          {t("planungTool.back")}
        </button>
        {step === 1 ? (
          <PrimaryButton onClick={main} pulse={!reading && !merging && (mode !== "read" || items.length === 0)} disabled={reading || merging}>
            {merging || items.some((i) => i.busy) ? t("planungTool.applying") : mode === "apply" ? t("planungTool.applyLists") : mode === "next" ? t("planungTool.nextTeam") : t("planungTool.readLists")}
          </PrimaryButton>
        ) : (
          <PrimaryButton disabled={step === 4} pulse={step !== 4} onClick={() => { const n = (step + 1) as StepId; setStep(n); setReached((r) => (r < n ? n : r)); }}>
            {t("planungTool.next")}
          </PrimaryButton>
        )}
      </div>
      <div aria-live="polite" className="sr-only">{merging ? t("planungTool.applying") : ""}</div>
    </>
  );

  return <PlanungShell house={<HouseMap house={house} animateKey={animateKey} highlight={highlight} dateLabel={dateLabel(house.date)} />} panel={panel} />;
}
