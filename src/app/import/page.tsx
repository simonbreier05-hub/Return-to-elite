import AppShell from "@/components/AppShell";
import { requirePage } from "@/lib/pageGuard";
import ImportView from "./view";

export default async function ImportPage() {
  const session = await requirePage(["supervisor", "duty_manager"]);
  return (
    <AppShell title="importPage.title" userName={session.name} role={session.role} backHref="/supervisor/planning">
      <ImportView />
    </AppShell>
  );
}
