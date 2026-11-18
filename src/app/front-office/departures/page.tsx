import AppShell from "@/components/AppShell";
import { requirePage } from "@/lib/pageGuard";
import FrontOfficeView from "../view";

/** Abreisen als eigener Menüpunkt (Simon-Feedback 18.11.2026): Mehrfach-Check-out, Zurücknehmen, Late Check-out. */
export default async function FrontOfficeDeparturesPage() {
  const session = await requirePage(["front_office"]);
  return (
    <AppShell title="nav.departures" userName={session.name} role={session.role} legacy={false}>
      <FrontOfficeView mode="departures" />
    </AppShell>
  );
}
