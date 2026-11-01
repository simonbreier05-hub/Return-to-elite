import { prisma } from "@/lib/db";

/** Gespeicherte Mannschaft des Tages (Planungshub, Schritt „Team"); `null`, wenn für diesen Tag nichts gespeichert wurde. */
export async function savedTeamFor(date: string): Promise<{ hk: string[]; sup: string[]; hm: string[] } | null> {
  const row = await prisma.setting.findUnique({ where: { key: "planningTeam" } });
  if (!row) return null;
  try {
    const v = JSON.parse(row.value) as { date?: string; hk?: unknown; sup?: unknown; hm?: unknown };
    if (v.date !== date) return null;
    const ids = (x: unknown) => (Array.isArray(x) ? x.map(String) : []);
    return { hk: ids(v.hk), sup: ids(v.sup), hm: ids(v.hm) };
  } catch { return null; }
}
