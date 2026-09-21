import { GUEST_SYSTEM_EMAIL } from "../src/lib/guest";

/**
 * The fixed list of demo / quick-login users, shared by the two scripts that
 * need it: prisma/seed.ts (full wipe-and-reseed of a fresh database) and
 * prisma/ensure-demo-users.ts (non-destructive upsert on every boot). It
 * lives here rather than inside seed.ts so a login added to this list can
 * never again exist in only one of those two paths — see the comment in
 * ensure-demo-users.ts for the incident that motivated the split.
 *
 * All demo passwords: 123
 */

export const DEMO_PASSWORD = "123";

export interface DemoUser {
  email: string;
  name: string;
  role: string;
  section?: string;
}

/**
 * A function rather than a const: the guest account's display name depends on
 * GUEST_ROOM_NUMBER, which is read per deployment, so it is resolved when the
 * list is actually used instead of whenever this module happens to be loaded.
 */
export function demoUsers(): DemoUser[] {
  return [
    // Ten attendants for 145 keys — roughly 14 rooms each, which is what a
    // five-star house actually rosters. With four, every plan comes out at
    // three shifts' worth of work and the planning board is meaningless.
    { email: "maria@hotel.test", name: "Maria Silva", role: "room_attendant", section: "2A" },
    { email: "aylin@hotel.test", name: "Aylin Kaya", role: "room_attendant", section: "3A" },
    { email: "petra@hotel.test", name: "Petra Novak", role: "room_attendant", section: "5B" },
    { email: "hausdame@hotel.test", name: "Ingrid Hausmann", role: "room_attendant", section: "1A" },
    { email: "lucia@hotel.test", name: "Lucia Ferrari", role: "room_attendant", section: "1B" },
    { email: "elena@hotel.test", name: "Elena Popescu", role: "room_attendant", section: "2B" },
    { email: "fatima@hotel.test", name: "Fatima Benali", role: "room_attendant", section: "3B" },
    { email: "joanna@hotel.test", name: "Joanna Kowalska", role: "room_attendant", section: "4A" },
    { email: "sena@hotel.test", name: "Sena Demir", role: "room_attendant", section: "4B" },
    { email: "grace@hotel.test", name: "Grace Okafor", role: "room_attendant", section: "5A" },
    { email: "supervisor@hotel.test", name: "Sofia Marchetti", role: "supervisor" },
    // Two more supervisor logins, added for the duty-manager floor-assignment
    // screen — that feature needs several real supervisor accounts to assign
    // floors to and show a meaningful "who covers what" overview; it does not
    // change what any supervisor can see (see the duty-manager-screen prompt).
    { email: "supervisor2@hotel.test", name: "Lukas Hoffmann", role: "supervisor" },
    { email: "supervisor3@hotel.test", name: "Amara Diallo", role: "supervisor" },
    { email: "frontoffice@hotel.test", name: "Felix Ott", role: "front_office" },
    { email: "concierge@hotel.test", name: "Claire Dubois", role: "concierge" },
    { email: "engineering@hotel.test", name: "Erik Weber", role: "engineering" },
    { email: "houseman@hotel.test", name: "Hans Bauer", role: "houseman" },
    { email: "manager@hotel.test", name: "Diana Maier", role: "duty_manager" },
    // System account backing the guest-facing test screen (src/app/guest/305)
    // — attributes guest-submitted notes/defects, never a real login.
    // role: "guest" is deliberately outside the ROLES enum (see src/lib/domain.ts)
    // so it never appears in a role-filtered staff picker; GET /api/auth/dev-login
    // filters it out of the quick-login list for the same reason.
    // Room number is env-overridable per deployment (see guestServer.ts) —
    // read directly here rather than importing that file, which pulls in
    // the Next.js prisma singleton these standalone scripts don't use.
    {
      email: GUEST_SYSTEM_EMAIL,
      name: `Guest (Room ${process.env.GUEST_ROOM_NUMBER?.trim() || "310"})`,
      role: "guest",
    },
  ];
}
