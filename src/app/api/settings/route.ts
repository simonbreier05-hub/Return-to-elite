import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/rbac";
import { AUTOPLAN_WEIGHTS } from "@/lib/autoplan/weights";
import { AUTOPLAN_WEIGHT_PREFIX, getChatSettings, HOTEL_DEFAULT_LANGUAGE_KEY, getAutoplanWeights, getPlanningCreditSettings, getPriorityWeights, getRoomTypeCredits, getSettings, WEIGHT_PREFIX } from "@/lib/settings";
import { PRIORITY_WEIGHTS } from "@/lib/priority/computePriority";
import { audit } from "@/lib/audit";
import { normalizeLanguage } from "@/lib/i18n/languages";
import { getRoomTypeMap, getRoomTypeSeen, saveRoomTypeMap } from "@/lib/import/roomTypes";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  return NextResponse.json({
    settings: await getSettings(),
    weights: await getPriorityWeights(),
    weightDefaults: PRIORITY_WEIGHTS,
    // Schritt 4: cleaning credits per room type + the tidy/linen-cycle knobs,
    // read here so the Planungshub never hardcodes a room type's credit value.
    roomTypeCredits: await getRoomTypeCredits(),
    planningCredits: await getPlanningCreditSettings(),
    autoplanWeights: await getAutoplanWeights(),
    autoplanWeightDefaults: AUTOPLAN_WEIGHTS,
    roomTypeMap: await getRoomTypeMap(),
    roomTypeSeen: Object.fromEntries(Object.entries(await getRoomTypeSeen()).map(([c, n]) => [c, n.length])),
    hotelDefaultLanguage: (await getChatSettings()).hotelDefaultLanguage,
  });
}

const Body = z.object({
  blockedRecheckMinutes: z.number().int().positive().optional(),
  welfareCheckMinutes: z.number().int().positive().optional(),
  etaWarningMinutes: z.number().int().positive().optional(),
  releaseQueueBacklogThreshold: z.number().int().positive().optional(),
  roomsPerAttendantMin: z.number().int().min(1).max(30).optional(),
  roomsPerAttendantMax: z.number().int().min(1).max(30).optional(),
  attendantPoolMax: z.number().int().min(1).max(50).optional(),
  roomInventory: z.number().int().min(1).max(1000).optional(),
  guestPurgeHour: z.number().int().min(0).max(23).optional(),
  guestStayDeleteDays: z.number().int().min(1).max(3650).optional(),
  autoplanTolerance: z.number().min(0).max(10).optional(),
  autoplanMaxFloors: z.number().int().min(1).max(7).optional(),
  stayoverFactor: z.number().min(0.1).max(2).optional(),
  stayoverLaundryFactor: z.number().min(0.1).max(2).optional(),
  linenCycleDays: z.number().int().min(1).max(30).optional(),
  autoplanManyTraces: z.number().int().min(1).max(20).optional(),
  azubiCreditsMin: z.number().min(0).max(40).optional(),
  azubiCreditsMax: z.number().min(0).max(40).optional(),
  teilzeitCreditsMin: z.number().min(0).max(40).optional(),
  teilzeitCreditsMax: z.number().min(0).max(40).optional(),
  minutesPerCredit: z.number().min(5).max(120).optional(),
  earlyFinishMinutes: z.number().int().min(5).max(240).optional(),
  redistributionMaxMoves: z.number().int().min(1).max(20).optional(),
  statusRewindMinutes: z.number().int().min(0).max(120).optional(),
  chatRetentionDays: z.number().int().min(1).max(365).optional(),
  /** Hotel-Standardsprache der Mitarbeiter-Oberfläche (Prompt K1), ISO-Basiscode. */
  hotelDefaultLanguage: z.string().max(12).optional(),
  /** Gewichte der Zuteilungs-Kostenfunktion (autoplanWeight.<name>). Null = auf Standard zurück. */
  autoplanWeights: z.record(z.string(), z.number().min(0).max(100000)).optional(),
  /** Opera-Zimmerart-Code → Zimmerart (Einstellungen). */
  roomTypeMap: z.record(z.string(), z.string()).optional(),
  /** Priority weights, by their name in PRIORITY_WEIGHTS. Zero is allowed — it
   *  is how a house switches a signal off entirely. */
  weights: z.record(z.string(), z.number().min(0).max(1000)).optional(),
});

