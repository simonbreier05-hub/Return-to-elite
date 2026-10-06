import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { getSettings } from "@/lib/settings";
import { isPurgeDue, lastSuccessfulPurge, latestScheduledPurge } from "@/lib/guestDataPurge";

/** GET /api/guest-data/purge-status — letzter Lauf, Fälligkeit, Zähler (keine personenbezogenen Daten). */
export async function GET() {
  const auth = await requireRole(["supervisor"]);
  if (!auth.ok) return auth.response;
  const settings = await getSettings();
  const last = await lastSuccessfulPurge();
  const latest = await prisma.purgeRun.findFirst({ orderBy: { startedAt: "desc" } });
  const latestImport = await prisma.importBatch.findFirst({ where: { status: "APPLIED" }, orderBy: { appliedAt: "desc" } });
  const now = new Date();
  return NextResponse.json({
    purgeHour: settings.guestPurgeHour,
    stayDeleteDays: settings.guestStayDeleteDays,
    lastOkAt: last?.finishedAt ?? null,
    lastCounts: last?.counts ? JSON.parse(last.counts) : null,
    latest: latest ? { trigger: latest.trigger, status: latest.status, at: latest.finishedAt ?? latest.startedAt, error: latest.error } : null,
    due: isPurgeDue(now, last?.finishedAt ?? null, settings.guestPurgeHour),
    lastScheduled: latestScheduledPurge(now, settings.guestPurgeHour),
    // true, wenn nach dem letzten Import gelöscht wurde: Listen müssen neu importiert werden.
    importsPurged: !!(last?.finishedAt && latestImport?.appliedAt && last.finishedAt > latestImport.appliedAt),
  });
}
