"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/components/api";
import { useSocket } from "@/components/useSocket";
import PurgeBanner from "@/components/PurgeBanner";
import PlausibilityBanner from "./PlausibilityBanner";
import DayPlanPanel from "@/app/import/DayPlanPanel";
import { IMPORT_TYPES, type ImportType } from "@/lib/domain";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { buildPreview } from "@/lib/import/preview";
import type { DateFormatId, ParseResult } from "@/lib/import/types";
import LiveClock from "@/components/LiveClock";
import { listStateOf, planningAllowed, type ListStatus } from "@/lib/import/readiness";
import { dateLabel, fileStatus, listsReady, type HouseData, type StepId } from "@/lib/planung/model";
import FileDropCard from "./FileDropCard";
import FloorStep from "./FloorStep";
import HouseMap from "./HouseMap";
import PlanungShell from "./PlanungShell";
import PlanEditorWindow, { type EditorTab } from "./PlanEditorWindow";
import PlanConfirmDialog from "./PlanConfirmDialog";
import Modal from "@/components/Modal";
import PlanStep from "./PlanStep";
import PrimaryButton from "./PrimaryButton";
import ProgressRing from "./ProgressRing";
import StepSegments from "./StepSegments";
import TeamStep from "./TeamStep";
import { usePlanRun, usePlanungTeam } from "./usePlanungFlow";
import Stepper from "./Stepper";
import { errorText, useImportSession, type ImportItem } from "./useImportSession";

const SLOTS: ImportType[] = ["FORECAST", "DEPARTURES", "ARRIVALS", "TRACES", "INHOUSE"];
const READ_MS = 850;

