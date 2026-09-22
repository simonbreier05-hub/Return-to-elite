import AppShell from "@/components/AppShell";
import { requirePage } from "@/lib/pageGuard";
import SettingsView from "./view";

export default async function SettingsPage() {
  // duty_manager passes every role check, so this is the admin-only page.
  const session = await requirePage(["duty_manager"]);
  // Only entry point today is the supervisor view; switch to roleHome(session.role)
  // once other dashboards link here too.
  return (
    <AppShell title="nav.settings" userName={session.name} role={session.role} backHref="/supervisor">
      <SettingsView />
    </AppShell>
  );
}
