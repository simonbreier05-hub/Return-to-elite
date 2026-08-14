import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { broadcast } from "@/lib/realtime";
import { DefectCategorySchema } from "@/lib/domain";

/**
 * POST /api/rooms/[id]/defects — report a defect (category + note + photo).
 * Photos are stored under public/uploads (local S3 mock). A work order is
 * auto-created and routed to the engineering queue.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["room_attendant", "supervisor", "engineering"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });

  const category = DefectCategorySchema.safeParse(form.get("category"));
  const note = String(form.get("note") ?? "").trim();
  if (!category.success) return NextResponse.json({ error: "Invalid defect category." }, { status: 400 });
  if (!note) return NextResponse.json({ error: "Defect note is required." }, { status: 400 });

  // Photo upload → local S3 mock (public/uploads)
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

  const defect = await prisma.defect.create({
    data: {
      roomId: id,
      category: category.data,
      note,
      photoPath,
      reportedById: auth.session.userId,
      workOrder: { create: { status: "OPEN" } }, // auto-route to engineering
    },
    include: { workOrder: true, room: { select: { number: true } } },
  });

  await audit({
    action: "DEFECT_REPORTED",
    userId: auth.session.userId,
    roomId: id,
    meta: { category: category.data, note, photoPath, workOrderId: defect.workOrder?.id },
  });

  const notification = await prisma.notification.create({
    data: {
      type: "WORK_ORDER",
      level: "warning",
      targetRole: "engineering",
      roomId: id,
      message: `New work order: room ${room.number} — ${category.data}: ${note.slice(0, 120)}`,
      dedupeKey: `WORK_ORDER:${defect.id}`,
    },
  });
  broadcast("notification:new", { notification });
  broadcast("workorder:update", { workOrder: { ...defect.workOrder, defect: { ...defect, workOrder: undefined } } });

  return NextResponse.json({ defect }, { status: 201 });
}
