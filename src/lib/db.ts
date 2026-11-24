import { Prisma, PrismaClient } from "@prisma/client";
import { PRISMA_OMIT } from "@/lib/dbOmit";
import { now, simulationAllowed } from "@/lib/clock";

const createBase = () => new PrismaClient({ omit: PRISMA_OMIT });
type Client = ReturnType<typeof createBase>;

/** Modell → Felder mit `@default(now())` (createdAt, statusSince, pausedAt, …). */
export const NOW_DEFAULT_FIELDS: ReadonlyMap<string, readonly string[]> = new Map(
  (Prisma.dmmf?.datamodel?.models ?? []) // im Browser undefined — db.ts gehört nie ins Client-Bündel (tests/ui/clientNoDb.test.ts)
    .map((m) => [m.name, m.fields.filter((f) => (f.default as { name?: string } | undefined)?.name === "now").map((f) => f.name)] as const)
    .filter(([, fs]) => fs.length > 0),
);

/** Fehlende `@default(now())`-Felder mit `at` füllen (ausdrücklich gesetzte bleiben). Rein, testbar. */
export function fillNowDefaults<T>(model: string, data: T, at: Date): T {
  const fields = NOW_DEFAULT_FIELDS.get(model);
  if (!fields || !data || typeof data !== "object") return data;
  if (Array.isArray(data)) return data.map((d) => fillNowDefaults(model, d, at)) as T;
  const out = { ...(data as Record<string, unknown>) };
  for (const f of fields) if (out[f] === undefined) out[f] = at;
  return out as T;
}

/**
 * S0: Im Simulationsmodus bekommen neue Zeilen Sim-Zeit statt DB-Zeit, damit Logik wie „heute angelegt“ zur Sim-Uhr
 * passt. Ohne Simulation (Produktion) wird die Erweiterung gar nicht eingehängt — Client unverändert.
 */
const withSimTimestamps = (base: Client): Client =>
  base.$extends({
    query: {
      $allModels: {
        create({ model, args, query }) { args.data = fillNowDefaults(model, args.data, now()); return query(args); },
        createMany({ model, args, query }) { args.data = fillNowDefaults(model, args.data, now()); return query(args); },
        createManyAndReturn({ model, args, query }) { args.data = fillNowDefaults(model, args.data, now()); return query(args); },
        upsert({ model, args, query }) { args.create = fillNowDefaults(model, args.create, now()); return query(args); },
      },
    },
  }) as unknown as Client;

const createClient = (): Client => (simulationAllowed() ? withSimTimestamps(createBase()) : createBase());

const globalForPrisma = globalThis as unknown as { prisma?: Client };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
