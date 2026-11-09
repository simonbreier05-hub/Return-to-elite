"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/api";
import type { LevelWarning } from "@/lib/ui/tagesplan";

/**
 * Zusatzangaben für den Tagesplan im Live-Modus (`/floor-plan`), nur aus bestehenden Wegen und nur lesend:
 *  - Typ je Kraft (Vollzeit/Teilzeit/Azubi) aus `GET /api/planung/team` (`kind`; nur Supervisor/Duty Manager),
 *  - Plan-Status und Level-Hinweise aus dem letzten Vorschlag `GET /api/autoplan` (nur Supervisor/Duty Manager),
 *  - offene Traces aus `GET /api/planung/house` (dieselbe Abfrage wie das Haus im Planungstool).
 * Fehlt etwas (z. B. noch kein Tagesplan), bleibt der Wert leer — der Tagesplan zeigt dann „–“ statt einer Schätzung.
 */
export interface TagesplanMeta {
  kinds: Record<string, string>;
  levelWarnings: LevelWarning[];
  hasProposal: boolean;
  confirmed: boolean;
  /** Zimmer, deren Zuteilung vom Vorschlag abweicht (Entwurf). */
  edits: number;
  traces: number | null;
}

export const EMPTY_META: TagesplanMeta = { kinds: {}, levelWarnings: [], hasProposal: false, confirmed: false, edits: 0, traces: null };

interface TeamResponse { members: { hk: { id: string; kind: string }[] } }
interface ProposalResponse { proposal: { status: string; payload: { result: { warnings: LevelWarning[] } } } | null }
interface HouseResponse { floors: { tiles: { openTraces?: number }[] }[] }

export function sumTraces(house: HouseResponse | null): number | null {
  if (!house) return null;
  return house.floors.reduce((a, f) => a + f.tiles.reduce((b, x) => b + (x.openTraces ?? 0), 0), 0);
}

export function useTagesplanMeta(date: string | null, reloadToken = 0): TagesplanMeta {
  const [meta, setMeta] = useState<TagesplanMeta>(EMPTY_META);
  useEffect(() => {
    if (!date) return;
    let alive = true;
    const q = `?date=${encodeURIComponent(date)}`;
    void Promise.all([
      api<TeamResponse>(`/api/planung/team${q}`).catch(() => null),
      api<ProposalResponse>(`/api/autoplan${q}`).catch(() => null),
      api<HouseResponse>(`/api/planung/house${q}`).catch(() => null),
    ]).then(([team, prop, house]) => {
      if (!alive) return;
      const p = prop?.proposal ?? null;
      setMeta({
        kinds: Object.fromEntries((team?.members.hk ?? []).map((h) => [h.id, h.kind])),
        levelWarnings: p?.payload.result.warnings ?? [],
        hasProposal: !!p,
        confirmed: p?.status === "CONFIRMED",
        edits: 0,
        traces: sumTraces(house),
      });
    });
    return () => { alive = false; };
  }, [date, reloadToken]);
  return meta;
}
