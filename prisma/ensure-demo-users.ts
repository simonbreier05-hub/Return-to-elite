import bcrypt from "bcryptjs";
import { DEMO_PASSWORD, demoUsers, type DemoUser } from "./demoUsers";

/**
 * Boot step (start:railway), running right after `SEED_MODE=if-empty tsx
 * prisma/seed.ts`. Additive only: it upserts the fixed demo/quick-login list
 * by email and never touches anything else in the database.
 *
 * It exists because SEED_MODE=if-empty skips the whole seed as soon as the
 * User and Room tables are non-empty — correct for protecting live data on a
 * redeploy, but it also means a login added to the list *after* a database
 * was first seeded never gets inserted. That is exactly what happened on
 * postgres-preview: the database was seeded before the Hausmann merge, so
 * houseman@hotel.test stayed missing from the quick-login list through every
 * later deploy. This step closes that gap without reintroducing the
 * wipe-and-reseed risk the guard was added to prevent.
 *
 * Deliberately `update: {}` — an existing user keeps their current name,
 * role, section and password hash, so a demo account someone has since
 * renamed or repurposed is left exactly as it is.
 */

/** The slice of PrismaClient this needs, so the logic is testable without a database. */
export interface DemoUserClient {
  user: {
    findMany(args: {
      where: { email: { in: string[] } };
      select: { email: true };
    }): Promise<{ email: string }[]>;
    upsert(args: {
      where: { email: string };
      update: Record<string, never>;
      create: DemoUser & { passwordHash: string };
    }): Promise<unknown>;
  };
}

export interface EnsureResult {
  /** Emails that were missing and have now been created. */
  created: string[];
  /** How many of the demo users were already present and left untouched. */
  untouched: number;
}

export async function ensureDemoUsers(client: DemoUserClient, passwordHash: string): Promise<EnsureResult> {
  const users = demoUsers();

  // Read first purely so the deploy log can say what actually changed; the
  // upsert below is what makes it correct, including against a concurrent boot.
  const existing = await client.user.findMany({
    where: { email: { in: users.map((u) => u.email) } },
    select: { email: true },
  });
  const existingEmails = new Set(existing.map((u) => u.email));

  for (const user of users) {
    await client.user.upsert({
      where: { email: user.email },
      update: {},
      create: { ...user, passwordHash },
    });
  }

  return {
    created: users.map((u) => u.email).filter((email) => !existingEmails.has(email)),
    untouched: existingEmails.size,
  };
}

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const { created, untouched } = await ensureDemoUsers(prisma as unknown as DemoUserClient, passwordHash);
    console.log(
      created.length > 0
        ? `ensure-demo-users: added ${created.length} missing demo user(s): ${created.join(", ")} (${untouched} already present, unchanged).`
        : `ensure-demo-users: all ${untouched} demo users already present — nothing changed.`
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Only when run as a script (`tsx prisma/ensure-demo-users.ts`) — importing
// this module, as the unit test does, must not touch a database.
if (process.argv[1]?.includes("ensure-demo-users")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
