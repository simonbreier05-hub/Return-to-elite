/**
 * Umfang Teil 1 der Prioritäts-Sprachdateien (Prompt K1): Namensräume, die Housekeeper, Hausmann und Techniker sehen
 * (inkl. gemeinsamer Teile wie Kopfzeile, Status, Meldungen, Chat). Seit Teil 2 sind vi/it/tr/fa/hi für **alle**
 * Schlüssel vollständig; `tests/i18n/completeness.test.ts` verlangt jeden Schlüssel. Die Einteilung bleibt nur noch für
 * die Gegenlese-Reihenfolge (zuerst Teil 1 prüfen lassen) und `npm run i18n:missing`.
 */
export const PHASE1_NAMESPACES = [
  "common", "errorBoundary", "nav", "role", "status", "blockReason", "blockReasonShort", "roomType", "defectCategory",
  "workOrderStatus", "roomTaskType", "department", "guestRequestKind", "guestRequestStatus", "dndWindow", "cleanTiming",
  "login", "appShell", "roomFlags", "priority", "attendant", "engineering", "houseman", "offline", "work", "hkHub",
  "dayNumbers", "hubDay", "lists", "chat", "language", "errors", "shared", "notify", "notifyType", "floorPlanRef",
] as const;

/** Einzelne Schlüssel aus Supervisor-Namensräumen, die auch Housekeeper sehen („Mehr“-Menü, Zimmer-Detail aus der Suche). */
export const PHASE1_EXTRA_KEYS = [
  "supervisor.more", "supervisor.assignedAttendant", "supervisor.defectsTitle", "supervisor.expectedArrivals", "supervisor.floorN",
  "supervisor.guestDndBanner", "supervisor.guestRequestsTitle", "supervisor.neededNowFlag", "supervisor.notesTitle",
  "supervisor.oooUntil", "supervisor.reportedByGuest", "supervisor.unassignedOption",
] as const;

export const inPhase1 = (key: string) =>
  (PHASE1_NAMESPACES as readonly string[]).includes(key.split(".")[0]) || (PHASE1_EXTRA_KEYS as readonly string[]).includes(key);
