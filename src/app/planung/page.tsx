import { requirePage } from "@/lib/pageGuard";
import { getHouseData } from "@/lib/planung/house";
import PlanungClient from "@/components/planung/PlanungClient";
import { NotifyRoot } from "@/components/notify/NotifyRoot";

export const dynamic = "force-dynamic";

/** Planungstool: geführter Ablauf Listen → Team → Etagen → Plan. Duty Manager (Supervisor als Ersatz), nicht für Housekeeper. */
export default async function PlanungPage() {
  const session = await requirePage(["supervisor", "duty_manager"]);
  // Meldungs-Zentrum (Glocke, Pop-up, Ton) auch hier — das Planungstool hat einen eigenen Rahmen ohne AppShell.
  return (
    <NotifyRoot role={session.role} withChat>
      <PlanungClient initialHouse={await getHouseData()} />
    </NotifyRoot>
  );
}
