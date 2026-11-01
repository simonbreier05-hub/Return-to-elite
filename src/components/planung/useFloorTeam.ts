"use client";

import { useCallback, useMemo, useState } from "react";
import { api } from "@/components/api";
import { applySuggestions, floorKpi, floorWarnings, type FloorAssign, type Person, type Suggestion } from "@/lib/planung/floorTeam";
import { PLAN_FLOORS } from "@/lib/planung/team";
import type { FloorTeamState } from "@/lib/planung/floorTeamData";

/**
 * Schritt 3 „Etagenzuweisung" für das ganze Team: laden, Person antippen → Etagen antippen, Vorschläge übernehmen
 * oder verwerfen, speichern. Nichts wird ohne „Weiter" gespeichert. Manuelle Änderungen haben Vorrang vor Vorschlägen.
 */
export function useFloorTeam(date: string | null) {
  const [state, setState] = useState<FloorTeamState | null>(null);
  const [assign, setAssign] = useState<FloorAssign>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!date) return;
    setLoading(true); setError(null);
    try {
      const s = await api<FloorTeamState>(`/api/planung/floors?date=${date}`);
      setState(s); setAssign(s.assign); setTouched(new Set()); setDismissed(new Set()); setActive(null);
    } catch (e) { setError(e instanceof Error ? e.message : "?"); } finally { setLoading(false); }
  }, [date]);

  const persons: Person[] = useMemo(() => (state?.people ?? []).map((p) => ({ id: p.id, role: p.role, roomsLo: p.roomsLo ?? 0, roomsHi: p.roomsHi ?? 0, level: p.level ?? 0 })), [state]);
  const key = (s: Suggestion) => `${s.userId}:${s.floor}`;
  /** Offene Vorschläge: nicht verworfen, Person nicht von Hand geändert, noch nicht übernommen. */
  const open = useMemo(() => (state?.suggestions ?? []).filter((s) => !dismissed.has(key(s)) && !touched.has(s.userId) && !(assign[s.userId] ?? []).includes(s.floor)), [state, dismissed, touched, assign]);

  const toggleFloor = useCallback((userId: string, floor: number) => {
    setAssign((a) => {
      const cur = a[userId] ?? [];
      return { ...a, [userId]: cur.includes(floor) ? cur.filter((f) => f !== floor) : [...cur, floor].sort((x, y) => x - y) };
    });
    setTouched((t) => new Set(t).add(userId));
  }, []);
  const remove = useCallback((userId: string, floor: number) => {
    setAssign((a) => ({ ...a, [userId]: (a[userId] ?? []).filter((f) => f !== floor) }));
    setTouched((t) => new Set(t).add(userId));
  }, []);
  /** Ablegen per Drag-and-Drop (Desktop): Person kommt auf die Etage dazu. */
  const drop = useCallback((userId: string, floor: number) => {
    setAssign((a) => ((a[userId] ?? []).includes(floor) ? a : { ...a, [userId]: [...(a[userId] ?? []), floor].sort((x, y) => x - y) }));
    setTouched((t) => new Set(t).add(userId));
  }, []);
  const tapPerson = useCallback((id: string) => setActive((a) => (a === id ? null : id)), []);
  const tapFloor = useCallback((floor: number) => { if (active) toggleFloor(active, floor); }, [active, toggleFloor]);

  const acceptAll = useCallback(() => setAssign((a) => applySuggestions(a, open, touched)), [open, touched]);
  const acceptOne = useCallback((s: Suggestion) => setAssign((a) => applySuggestions(a, [s], touched, { userId: s.userId, floor: s.floor })), [touched]);
  const dismissOne = useCallback((s: Suggestion) => setDismissed((d) => new Set(d).add(key(s))), []);

  const kpis = useMemo(() => Object.fromEntries((state?.loads ?? []).map((l) => [l.floor, floorKpi(l, persons, assign)])), [state, persons, assign]);
  const warnings = useMemo(() => (state ? floorWarnings(state.loads, persons, assign, state.rules.demandingShare) : []), [state, persons, assign]);
  const openFloors = useMemo(() => PLAN_FLOORS.filter((f) => !persons.some((p) => p.role === "SUP" && (assign[p.id] ?? []).includes(f))), [persons, assign]);
  /** Etage → Supervisor-ID (der erste), für die Haus-Badges und „Plan erstellen". */
  const supByFloor = useMemo(() => {
    const out: Record<number, string | null> = {};
    for (const f of PLAN_FLOORS) out[f] = persons.find((p) => p.role === "SUP" && (assign[p.id] ?? []).includes(f))?.id ?? null;
    return out;
  }, [persons, assign]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!date) return false;
    setSaving(true); setError(null);
    const clean = Object.fromEntries(Object.entries(assign).filter(([id]) => persons.some((p) => p.id === id)));
    try { await api("/api/planung/floors", { method: "PUT", body: { date, assign: clean } }); return true; }
    catch (e) { setError(e instanceof Error ? e.message : "?"); return false; } finally { setSaving(false); }
  }, [date, assign, persons]);

  return { state, assign, active, loading, saving, error, load, tapPerson, tapFloor, toggleFloor, remove, drop, open, acceptAll, acceptOne, dismissOne, kpis, warnings, openFloors, supByFloor, save, setActive };
}
