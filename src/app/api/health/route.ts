import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/health — liveness probe used by Railway's healthcheck.
 * Verifies the process is up AND the database is reachable/seeded.
 */
export async function GET() {
  try {
    const rooms = await prisma.room.count();
    return NextResponse.json({ status: "ok", rooms });
  } catch (err) {
    return NextResponse.json(
      { status: "degraded", error: (err as Error).message },
      { status: 503 }
    );
  }
}
