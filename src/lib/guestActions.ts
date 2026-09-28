import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { broadcast } from "@/lib/realtime";
import { DefectCategorySchema } from "@/lib/domain";
import {
  CLEAN_TIMINGS,
  CLEAN_TIMING_LABELS,
  CONTACT_DEPARTMENTS,
  DND_WINDOWS,
  DND_WINDOW_LABELS,
} from "@/lib/guest";
import { getGuestSystemUserId } from "@/lib/guestServer";
import { reportDefect } from "@/lib/rooms/reportDefect";
import { addRoomNote } from "@/lib/rooms/addRoomNote";
import { sanitizeGuestText } from "@/lib/guestSanitize";

/**
 * The five guest write actions, shared by both access paths
 * (src/app/api/guest/r/[roomCode]/[action], src/app/api/guest/s/[stayToken]/[action])
 * — each route resolves its own identifier to a room, then dispatches here.
 * None of these ever see roomNumber/roomCode/stayToken; they only see the
 * already-resolved room, so there's exactly one place each action's rules
 * (validation, sanitizing, side effects) live, regardless of how the guest
 * got in.
 */

type GuestActionRoom = { id: string; number: string };

export const GUEST_ACTIONS = ["dnd", "clean-request", "defect", "contact", "notes"] as const;
export type GuestAction = (typeof GUEST_ACTIONS)[number];

export function isGuestAction(value: string): value is GuestAction {
  return (GUEST_ACTIONS as readonly string[]).includes(value);
}

export function runGuestAction(action: GuestAction, room: GuestActionRoom, req: NextRequest): Promise<NextResponse> {
  switch (action) {
    case "dnd":
      return handleDnd(room, req);
    case "clean-request":
      return handleCleanRequest(room, req);
    case "defect":
      return handleDefect(room, req);
    case "contact":
      return handleContact(room, req);
    case "notes":
      return handleNotes(room, req);
  }
}

const DndBody = z.object({ window: z.enum(DND_WINDOWS) });

/**
 * Does NOT set Room.status/blockReason directly: that transition is gated
 * to staff sessions by the state machine (src/lib/stateMachine.ts), and
 * attributing it to a fake staff identity would be worse than not
 * automating it. Instead it raises the same Notification staff already
 * watch for everything else (see src/app/api/rooms/[id]/defects/route.ts).
 */
async function handleDnd(room: GuestActionRoom, req: NextRequest): Promise<NextResponse> {
  const parsed = DndBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid time window." }, { status: 400 });

  const notification = await prisma.notification.create({
    data: {
      type: "GUEST_REQUEST",
      level: "info",
      targetRole: "supervisor",
      roomId: room.id,
      message: `Room ${room.number}: guest requests Do Not Disturb — ${DND_WINDOW_LABELS[parsed.data.window]}.`,
    },
  });
  broadcast("notification:new", { notification });
  return NextResponse.json({ ok: true }, { status: 201 });
}

const CleanRequestBody = z.object({
  timing: z.enum(CLEAN_TIMINGS),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM.")
    .optional(),
});

async function handleCleanRequest(room: GuestActionRoom, req: NextRequest): Promise<NextResponse> {
  const parsed = CleanRequestBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid timing." }, { status: 400 });

  const { timing, time } = parsed.data;
  const timingLabel =
    timing === "LATER" && time ? `${CLEAN_TIMING_LABELS.LATER} – ${time} Uhr` : CLEAN_TIMING_LABELS[timing];

  const notification = await prisma.notification.create({
    data: {
      type: "GUEST_REQUEST",
      level: "info",
      targetRole: "supervisor",
      roomId: room.id,
      message: `Room ${room.number}: guest requests cleaning — ${timingLabel}.`,
    },
  });
  broadcast("notification:new", { notification });
  return NextResponse.json({ ok: true }, { status: 201 });
}

const MAX_DEFECT_NOTE_LENGTH = 1000;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

/**
 * Reuses the exact same reportDefect() logic as the staff route
 * (src/app/api/rooms/[id]/defects/route.ts), just with no auth check and
 * the seeded guest system account as the reporter — the resulting
 * Defect/WorkOrder reaches Engineering's real queue like any staff-reported one.
 */
async function handleDefect(room: GuestActionRoom, req: NextRequest): Promise<NextResponse> {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });

  const category = DefectCategorySchema.safeParse(form.get("category"));
  const note = sanitizeGuestText(String(form.get("note") ?? ""));
  if (!category.success) return NextResponse.json({ error: "Invalid defect category." }, { status: 400 });
  if (!note) return NextResponse.json({ error: "Please describe the issue." }, { status: 400 });
  if (note.length > MAX_DEFECT_NOTE_LENGTH) {
    return NextResponse.json({ error: `Description too long (max ${MAX_DEFECT_NOTE_LENGTH} characters).` }, { status: 400 });
  }

  let photoPath: string | null = null;
  const photo = form.get("photo");
  if (photo instanceof File && photo.size > 0) {
    if (photo.size > MAX_PHOTO_BYTES) {
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

const ContactBody = z.object({ department: z.string() });

async function handleContact(room: GuestActionRoom, req: NextRequest): Promise<NextResponse> {
  const parsed = ContactBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Department required." }, { status: 400 });

  const dept = CONTACT_DEPARTMENTS.find((d) => d.key === parsed.data.department);
  if (!dept) return NextResponse.json({ error: "Unknown department." }, { status: 400 });

  const notification = await prisma.notification.create({
    data: {
      type: "GUEST_REQUEST",
      level: "info",
      targetRole: dept.role,
      roomId: room.id,
      message: `Room ${room.number}: guest wants to be contacted by ${dept.label}.`,
    },
  });
  broadcast("notification:new", { notification });
  return NextResponse.json({ ok: true }, { status: 201 });
}

const NotesBody = z.object({ body: z.string().trim().min(1).max(2000) });

/**
 * Reuses the exact same addRoomNote() logic as the staff route
 * (src/app/api/rooms/[id]/notes/route.ts), so the message shows up in the
 * Supervisor/Attendant note lists exactly like any other room note.
 */
async function handleNotes(room: GuestActionRoom, req: NextRequest): Promise<NextResponse> {
  const parsed = NotesBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Message required." }, { status: 400 });

  const body = sanitizeGuestText(parsed.data.body);
  if (!body) return NextResponse.json({ error: "Message required." }, { status: 400 });

  const authorId = await getGuestSystemUserId();
  const note = await addRoomNote({ room, authorId, body });
  return NextResponse.json({ note }, { status: 201 });
}
