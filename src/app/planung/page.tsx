import { requirePage } from "@/lib/pageGuard";
import { getHouseData } from "@/lib/planung/house";
import PlanungClient from "@/components/planung/PlanungClient";

export const dynamic = "force-dynamic";

/** Planungstool: geführter Ablauf Listen → Team → Etagen → Plan. Duty Manager (Supervisor als Ersatz), nicht für Housekeeper. */
export default async function PlanungPage() {
  await requirePage(["supervisor", "duty_manager"]);
  return <PlanungClient initialHouse={await getHouseData()} />;
}
