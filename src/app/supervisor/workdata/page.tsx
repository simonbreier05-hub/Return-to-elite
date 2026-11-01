import AppShell from "@/components/AppShell";
import { requirePage } from "@/lib/pageGuard";
import WorkDataView from "./view";

/** H3: Arbeitsdaten je Housekeeper (nur Supervisor/Duty Manager, eine Person auf einmal). */
export default async function WorkDataPage() {
  const session = await requirePage(["supervisor"]);
  return (
    <AppShell title="nav.workdata" userName={session.name} role={session.role} backHref="/supervisor">
      <WorkDataView />
    </AppShell>
  );
}
