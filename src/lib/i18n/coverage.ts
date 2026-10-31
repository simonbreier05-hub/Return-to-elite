/**
 * Umfang der Prioritäts-Sprachdateien (Prompt K1, Teil 1): Namensräume, die Housekeeper, Hausmann und Techniker sehen
 * (inkl. gemeinsamer Teile wie Kopfzeile, Status, Meldungen, Chat). Für diese Namensräume müssen vi/it/tr/fa/hi
 * vollständig sein — `tests/i18n/completeness.test.ts` meldet jeden fehlenden Schlüssel.
 * Teil 2 (Supervisor-Werkzeuge, Duty Manager, Front Office, Concierge, Planungstool, Import) zeigt bis dahin Englisch.
 */
export const PHASE1_NAMESPACES = [
  "common", "errorBoundary", "nav", "role", "status", "blockReason", "blockReasonShort", "roomType", "defectCategory",
  "workOrderStatus", "roomTaskType", "department", "guestRequestKind", "guestRequestStatus", "dndWindow", "cleanTiming",
  "login", "appShell", "roomFlags", "priority", "attendant", "engineering", "houseman", "offline", "work", "hkHub",
  "dayNumbers", "hubDay", "lists", "chat", "language", "errors", "shared", "notify", "floorPlanRef",
] as const;

export const inPhase1 = (key: string) => (PHASE1_NAMESPACES as readonly string[]).includes(key.split(".")[0]);
