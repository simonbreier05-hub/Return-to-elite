import type { Kind } from "./dayRows";
import { isToClean, type DayKind } from "@/lib/dayplan/dayNumbers";

/**
 * Reine Service-Bausteine ohne Datenbank — dürfen in Client-Komponenten (z. B. ServiceOverview.tsx) importiert werden.
 * Nie `@/lib/db` hier importieren: sonst landet Prisma im Browser-Bündel (S0: db.ts liest Prisma.dmmf beim Laden → /planung stürzt ab).
 */
export type ServiceKey = "TURN" | "DEPARTURE" | "STAYOVER_LINEN" | "STAYOVER" | "ARRIVAL";
export const SERVICE_ORDER: ServiceKey[] = ["TURN", "DEPARTURE", "STAYOVER_LINEN", "STAYOVER", "ARRIVAL"];

export function serviceOf(kind: Kind, laundry: boolean): ServiceKey {
  if (kind === "SAME_DAY_TURN") return "TURN";
  if (kind === "DEPARTURE" || kind === "CARRYOVER" || kind === "EXTRA") return "DEPARTURE"; // F1: Rest vom Vortag/Zusatz wie Abreise
  if (kind === "ARRIVAL") return "ARRIVAL";
  return laundry ? "STAYOVER_LINEN" : "STAYOVER";
}
const DAY_KIND: Record<ServiceKey, DayKind> = { TURN: "TURN", DEPARTURE: "DEPARTURE", STAYOVER_LINEN: "STAYOVER", STAYOVER: "STAYOVER", ARRIVAL: "ARRIVAL" };
/**
 * Wird das Zimmer heute gereinigt? Dieselbe Regel wie die Tageszahlen (`isToClean`): Abreise, Turn und Bleiber immer,
 * eine Anreise nur in ein noch nicht gereinigtes Zimmer. Ohne Status (nur Art bekannt) gilt die Anreise als bereit.
 */
export const needsCleaning = (s: ServiceKey, status = "INSPECTED") => isToClean(DAY_KIND[s], status);
