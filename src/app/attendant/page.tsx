import AppShell from "@/components/AppShell";
import { requirePage } from "@/lib/pageGuard";
import AttendantView from "./view";

export default async function AttendantPage() {
  const session = await requirePage(["room_attendant"]);
  return (
    <AppShell title="hkHub.subtitle" userName={session.name} role={session.role} legacy={false}>
      <AttendantView />
    </AppShell>
  );
}
