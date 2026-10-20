import { IMPORT_TYPES, type ImportType } from "@/lib/domain";

/** Alle Opera-Listen, die vor dem Planen übernommen sein müssen (client-sicher, keine DB). */
export const REQUIRED_LISTS: readonly ImportType[] = IMPORT_TYPES;

/** Listen, die noch nicht übernommen sind (leer = Planung darf starten). */
export function missingLists(applied: Partial<Record<ImportType, unknown>>): ImportType[] {
  return REQUIRED_LISTS.filter((t) => !applied[t]);
}

export const listsComplete = (applied: Partial<Record<ImportType, unknown>>) => missingLists(applied).length === 0;
