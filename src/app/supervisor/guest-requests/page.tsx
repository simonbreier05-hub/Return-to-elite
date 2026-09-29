import AppShell from "@/components/AppShell";
import { requirePage } from "@/lib/pageGuard";
import GuestRequestsView from "./view";

/**
 * Prompt G2 Teil 4: "Supervisor kann Gästeanfragen einsehen, zuweisen, als
 * erledigt markieren". DND/clean-request/contact only — Mängel and
 * Freitext-Nachrichten already have their own real screens (Techniker-Hub,
 * room notes) and don't need a duplicate here.
 */
export default async function GuestRequestsPage() {
  const session = await requirePage(["supervisor"]);
  return (
    <AppShell title="nav.guestRequests" userName={session.name} role={session.role} backHref="/supervisor">
      <GuestRequestsView currentUserId={session.userId} />
    </AppShell>
  );
}
