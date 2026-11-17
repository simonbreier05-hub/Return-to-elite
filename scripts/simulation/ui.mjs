// Simulation — Bedienung eines Geräts:  node scripts/simulation/ui.mjs <person> <befehl> [argumente]
// Personen: dm, sup1, sup2, fo, concierge, technik, hausmann, maria, aylin, petra, lucia, elena, fatima, grace, joanna, sena, gast-<Zimmer>
// Befehle: open <pfad> | open-guest | look [--mehr] [--suche <Wort>] [--groessen] | tap <nr|text> | fill <nr> <text> | choose <nr> <eintrag>
//          key <Taste> | scroll [px] | back | reload | upload <dateien> | drop [--auf <nr>] <dateien> | api <METHODE> <pfad> [json] [--speichern <datei>]
//          inbox | net [n] | shot <name> | offline an|aus
import { UI_PORT } from "./lib/common.mjs";

// Git Bash unter Windows macht aus „/planung“ ungefragt „C:/Program Files/Git/planung“ — hier wieder zurückdrehen.
const unmangle = (a) => { const m = /^[A-Za-z]:[\\/]Program Files[\\/]Git(?:[\\/](.*))?$/.exec(a); return m ? "/" + (m[1] ?? "").split("\\").join("/") : a; };
const [who, cmd, ...args] = process.argv.slice(2).map(unmangle);
if (!who || !cmd) { console.log("Aufruf: node scripts/simulation/ui.mjs <person> <befehl> [argumente]"); process.exit(1); }
const li = args.indexOf("--sprache");
const lang = li >= 0 ? args.splice(li, 2)[1] : undefined;
try {
  const res = await fetch(`http://127.0.0.1:${UI_PORT}/cmd`, { method: "POST", body: JSON.stringify({ who, cmd, args, lang }) });
  console.log(await res.text());
} catch (e) { console.log(`✖ UI-Dienst nicht erreichbar (${e.message}). Dem Simulationsleiter melden.`); process.exit(1); }
