"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/components/api";
import { buildResult } from "@/lib/autoplan/result";
import type { Assignment, PlanInput, PlanResult } from "@/lib/autoplan/types";
import {
  capacityVerdict, floorsMissing, phaseStates, planCounts, teamMissing,
  type PlanCounts, type PlanPhase, type TeamSelection,
} from "@/lib/planung/team";
import type { HouseData } from "@/lib/planung/model";
import type { TeamState } from "@/lib/planung/teamData";

type Group = keyof TeamSelection;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Zustand der Schritte „Team" und „Etagen": laden, wählen, speichern. Die Vorschau im Haus läuft lokal, gespeichert wird beim Weiter. */
export function usePlanungTeam(date: string | null) {
  const [state, setState] = useState<TeamState | null>(null);
  const [sel, setSel] = useState<TeamSelection>({ hk: [], sup: [], hm: [] });
  const [floorSel, setFloorSel] = useState<Record<number, string | null>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!date) return;
    setLoading(true); setError(null);
    try {
      const s = await api<TeamState>(`/api/planung/team?date=${date}`);
      setState(s); setSel(s.selected); setFloorSel(s.floorAssign);
    } catch (e) { setError(e instanceof Error ? e.message : "?"); } finally { setLoading(false); }
  }, [date]);

  const toggle = useCallback((g: Group, id: string) => {
    setSel((s) => ({ ...s, [g]: s[g].includes(id) ? s[g].filter((x) => x !== id) : [...s[g], id] }));
    // Wer abgewählt wird, behält keine Etage
    if (g === "sup") setFloorSel((f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === id ? null : v])) as Record<number, string | null>);
  }, []);
  const pickFloor = useCallback((floor: number, id: string) => setFloorSel((f) => ({ ...f, [floor]: id })), []);

  const targets = useMemo(() => (state ? state.members.hk.filter((h) => sel.hk.includes(h.id)).map((h) => h.target) : []), [state, sel.hk]);
  const verdict = useMemo(() => capacityVerdict(state?.demand.credits ?? 0, targets), [state, targets]);
  const missing = useMemo(() => teamMissing({ hk: sel.hk.length, sup: sel.sup.length }), [sel.hk.length, sel.sup.length]);
  const openFloors = useMemo(() => floorsMissing(floorSel), [floorSel]);
  const chosenSups = useMemo(() => (state ? state.members.sup.filter((s) => sel.sup.includes(s.id)) : []), [state, sel.sup]);

  const saveTeam = useCallback(async (): Promise<boolean> => {
    if (!date) return false;
    setSaving(true); setError(null);
    try { await api("/api/planung/team", { method: "PUT", body: { date, ...sel } }); return true; }
    catch (e) { setError(e instanceof Error ? e.message : "?"); return false; } finally { setSaving(false); }
  }, [date, sel]);

  const saveFloors = useCallback(async (): Promise<boolean> => {
    if (!date) return false;
    setSaving(true); setError(null);
    try { await api("/api/planung/floors", { method: "PUT", body: { date, floors: Object.fromEntries([1, 2, 3, 4, 5].map((f) => [String(f), floorSel[f]])) } }); return true; }
    catch (e) { setError(e instanceof Error ? e.message : "?"); return false; } finally { setSaving(false); }
  }, [date, floorSel]);

  return { state, sel, floorSel, loading, saving, error, load, toggle, pickFloor, verdict, missing, openFloors, chosenSups, saveTeam, saveFloors };
}

export interface PlanResultView { counts: PlanCounts; warnings: { severity: "WARNING" | "INFO"; message: string }[] }

/** Der Entwurf, wie er bearbeitet wird: Eingabe des Vorschlags + aktuelle (ggf. von Hand geänderte) Zuteilung. */
export interface PlanDraft { proposalId: string; input: PlanInput; proposed: Assignment; assignment: Assignment }
export type ConfirmOutcome =
  | { ok: true; assigned: number; open: number }
  | { ok: false; code: "OPEN_ROOMS" | "STARTED_ROOMS" | "OTHER"; message: string; rooms?: string[]; open?: number };

/**
 * Schritt „Plan": ruft die echte Logik auf (Tagesplan berechnen, Zuteilung vorschlagen) und meldet jede Phase erst,
 * wenn sie wirklich fertig ist. Danach lässt sich der Entwurf ansehen und bearbeiten (Grundriss im Entwurfsmodus);
 * erst `confirm` schaltet ihn live (eine Transaktion, Meldungen an die Betroffenen).
 */
