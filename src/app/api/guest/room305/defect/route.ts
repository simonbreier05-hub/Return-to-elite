import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { DefectCategorySchema } from "@/lib/domain";
import { reportDefect } from "@/lib/rooms/reportDefect";
import { getGuestRoom, getGuestSystemUserId } from "@/lib/guestServer";

/**
 * TEST/DEMO — unauthenticated guest-facing defect report, hard scoped to
 * room 305 (see src/app/guest/305). Reuses the exact same reportDefect()
 * logic as the staff route (src/app/api/rooms/[id]/defects/route.ts), just
 * with no auth check and the seeded guest system account as the reporter —
 * the resulting Defect/WorkOrder reaches Engineering's real queue like any
 * staff-reported one.
 */
export async function POST(req: NextRequest) {
  const room = await getGuestRoom();
  if (!room) return NextResponse.json({ error: "Room 305 not found — is the database seeded?" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });

  const category = DefectCategorySchema.safeParse(form.get("category"));
  const note = String(form.get("note") ?? "").trim();
  if (!category.success) return NextResponse.json({ error: "Invalid defect category." }, { status: 400 });
  if (!note) return NextResponse.json({ error: "Please describe the issue." }, { status: 400 });

  let photoPath: string | null = null;
  const photo = form.get("photo");
  if (photo instanceof File && photo.size > 0) {
    if (photo.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "Photo too large (max 8 MB)." }, { status: 400 });
    }
    const ext = (photo.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const filename = `defect-${room.number}-${Date.now()}.${ext}`;
    const dir = path.join(process.cwd(), "public", "uploads");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, filename), Buffer.from(await photo.arrayBuffer()));
    photoPath = `/uploads/${filename}`;
  }

  const reportedById = await getGuestSystemUserId();
  const defect = await reportDefect({ room, category: category.data, note, photoPath, reportedById });

  return NextResponse.json({ defect }, { status: 201 });
}
