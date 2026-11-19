"use client";

import { useRef, useState } from "react";
import { IMPORT_TYPES, type ImportType } from "@/lib/domain";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { listStateOf } from "@/lib/import/readiness";
import DayPlanPanel from "./DayPlanPanel";
import PurgeBanner from "@/components/PurgeBanner";
import { buildPreview } from "@/lib/import/preview";
import type { DateFormatId, ParseResult } from "@/lib/import/types";
import { useImportSession, type ImportItem } from "@/components/planung/useImportSession";

type Item = ImportItem;

const ICON = { CRITICAL: "✖", WARNING: "⚠", INFO: "ℹ" } as const;
const TONE = {
  CRITICAL: "text-status-danger-fg",
  WARNING: "text-status-in-progress",
  INFO: "text-text-secondary",
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

export default function ImportView() {
  const { t } = useLocale();
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const { items, day, setDay, status, today, acceptStale, addFiles, reparse, discard, applyOne, applyAll, issuesOf, isCritical, ready } = useImportSession();
  const anyApplied = items.some((x) => x.phase === "applied");

  const statusLabel = (it: Item) => {
    if (it.phase === "read") return t(it.result && issuesOf(it).some((i) => i.severity !== "INFO") ? "importPage.stWarning" : "importPage.stRead");
    return t(({ waiting: "importPage.stWaiting", reading: "importPage.stReading", error: "importPage.stError", applied: "importPage.stApplied", discarded: "importPage.stDiscarded", read: "importPage.stRead" } as const)[it.phase]);
  };

  return (
    <div className="theme-glass pb-28">
      
      <PurgeBanner refreshKey={JSON.stringify(status ?? {})} />
      <p className="mb-4 max-w-2xl text-sm text-text-secondary">{t("importPage.intro")}</p>

      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}
        className={`mb-4 flex min-h-48 flex-col items-center justify-center gap-3 rounded-(--glass-radius-lg) border-2 border-dashed p-6 text-center ${over ? "border-border-accent bg-accent-subtle-bg" : "border-border-subtle bg-surface-card-raised"}`}
      >
        <div className="text-title-22 text-text-primary">{t("importPage.dropHere")}</div>
        <button type="button" onClick={() => input.current?.click()}
          className="h-12 rounded-(--glass-radius-md) bg-champagne border border-border-accent px-6 text-sm font-medium text-text-on-accent">
          {t("importPage.chooseFiles")}
        </button>
        <input ref={input} type="file" multiple accept=".pdf,.xlsx,.csv,.txt" className="hidden"
          onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
        <div className="text-xs text-text-muted">{t("importPage.formats")}</div>
      </div>

      <label className="mb-4 block max-w-sm rounded-(--glass-radius-md) border border-border-subtle bg-surface-card-raised p-4">
        <div className="text-sm font-medium">{t("importPage.businessDate")}</div>
        <div className="mb-2 text-xs text-text-muted">{t("importPage.businessDateHint")}</div>
        <input type="date" value={day} onChange={(e) => setDay(e.target.value)}
          className="h-12 rounded-(--glass-radius-sm) border border-border-subtle px-3" />
      </label>

      {items.length > 0 && ready.length > 1 && (
        <button type="button" onClick={() => void applyAll()}
          className="mb-3 h-12 rounded-(--glass-radius-md) bg-champagne border border-border-accent px-6 text-sm font-medium text-text-on-accent">
          {t("importPage.applyAll")}
        </button>
      )}

      <div className="space-y-3">
        {items.map((it) => {
          const pv = it.result ? buildPreview(it.result as unknown as ParseResult<unknown>) : null;
          const issues = issuesOf(it);
          const critical = isCritical(it);
          return (
            <section key={it.id} className="rounded-(--glass-radius-lg) border border-border-subtle bg-surface-card-raised p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{it.name}</div>
                  <div className="text-xs text-text-muted">
                    {it.type ? t(`importPage.type${it.type}` as "importPage.typeFORECAST") : "—"} · {statusLabel(it)}
                  </div>
                </div>
                {it.phase === "read" && it.list && !it.type && (
                  <label className="text-sm">
                    {t("importPage.askType")}{" "}
                    <select defaultValue="" onChange={(e) => e.target.value && reparse(it, e.target.value as ImportType)}
                      className="h-12 rounded-(--glass-radius-sm) border border-border-subtle bg-surface-card-raised px-3">
                      <option value="" disabled>{t("importPage.chooseType")}</option>
                      {IMPORT_TYPES.map((ty) => <option key={ty} value={ty}>{t(`importPage.type${ty}` as "importPage.typeFORECAST")}</option>)}
                    </select>
                  </label>
                )}
              </div>

              {it.phase === "error" && <p className="mt-2 text-sm text-status-danger-fg">{it.error}</p>}

              {pv && it.phase === "read" && (
                <div className="mt-3">
                  <div className="text-sm">
                    {t("importPage.rowCount", { count: pv.count })}
                    {pv.periodFrom && ` · ${t("importPage.period", { from: pv.periodFrom, to: pv.periodTo ?? "—" })}`}
                    {pv.pages.total && ` · ${t("importPage.pages", { seen: pv.pages.seen, total: pv.pages.total })}`}
                  </div>

                  {pv.dateFormat.via === "ambiguous" && pv.dateFormat.readings && (
                    <div className="mt-2 rounded-(--glass-radius-md) border border-border-accent bg-accent-subtle-bg p-3 text-sm">
                      <div className="mb-2">{t("importPage.dateUnclear")}</div>
                      <div className="flex flex-wrap gap-2">
                        {(Object.keys(pv.dateFormat.readings) as DateFormatId[]).map((f) => (
                          <button key={f} type="button" onClick={() => reparse(it, it.type!, f)}
                            className="h-12 rounded-(--glass-radius-md) border border-border-subtle bg-surface-card-raised px-4">
                            {t("importPage.dateReading", { format: t(`importPage.format${f}` as "importPage.formatMDY"), min: pv.dateFormat.readings![f].min, max: pv.dateFormat.readings![f].max })}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {pv.sample.length > 0 && (
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-start text-xs">
                        <thead className="text-text-muted">
                          <tr>{previewColumns(it.type).map((c) => <th key={c.head} className="pe-3">{t(c.head)}</th>)}</tr>
                        </thead>
                        <tbody>
                          {pv.sample.map((r, i) => (
                            <tr key={i} className="border-t border-border-subtle">
                              {previewColumns(it.type).map((c) => <td key={c.head} className="py-1 pe-3">{String(r[c.key] ?? "")}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="mt-1 text-xs text-text-muted">{t("importPage.previewNote")}</div>
                    </div>
                  )}

                  {issues.length > 0 && (
                    <ul className="mt-2 space-y-1 text-sm">
                      {issues.map((i, k) => (
                        <li key={k} className={TONE[i.severity]}>{ICON[i.severity]} {i.message}</li>
                      ))}
                    </ul>
                  )}
                  {critical && <p className="mt-2 text-sm font-medium text-status-danger-fg">{t("importPage.blocked")}</p>}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={critical || it.busy} onClick={() => void applyOne(it)}
                      className="h-12 rounded-(--glass-radius-md) bg-champagne border border-border-accent px-6 text-sm font-medium text-text-on-accent disabled:opacity-40">
                      {t("importPage.apply")}
                    </button>
                    <button type="button" onClick={() => discard(it)}
                      className="h-12 rounded-(--glass-radius-md) border border-border-subtle bg-surface-card-raised px-5 text-sm">
                      {t("importPage.discard")}
                    </button>
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>
      {anyApplied && <p className="mt-4 text-sm text-text-secondary">{t("importPage.deleteFiles")}</p>}

      <DayPlanPanel date={status?.DEPARTURES?.businessDate ?? null} refreshKey={JSON.stringify(status ?? {})} />

      <section className="mt-6 rounded-(--glass-radius-lg) border border-border-subtle bg-surface-card-raised p-4">
        <h3 className="text-title-22 text-text-primary">{t("importPage.sampleTitle")}</h3>
        <p className="mb-3 max-w-2xl text-xs text-text-muted">{t("importPage.sampleHint")}</p>
        <div className="flex flex-wrap gap-2">
          {([
            ["arrivals", t("importPage.typeARRIVALS")], ["arrivals_page1", t("importPage.sampleArrivalsPage1")],
            ["departures", t("importPage.typeDEPARTURES")], ["forecast", t("importPage.typeFORECAST")], ["traces", t("importPage.typeTRACES")], ["inhouse", t("importPage.typeINHOUSE")],
          ] as const).map(([file, label]) => (
            <a key={file} href={`/api/import/sample?file=${file}`} download
              className="flex h-12 items-center rounded-(--glass-radius-md) border border-border-subtle bg-surface-card-raised px-4 text-sm">{label} ↓</a>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-(--glass-radius-lg) border border-border-subtle bg-surface-card-raised p-4">
        <h3 className="mb-2 text-title-22 text-text-primary">{t("importPage.dataStatus")}</h3>
        <ul className="space-y-1 text-sm">
          {IMPORT_TYPES.map((ty) => (
            <li key={ty}>
              <span className="inline-block w-36 font-medium">{t(`importPage.type${ty}` as "importPage.typeFORECAST")}</span>
              {status?.[ty] ? t("importPage.asOf", { date: status[ty]!.businessDate, count: status[ty]!.rows }) : <span className="text-text-muted">{t("importPage.notImported")}</span>}
              {listStateOf(status?.[ty] ?? null, today) === "stale" && (
                <>
                  {" · "}<span className="font-medium text-status-danger-fg">{t("planungTool.stale", { date: status![ty]!.businessDate })}</span>
                  <button type="button" onClick={() => void acceptStale(ty)} className="ms-2 h-11 rounded-(--glass-radius-md) border border-border-subtle bg-surface-card-raised px-3 text-xs">{t("planungTool.useAnyway")}</button>
                </>
              )}
              {listStateOf(status?.[ty] ?? null, today) === "accepted" && <span className="text-text-muted"> · {t("planungTool.staleAccepted", { date: status![ty]!.businessDate })}</span>}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-text-muted">{t("importPage.replaces")}</p>
      </section>
    </div>
  );
}
