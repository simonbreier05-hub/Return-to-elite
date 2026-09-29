import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { broadcast } from "@/lib/realtime";
import { audit } from "@/lib/audit";
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

export const GUEST_ACTIONS = ["dnd", "dnd-cancel", "clean-request", "defect", "contact", "notes"] as const;
export type GuestAction = (typeof GUEST_ACTIONS)[number];

export function isGuestAction(value: string): value is GuestAction {
  return (GUEST_ACTIONS as readonly string[]).includes(value);
}

export function runGuestAction(action: GuestAction, room: GuestActionRoom, req: NextRequest): Promise<NextResponse> {
  switch (action) {
    case "dnd":
      return handleDnd(room, req);
    case "dnd-cancel":
      return handleDndCancel(room);
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
 * watch for everything else (see src/app/api/rooms/[id]/defects/route.ts),
 * plus a GuestRequest row (Prompt G2 Teil 3) so the guest screen can show
 * "Eingegangen" and later offer to lift it themselves.
 */
async function handleDnd(room: GuestActionRoom, req: NextRequest): Promise<NextResponse> {
  const parsed = DndBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid time window." }, { status: 400 });

  const guestUserId = await getGuestSystemUserId();
  const [notification, guestRequest] = await Promise.all([
    prisma.notification.create({
      data: {
        type: "GUEST_REQUEST",
        level: "info",
        targetRole: "supervisor",
        roomId: room.id,
        message: `Room ${room.number}: guest requests Do Not Disturb — ${DND_WINDOW_LABELS[parsed.data.window]}.`,
      },
    }),
    prisma.guestRequest.create({
      data: { roomId: room.id, kind: "DND", detail: JSON.stringify({ window: parsed.data.window }) },
    }),
  ]);
  await audit({ action: "GUEST_DND_REQUESTED", userId: guestUserId, roomId: room.id, meta: { window: parsed.data.window } });
  broadcast("notification:new", { notification });
  broadcast("guestrequest:new", { guestRequest });
  return NextResponse.json({ ok: true, requestId: guestRequest.id }, { status: 201 });
}

/**
 * Guest self-service: lifts whichever DND request is currently active for
 * this room (Prompt G2 Teil 3: "Gast kann eine DND-Einstellung selbst
 * zurücknehmen"). No-op with a plain error if there is nothing active —
 * this only ever cancels the guest's *own* still-open request, never
 * touches Room.status/blockReason (staff-only, same as handleDnd above).
 */
async function handleDndCancel(room: GuestActionRoom): Promise<NextResponse> {
  const active = await prisma.guestRequest.findFirst({
    where: { roomId: room.id, kind: "DND", status: { in: ["RECEIVED", "IN_PROGRESS"] } },
    orderBy: { createdAt: "desc" },
  });
  if (!active) return NextResponse.json({ error: "No active Do Not Disturb request." }, { status: 400 });

  const guestUserId = await getGuestSystemUserId();
  const [updated, notification] = await Promise.all([
    prisma.guestRequest.update({ where: { id: active.id }, data: { status: "CANCELLED" } }),
    prisma.notification.create({
      data: {
        type: "GUEST_REQUEST",
        level: "info",
        targetRole: "supervisor",
        roomId: room.id,
        message: `Room ${room.number}: guest lifted Do Not Disturb.`,
      },
    }),
  ]);
  await audit({ action: "GUEST_DND_CANCELLED", userId: guestUserId, roomId: room.id });
  broadcast("notification:new", { notification });
  broadcast("guestrequest:update", { guestRequest: updated });
  return NextResponse.json({ ok: true }, { status: 200 });
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

  const guestUserId = await getGuestSystemUserId();
  const [notification, guestRequest] = await Promise.all([
    prisma.notification.create({
      data: {
        type: "GUEST_REQUEST",
        level: "info",
        targetRole: "supervisor",
        roomId: room.id,
        message: `Room ${room.number}: guest requests cleaning — ${timingLabel}.`,
      },
    }),
    prisma.guestRequest.create({
      data: { roomId: room.id, kind: "CLEAN_REQUEST", detail: JSON.stringify({ timing, time }) },
    }),
  ]);
  await audit({ action: "GUEST_CLEAN_REQUESTED", userId: guestUserId, roomId: room.id, meta: { timing, time } });
  broadcast("notification:new", { notification });
  broadcast("guestrequest:new", { guestRequest });
  return NextResponse.json({ ok: true, requestId: guestRequest.id }, { status: 201 });
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
    const dir = path.join(process.cwd(), "uploads");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, filename), Buffer.from(await photo.arrayBuffer()));
    photoPath = `/api/uploads/${filename}`;
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

  const guestUserId = await getGuestSystemUserId();
  const [notification, guestRequest] = await Promise.all([
    prisma.notification.create({
      data: {
        type: "GUEST_REQUEST",
        level: "info",
        targetRole: dept.role,
        roomId: room.id,
        message: `Room ${room.number}: guest wants to be contacted by ${dept.label}.`,
      },
    }),
    prisma.guestRequest.create({
      data: { roomId: room.id, kind: "CONTACT", detail: JSON.stringify({ department: dept.key }) },
    }),
  ]);
  await audit({ action: "GUEST_CONTACT_REQUESTED", userId: guestUserId, roomId: room.id, meta: { department: dept.key } });
  broadcast("notification:new", { notification });
  broadcast("guestrequest:new", { guestRequest });
  return NextResponse.json({ ok: true, requestId: guestRequest.id }, { status: 201 });
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
