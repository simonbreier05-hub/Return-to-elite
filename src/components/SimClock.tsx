"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { bannerText, nowMs, setSimState, simState, type SimState } from "@/lib/clock";
import { getSocket, RESYNC_EVENT } from "@/components/useSocket";

/**
 * S0 Simulationsuhr im Browser (Root-Layout, also auf jeder Seite inkl. Gastseite):
 * - holt beim Laden und beim Zurückkehren in die App GET /api/sim/clock,
 * - hört auf Mitarbeiter-Seiten auf das Socket-Ereignis `clock:update`,
 * - setzt den Zustand für `now()` (src/lib/clock.ts), korrigiert um den Uhrenversatz Server↔Gerät,
 * - zeigt oben das Banner „SIMULATION · Mo 07.12. 07:42 · ×3 / pausiert“.
 * Ohne Simulation (Produktion) antwortet der Server { active: false } → kein Banner, echte Zeit.
 */
interface ClockInfo { active: boolean; state: SimState | null; serverEcht: number }

function adopt(info: ClockInfo | null): boolean {
  const prev = simState();
  const next = info?.active && info.state
    ? { ...info.state, echtAnker: info.state.echtAnker - (info.serverEcht - Date.now()) }
    : null;
  setSimState(next);
  return JSON.stringify(prev) !== JSON.stringify(next);
}

/** Gastseiten und Anmeldung haben keine Sitzung → dort kein Live-Kanal, nur Abruf. */
const staffPath = (p: string | null) => !!p && !p.startsWith("/g/") && p !== "/g" && !p.startsWith("/login");

export default function SimClock() {
  const pathname = usePathname();
  const live = staffPath(pathname);
  const [state, setState] = useState<SimState | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    let stop = false;
    const apply = (info: ClockInfo | null) => {
      if (stop) return;
      const changed = adopt(info);
      setState(simState());
      // Uhr gesprungen (gestellt, nächster Tag, Pause …): Ansichten laden neu, damit „heute“ stimmt.
      if (changed) window.dispatchEvent(new Event(RESYNC_EVENT));
    };
    const load = () => fetch("/api/sim/clock", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then(apply).catch(() => {});
    void load();
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    let off = () => {};
    if (live) {
      const s = getSocket();
      s.on("clock:update", apply);
      off = () => s.off("clock:update", apply);
    }
    return () => { stop = true; document.removeEventListener("visibilitychange", onVisible); off(); };
  }, [live]);

  useEffect(() => {
    if (!state) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [state]);

  if (!state) return null;
  return (
    <div
      role="status"
      data-sim-banner
      className="sticky top-0 z-[1000] w-full bg-status-warning-fg px-4 py-1.5 text-center text-sm font-bold tracking-wide text-charcoal shadow-md tabular-nums"
    >
      {bannerText(state, nowMs())}
    </div>
  );
}
