import { z } from "zod";
import { ImportTypeSchema } from "@/lib/domain";

/**
 * Server-seitige Whitelist. Der Browser liest die Datei, der Server nimmt aber
 * nur Felder an, die hier stehen — `.strict()` lehnt jedes weitere Feld
 * (Kartennummer, Preis, Saldo …) ab, auch wenn ein Client es mitschickt.
 */
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hhmm = z.string().regex(/^\d{2}:\d{2}$/);
const room = z.string().regex(/^\d{3,4}$/);
const short = (n: number) => z.string().max(n);

const Guest = z.object({
  salutation: short(20).nullable(), title: short(20).nullable(), lastName: z.string().min(1).max(80), fullName: short(160),
}).strict();
const Trace = z.object({ code: short(20), date: iso, text: short(400) }).strict();

export const DepartureRowSchema = z.object({
  room, guest: Guest, arrDate: iso, depDate: iso, adults: z.number().int().min(0).max(50), children: z.number().int().min(0).max(50),
  nights: z.number().int().min(0).max(999), status: short(10).nullable(), depTime: hhmm.nullable(), vip: z.boolean(),
}).strict();

export const ArrivalRowSchema = z.object({
  room, guest: Guest, arrDate: iso, depDate: iso, arrTime: hhmm.nullable(), adults: z.number().int().min(0).max(50),
  children: z.number().int().min(0).max(50), status: short(10).nullable(), vip: z.boolean(), traces: z.array(Trace).max(50),
}).strict();

export const TraceRowSchema = z.object({
  room, guest: Guest.nullable(), code: short(20), dept: short(20).nullable(), date: iso, text: short(400),
}).strict();

export const ForecastDayRowSchema = z.object({
  date: iso, occupiedRooms: z.number().int().min(0).max(1000), arrivals: z.number().int().min(0).max(1000),
  departures: z.number().int().min(0).max(1000), occupancyPct: z.number().min(0).max(1000), outOfOrder: z.number().int().min(0).max(1000),
  dayUse: z.number().int().min(0).max(1000), noShow: z.number().int().min(0).max(1000), persons: z.number().int().min(0).max(10000),
}).strict();

const Issue = z.object({
  severity: z.enum(["CRITICAL", "WARNING", "INFO"]), code: short(40), page: z.number().int().optional(), line: z.number().int().optional(),
  room: short(10).optional(),
  // Meldungen enthalten nie Gastdaten; eine lange Ziffernfolge (Karten-/Reservierungsnr.) wird abgelehnt.
  message: short(500).refine((m) => !/\d{9,}/.test(m), "Meldung enthält eine lange Zahl"),
}).strict();

const ROW_SCHEMAS = {
  DEPARTURES: DepartureRowSchema, ARRIVALS: ArrivalRowSchema, TRACES: TraceRowSchema, FORECAST: ForecastDayRowSchema,
} as const;

export const SubmitBatchSchema = z.object({
  type: ImportTypeSchema,
  fileHash: z.string().regex(/^[a-f0-9]{64}$/),
  reportDate: iso.nullable(), periodFrom: iso.nullable(), periodTo: iso.nullable(),
  issues: z.array(Issue).max(500),
  rows: z.array(z.unknown()).max(5000),
}).strict().superRefine((v, ctx) => {
  const schema = ROW_SCHEMAS[v.type];
  v.rows.forEach((row, i) => {
    const r = schema.safeParse(row);
    if (!r.success) ctx.addIssue({ code: "custom", path: ["rows", i], message: r.error.issues[0]?.message ?? "invalid" });
  });
});
export type SubmitBatch = z.infer<typeof SubmitBatchSchema>;
