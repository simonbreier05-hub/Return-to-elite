"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/components/api";
import { IMPORT_TYPES, type ImportType } from "@/lib/domain";
import { useLocale } from "@/lib/i18n/LocaleContext";
import DayPlanPanel from "./DayPlanPanel";
import PurgeBanner from "@/components/PurgeBanner";
import { crossCheckArrivals } from "@/lib/import/parsers";
import { buildPreview, sha256Hex } from "@/lib/import/preview";
import { loadList, parseList, type AnyResult, type LoadedList } from "@/lib/import/readFile";
import type { ArrivalRow, DateFormatId, DepartureRow, ParseIssue, ParseResult } from "@/lib/import/types";

type Phase = "waiting" | "reading" | "read" | "error" | "applied" | "discarded";

interface Item {
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
}

interface Status { [k: string]: { businessDate: string; appliedAt: string; rows: number } | null }

const ICON = { CRITICAL: "✖", WARNING: "⚠", INFO: "ℹ" } as const;
const TONE = {
  CRITICAL: "text-status-out-of-order",
  WARNING: "text-status-in-progress",
  INFO: "text-graphite/70",
} as const;

type ColHead = "importPage.colRoom" | "importPage.colGuest" | "importPage.colArr" | "importPage.colDep" | "importPage.colDate"
  | "importPage.colOccupied" | "importPage.colOccPct" | "importPage.colArrivals" | "importPage.colCode" | "importPage.colText";

/** Vorschau-Spalten je Listentyp (Namen kommen schon maskiert aus buildPreview). */
function previewColumns(type: ImportType | null): { head: ColHead; key: string }[] {
  if (type === "FORECAST") return [
    { head: "importPage.colDate", key: "date" }, { head: "importPage.colOccupied", key: "occupiedRooms" },
    { head: "importPage.colOccPct", key: "occupancyPct" }, { head: "importPage.colArrivals", key: "arrivals" },
  ];
  if (type === "TRACES") return [
    { head: "importPage.colRoom", key: "room" }, { head: "importPage.colGuest", key: "guest" },
    { head: "importPage.colCode", key: "code" }, { head: "importPage.colText", key: "text" },
  ];
  return [
    { head: "importPage.colRoom", key: "room" }, { head: "importPage.colGuest", key: "guest" },
    { head: "importPage.colArr", key: "arrDate" }, { head: "importPage.colDep", key: "depDate" },
  ];
}

const todayIso = () => new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD, Ortszeit

