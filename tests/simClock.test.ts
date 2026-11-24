import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  applyCommand, bannerText, now, nowMs, parseBerlinLocal, setSimState, simMsAt, simulationAllowed, type SimState,
} from "@/lib/clock";
import { berlinToday } from "@/lib/import/businessDay";
import { berlinDate, berlinHHMM } from "@/lib/dayplan/time";
import { fillNowDefaults } from "@/lib/db";

/** S0 Simulationsuhr — Prompt-Abschluss: Betriebstag, Faktor 3, Pause, nächster Tag, Produktions-Sperre, 403 ohne Token. */

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 24, 12, 0); // echter Bezugspunkt
const enableSim = () => { vi.stubEnv("SIMULATION_MODE", "true"); vi.stubEnv("SIM_ALLOWED", "preview"); vi.stubEnv("RAILWAY_SERVICE_NAME", ""); vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", ""); };

beforeEach(() => setSimState(null));
afterEach(() => { setSimState(null); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("Betriebstag bei Sim-Zeit", () => {
  it("Mo 07.12. 07:00 Berlin → Betriebstag 2026-12-07, alle Tag-Helfer folgen now()", () => {
    enableSim();
    const s = applyCommand(null, { cmd: "set", at: parseBerlinLocal("2026-12-07T07:00") }, Date.now());
    setSimState(s);
    expect(berlinToday()).toBe("2026-12-07");
    expect(berlinDate(now())).toBe("2026-12-07");
    expect(berlinHHMM(now())).toBe("07:00");
  });

  it("kurz vor Mitternacht Berlin (UTC noch Vortag) zählt der Berliner Tag", () => {
    enableSim();
    setSimState(applyCommand(null, { cmd: "set", at: parseBerlinLocal("2026-12-08T00:30") }, Date.now()));
    expect(berlinToday()).toBe("2026-12-08");
    expect(now().toISOString().slice(0, 10)).toBe("2026-12-07");
  });
});

describe("Zeitraffer, Pause, nächster Tag", () => {
  const start = parseBerlinLocal("2026-12-07T07:00");

  it("Faktor 3: 10 echte Minuten = 30 Sim-Minuten, ohne Sprung beim Umstellen", () => {
    const s1 = applyCommand(null, { cmd: "set", at: start }, T0);
    const s2 = applyCommand(s1, { cmd: "faktor", faktor: 3 }, T0 + 5 * MIN); // 5 Min. bei ×1
    expect(simMsAt(s2, T0 + 5 * MIN)).toBe(start + 5 * MIN);
    expect(simMsAt(s2, T0 + 15 * MIN)).toBe(start + 35 * MIN);
    expect(bannerText(s2, simMsAt(s2, T0 + 15 * MIN))).toBe("SIMULATION · Mo 07.12. 07:35 · ×3");
  });

  it("Faktor 3 wirkt auf now()", () => {
    enableSim();
    vi.useFakeTimers({ now: T0 });
    setSimState(applyCommand(applyCommand(null, { cmd: "set", at: start }, T0), { cmd: "faktor", faktor: 3 }, T0));
    vi.setSystemTime(T0 + 10 * MIN);
    expect(nowMs()).toBe(start + 30 * MIN);
  });

  it("Pause hält die Zeit an, weiter läuft ab dort", () => {
    const s1 = applyCommand(null, { cmd: "set", at: start }, T0);
    const p = applyCommand(s1, { cmd: "pause" }, T0 + 10 * MIN);
    expect(simMsAt(p, T0 + 60 * MIN)).toBe(start + 10 * MIN);
    expect(bannerText(p, simMsAt(p, T0 + 60 * MIN))).toBe("SIMULATION · Mo 07.12. 07:10 · pausiert");
    const w = applyCommand(p, { cmd: "weiter" }, T0 + 60 * MIN);
    expect(simMsAt(w, T0 + 70 * MIN)).toBe(start + 20 * MIN);
  });

  it("nächster Tag 07:00 — auch spät abends und über die Zeitumstellung", () => {
    const late = applyCommand(null, { cmd: "set", at: parseBerlinLocal("2026-12-07T23:30") }, T0);
    const n = applyCommand(late, { cmd: "naechster-tag", hhmm: "07:00" }, T0);
    expect(n.simAnker).toBe(parseBerlinLocal("2026-12-08T07:00"));
    const dst = applyCommand(null, { cmd: "set", at: parseBerlinLocal("2027-03-27T18:00") }, T0);
    expect(applyCommand(dst, { cmd: "naechster-tag", hhmm: "07:00" }, T0).simAnker).toBe(parseBerlinLocal("2027-03-28T07:00"));
    expect(new Date(parseBerlinLocal("2027-03-28T07:00")).toISOString()).toBe("2027-03-28T05:00:00.000Z"); // Sommerzeit
  });

  it("naechster-tag behält Pause und Faktor", () => {
    const p = applyCommand(applyCommand(null, { cmd: "faktor", faktor: 3 }, T0), { cmd: "pause" }, T0);
    const n = applyCommand(p, { cmd: "naechster-tag", hhmm: "07:00" }, T0);
    expect(n.pausiert).toBe(true);
    expect(n.faktor).toBe(3);
  });
});

describe("Produktions-Sperre", () => {
  it("nur mit SIMULATION_MODE=true UND SIM_ALLOWED=preview, nie im Produktionsdienst", () => {
    expect(simulationAllowed({})).toBe(false);
    expect(simulationAllowed({ SIMULATION_MODE: "true" })).toBe(false);
    expect(simulationAllowed({ SIM_ALLOWED: "preview" })).toBe(false);
    expect(simulationAllowed({ SIMULATION_MODE: "1", SIM_ALLOWED: "preview" })).toBe(false);
    expect(simulationAllowed({ SIMULATION_MODE: "true", SIM_ALLOWED: "preview" })).toBe(true);
    expect(simulationAllowed({ SIMULATION_MODE: "true", SIM_ALLOWED: "preview", RAILWAY_SERVICE_NAME: "StayClean" })).toBe(false);
    expect(simulationAllowed({ SIMULATION_MODE: "true", SIM_ALLOWED: "preview", RAILWAY_SERVICE_NAME: "StayClean-preview" })).toBe(true);
    expect(simulationAllowed({ SIMULATION_MODE: "true", SIM_ALLOWED: "preview", RAILWAY_ENVIRONMENT_NAME: "production", RAILWAY_SERVICE_NAME: "stayclean-web" })).toBe(false);
  });

  it("ohne Freigabe liefert now() echte Zeit, auch wenn ein Zustand gesetzt wäre", () => {
    vi.stubEnv("SIMULATION_MODE", "true"); // SIM_ALLOWED fehlt
    vi.stubEnv("SIM_ALLOWED", "");
    vi.useFakeTimers({ now: T0 });
    setSimState({ simAnker: parseBerlinLocal("2030-01-01T07:00"), echtAnker: T0, faktor: 3, pausiert: true });
    expect(nowMs()).toBe(T0);
    expect(berlinToday()).toBe("2026-11-24");
  });
});

describe("POST /api/sim/clock", () => {
  const post = async (headers: Record<string, string>, body: unknown = { cmd: "status" }) => {
    const { POST } = await import("@/app/api/sim/clock/route");
    return POST(new NextRequest("http://x/api/sim/clock", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));
  };
  const TOKEN = "test-token-0123456789abcdef";

  it("403 ohne Token", async () => {
    enableSim(); vi.stubEnv("SIM_CONTROL_TOKEN", TOKEN);
    expect((await post({})).status).toBe(403);
  });
  it("403 mit falschem Token", async () => {
    enableSim(); vi.stubEnv("SIM_CONTROL_TOKEN", TOKEN);
    expect((await post({ "x-sim-token": "test-token-0123456789abcdeX" })).status).toBe(403);
  });
  it("403 in Produktion, selbst mit richtigem Token", async () => {
    vi.stubEnv("SIMULATION_MODE", "true"); vi.stubEnv("SIM_ALLOWED", "preview"); vi.stubEnv("RAILWAY_SERVICE_NAME", "StayClean");
    vi.stubEnv("SIM_CONTROL_TOKEN", TOKEN);
    expect((await post({ "x-sim-token": TOKEN })).status).toBe(403);
  });
  it("403 wenn kein Token konfiguriert ist", async () => {
    enableSim(); vi.stubEnv("SIM_CONTROL_TOKEN", "");
    expect((await post({ "x-sim-token": "" })).status).toBe(403);
  });
});

describe("Zeitstempel neuer Zeilen im Sim-Modus", () => {
  it("füllt fehlende @default(now())-Felder, lässt gesetzte stehen", () => {
    const at = new Date(parseBerlinLocal("2026-12-07T07:00"));
    const given = new Date(0);
    expect(fillNowDefaults("GuestRequest", { roomId: "r" }, at)).toMatchObject({ createdAt: at });
    expect(fillNowDefaults("GuestRequest", { roomId: "r", createdAt: given }, at)).toMatchObject({ createdAt: given });
    expect(fillNowDefaults("Room", [{ id: "a" }], at)).toEqual([expect.objectContaining({ statusSince: at })]);
  });
});

// Typ-Prüfung, dass SimState die vier Felder des Prompts hat.
const _s: SimState = { simAnker: 0, echtAnker: 0, faktor: 1, pausiert: false };
void _s;