/** Planungstool: Gerüst, Schritt 1 „Listen" und Haus-Ansicht. Schritte 2–4 folgen in D2 (hier Platzhalter). */
export default function PlanungClient({ initialHouse }: { initialHouse: HouseData }) {
  const { t, intl } = useLocale();
  const [step, setStep] = useState<StepId>(1);
  const [reached, setReached] = useState<StepId>(1);
  const [house, setHouse] = useState<HouseData>(initialHouse);
  const [animateKey, setAnimateKey] = useState(0);
  const [highlight, setHighlight] = useState<Set<string>>(new Set());
  const [changedNote, setChangedNote] = useState<number>(0);
  const [over, setOver] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<ImportType | null>(null);
  const [deleting, setDeleting] = useState<ImportType | null>(null);
  const [delError, setDelError] = useState<{ type: ImportType; text: string } | null>(null);
  const [editor, setEditor] = useState<{ tab: EditorTab; view: "plan" | "list" } | null>(null);
  const [hmEdits, setHmEdits] = useState<Record<string, string | null>>({});
  const [skipAsk, setSkipAsk] = useState<{ id: string; name: string; rooms: number } | null>(null);
  const [undo, setUndo] = useState<{ id: string; name: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
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

  // Nach dem Übernehmen: sobald das Gate offen ist (fünf Listen, keine unbestätigt veraltet), Tagesplan berechnen
  // (idempotent) und das Haus füllen — Kachel-Welle, dann Etagenbalken. Ein Fehler bleibt sichtbar (mit „Erneut versuchen").
  const mergeNow = useCallback(async () => {
    setMerging(true); setMergeError(null);
    try {
      const st = await api<{ status: ListStatus; today: string }>("/api/import/status");
      if (planningAllowed(st.status, st.today)) await api("/api/dayplan/merge", { body: {} }); // Server rechnet für den Betriebstag
      await refreshHouse({ wave: true });
    } catch (e) {
      setMergeError(errorText(e));
    } finally { setMerging(false); }
  }, [refreshHouse]);
  const session = useImportSession(mergeNow, { minReadMs: READ_MS });
  const { items, status, plan: planHint, addFiles, reparse, discard, applyAll, retry, removeList, issuesOf, isCritical, ready } = session;

  /** Zwei-Tap-Löschen: erster Tap fragt „Liste löschen?", zweiter löscht die eingelesene Liste. */
  const deleteList = async (ty: ImportType) => {
    setDeleting(ty); setDelError(null);
    const err = await removeList(ty, !!planHint?.confirmed);
    setDeleting(null);
    if (err === "planConfirmed") { await session.loadStatus(); return; } // Plan wurde inzwischen bestätigt → Hinweis zeigen, erneut fragen
    if (err) { setDelError({ type: ty, text: err }); return; }
    setConfirmDel(null);
    // Schritt-Zustand zurücksetzen: ohne die Liste gilt der bisherige Plan-Lauf nicht mehr (Gate wertet neu aus)
    setReached(1); setMergeError(null); setChangedNote(0); setHighlight(new Set()); setHmEdits({});
    await refreshHouse();
  };
  const router = useRouter();
  const team = usePlanungTeam(house.date);
  const plan = usePlanRun(house.date);
  // Schritt „Plan“: Kräfte (auch bewusst nicht eingeplante), Supervisor- und Hausmann-Listen für den Entwurf
  const hkNames = Object.fromEntries((team.state?.members.hk ?? []).map((m) => [m.id, m.name]));
  const planHkRows = (team.state?.members.hk ?? []).map((m) => {
    const h = plan.draft?.input.housekeepers.find((x) => x.id === m.id);
    const v = plan.view?.metrics.find((x) => x.hkId === m.id);
    return { id: m.id, name: m.name, rooms: v?.rooms ?? 0, credits: v?.credits ?? 0, lo: h?.lo ?? 0, hi: h?.hi ?? 0, excluded: !plan.active.includes(m.id) };
  });
  /** Abwählen fragt nach, wenn die Kraft schon Zimmer hat (ihre Zimmer werden neu verteilt) und ist über „Rückgängig“ umkehrbar; Einplanen sofort. */
  const toggleHk = (id: string) => {
    const row = planHkRows.find((r) => r.id === id);
    if (!row) return;
    if (row.excluded) { setUndo(null); void plan.toggleHk(id); return; }
    if (row.rooms > 0) setSkipAsk({ id, name: row.name, rooms: row.rooms });
    else { void plan.toggleHk(id); setUndo({ id, name: row.name }); }
  };
  const confirmSkip = async () => { if (!skipAsk) return; const s = skipAsk; setSkipAsk(null); await plan.toggleHk(s.id); setUndo({ id: s.id, name: s.name }); };
  /** Bestätigen: Hausmann-Zuteilungen gehen in derselben Transaktion mit; die geänderten Etagen (Supervisor) werden danach gespeichert. */
  const confirmAndSave = async (opts: { acceptOpen?: boolean; confirmStarted?: boolean }) => {
    const housemanAssignments = Object.entries(hmEdits).map(([traceId, userId]) => ({ traceId, userId })); // in derselben Transaktion + Meldung an die Hausmänner
    const r = await plan.confirm({ ...opts, housemanAssignments });
    if (r.ok) await team.saveFloors();
    return r;
  };

  // Live bei Nachimport / geändertem Tagesplan
  useSocket({
    "dayplan:updated": (p: { changedRooms?: string[] }) => { void refreshHouse({ changed: p?.changedRooms }); },
    "import:applied": () => { void session.loadStatus(); },
    "import:deleted": () => { void session.loadStatus(); void refreshHouse(); },
  });
  useEffect(() => { void refreshHouse(); }, [refreshHouse]);

  const appliedMap: Record<string, boolean> = {};
  // „Übernommen“ zählt nur, wenn die Liste zum Betriebstag passt oder als veraltet bestätigt wurde.
  const stateOf = (ty: ImportType) => listStateOf(status?.[ty] ?? null, session.today);
  for (const ty of IMPORT_TYPES) appliedMap[ty] = stateOf(ty) === "fresh" || stateOf(ty) === "accepted";
  const reading = items.some((i) => i.phase === "reading" || i.phase === "waiting");
  const busyStep1 = reading || merging || !!deleting || items.some((i) => i.busy);
  const itemFor = (ty: ImportType): ImportItem | undefined => [...items].reverse().find((i) => i.type === ty && i.phase !== "discarded");
  const unknown = items.filter((i) => i.phase === "read" && !i.type);
  const failed = items.filter((i) => i.phase === "error" && !i.type);
  const btn = "min-h-11 rounded-full px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-light";
  const retryButton = (it: ImportItem) => (it.result || it.file) && (
    <button type="button" onClick={() => void retry(it)} className={`mt-1.5 border border-line-2 font-medium text-pl-text hover:border-brass-light ${btn}`}>{t("planungTool.retry")}</button>
  );

  const canNext = listsReady(appliedMap) && ready.length === 0 && !reading && !merging;
  const mode: "read" | "apply" | "next" = ready.length > 0 ? "apply" : canNext ? "next" : "read";
  const main = () => {
    if (mode === "apply") void applyAll();
    else if (mode === "next") goNext(2);
    else input.current?.click();
  };
  const goStep = (s: StepId) => setStep(s);
  const goNext = (n: StepId) => { setStep(n); setReached((r) => (r < n ? n : r)); };
  // Team einmal laden, sobald „Team" erreicht ist (Auswahl bleibt beim Vor- und Zurückgehen erhalten)
  useEffect(() => { if (step >= 2 && !team.state && !team.loading && house.date) void team.load(); }, [step, team, house.date]);

  const next2 = async () => { if (await team.saveTeam()) goNext(3); };
  const next3 = async () => { if (await team.saveFloors()) goNext(4); };
  const startPlan = () => { void plan.run(team.sel, team.floorSel); };

  // Haus: ab „Etagen" zeigen die Badges sofort die gewählte Zuteilung (vor dem Speichern)
  const houseView = useMemo<HouseData>(() => {
    if (step < 3 || !team.state) return house;
    const supervisors: HouseData["supervisors"] = {};
    for (const f of [1, 2, 3, 4, 5]) { const m = team.state.members.sup.find((x) => x.id === team.floorSel[f]); if (m) supervisors[f] = m.badge; }
    return { ...house, supervisors };
  }, [step, team.state, team.floorSel, house]);
  const doneCount = SLOTS.filter((ty) => appliedMap[ty] || itemFor(ty)?.phase === "read").length;
  const labels = { 1: t("planungTool.step1"), 2: t("planungTool.step2"), 3: t("planungTool.step3"), 4: t("planungTool.step4") } as Record<StepId, string>;

  const slotText = (ty: ImportType) => ({ title: t(`planungTool.slot${ty}` as "planungTool.slotFORECAST"), sub: t(`planungTool.slot${ty}sub` as "planungTool.slotFORECASTsub") });
  const statusLabel = (s: ReturnType<typeof fileStatus>) => t(({ waiting: "planungTool.stWaiting", reading: "planungTool.stReading", read: "planungTool.stRead", warning: "planungTool.stWarning", error: "planungTool.stError", applied: "planungTool.stApplied" } as const)[s]);

  const panel = (
    <>
      <div className="mb-8 hidden md:block">
        <Stepper current={step} reached={reached} labels={labels} onSelect={goStep} ariaLabel={t("planungTool.stepsLabel")} />
        <div className="mt-3 flex items-center justify-between text-xs text-pl-muted">
          <Link href="/supervisor" className="-ms-3 inline-flex min-h-11 items-center gap-1 rounded-full px-3 hover:text-pl-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-light"><span aria-hidden className="inline-block rtl:-scale-x-100">←</span>{t("planungTool.leave")}</Link>
          <span>{t("planungTool.stepOf", { n: step })} · <LiveClock tone="pl" /></span>
          <Link href="/supervisor" className="rounded-full px-3 py-2 hover:text-pl-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-light">{t("planungTool.liveBoard")} →</Link>
        </div>
      </div>

      <PlausibilityBanner refreshKey={`${JSON.stringify(status ?? {})}|${merging}`} />
      <div key={step} className="flex flex-1 flex-col" onDragOver={(e) => { if (step === 1) { e.preventDefault(); setOver(true); } }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { if (step === 1) { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); } }}>
        <h1 className="pl-rise font-serif text-4xl font-semibold leading-tight sm:text-[2.6rem]" style={{ ["--i" as string]: 0 }}>
          {step === 1 ? t("planungTool.s1Title") : labels[step]}
        </h1>

        {step === 1 ? (
          <>
            <p className="pl-rise mb-5 mt-2 hidden max-w-md text-[15px] text-pl-muted md:block" style={{ ["--i" as string]: 1 }}>{t("planungTool.s1Intro")}</p>
            <p className="pl-rise mb-1 mt-2 max-w-md text-[15px] text-pl-muted md:hidden" style={{ ["--i" as string]: 1 }}>{t("planungTool.s1IntroMobile")}</p>
            <PurgeBanner refreshKey={JSON.stringify(status ?? {})} />
            <ProgressRing done={doneCount} total={SLOTS.length} pulse={!reading && !merging} disabled={reading || merging} label={t("planungTool.progressLabel")} onClick={main}
              hint={mode === "next" ? t("planungTool.nextTeam") : mode === "apply" ? t("planungTool.applyLists") : items.length ? t("planungTool.filesOfN", { done: doneCount, total: SLOTS.length }) : t("planungTool.ringStart")} />
            <div className="space-y-2.5">
              {SLOTS.map((ty, idx) => {
                const it = itemFor(ty);
                const issues = it ? issuesOf(it) : [];
                const isStale = !it && stateOf(ty) === "stale";
                const st = it ? fileStatus({ phase: it.phase, severities: issues.map((i) => i.severity) }) : isStale ? "warning" : appliedMap[ty] ? "applied" : "waiting";
                const pv = it?.result ? buildPreview(it.result as unknown as ParseResult<unknown>) : null;
                const stand = status?.[ty]?.businessDate;
                const resultText = it?.phase === "error" ? it.error
                  : pv ? `${t("importPage.rowCount", { count: pv.count })}${pv.periodFrom ? ` · ${t("importPage.period", { from: pv.periodFrom, to: pv.periodTo ?? "—" })}` : ""}`
                  : isStale ? t("planungTool.stale", { date: stand ?? "" })
                  : stand ? (stateOf(ty) === "accepted" ? t("planungTool.staleAccepted", { date: stand }) : t("planungTool.asOf", { date: stand })) : undefined;
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
                    {it?.phase === "error" && retryButton(it)}
                    {isStale && (
                      <button type="button" onClick={() => void session.acceptStale(ty)} className="mt-1.5 min-h-11 rounded-full border border-line-2 px-4 text-xs hover:border-brass-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-light">{t("planungTool.useAnyway")}</button>
                    )}
                    {it && (it.phase === "read" || it.phase === "error") && (
                      <button type="button" onClick={() => discard(it)} className="mt-1.5 min-h-11 rounded-full px-1 text-xs text-pl-muted underline-offset-2 hover:text-pl-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-light">{t("planungTool.discard")}</button>
                    )}
                    {status?.[ty] && (!it || it.phase === "applied") && (confirmDel === ty ? (
                      <div className="mt-2 rounded-xl border border-line-2 bg-night-800 p-2 text-xs" role="group" aria-label={t("planungTool.deleteConfirm")}>
                        <div className="mb-1 font-medium text-pl-text">{t("planungTool.deleteConfirm")}</div>
                        {planHint?.confirmed && <p className="mb-1.5 text-brass-ink">{t("planungTool.deletePlanNote")}</p>}
                        {delError?.type === ty && <p role="alert" className="mb-1.5 text-brass-ink">{delError.text}</p>}
                        <div className="flex flex-wrap gap-2">
                          <button type="button" disabled={!!deleting} onClick={() => void deleteList(ty)} className={`border border-badge-3 font-medium text-pl-text hover:border-brass-light disabled:opacity-50 ${btn}`}>
                            {deleting === ty ? t("planungTool.deleting") : t("planungTool.deleteYes")}
                          </button>
                          <button type="button" disabled={!!deleting} onClick={() => { setConfirmDel(null); setDelError(null); }} className={`border border-line-2 text-pl-muted hover:text-pl-text disabled:opacity-50 ${btn}`}>{t("planungTool.deleteCancel")}</button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" disabled={busyStep1} onClick={() => { setConfirmDel(ty); setDelError(null); }} className={`mt-1.5 px-1 text-pl-muted underline-offset-2 hover:text-pl-text hover:underline disabled:opacity-50 ${btn}`}>{t("planungTool.deleteList")}</button>
                    ))}
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
                <FileDropCard key={it.id} title={it.name} subtitle="" status="error" statusLabel={t("planungTool.stError")} resultText={it.error}>{retryButton(it)}</FileDropCard>
              ))}
            </div>

            <div className={`pl-rise mt-4 hidden min-h-[8.5rem] md:flex flex-1 flex-col items-center justify-center gap-2 rounded-[18px] border-2 border-dashed p-4 text-center transition-colors ${over ? "border-brass-light bg-night-600" : "border-line-2"}`} style={{ ["--i" as string]: 6 }}>
              <div className="font-serif text-xl font-semibold">{t("planungTool.dropTitle")}</div>
              <div className="text-xs text-pl-muted">{t("planungTool.dropHint")}</div>
              <button type="button" onClick={() => input.current?.click()} className="min-h-11 rounded-full border border-line-2 px-5 text-sm font-medium hover:border-brass-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-light">{t("planungTool.chooseFiles")}</button>
              <input ref={input} type="file" multiple accept=".pdf,.xlsx,.csv,.txt" className="hidden" aria-label={t("planungTool.chooseFiles")}
                onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
            </div>
            {items.some((i) => i.phase === "applied") && <p className="mt-3 text-xs text-pl-muted">{t("planungTool.deleteFiles")}</p>}
            {changedNote > 0 && <p role="status" className="mt-2 text-xs text-brass-ink">{t("planungTool.changedRooms", { n: changedNote })}</p>}
            {mergeError && (
              <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-xs text-brass-ink">
                <span>{t("planungTool.mergeFailed")} {mergeError}</span>
                <button type="button" onClick={() => void mergeNow()} className={`border border-line-2 font-medium text-pl-text hover:border-brass-light ${btn}`}>{t("planungTool.retry")}</button>
              </div>
            )}
            {planHint?.listsChanged && (
              <p role="status" className="mt-2 text-xs text-brass-ink">
                {t("planungTool.planChanged")} <Link href="/supervisor/planning" className="inline-flex min-h-11 items-center underline underline-offset-2">{t("planungTool.planChangedLink")}</Link>
              </p>
            )}
            {!listsReady(appliedMap) && items.length > 0 && !reading && <p className="mt-2 text-xs text-pl-muted">{t("planungTool.needDepartures")}</p>}
          </>
        ) : step === 2 ? (
          <TeamStep state={team.state} sel={team.sel} onToggle={team.toggle} verdict={team.verdict} missing={team.missing} loading={team.loading} previous={team.state?.source === "previous"} />
        ) : step === 3 ? (
          <>
            <FloorStep house={house} sups={team.chosenSups} assign={team.floorSel} onPick={team.pickFloor} animateKey={1} />
            <p role="status" className="mt-3 min-h-5 text-sm text-brass-ink">{team.openFloors.length ? t("planungTool.floorOpen", { list: team.openFloors.join(", ") }) : ""}</p>
          </>
        ) : (
          <PlanStep states={plan.states} counts={plan.result?.counts ?? null} warnings={plan.view?.warnings ?? []} error={plan.error} started={plan.started}
            summary={plan.view && plan.draft ? { assigned: plan.draft.input.rooms.length - plan.view.unassigned.length, total: plan.draft.input.rooms.length, open: plan.view.unassigned.length } : null}
            hkRows={planHkRows} onEdit={() => setEditor({ tab: "rooms", view: "plan" })} onOpen={(tab, view) => setEditor({ tab, view: view ?? "plan" })} onToggleHk={toggleHk} confirmed={plan.confirmed} />
        )}
        {step >= 2 && team.error && <p role="alert" className="mt-2 text-sm text-brass-ink">{t("planungTool.saveFailed")} {team.error}</p>}
      </div>

    </>
  );

  const mainLabel = step === 1
    ? (merging || items.some((i) => i.busy) ? t("planungTool.applying") : mode === "apply" ? t("planungTool.applyLists") : mode === "next" ? t("planungTool.nextTeam") : t("planungTool.readLists"))
    : step === 2 ? (team.saving ? t("planungTool.saving") : t("planungTool.nextFloors"))
    : step === 3 ? (team.saving ? t("planungTool.saving") : t("planungTool.nextPlan"))
    : plan.running ? t("planungTool.planRunning") : plan.confirmed ? t("planungTool.toAssignmentBtn") : plan.done ? t("planungTool.reviewConfirm") : plan.error ? t("planungTool.planRetry") : t("planungTool.startPlan");
  const mainDisabled = step === 1 ? busyStep1
    : step === 2 ? team.saving || team.loading || !team.state?.hasPlan || team.missing.length > 0
    : step === 3 ? team.saving || team.openFloors.length > 0
    : plan.running;
  const mainPulse = !mainDisabled && (step === 1 ? mode !== "read" || items.length === 0 : step === 4 ? !plan.running : true);
  const mainClick = step === 1 ? main : step === 2 ? () => void next2() : step === 3 ? () => void next3() : plan.confirmed ? () => router.push("/floor-plan") : plan.done ? () => setConfirmOpen(true) : startPlan;

  const actions = (
    <>
      <div className="flex items-center justify-between gap-3">
        <button type="button" disabled={step === 1} onClick={() => goStep((step - 1) as StepId)}
          className="inline-flex h-14 items-center rounded-full border border-line-2 px-7 text-base text-pl-muted transition-colors enabled:hover:border-pl-text enabled:hover:text-pl-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-light disabled:cursor-not-allowed disabled:opacity-50">
          {t("planungTool.back")}
        </button>
        <PrimaryButton onClick={mainClick} pulse={mainPulse} disabled={mainDisabled} className="min-w-0 flex-1 lg:flex-none">{mainLabel}</PrimaryButton>
      </div>
      <div aria-live="polite" className="sr-only">{merging ? t("planungTool.applying") : plan.running ? t("planungTool.planRunning") : ""}</div>
    </>
  );

  const top = <StepSegments current={step} labels={labels} dateText={dateLabel(house.date, intl).split(",").slice(-1)[0]?.trim() ?? ""} stepText={t("planungTool.stepOf", { n: step })} ariaLabel={t("planungTool.stepsLabel")} leaveLabel={t("planungTool.leave")} />;

  const overlays = (
    <>
      {editor && plan.draft && (
        <PlanEditorWindow draft={plan.draft} initialTab={editor.tab} initialView={editor.view} floorSel={team.floorSel}
          supOptions={team.chosenSups.map((x) => ({ id: x.id, name: x.name }))} onPickFloor={team.pickFloor}
          housemen={(team.state?.members.hm ?? []).filter((m) => team.sel.hm.includes(m.id)).map((m) => ({ id: m.id, name: m.name }))}
          hmEdits={hmEdits} onHmEdit={(id, uid) => setHmEdits((e) => ({ ...e, [id]: uid }))} onAssign={plan.assign} onAssignMany={plan.assignMany} onClose={() => setEditor(null)} />
      )}
      {skipAsk && (
        <Modal title={t("planungTool.skipAskTitle", { name: skipAsk.name })} onClose={() => setSkipAsk(null)}>
          <p className="mb-4 text-sm text-graphite/80">{t("planungTool.skipAskBody", { name: skipAsk.name, n: skipAsk.rooms })}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void confirmSkip()} className="h-12 rounded-xl bg-navy px-6 text-sm font-medium text-white hover:bg-navy-line">{t("planungTool.skipAskConfirm")}</button>
            <button type="button" onClick={() => setSkipAsk(null)} className="h-12 rounded-xl border border-charcoal/15 bg-white px-5 text-sm">{t("common.cancel")}</button>
          </div>
        </Modal>
      )}
      {undo && !plan.confirmed && (
        <div role="status" className="fixed bottom-24 start-4 end-4 z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-full border border-line-2 bg-night-600 px-4 py-2 text-sm text-pl-text shadow-lg">
          <span>{t("planungTool.skippedBar", { name: undo.name })}</span>
          <button type="button" onClick={() => { const u = undo; setUndo(null); void plan.toggleHk(u.id); }} className="min-h-11 rounded-full px-3 font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-light">{t("planungTool.undoSkip")}</button>
        </div>
      )}
      {confirmOpen && plan.view && plan.draft && (
        <PlanConfirmDialog view={plan.view} names={Object.fromEntries(plan.draft!.input.housekeepers.map((h) => [h.id, h.name]))} confirming={plan.confirming}
          onConfirm={confirmAndSave} onClose={() => setConfirmOpen(false)} />
      )}
    </>
  );

  return (
    <>
      {overlays}
      <PlanungShell top={top} actions={actions} house={<HouseMap house={houseView} animateKey={animateKey} highlight={highlight} beamKey={plan.beamKey} dateLabel={dateLabel(house.date, intl)} />} panel={panel} />
    </>
  );
}
