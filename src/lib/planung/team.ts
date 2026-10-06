/**
 * Reine Logik für „Team" und „Etagen" im Planungstool (D2). Keine DB, kein React.
 * Enthält bewusst keine Beschäftigtendaten-Felder: Ziele kommen als fertige Zahlen herein.
 */

export const PLAN_FLOORS = [1, 2, 3, 4, 5] as const;

export interface Verdict { ok: boolean; need: number; have: number; missing: number }

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Bedarf (Credits laut Tagesplan) gegen die Summe der Tagesziele der Gewählten. „reicht" = Besetzung ≥ Bedarf. */
export function capacityVerdict(need: number, targets: number[]): Verdict {
  const have = targets.reduce((a, b) => a + b, 0);
  return { ok: have >= need, need: r1(need), have: r1(have), missing: r1(Math.max(0, need - have)) };
}

export type TeamMissing = "HK" | "SUP";

/** Weiter in „Team" braucht mindestens einen Housekeeper und einen Supervisor. */
export function teamMissing(counts: { hk: number; sup: number }): TeamMissing[] {
  const out: TeamMissing[] = [];
  if (counts.hk < 1) out.push("HK");
  if (counts.sup < 1) out.push("SUP");
  return out;
}

export interface TeamSelection { hk: string[]; sup: string[]; hm: string[] }
export interface SavedTeam extends TeamSelection { date: string }

/**
 * Vorbelegung: Auswahl von heute (falls schon gespeichert), sonst die vom letzten Planungstag,
 * sonst alle aktiven. Wer heute abwesend gemeldet ist, ist nie vorgewählt (außer bei „heute" gespeichert).
 */
export function pickDefaultTeam(
  date: string,
  saved: SavedTeam | null,
  available: { hk: string[]; sup: string[]; hm: string[]; absentToday: string[] },
): { selected: TeamSelection; source: "today" | "previous" | "default" } {
  const keep = (ids: string[], pool: string[]) => ids.filter((id) => pool.includes(id));
  const away = new Set(available.absentToday);
  if (saved && saved.date === date) {
    return { selected: { hk: keep(saved.hk, available.hk), sup: keep(saved.sup, available.sup), hm: keep(saved.hm, available.hm) }, source: "today" };
  }
  if (saved) {
    return {
      selected: { hk: keep(saved.hk, available.hk).filter((id) => !away.has(id)), sup: keep(saved.sup, available.sup), hm: keep(saved.hm, available.hm) },
      source: "previous",
    };
  }
  return { selected: { hk: available.hk.filter((id) => !away.has(id)), sup: [...available.sup], hm: [...available.hm] }, source: "default" };
}

/** Etagen ohne Supervisor (Weiter in „Etagen" erst, wenn die Liste leer ist). */
export function floorsMissing(assign: Record<number, string | null | undefined>): number[] {
  return PLAN_FLOORS.filter((f) => !assign[f]);
}

/** Antippen auf Mobil: reihum zum nächsten Supervisor. Ohne Zuteilung → der erste. */
export function nextSupervisor(current: string | null | undefined, sups: string[]): string | null {
  if (!sups.length) return null;
  const i = current ? sups.indexOf(current) : -1;
  return sups[(i + 1) % sups.length];
}

/** Etage → Supervisor-ID, umgekehrt: Supervisor-ID → Etagen (aufsteigend). */
export function floorsBySupervisor(assign: Record<number, string | null | undefined>): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const f of PLAN_FLOORS) { const id = assign[f]; if (id) (out[id] ??= []).push(f); }
  return out;
}

export interface PlanCounts { roomLists: number; supervisorLists: number; hausmannLists: number }

/** Karten im Ergebnis: je Housekeeper mit mindestens einem Zimmer eine Liste, je Supervisor mit Etage eine, je gewähltem Hausmann eine. */
export function planCounts(routes: { roomIds: string[] }[], assign: Record<number, string | null | undefined>, hausmaenner: number): PlanCounts {
  return {
    roomLists: routes.filter((r) => r.roomIds.length > 0).length,
    supervisorLists: Object.keys(floorsBySupervisor(assign)).length,
    hausmannLists: hausmaenner,
  };
}

export type PlanPhase = "merge" | "propose" | "rooms" | "supervisors" | "houseman";
export const PLAN_PHASES: PlanPhase[] = ["merge", "propose", "rooms", "supervisors", "houseman"];
export type PhaseState = "waiting" | "running" | "done" | "error";

/** Zustand je Phase aus dem echten Fortschritt: `completed` = Anzahl fertiger Phasen, `failedAt` = Phase mit Fehler. */
export function phaseStates(completed: number, running: boolean, failedAt: PlanPhase | null): Record<PlanPhase, PhaseState> {
  const out = {} as Record<PlanPhase, PhaseState>;
  PLAN_PHASES.forEach((p, i) => {
    out[p] = failedAt === p ? "error" : i < completed ? "done" : i === completed && running && !failedAt ? "running" : "waiting";
  });
  return out;
}
