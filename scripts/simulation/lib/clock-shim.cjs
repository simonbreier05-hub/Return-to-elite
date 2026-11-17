// Test-Uhr für den Serverprozess (Vorlade-Skript: node -r …). Verschiebt nur Date um den Wert aus SIM_CLOCK_FILE;
// Timer laufen normal weiter. Kein App-Code wird geändert.
const fs = require("fs");
const file = process.env.SIM_CLOCK_FILE;
if (file) {
  const R = Date;
  let off = 0, last = 0;
  const cur = () => {
    const n = R.now();
    if (n - last > 200) { last = n; try { off = JSON.parse(fs.readFileSync(file, "utf8")).offsetMs || 0; } catch { /* Datei wird gerade geschrieben */ } }
    return off;
  };
  function SimDate(...a) {
    if (!new.target) return new R(R.now() + cur()).toString();
    return a.length ? new R(...a) : new R(R.now() + cur());
  }
  SimDate.prototype = R.prototype;
  SimDate.now = () => R.now() + cur();
  SimDate.parse = R.parse;
  SimDate.UTC = R.UTC;
  globalThis.Date = SimDate;
}
