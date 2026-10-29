import { IMPORT_TYPES, type ImportType } from "@/lib/domain";
import { freshState, type FreshState } from "./businessDay";

/** Alle Opera-Listen, die vor dem Planen übernommen sein müssen (client-sicher, keine DB). */
export const REQUIRED_LISTS: readonly ImportType[] = IMPORT_TYPES;

/** Listen, die noch nicht übernommen sind (leer = Planung darf starten). */
export function missingLists(applied: Partial<Record<ImportType, unknown>>): ImportType[] {
  return REQUIRED_LISTS.filter((t) => !applied[t]);
}

export const listsComplete = (applied: Partial<Record<ImportType, unknown>>) => missingLists(applied).length === 0;

export interface ListStatusEntry { businessDate: string; staleAccepted?: boolean }
export type ListStatus = Partial<Record<ImportType, ListStatusEntry | null>>;

/** Je Liste: fehlt / veraltet (nicht bestätigt) / ok. Veraltete Listen zählen nur mit Bestätigung (`staleAccepted`). */
export function listBlockers(status: ListStatus, today: string): { missing: ImportType[]; stale: { type: ImportType; businessDate: string }[] } {
  const missing: ImportType[] = [];
  const stale: { type: ImportType; businessDate: string }[] = [];
  for (const t of REQUIRED_LISTS) {
    const e = status[t];
    if (!e) { missing.push(t); continue; }
    if (freshState(e.businessDate, today, !!e.staleAccepted) === "stale") stale.push({ type: t, businessDate: e.businessDate });
  }
  return { missing, stale };
}

export const listStateOf = (e: ListStatusEntry | null | undefined, today: string): FreshState | "missing" =>
  e ? freshState(e.businessDate, today, !!e.staleAccepted) : "missing";

/** Planung darf starten: alle fünf übernommen und keine unbestätigt veraltet. */
export const planningAllowed = (status: ListStatus, today: string) => {
  const b = listBlockers(status, today);
  return !b.missing.length && !b.stale.length;
};
