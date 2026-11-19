/**
 * F2 (Entscheidung 16.11.2026): „Nicht im Service“ (OUT_OF_SERVICE) entfällt — einmalige, additive Umstellung bestehender
 * Zimmer auf „Außer Betrieb“ (OUT_OF_ORDER) mit Grund „übernommen aus Nicht im Service“. Der Wert selbst bleibt in Code/Schema.
 *
 *   npx tsx scripts/migrate-oos-to-ooo.ts            → Probelauf: zeigt nur, welche Zimmer betroffen wären
 *   npx tsx scripts/migrate-oos-to-ooo.ts --apply    → SQLite: legt vorher eine Kopie der DB-Datei an, dann umstellen
 *
 * Postgres: vorher selbst sichern (pg_dump) und `--apply --backup-done` angeben. Ende der Sperre: jetzt + 24 h (danach erinnert
 * der Minutentakt Supervisor und DM, siehe escalations.ts) — der DM passt Grund und Ende danach an. Logbuch je Zimmer.
 * Vor dem Ausführen auf echten Daten: Simon fragen (Prompt F2, Grenzen).
 */
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");
const REASON = "übernommen aus Nicht im Service";

async function main() {
  const rooms = await prisma.room.findMany({ where: { status: "OUT_OF_SERVICE" }, select: { id: true, number: true, oooUntil: true } });
  console.log(`${rooms.length} Zimmer „Nicht im Service“: ${rooms.map((r) => r.number).join(", ") || "—"}`);
  if (!apply || !rooms.length) { if (!apply) console.log("Probelauf — nichts geändert. Mit --apply umstellen."); return; }
  const url = process.env.DATABASE_URL ?? "";
  if (url.startsWith("file:")) {
    const file = path.resolve("prisma", url.slice(5).replace(/^\.\//, ""));
    const db = existsSync(url.slice(5)) ? url.slice(5) : file;
    const backup = `${db}.backup-oos-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    copyFileSync(db, backup);
    console.log(`Backup: ${backup}`);
  } else if (!process.argv.includes("--backup-done")) {
    throw new Error("Keine SQLite-Datei: bitte zuerst sichern (pg_dump) und mit --backup-done erneut starten.");
  }
  const until = new Date(Date.now() + 24 * 3_600_000);
  for (const r of rooms) {
    await prisma.room.update({ where: { id: r.id }, data: { status: "OUT_OF_ORDER", oooReason: REASON, oooUntil: r.oooUntil ?? until, oooSince: new Date() } });
    await prisma.auditLog.create({ data: { action: "OOS_MIGRATED", roomId: r.id, fromStatus: "OUT_OF_SERVICE", toStatus: "OUT_OF_ORDER", meta: JSON.stringify({ reason: REASON }) } });
  }
  console.log(`${rooms.length} Zimmer auf „Außer Betrieb“ umgestellt.`);
}
main().finally(() => prisma.$disconnect());
