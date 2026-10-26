"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, NetworkError } from "@/components/api";
import type { ImportType } from "@/lib/domain";
import { crossCheckArrivals } from "@/lib/import/parsers";
import { sha256Hex } from "@/lib/import/preview";
import { loadList, parseList, type AnyResult, type LoadedList } from "@/lib/import/readFile";
import type { ArrivalRow, DateFormatId, DepartureRow, ParseIssue, ParseResult } from "@/lib/import/types";

export type Phase = "waiting" | "reading" | "read" | "error" | "applied" | "discarded";

export interface ImportItem {
  id: string;
  name: string;
  phase: Phase;
  type: ImportType | null;
  list?: LoadedList;
  hash?: string;
  result?: AnyResult;
  confirmed?: DateFormatId;
  error?: string;
  serverIssues?: ParseIssue[];
  busy?: boolean;
  /** Nur im Arbeitsspeicher, für „Erneut versuchen" beim Lesen — wird nie hochgeladen oder gespeichert. */
  file?: File;
}

export type ImportStatus = Record<string, { businessDate: string; appliedAt: string; rows: number } | null>;
export interface PlanHint { confirmed: boolean; listsChanged: boolean }

/** Betriebstag (YYYY-MM-DD) — Kalendertag in Berlin, wie auf dem Server (`berlinDate`). */
export const todayIso = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

/** Verständliche Meldung statt roher Fehlertexte; Server-Meldungen sind schon bereinigt. */
export const errorText = (e: unknown) => e instanceof NetworkError ? "Keine Verbindung zum Server. Bitte erneut versuchen."
  : e instanceof Error && e.message ? e.message : "Unbekannter Fehler. Bitte erneut versuchen.";

/** Nacheinander statt gleichzeitig: parallele Übernahmen sperrten sich in der Datenbank gegenseitig (Timeout). */
export async function inOrder<T, R>(xs: T[], fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (const x of xs) out.push(await fn(x));
  return out;
}

/**
 * Die Import-Logik aus M1 (Auslesen im Browser, Vorschau, Befunde, Übernehmen) als Hook — genutzt von
 * `/import` und vom Planungstool `/planung`. Schnittstellen zum Server unverändert.
 */
