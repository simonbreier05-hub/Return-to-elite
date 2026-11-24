// S0 Simulationsuhr steuern (Preview oder lokal):
//   npm run sim:clock -- status | set 2026-12-07T07:00 | faktor 3 | pause | weiter | naechster-tag 07:00 | echt
// Umgebung: SIM_URL (z. B. https://<preview>.up.railway.app, Standard http://localhost:3000), SIM_CONTROL_TOKEN.
// Das Token wird nie ausgegeben.

const [cmd, arg] = process.argv.slice(2);
const url = (process.env.SIM_URL || "http://localhost:3000").replace(/\/$/, "") + "/api/sim/clock";
const token = process.env.SIM_CONTROL_TOKEN;

const usage = "Befehle: status | set 2026-12-07T07:00 | faktor 3 | pause | weiter | naechster-tag 07:00 | echt";
const bodies = {
  status: () => ({ cmd: "status" }),
  set: () => (arg ? { cmd: "set", at: arg } : null),
  faktor: () => (arg && Number.isFinite(Number(arg)) ? { cmd: "faktor", faktor: Number(arg) } : null),
  pause: () => ({ cmd: "pause" }),
  weiter: () => ({ cmd: "weiter" }),
  "naechster-tag": () => ({ cmd: "naechster-tag", hhmm: arg || "07:00" }),
  echt: () => ({ cmd: "echt" }),
};
const body = bodies[cmd]?.();
if (!body) { console.error(usage); process.exit(1); }
if (!token) { console.error("SIM_CONTROL_TOKEN fehlt in der Umgebung."); process.exit(1); }

const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-sim-token": token }, body: JSON.stringify(body) })
  .catch((e) => { console.error(`Nicht erreichbar: ${url} (${e.message})`); process.exit(1); });
const data = await res.json().catch(() => ({}));
if (!res.ok) { console.error(`Fehler ${res.status}: ${data.error ?? "unbekannt"}${res.status === 403 ? " (Token falsch oder Simulation auf diesem Server nicht freigegeben)" : ""}`); process.exit(1); }

const fmt = (ms) => new Date(ms).toLocaleString("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
if (!data.active) console.log("Simulation aus — echte Zeit.");
else if (!data.state) console.log("Simulation freigegeben, Uhr noch nicht gestellt — echte Zeit.");
else console.log(`Sim-Zeit: ${fmt(data.simNow)} · ${data.state.pausiert ? "pausiert" : `×${data.state.faktor}`}`);
