import AppShell from "@/components/AppShell";
import { requirePage } from "@/lib/pageGuard";
import ServiceOverview from "@/components/lists/ServiceOverview";

/** „Zimmer und Service heute“ — welche Zimmer zu reinigen sind und welches welchen Service braucht (Supervisor: eigene Etagen, Duty Manager: alle). */
export default async function ServicePage() {
  const session = await requirePage(["supervisor"]);
  return (
    <AppShell title="service.title" userName={session.name} role={session.role} backHref="/supervisor">
      <div className="animate-rise">
        <ServiceOverview />
      </div>
    </AppShell>
  );
}