export function useImportSession(onApplied?: (types: ImportType[]) => void | Promise<void>, opts: { minReadMs?: number } = {}) {
  const [items, setItems] = useState<ImportItem[]>([]);
  const [day, setDay] = useState(todayIso());
  const [inventory, setInventory] = useState<number | undefined>();
  const [status, setStatus] = useState<ImportStatus | null>(null);
  const [plan, setPlan] = useState<PlanHint | null>(null);
  const dayRef = useRef(day);
  dayRef.current = day;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const cb = useRef(onApplied);
  cb.current = onApplied;

  const patch = useCallback((id: string, p: Partial<ImportItem>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x))), []);
  /** Stand der Daten des Betriebstags neu laden. Gibt den frischen Stand zurück (null bei Fehler). */
  const loadStatus = useCallback(() => api<{ status: ImportStatus; plan?: PlanHint }>(`/api/import/status?date=${dayRef.current}`)
    .then((d) => { setStatus(d.status); setPlan(d.plan ?? null); return d.status; }).catch(() => null), []);

  useEffect(() => { void loadStatus(); }, [loadStatus, day]);
  useEffect(() => {
    api<{ settings: { roomInventory: number } }>("/api/settings").then((d) => setInventory(d.settings.roomInventory)).catch(() => {});
  }, []);

  const read = useCallback(async (id: string, file: File) => {
    patch(id, { phase: "reading" });
    try {
      const started = Date.now();
      const bytes = new Uint8Array(await file.arrayBuffer());
      const list = await loadList(file.name, bytes);
      // Planungstool: "liest" bleibt kurz sichtbar (ca. 850 ms je Datei), außer bei reduzierter Bewegung.
      const calm = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const wait = (opts.minReadMs ?? 0) - (Date.now() - started);
      if (wait > 0 && !calm) await new Promise((r) => setTimeout(r, wait));
      const hash = await sha256Hex(bytes);
      const type = list.type;
      if (!type) { patch(id, { phase: "read", list, hash, type: null }); return; }
      patch(id, { phase: "read", list, hash, type, result: parseList(type, list, { today: dayRef.current, roomInventory: inventory }) });
    } catch (e) {
      patch(id, { phase: "error", error: errorText(e) });
    }
  }, [patch, inventory, opts.minReadMs]);

  const addFiles = useCallback((files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      const id = `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 7)}`;
      // Eine neue Datei desselben Typs ersetzt die vorherige Vorschau (die alte wird verworfen)
      setItems((xs) => [...xs, { id, name: f.name, phase: "waiting", type: null, file: f }]);
      void read(id, f);
    }
  }, [read]);

  const reparse = useCallback((it: ImportItem, type: ImportType, confirmed?: DateFormatId) => {
    if (!it.list) return;
    patch(it.id, { type, confirmed, serverIssues: undefined, result: parseList(type, it.list, { today: dayRef.current, roomInventory: inventory, confirmedDateFormat: confirmed }) });
  }, [patch, inventory]);

  const discard = useCallback((it: ImportItem) => patch(it.id, { phase: "discarded", list: undefined, result: undefined, file: undefined }), [patch]);

  const cross = (xs: ImportItem[]): ParseIssue[] => {
    const pick = (t: ImportType) => xs.find((x) => x.type === t && x.result && x.phase === "read")?.result as unknown;
    const a = pick("ARRIVALS") as ParseResult<ArrivalRow> | undefined;
    const d = pick("DEPARTURES") as ParseResult<DepartureRow> | undefined;
    return a && d ? crossCheckArrivals(a, d) : [];
  };
  const issuesOf = (it: ImportItem): ParseIssue[] => [...(it.result?.issues ?? []), ...(it.type === "ARRIVALS" ? cross(items) : []), ...(it.serverIssues ?? [])];
  const isCritical = (it: ImportItem) => !it.result || issuesOf(it).some((i) => i.severity === "CRITICAL");

  /** Eine Liste übernehmen. Gibt den Listentyp zurück, wenn übernommen wurde. */
  const applyOne = useCallback(async (it: ImportItem): Promise<ImportType | null> => {
    if (!it.result || !it.type || !it.hash) return null;
    if (it.result.issues.some((i) => i.severity === "CRITICAL")) return null; // kritische Befunde: nichts wird übernommen
    patch(it.id, { busy: true });
    try {
      const r = it.result;
      const own = [...(it.result.issues ?? []), ...(it.type === "ARRIVALS" ? cross(itemsRef.current) : [])];
      const sub = await api<{ batchId: string; critical: boolean; issues: ParseIssue[] }>("/api/import/batches", {
        body: { type: it.type, fileHash: it.hash, reportDate: r.reportDate, periodFrom: r.periodFrom, periodTo: r.periodTo, issues: own, rows: r.rows },
      });
      if (sub.critical) {
        patch(it.id, { busy: false, serverIssues: sub.issues.filter((i) => !own.some((x) => x.code === i.code && x.message === i.message)) });
        await api(`/api/import/batches/${sub.batchId}/reject`, { method: "POST", body: {} });
        return null;
      }
      await api(`/api/import/batches/${sub.batchId}/apply`, { method: "POST", body: {} });
      patch(it.id, { busy: false, phase: "applied", list: undefined, result: undefined, file: undefined, error: undefined });
      return it.type;
    } catch (e) {
      // Ergebnis bleibt erhalten → „Erneut versuchen" übernimmt ohne neues Lesen
      patch(it.id, { busy: false, phase: "error", error: errorText(e) });
      return null;
    }
  }, [patch]);

  const ready = items.filter((x) => x.phase === "read" && x.result && !isCritical(x));

  /** Übernehmen und danach sofort den Stand neu laden (Kachel, Status, Gate) — ohne Verlassen oder Neuladen der Seite. */
  const applyAndRefresh = useCallback(async (xs: ImportItem[]) => {
    const applied = (await inOrder(xs, applyOne)).filter((t): t is ImportType => !!t);
    await loadStatus();
    if (applied.length) await cb.current?.(applied);
    return applied;
  }, [applyOne, loadStatus]);

  /** Alle fehlerfreien Listen übernehmen; meldet danach einmal, welche Typen übernommen wurden. */
  const applyAll = useCallback(() => applyAndRefresh(itemsRef.current.filter((x) => x.phase === "read" && x.result && x.type)), [applyAndRefresh]);

  /** „Erneut versuchen": gelesene Liste erneut übernehmen, sonst die Datei erneut lesen. */
  const retry = useCallback(async (it: ImportItem) => {
    if (it.result && it.type) { patch(it.id, { phase: "read", error: undefined }); await applyAndRefresh([{ ...it, phase: "read" }]); }
    else if (it.file) { patch(it.id, { error: undefined }); await read(it.id, it.file); }
  }, [patch, applyAndRefresh, read]);

  /**
   * Eingelesene Liste des Betriebstags löschen. `keepPlan` bestätigt, dass ein bestätigter Plan bestehen bleibt.
   * Gibt `null` bei Erfolg zurück, sonst die Fehlermeldung (bzw. "planConfirmed").
   */
  const removeList = useCallback(async (type: ImportType, keepPlan = false): Promise<string | null> => {
    try {
      await api(`/api/import/lists/${type}?date=${dayRef.current}${keepPlan ? "&keepPlan=1" : ""}`, { method: "DELETE" });
    } catch (e) {
      return e instanceof ApiError && e.status === 409 ? "planConfirmed" : errorText(e); // 409 = Plan bestätigt, keepPlan fehlt
    }
    setItems((xs) => xs.map((x) => (x.type === type && x.phase !== "discarded" ? { ...x, phase: "discarded", list: undefined, result: undefined, file: undefined } : x)));
    await loadStatus();
    return null;
  }, [loadStatus]);

  return { items, day, setDay, status, plan, loadStatus, addFiles, reparse, discard, applyOne, applyAll, retry, removeList, issuesOf, isCritical, ready };
}