export default function ImportView() {
  const { t } = useLocale();
  const [items, setItems] = useState<Item[]>([]);
  const [day, setDay] = useState(todayIso());
  const [inventory, setInventory] = useState<number | undefined>();
  const [status, setStatus] = useState<Status | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const dayRef = useRef(day);
  dayRef.current = day;

  const patch = useCallback((id: string, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x))), []);
  const loadStatus = useCallback(() => api<{ status: Status }>("/api/import/status").then((d) => setStatus(d.status)).catch(() => {}), []);

  useEffect(() => {
    loadStatus();
    api<{ settings: { roomInventory: number } }>("/api/settings").then((d) => setInventory(d.settings.roomInventory)).catch(() => {});
  }, [loadStatus]);

  const read = useCallback(async (id: string, file: File) => {
    patch(id, { phase: "reading" });
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const list = await loadList(file.name, bytes);
      const hash = await sha256Hex(bytes);
      const type = list.type;
      if (!type) { patch(id, { phase: "read", list, hash, type: null }); return; }
      patch(id, { phase: "read", list, hash, type, result: parseList(type, list, { today: dayRef.current, roomInventory: inventory }) });
    } catch (e) {
      patch(id, { phase: "error", error: e instanceof Error ? e.message : "?" });
    }
  }, [patch, inventory]);

  const addFiles = (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      const id = `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 7)}`;
      setItems((xs) => [...xs, { id, name: f.name, phase: "waiting", type: null }]);
      void read(id, f);
    }
  };

  const reparse = (it: Item, type: ImportType, confirmed?: DateFormatId) => {
    if (!it.list) return;
    patch(it.id, { type, confirmed, serverIssues: undefined, result: parseList(type, it.list, { today: day, roomInventory: inventory, confirmedDateFormat: confirmed }) });
  };

  const byType = (type: ImportType) => items.find((x) => x.type === type && x.result && x.phase === "read");
  const cross = (): ParseIssue[] => {
    const a = byType("ARRIVALS")?.result as unknown as ParseResult<ArrivalRow> | undefined;
    const d = byType("DEPARTURES")?.result as unknown as ParseResult<DepartureRow> | undefined;
    return a && d ? crossCheckArrivals(a, d) : [];
  };
  const issuesOf = (it: Item): ParseIssue[] => [...(it.result?.issues ?? []), ...(it.type === "ARRIVALS" ? cross() : []), ...(it.serverIssues ?? [])];
  const isCritical = (it: Item) => !it.result || issuesOf(it).some((i) => i.severity === "CRITICAL");

  const applyOne = async (it: Item) => {
    if (!it.result || !it.type || !it.hash || isCritical(it)) return;
    patch(it.id, { busy: true });
    try {
      const r = it.result;
      const issues = issuesOf(it).filter((i) => !(it.serverIssues ?? []).includes(i));
      const sub = await api<{ batchId: string; critical: boolean; issues: ParseIssue[] }>("/api/import/batches", {
        body: { type: it.type, fileHash: it.hash, reportDate: r.reportDate, periodFrom: r.periodFrom, periodTo: r.periodTo, issues, rows: r.rows },
      });
      if (sub.critical) {
        patch(it.id, { busy: false, serverIssues: sub.issues.filter((i) => !issues.some((x) => x.code === i.code && x.message === i.message)) });
        await api(`/api/import/batches/${sub.batchId}/reject`, { method: "POST", body: {} });
        return;
      }
      await api(`/api/import/batches/${sub.batchId}/apply`, { method: "POST", body: {} });
      patch(it.id, { busy: false, phase: "applied", list: undefined, result: undefined });
      loadStatus();
    } catch (e) {
      patch(it.id, { busy: false, phase: "error", error: e instanceof Error ? e.message : "?" });
    }
  };

  const ready = items.filter((x) => x.phase === "read" && x.result && !isCritical(x));
  const anyApplied = items.some((x) => x.phase === "applied");

  const statusLabel = (it: Item) => {
    if (it.phase === "read") return t(it.result && issuesOf(it).some((i) => i.severity !== "INFO") ? "importPage.stWarning" : "importPage.stRead");
    return t(({ waiting: "importPage.stWaiting", reading: "importPage.stReading", error: "importPage.stError", applied: "importPage.stApplied", discarded: "importPage.stDiscarded", read: "importPage.stRead" } as const)[it.phase]);
  };

  return (
    <div className="animate-rise pb-28">
      <h2 className="font-serif text-4xl leading-none">{t("importPage.title")}</h2>
      <div className="rule-gold my-2 w-40" />
      <PurgeBanner refreshKey={JSON.stringify(status ?? {})} />
      <p className="mb-4 max-w-2xl text-sm text-graphite/70">{t("importPage.intro")}</p>

      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}
        className={`mb-4 flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-6 text-center ${over ? "border-gold bg-parchment" : "border-charcoal/20 bg-linen"}`}
      >
        <div className="font-serif text-2xl">{t("importPage.dropHere")}</div>
        <button type="button" onClick={() => input.current?.click()}
          className="h-12 rounded-xl bg-navy px-6 text-sm font-medium text-white hover:bg-navy-line">
          {t("importPage.chooseFiles")}
        </button>
        <input ref={input} type="file" multiple accept=".pdf,.xlsx,.csv,.txt" className="hidden"
          onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
        <div className="text-xs text-graphite/60">{t("importPage.formats")}</div>
      </div>

      <label className="mb-4 block max-w-sm rounded-xl border border-charcoal/15 bg-white p-4">
        <div className="text-sm font-medium">{t("importPage.businessDate")}</div>
        <div className="mb-2 text-xs text-graphite/60">{t("importPage.businessDateHint")}</div>
        <input type="date" value={day} onChange={(e) => setDay(e.target.value)}
          className="h-12 rounded-lg border border-charcoal/20 px-3 outline-none focus:border-gold" />
      </label>

      {items.length > 0 && ready.length > 1 && (
        <button type="button" onClick={() => ready.forEach((x) => void applyOne(x))}
          className="mb-3 h-12 rounded-xl bg-navy px-6 text-sm font-medium text-white hover:bg-navy-line">
          {t("importPage.applyAll")}
        </button>
      )}

      <div className="space-y-3">
        {items.map((it) => {
          const pv = it.result ? buildPreview(it.result as unknown as ParseResult<unknown>) : null;
          const issues = issuesOf(it);
          const critical = isCritical(it);
          return (
            <section key={it.id} className="rounded-2xl border border-charcoal/10 bg-linen p-4 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{it.name}</div>
                  <div className="text-xs text-graphite/60">
                    {it.type ? t(`importPage.type${it.type}` as "importPage.typeFORECAST") : "—"} · {statusLabel(it)}
                  </div>
                </div>
                {it.phase === "read" && it.list && !it.type && (
                  <label className="text-sm">
                    {t("importPage.askType")}{" "}
                    <select defaultValue="" onChange={(e) => e.target.value && reparse(it, e.target.value as ImportType)}
                      className="h-12 rounded-lg border border-charcoal/20 bg-white px-3">
                      <option value="" disabled>{t("importPage.chooseType")}</option>
                      {IMPORT_TYPES.map((ty) => <option key={ty} value={ty}>{t(`importPage.type${ty}` as "importPage.typeFORECAST")}</option>)}
                    </select>
                  </label>
                )}
              </div>

              {it.phase === "error" && <p className="mt-2 text-sm text-status-out-of-order">{it.error}</p>}

              {pv && it.phase === "read" && (
                <div className="mt-3">
                  <div className="text-sm">
                    {t("importPage.rowCount", { count: pv.count })}
                    {pv.periodFrom && ` · ${t("importPage.period", { from: pv.periodFrom, to: pv.periodTo ?? "—" })}`}
                    {pv.pages.total && ` · ${t("importPage.pages", { seen: pv.pages.seen, total: pv.pages.total })}`}
                  </div>

                  {pv.dateFormat.via === "ambiguous" && pv.dateFormat.readings && (
                    <div className="mt-2 rounded-xl border border-gold-line bg-parchment p-3 text-sm">
                      <div className="mb-2">{t("importPage.dateUnclear")}</div>
                      <div className="flex flex-wrap gap-2">
                        {(Object.keys(pv.dateFormat.readings) as DateFormatId[]).map((f) => (
                          <button key={f} type="button" onClick={() => reparse(it, it.type!, f)}
                            className="h-12 rounded-xl border border-charcoal/20 bg-white px-4 hover:border-gold-line">
                            {t("importPage.dateReading", { format: t(`importPage.format${f}` as "importPage.formatMDY"), min: pv.dateFormat.readings![f].min, max: pv.dateFormat.readings![f].max })}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {pv.sample.length > 0 && (
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="text-graphite/60">
                          <tr>{previewColumns(it.type).map((c) => <th key={c.head} className="pr-3">{t(c.head)}</th>)}</tr>
                        </thead>
                        <tbody>
                          {pv.sample.map((r, i) => (
                            <tr key={i} className="border-t border-charcoal/5">
                              {previewColumns(it.type).map((c) => <td key={c.head} className="py-1 pr-3">{String(r[c.key] ?? "")}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="mt-1 text-xs text-graphite/50">{t("importPage.previewNote")}</div>
                    </div>
                  )}

                  {issues.length > 0 && (
                    <ul className="mt-2 space-y-1 text-sm">
                      {issues.map((i, k) => (
                        <li key={k} className={TONE[i.severity]}>{ICON[i.severity]} {i.message}</li>
                      ))}
                    </ul>
                  )}
                  {critical && <p className="mt-2 text-sm font-medium text-status-out-of-order">{t("importPage.blocked")}</p>}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={critical || it.busy} onClick={() => void applyOne(it)}
                      className="h-12 rounded-xl bg-navy px-6 text-sm font-medium text-white hover:bg-navy-line disabled:opacity-40">
                      {t("importPage.apply")}
                    </button>
                    <button type="button" onClick={() => patch(it.id, { phase: "discarded", list: undefined, result: undefined })}
                      className="h-12 rounded-xl border border-charcoal/15 bg-white px-5 text-sm hover:border-gold-line">
                      {t("importPage.discard")}
                    </button>
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>
      {anyApplied && <p className="mt-4 text-sm text-graphite/70">{t("importPage.deleteFiles")}</p>}

      <DayPlanPanel date={status?.DEPARTURES?.businessDate ?? null} refreshKey={JSON.stringify(status ?? {})} />

      <section className="mt-6 rounded-2xl border border-charcoal/10 bg-linen p-4 shadow-card">
        <h3 className="mb-1 font-serif text-2xl">{t("importPage.sampleTitle")}</h3>
        <p className="mb-3 max-w-2xl text-xs text-graphite/60">{t("importPage.sampleHint")}</p>
        <div className="flex flex-wrap gap-2">
          {([
            ["arrivals", t("importPage.typeARRIVALS")], ["arrivals_page1", t("importPage.sampleArrivalsPage1")],
            ["departures", t("importPage.typeDEPARTURES")], ["forecast", t("importPage.typeFORECAST")], ["traces", t("importPage.typeTRACES")],
          ] as const).map(([file, label]) => (
            <a key={file} href={`/api/import/sample?file=${file}`} download
              className="flex h-12 items-center rounded-xl border border-charcoal/15 bg-white px-4 text-sm hover:border-gold-line">{label} ↓</a>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-charcoal/10 bg-linen p-4 shadow-card">
        <h3 className="mb-2 font-serif text-2xl">{t("importPage.dataStatus")}</h3>
        <ul className="space-y-1 text-sm">
          {IMPORT_TYPES.map((ty) => (
            <li key={ty}>
              <span className="inline-block w-28 font-medium">{t(`importPage.type${ty}` as "importPage.typeFORECAST")}</span>
              {status?.[ty] ? t("importPage.asOf", { date: status[ty]!.businessDate, count: status[ty]!.rows }) : <span className="text-graphite/60">{t("importPage.notImported")}</span>}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-graphite/60">{t("importPage.replaces")}</p>
      </section>
    </div>
  );
}