export function usePlanRun(date: string | null) {
  const [completed, setCompleted] = useState(0);
  const [running, setRunning] = useState(false);
  const [failedAt, setFailedAt] = useState<PlanPhase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PlanResultView | null>(null);
  const [started, setStarted] = useState(false);
  const [beamKey, setBeamKey] = useState(0);
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [startedOk, setStartedOk] = useState<Set<string>>(new Set());
  /** Kräfte, die der Vorschlag gerade einplant (Start: Team aus Schritt 2). Hinzu-/Abwählen rechnet neu. */
  const [active, setActive] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState<{ assigned: number; open: number } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const busy = useRef(false);
  const last = useRef<{ team: TeamSelection; floorAssign: Record<number, string | null> } | null>(null);

  const propose = useCallback(async (ids: string[]) => {
    const p = await api<{ proposalId: string; input: PlanInput; result: PlanResult }>("/api/autoplan/propose", { body: { date, attendantIds: ids } });
    setDraft({ proposalId: p.proposalId, input: p.input, proposed: p.result.assignment, assignment: p.result.assignment });
    setStartedOk(new Set());
    return p;
  }, [date]);

  const run = useCallback(async (team: TeamSelection, floorAssign: Record<number, string | null>) => {
    if (!date || busy.current) return;
    busy.current = true;
    last.current = { team, floorAssign };
    setStarted(true); setRunning(true); setError(null); setFailedAt(null); setResult(null); setCompleted(0); setDraft(null); setActive(team.hk); setConfirmed(null);
    const beat = () => (reduced() ? Promise.resolve() : wait(380)); // damit jede fertige Zeile sichtbar wird
    let phase: PlanPhase = "merge";
    try {
      await api("/api/dayplan/merge", { body: { date } });
      setCompleted(1); await beat();
      phase = "propose";
      const p = await propose(team.hk);
      setCompleted(2); await beat();
      const counts = planCounts(p.result.routes, floorAssign, team.hm.length);
      phase = "rooms"; setCompleted(3); await beat();
      phase = "supervisors"; setCompleted(4); await beat();
      phase = "houseman"; setCompleted(5);
      setResult({ counts, warnings: [] });
      setBeamKey((k) => k + 1); // Lichtstrahl läuft einmal durchs Haus
    } catch (e) {
      setFailedAt(phase); setError(e instanceof Error ? e.message : "");
    } finally { setRunning(false); busy.current = false; }
  }, [date, propose]);

  /** Eine Kraft hinzu- oder abwählen (Supervisor entscheidet): neuer Vorschlag mit den gewählten Kräften; Handänderungen am Entwurf gehen dabei verloren. */
  const toggleHk = useCallback(async (hkId: string) => {
    if (busy.current) return;
    busy.current = true; setError(null);
    const next = active.includes(hkId) ? active.filter((x) => x !== hkId) : [...active, hkId];
    try {
      if (!next.length) throw new Error("Mindestens eine Kraft muss eingeplant bleiben.");
      await propose(next); setActive(next);
    } catch (e) { setError(e instanceof Error ? e.message : ""); } finally { busy.current = false; }
  }, [active, propose]);

  /** Zimmer von Hand zuteilen/verschieben/entfernen — ohne Sperren; Warnungen werden live neu gerechnet. */
  const assign = useCallback((roomId: string, hkId: string | null, confirmStarted: boolean) => {
    setDraft((d) => (d ? { ...d, assignment: { ...d.assignment, [roomId]: hkId } } : d));
    if (confirmStarted) setStartedOk((s) => new Set(s).add(roomId));
  }, []);

  /** Mehrere Zimmer auf einmal (Mehrfachauswahl, Ziehen) — ein Zustandswechsel, ein Neuberechnen. */
  const assignMany = useCallback((roomIds: string[], hkId: string | null, confirmStarted: boolean) => {
    setDraft((d) => (d ? { ...d, assignment: { ...d.assignment, ...Object.fromEntries(roomIds.map((id) => [id, hkId])) } } : d));
    if (confirmStarted) setStartedOk((s) => new Set([...s, ...roomIds]));
  }, []);

  const view = useMemo(() => (draft ? buildResult(draft.input, draft.assignment) : null), [draft]);

  const confirm = useCallback(async (opts: { acceptOpen?: boolean; confirmStarted?: boolean; housemanAssignments?: { traceId: string; userId: string | null }[] }): Promise<ConfirmOutcome> => {
    if (!draft) return { ok: false, code: "OTHER", message: "" };
    setConfirming(true);
    try {
      const r = await api<{ assigned: number; open: number }>("/api/autoplan/confirm", { body: { proposalId: draft.proposalId, assignment: draft.assignment, ...opts } });
      setConfirmed({ assigned: r.assigned, open: r.open });
      return { ok: true, assigned: r.assigned, open: r.open };
    } catch (e) {
      if (e instanceof ApiError && (e.code === "OPEN_ROOMS" || e.code === "STARTED_ROOMS")) {
        return { ok: false, code: e.code, message: e.message, rooms: e.data?.rooms as string[] | undefined, open: e.data?.open as number | undefined };
      }
      return { ok: false, code: "OTHER", message: e instanceof Error ? e.message : "" };
    } finally { setConfirming(false); }
  }, [draft]);

  const states = phaseStates(completed, running, failedAt);
  return { run, states, started, running, error, result, beamKey, done: !!result && !running, draft, view, assign, assignMany, active, toggleHk, startedOk, confirm, confirming, confirmed };
}
