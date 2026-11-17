// Simulation — erzeugt je Tag das Drehbuch (wer macht wann was mit welchem Zimmer) aus erwartung.json.
//   node scripts/simulation/drehbuch.mjs   → tests/simulation/drehbuch/tag-0.md … tag-5.md
import fs from "node:fs";
import path from "node:path";

const OPERA = path.join(process.cwd(), "tests", "simulation", "opera");
const OUT = path.join(process.cwd(), "tests", "simulation", "drehbuch");
fs.mkdirSync(OUT, { recursive: true });

export const TEAM = {
  maria: "Maria Silva — Vollzeit, Level 3, Präferenz-Etagen 1+2",
  aylin: "Aylin Kaya — Vollzeit, Level 2, Präferenz-Etagen 3+4",
  petra: "Petra Novak — Vollzeit, Level 1, Präferenz-Etagen 2+3",
  lucia: "Lucia Ferrari — Vollzeit, Level 1, Präferenz-Etage 1",
  elena: "Elena Popescu — Teilzeit, Level 2, Präferenz-Etagen 4+5",
  fatima: "Fatima Benali — Azubi, Level 2, Präferenz-Etage 2",
  grace: "Grace Okafor — externe Aushilfe (Springer), Level 2, keine Präferenz",
  joanna: "Joanna Kowalska — Vollzeit, Level 2, Einschränkung „keine Suiten“, Präferenz-Etagen 4+5",
  sena: "Sena Demir — Vollzeit, Level 1, Präferenz-Etage 3 (nur Tag 3 im Dienst)",
};
const GROUPS = { 1: ["maria", "petra", "fatima"], 2: ["aylin", "lucia", "grace"], 3: ["elena", "joanna"] };
const GROUPS_DAY3 = { 1: ["maria", "petra"], 2: ["lucia", "sena"], 3: ["joanna"] };
const SICK = { 1: "fatima", 2: "grace", 3: "sena", 4: "elena", 5: "lucia" };
const WLAN = { 1: "aylin", 2: "maria", 3: "joanna", 4: "petra", 5: "elena" };
const PAUSE = { 1: "maria", 2: "joanna", 3: "petra", 4: "aylin", 5: "grace" };
const LANGS = ["en-US", "fr-FR", "es-ES", "zh-CN", "ar-SA", "de-DE"];
const groupOf = (d, who) => Object.entries(d === 3 ? GROUPS_DAY3 : GROUPS).find(([, m]) => m.includes(who))[0];

const tag0 = `# Drehbuch Tag 0 — Sonntag 15.11.2026, Vorabend (nur Leitung + Supervisor)

## leitung
Personal für die Woche pflegen (Einstellungen → Housekeeper): Typ, Level, Präferenz-Etagen, Einschränkungen. Protokoll: Wie viele Schritte je Person? Ist alles pflegbar (P5, P6)?

${Object.entries(TEAM).map(([k, v]) => `- \`${k}\`: ${v}`).join("\n")}
- Ingrid Hausmann (Hausdame) arbeitet diese Woche nicht als Housekeeperin — nicht einplanen, falls möglich inaktiv setzen.

Danach in den Einstellungen nachsehen und notieren: Credit-Werte, Minuten je Credit, Zielwerte (11/7), Toleranz, Wäsche-Intervall, max. Suiten — stehen sie dort und stimmen sie (P1, P2, P4, P8)?

## supervisor
\`sup1\`: Versuche, bei Petra Novak das **Level** von 1 auf 3 zu ändern (P6: darf nur der DM) — über die Oberfläche und, falls du den Aufruf siehst, direkt. Versuche danach, eine Präferenz-Etage zu ändern (darf ein Supervisor das? notieren) und stelle sie wieder zurück.
`;
fs.writeFileSync(path.join(OUT, "tag-0.md"), tag0);

