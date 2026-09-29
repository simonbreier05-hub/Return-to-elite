import AppShell from "@/components/AppShell";
import { requirePage } from "@/lib/pageGuard";
import GuestAccessView from "./view";

/**
 * QR/NFC generator (Prompt G2 Teil 2): per-room access codes for the
 * NFC tag/QR code physically at the room, with a printable sheet and a
 * regenerate action for a lost tag. duty_manager passes every role check
 * (src/lib/rbac.ts), so this reaches both supervisor and admin per the brief.
 */
export default async function GuestAccessPage() {
  const session = await requirePage(["supervisor"]);
  return (
    <AppShell title="nav.guestAccess" userName={session.name} role={session.role} backHref="/supervisor">
      <GuestAccessView />
    </AppShell>
  );
}
