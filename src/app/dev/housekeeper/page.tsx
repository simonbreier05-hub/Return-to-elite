import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import { styleguideEnabled } from "@/lib/ui/styleguideAccess";
import HousekeeperDemo from "./HousekeeperDemo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Housekeeper-Demo · StayClean", robots: { index: false, follow: false } };

/**
 * Demo des Housekeeper-Hubs (D2) zum Vergleich mit Figma (`22:67`, `22:449`, `30:465`, `41:1899`, `41:2140`).
 * Nur erfundene Testdaten, keine Anmeldung, keine API; sichtbar wie der Styleguide (Entwicklung oder ENABLE_STYLEGUIDE=1).
 * `?detail=0` startet ohne geöffnetes Zimmer, `?empty=1` zeigt den Leer-Zustand, `?done=1` „alles erledigt“.
 */
export default async function HousekeeperDemoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!styleguideEnabled({ NODE_ENV: process.env.NODE_ENV, ENABLE_STYLEGUIDE: process.env.ENABLE_STYLEGUIDE })) notFound();
  const sp = await searchParams;
  return (
    <AppShell title="hkHub.subtitle" userName="Ingrid Neumann" role="room_attendant" legacy={false} backHref={sp.sub ? "/dev/housekeeper" : undefined}>
      <HousekeeperDemo detail={sp.detail !== "0"} empty={sp.empty === "1"} allDone={sp.done === "1"} />
    </AppShell>
  );
}