for (let d = 1; d <= 5; d++) {
  const e = JSON.parse(fs.readFileSync(path.join(OPERA, `tag-${d}`, "erwartung.json"), "utf8"));
  const z = e.zimmer;
  const groups = d === 3 ? GROUPS_DAY3 : GROUPS;
  const team = Object.values(groups).flat();
  const special = new Set([...z.waeschewechsel, ...z.tag1Langbleiber, e.manuellImTagesverlauf.greenOption?.zimmer, e.manuellImTagesverlauf.zimmerwechsel?.von].filter(Boolean));
  const plain = z.bleiber.filter((r) => !special.has(r));
  const pick = (i) => plain[Math.floor((plain.length - 1) * i)];
  const dnd = pick(0.1), ab13 = pick(0.3), now = pick(0.5), mangel = pick(0.7), move = e.manuellImTagesverlauf.zimmerwechsel ?? { von: pick(0.9), nach: null };
  const late = new Set(z.lateCheckoutImReport), chkd = new Set(z.ausgechecktImReport);
  const outs = z.abreisen.filter((r) => !late.has(r) && !chkd.has(r));
  const manualLate = e.manuellImTagesverlauf.lateCheckoutsVonHand ?? [outs[outs.length - 1]];
  const co = outs.filter((r) => !manualLate.includes(r));
  const half = Math.ceil(co.length / 2);
  const rushFo = z.turns[0], rushSup = z.turns[1];
  const arrGuest = z.anreisen.find((r) => !z.turns.includes(r)) ?? z.anreisen[0];
  const guests = [[dnd, "DND"], [ab13, "ab 13 Uhr"], [now, "Service Now"], [mangel, "Mangel mit Foto"], ...(d === 4 ? [[e.manuellImTagesverlauf.greenOption.zimmer, "Green Option"]] : []), [arrGuest, "Anreise-Gast"]]
    .map(([room, role], i) => ({ room, role, lang: LANGS[(i + d) % LANGS.length] }));
  const g = (role) => guests.find((x) => x.role === role);
  const sick = SICK[d], wlan = WLAN[d], pause = PAUSE[d];
  const hkSection = (n) => {
    const m = groups[n];
    return [`## hk-gruppe-${n}`, `Deine Kräfte heute: ${m.map((k) => `\`${k}\``).join(", ")}. Protokoll \`hk-gruppe-${n}.md\`.`,
      m.includes(sick) ? `- **09:00** \`${sick}\` meldet sich nach dem ersten Zimmer krank (telefonisch beim Supervisor) und arbeitet danach nicht mehr. Um 10:00 einmal nachsehen: Was zeigt ihr Handy noch an?` : "",
      m.includes(pause) ? `- **12:00** \`${pause}\` macht 30 Minuten Pause (Pausen-Funktion benutzen), um 13:00 weiter.` : "",
      m.includes(wlan) ? `- **14:00** \`${wlan}\`: WLAN-Abbruch (siehe Rollenbeschreibung).` : "",
      `- DND-Zimmer heute: ${dnd} (Gast hängt um 08:00 „Bitte nicht stören“ an). Wer es in der Liste hat: ab 12:00 auf den Hinweis „Karte ans Zimmer hängen“ achten (B6). „Ab 13 Uhr“-Zimmer: ${ab13} (P9). Service Now: ${now} (P7). Rush: ${rushFo} um 10:00, ${rushSup} um 11:00 (P10).`,
      `- Rechte-Tests dieser Gruppe heute: ${["Zimmer einer Kollegin zuteilen (P12) + Rush setzen (P10)", "eigenes Zimmer selbst abnehmen/freigeben (B4) + Zimmerwechsel freigeben (B5)", "Foto eines Gast-Mangels ansehen (B9) + fremde Zimmer/Gastnamen sehen"][(n + d) % 3]}.`,
    ].filter(Boolean).join("\n");
  };
  const md = `# Drehbuch Tag ${d} — ${e.wochentag} ${e.date} (${["Normal", "Spitze", "Engpass", "Ruhig", "Randfälle"][d - 1]})

Soll laut Listen: ${e.abreisen} Abreisen (davon ${e.davonTurns} Turns), ${e.anreisen} Anreisen, ${e.bleiber} Bleiber, ${e.waeschewechsel} Wäschewechsel, ${e.traces.offen} offene Traces. Alle Soll-Zahlen: \`tests/simulation/opera/tag-${d}/erwartung.json\`.
Mannschaft: ${team.length} Housekeeper (${team.map((k) => `\`${k}\``).join(", ")}), Supervisor \`sup1\` (Etagen 1–2) und \`sup2\` (Etagen 3–5), Hausmann \`hausmann\`.${d === 3 ? " **Engpass: nur 5 Kräfte, davon 3 mit Level 1 (petra, lucia, sena).**" : ""}

## leitung
- **06:30** ${d === 5 ? `Zuerst die Fehl-Uploads aus \`tests/simulation/opera/tag-5/randfaelle/\`, je einzeln, Verhalten notieren: (1) \`FEHLER_departures_…_spalte-fehlt.pdf\`, (2) \`FEHLER_traces_…_spalte-fehlt.csv\`, (3) \`VORTAG_arrivals_19-11-26.pdf\` (Liste von gestern) — jeweils: verständliche Meldung? gesperrt? lässt sich die Datei wieder entfernen? Danach die fünf richtigen Listen. Danach (4) \`DOPPELT_inhouse_20-11-26.pdf\` noch einmal hochladen: doppelte Zimmer? Zahlen unverändert? ` : ""}Fünf Listen aus \`tests/simulation/opera/tag-${d}/\` einlesen (alle \`*.pdf\` im Ordner, nicht \`randfaelle\`).
- **07:00** Mannschaft: genau die ${team.length} oben genannten Housekeeper, beide Supervisoren, der Hausmann. Etagen: sup1 = 1+2, sup2 = 3+4+5. Vorschlag erstellen.
- **07:30** Plan bestätigen (vor 08:00), nachdem die Supervisoren ihre 3 Handzuteilungen gemacht haben (im Entwurf oder direkt danach — notieren, was die App zulässt).
${d === 2 ? "- **12:00** Lage prüfen: 70 Abreisen, 15 Turns, 6 VIP auf Etage 5 — sieht der DM, wo es brennt?\n" : ""}${d === 3 ? "- **07:00** Achtung Engpass: Warnung „Personal reicht nicht“? Level-1-Warnungen bei Suiten/VIP/Allergiker (P6)? Gestern 5 vorzeitig Abgereiste — wie zeigt die App diese Aufenthalte heute?\n" : ""}${d === 5 ? `- **06:30** Die Zimmer ${e.manuellImTagesverlauf.ausserBetrieb.join(" und ")} sind seit gestern Abend außer Betrieb (setzt der Techniker um 06:30). Tauchen sie im Vorschlag auf?\n` : ""}
## supervisor
- **07:30** 3 Handzuteilungen (frei wählbar, notieren).
- **09:00** Krankmeldung: \`${sick}\` (${TEAM[sick].split(" — ")[0]}) fällt aus — ${["sup1", "sup2"][(d + 1) % 2]} trägt es ein und verteilt ihre offenen Zimmer von Hand (P11).
- **11:00** \`${["sup1", "sup2"][d % 2]}\` setzt Rush für Zimmer ${rushSup} (P10).
- **13:00** Mangel selbst melden in Zimmer ${z.bleiber[0]}; Gast-Mangel in ${mangel} ansehen (Foto sichtbar? B9).
- **14:00** Zimmerwechsel freigeben: Gast aus ${move.von}${move.nach ? ` nach ${move.nach}` : " in ein freies, sauberes Zimmer eurer Wahl"} (B5).
- **15:00** Nachricht an alle Housekeeper („Bitte Wäschewagen bis 16:15 zurück in den Office-Raum“), Lesebestätigung prüfen (B10).

${[1, 2, 3].map(hkSection).join("\n\n")}

## empfang
- **10:00** FO: „Gast ausgecheckt“ für: ${co.slice(0, half).join(", ")}. Rush für Anreise-Zimmer ${rushFo} (P10).
- **10:00** FO: Late Check-out von Hand eintragen: ${manualLate.join(", ")} (bis 14:00). Im Report stehen schon: ${[...late].join(", ") || "–"} — sind die markiert?
- **11:00** FO: „Gast ausgecheckt“ für: ${co.slice(half).join(", ")}. ${[...chkd].length ? `Laut Report schon ausgecheckt: ${[...chkd].join(", ")} — zeigt die App das?` : ""}
${d === 2 ? `- **12:00 und 13:00** FO: **zusätzliche Check-outs** (vorzeitige Abreise, stehen heute nicht als Abreise in den Listen): ${e.manuellImTagesverlauf.zusaetzlicheCheckouts.join(", ")} — drei um 12:00, zwei um 13:00. Geht das bei einem Bleiber? Wer wird benachrichtigt, wird das Zimmer zur Abreise-Reinigung? (B3, P14)\n` : ""}- **13:00** Concierge: Ausflug für Zimmer ${ab13} eintragen (Abfahrt 14:00, Rückkehr 18:00) (B11).
- **14:00** FO: Zimmerwechsel anstoßen: ${move.von}${move.nach ? ` → ${move.nach}` : " → freies Zimmer"} (B5).
- **14:00/15:00** FO: die Late-Check-out-Zimmer auschecken.

## technik
- ${d === 1 ? "**08:00** Hausmann legt eine wiederkehrende Aufgabe an: Zimmer 304 „Blumen wechseln“, alle 2 Tage, ab heute (B7). Erscheint sie heute in der Liste?" : `**08:00** Hausmann: wiederkehrende Aufgabe Zimmer 304 „Blumen wechseln“ (alle 2 Tage ab Tag 1) — heute ${d % 2 ? "**fällig**: steht sie automatisch in der Liste (genau einmal)?" : "**nicht fällig**: steht sie fälschlich in der Liste?"} (B7)`}
${d === 5 ? `- **06:30** Techniker setzt ${e.manuellImTagesverlauf.ausserBetrieb.join(" und ")} auf „außer Betrieb“ (Wasserschaden, bis auf Weiteres) (B8).\n` : ""}- **13:00** Techniker: Gast-Mangel in Zimmer ${mangel} (mit Foto) → Zimmer außer Betrieb setzen (B8, B9).
- **15:00** Techniker: Auftrag ${mangel} erledigen — ohne Notiz versuchen, dann mit Notiz (B8). Zimmer wieder in Betrieb?
- **14:00** Techniker meldet selbst einen Mangel in Zimmer ${z.abreisen[2]} (Abreise-Zimmer) (B9).

## gast
${guests.map((x) => `- \`gast-${x.room}\` (${x.lang}): ${x.role}`).join("\n")}
- **08:00** ${g("DND").room}: „Bitte nicht stören“. ${g("ab 13 Uhr").room}: „Reinigung ab 13 Uhr“ (P9).${d === 4 ? ` ${g("Green Option").room}: **Green Option** wählen (P8) — verschwindet der Wäschewechsel heute?` : ""}
- **10:00** ${g("Service Now").room}: „Bitte jetzt reinigen“ (Service Now, P7).
- **13:00** ${g("Mangel mit Foto").room}: Mangel mit Foto melden („Dusche tropft“ in der Sprache des Gastes) (B9). ${g("DND").room}: DND wieder aufheben.
- **15:00** Alle: Status der eigenen Wünsche ansehen. ${g("Anreise-Gast").room}: Anreise-Gast scannt den Code (ist er schon „sein“ Zimmer? was sieht er vor dem Check-in?). Grenzen laut Rollenbeschreibung testen.
`;
  fs.writeFileSync(path.join(OUT, `tag-${d}.md`), md);
  fs.writeFileSync(path.join(OUT, `tag-${d}.json`), JSON.stringify({ tag: d, team, gruppen: groups, krank: sick, wlan, pause, dnd, ab13, serviceNow: now, mangel, zimmerwechsel: move, rushFo, rushSup, checkouts10: co.slice(0, half), checkouts11: co.slice(half), lateVonHand: manualLate, gaeste: guests }, null, 1) + "\n");
}
console.log("Drehbücher geschrieben:", fs.readdirSync(OUT).join(", "));
