import { unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";

/**
 * F6 (M3, Entscheidung B9 / Recht 4): Mängel-Fotos werden gelöscht, sobald der Mangel behoben (Auftrag RESOLVED) und das
 * Zimmer wieder in Betrieb ist (nicht OUT_OF_ORDER/OUT_OF_SERVICE). Datei unter ./uploads und Verweis `Defect.photoPath`.
 * Aufrufer: „Wieder in Betrieb“ (applyStatusChange) und die Nachtlöschung als Sicherheitsnetz (`roomId` weglassen = ganzes Haus).
 * Offene Mängel behalten ihr Foto (Technik braucht es). Liefert die Zahl gelöschter Fotos.
 */
export async function deleteResolvedDefectPhotos(roomId?: string): Promise<number> {
  const defects = await prisma.defect.findMany({
    where: {
      photoPath: { not: null },
      workOrder: { status: "RESOLVED" },
      room: { status: { notIn: ["OUT_OF_ORDER", "OUT_OF_SERVICE"] }, ...(roomId ? { id: roomId } : {}) },
    },
    select: { id: true, photoPath: true },
  });
  for (const d of defects) {
    const filename = d.photoPath?.split("/").pop();
    if (filename && !filename.includes("..")) await unlink(path.join(process.cwd(), "uploads", filename)).catch(() => undefined);
  }
  if (defects.length) await prisma.defect.updateMany({ where: { id: { in: defects.map((d) => d.id) } }, data: { photoPath: null } });
  return defects.length;
}
