import { describe, expect, it } from "vitest";
import { ensureDemoUsers, type DemoUserClient } from "../prisma/ensure-demo-users";
import { demoUsers } from "../prisma/demoUsers";

/**
 * The boot step must be safe to run against a database that is already full:
 * it may only add the demo logins that are missing, and running it again must
 * be a no-op. See prisma/ensure-demo-users.ts for the incident this guards.
 */

interface StoredUser {
  id: string;
  email: string;
  name: string;
  role: string;
  section?: string;
  passwordHash: string;
}

/** In-memory stand-in for prisma.user with real upsert-by-email semantics. */
function fakeClient(initial: StoredUser[] = []) {
  const rows = new Map(initial.map((u) => [u.email, { ...u }]));
  let nextId = initial.length + 1;
  const client: DemoUserClient = {
    user: {
      async findMany({ where }) {
        return [...rows.values()]
          .filter((u) => where.email.in.includes(u.email))
          .map((u) => ({ email: u.email }));
      },
      async upsert({ where, update, create }) {
        const found = rows.get(where.email);
        if (found) {
          Object.assign(found, update); // `update: {}` — nothing changes
          return found;
        }
        const row = { id: `generated-${nextId++}`, ...create };
        rows.set(where.email, row);
        return row;
      },
    },
  };
  return { client, rows };
}

const snapshot = (rows: Map<string, StoredUser>) => JSON.stringify([...rows.entries()].sort());

describe("ensureDemoUsers", () => {
  it("creates every demo user on an empty database", async () => {
    const { client, rows } = fakeClient();

    const result = await ensureDemoUsers(client, "hash");

    expect(rows.size).toBe(demoUsers().length);
    expect(result.created).toHaveLength(demoUsers().length);
    expect(result.untouched).toBe(0);
    expect(rows.has("houseman@hotel.test")).toBe(true);
  });

  it("adds only the missing login to an already-populated database", async () => {
    // The postgres-preview situation: everything seeded before the Hausmann
    // merge is there, houseman@hotel.test is not.
    const preexisting = demoUsers()
      .filter((u) => u.email !== "houseman@hotel.test")
      .map((u, i) => ({ id: `existing-${i}`, ...u, passwordHash: "old-hash" }));
    const { client, rows } = fakeClient(preexisting);

    const result = await ensureDemoUsers(client, "new-hash");

    expect(result.created).toEqual(["houseman@hotel.test"]);
    expect(result.untouched).toBe(preexisting.length);
    expect(rows.get("houseman@hotel.test")).toMatchObject({
      name: "Hans Bauer",
      role: "houseman",
      passwordHash: "new-hash",
    });
  });

  it("leaves existing users completely untouched, including a renamed one", async () => {
    const renamed = {
      id: "existing-1",
      email: "supervisor@hotel.test",
      name: "Someone Else Entirely",
      role: "supervisor",
      section: "9Z",
      passwordHash: "their-own-hash",
    };
    const { client, rows } = fakeClient([renamed]);

    await ensureDemoUsers(client, "new-hash");

    expect(rows.get("supervisor@hotel.test")).toEqual(renamed);
  });

  it("is idempotent — a second run changes nothing", async () => {
    const { client, rows } = fakeClient();

    await ensureDemoUsers(client, "hash");
    const afterFirst = snapshot(rows);

    const second = await ensureDemoUsers(client, "hash");

    expect(snapshot(rows)).toBe(afterFirst);
    expect(second.created).toEqual([]);
    expect(second.untouched).toBe(demoUsers().length);
  });
});
