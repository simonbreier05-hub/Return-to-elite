/**
 * Offizielle Zimmerliste v2.1 in die DB bringen (`src/lib/rooms/roomList.ts`).
 *   npm run rooms:sync -- --dry-run --backup     → Room-Tabelle als JSON sichern + dry-run: zeigt neu/geändert/deaktiviert, schreibt nichts
 *   npx tsx scripts/sync-room-list.ts --apply    → schreibt (nur additiv, löscht nie)
 * Zeigt vorher den Host der DATABASE_URL (nie Zugangsdaten). Production nur auf ausdrückliche Freigabe.
 * Gibt keine Gastdaten aus — nur Zimmernummern, Etagen, Typen, Credits.
 */
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { syncRoomList, ROOM_LIST_TOTALS } from "../src/lib/rooms/roomListSync";
import { ROOM_LIST_VERSION } from "../src/lib/rooms/roomList";

const apply = process.argv.includes("--apply");
const url = process.env.DATABASE_URL ?? "";
let host = "(unbekannt)";
try {
  host = url.startsWith("file:") ? `SQLite ${url.slice(5)}` : new URL(url).host;
} catch {
  /* nur Anzeige */
}
console.log(
  `Zimmerliste v${ROOM_LIST_VERSION}: ${ROOM_LIST_TOTALS.rooms} Zimmer, Summe ${ROOM_LIST_TOTALS.credits} Credits`,
);
console.log(`Datenbank-Host: ${host}`);
console.log(
  apply ? "Modus: APPLY (schreibt)" : "Modus: dry-run (schreibt nichts)",
);

async function main() {
  // Sicherung: schreiben nur gegen die Preview-DB oder eine lokale SQLite — Produktion nie (Host ohne „preview“ → Abbruch).
  if (apply && !url.startsWith("file:") && !/preview/i.test(host)) {
    console.error(`Abbruch: Host „${host}“ ist keine Preview-DB. --apply nur gegen Preview oder SQLite.`);
    process.exit(2);
  }
  const prisma = new PrismaClient();
  try {
    // --backup[=<datei>]: Tabelle Room vor allem anderen als JSON sichern (nur Datei + Anzahl ausgeben, kein Inhalt)
    const backupArg = process.argv.find((a) => a === "--backup" || a.startsWith("--backup="));
    if (backupArg) {
      const file = backupArg.includes("=") ? backupArg.split("=")[1] : `/tmp/room-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      const rows = await prisma.room.findMany();
      writeFileSync(file, JSON.stringify(rows, null, 1));
      console.log(`Backup: ${rows.length} Zeilen der Tabelle Room → ${file}`);
    }
    const plan = await syncRoomList(prisma, { apply });
    console.log(
      `\nneu (${plan.create.length}): ${plan.create.map((e) => `${e.number} [E${e.floor} ${e.type} ${e.credit}]`).join(", ") || "–"}`,
    );
    console.log(`\ngeändert (${plan.update.length}):`);
    for (const u of plan.update)
      console.log(`  ${u.entry.number}: ${u.changes.join(", ")}`);
    console.log(
      `\ndeaktiviert (${plan.deactivate.length}): ${plan.deactivate.join(", ") || "–"}`,
    );
    console.log(`unverändert: ${plan.unchanged}`);
    if (apply) {
      const active = await prisma.room.findMany({
        where: { active: true },
        select: { floor: true, credit: true },
      });
      const floors: Record<number, number> = {};
      for (const r of active) floors[r.floor] = (floors[r.floor] ?? 0) + 1;
      const sum = active.reduce((n, r) => n + (r.credit ?? 0), 0);
      console.log(
        `\nNachher aktiv: ${active.length} Zimmer, Etagen ${JSON.stringify(floors)}, Summe ${sum} Credits`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
