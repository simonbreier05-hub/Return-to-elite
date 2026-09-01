import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { guardGuestRequest } from "@/lib/rooms/resolveGuestRoom";
import { reportDefect } from "@/lib/rooms/reportDefect";
import { DefectCategorySchema } from "@/lib/domain";

/**
 * POST /api/guest/[roomToken]/defect — "Mangel melden". Multipart, mirrors
 * the staff route (POST /api/rooms/[id]/defects) exactly, sharing the same
 * reportDefect() creation logic — this is the real work-order path.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ roomToken: string }> }) {
  const { roomToken } = await params;
  const gate = await guardGuestRequest(req, roomToken, "defect", { limit: 5, windowMs: 60_000 });
  if (!gate.ok) return gate.response;
  const { room, guestSource } = gate;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });

  const category = DefectCategorySchema.safeParse(form.get("category"));
  const note = String(form.get("note") ?? "").trim();
  if (!category.success) return NextResponse.json({ error: "Invalid defect category." }, { status: 400 });
  if (!note) return NextResponse.json({ error: "Defect note is required." }, { status: 400 });

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

  const defect = await reportDefect(
    { roomId: room.id, roomNumber: room.number, category: category.data, note, photoPath },
    { type: "guest", label: guestSource }
  );

  return NextResponse.json({ defect }, { status: 201 });
}