/** PATCH /api/settings — duty_manager tunes escalation thresholds. */
export async function PATCH(req: NextRequest) {
  const auth = await requireRole(["duty_manager"]);
  if (!auth.ok) return auth.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid settings payload.", code: "INVALID_INPUT" }, { status: 400 });

  const { roomsPerAttendantMin: minRooms, roomsPerAttendantMax: maxRooms } = parsed.data;
  if (minRooms !== undefined && maxRooms !== undefined && minRooms > maxRooms) {
    return NextResponse.json({ error: "roomsPerAttendantMin cannot be greater than roomsPerAttendantMax." }, { status: 400 });
  }
  // A lone min/max change is checked against whatever the other one currently
  // is, so a save can never leave the pair inverted in the database either.
  if (minRooms !== undefined && maxRooms === undefined) {
    const current = await getSettings();
    if (minRooms > current.roomsPerAttendantMax) {
      return NextResponse.json({ error: "roomsPerAttendantMin cannot be greater than roomsPerAttendantMax." }, { status: 400 });
    }
  }
  if (maxRooms !== undefined && minRooms === undefined) {
    const current = await getSettings();
    if (maxRooms < current.roomsPerAttendantMin) {
      return NextResponse.json({ error: "roomsPerAttendantMax cannot be less than roomsPerAttendantMin." }, { status: 400 });
    }
  }

  const { weights, autoplanWeights, roomTypeMap, hotelDefaultLanguage, ...thresholds } = parsed.data;
  if (hotelDefaultLanguage !== undefined) {
    const lang = normalizeLanguage(hotelDefaultLanguage);
    if (!lang) return NextResponse.json({ error: "Unknown language.", code: "UNKNOWN_LANGUAGE" }, { status: 400 });
    await prisma.setting.upsert({ where: { key: HOTEL_DEFAULT_LANGUAGE_KEY }, create: { key: HOTEL_DEFAULT_LANGUAGE_KEY, value: lang }, update: { value: lang } });
  }
  let roomTypesApplied: number | undefined;
  if (roomTypeMap) roomTypesApplied = (await saveRoomTypeMap(roomTypeMap)).applied;

  for (const [key, value] of Object.entries(thresholds)) {
    if (value === undefined) continue;
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: String(value) },
      update: { value: String(value) },
    });
  }

  // Ignore unknown weight names rather than storing junk that getPriorityWeights
  // would silently drop later.
  const known = new Set(Object.keys(PRIORITY_WEIGHTS));
  for (const [name, value] of Object.entries(weights ?? {})) {
    if (!known.has(name)) continue;
    const key = `${WEIGHT_PREFIX}${name}`;
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: String(value) },
      update: { value: String(value) },
    });
  }

  // Autoplan-Gewichte: nur bekannte Namen; 0 ist erlaubt (Regel ausschalten).
  const knownAutoplan = new Set(Object.keys(AUTOPLAN_WEIGHTS));
  for (const [name, value] of Object.entries(autoplanWeights ?? {})) {
    if (!knownAutoplan.has(name)) continue;
    const key = `${AUTOPLAN_WEIGHT_PREFIX}${name}`;
    await prisma.setting.upsert({ where: { key }, create: { key, value: String(value) }, update: { value: String(value) } });
  }

  await audit({ action: "SETTINGS_UPDATED", userId: auth.session.userId, meta: parsed.data });
  return NextResponse.json({
    settings: await getSettings(),
    weights: await getPriorityWeights(),
    weightDefaults: PRIORITY_WEIGHTS,
    roomTypeCredits: await getRoomTypeCredits(),
    planningCredits: await getPlanningCreditSettings(),
    autoplanWeights: await getAutoplanWeights(),
    autoplanWeightDefaults: AUTOPLAN_WEIGHTS,
    hotelDefaultLanguage: (await getChatSettings()).hotelDefaultLanguage,
  });
}
