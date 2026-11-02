import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import { styleguideEnabled } from "@/lib/ui/styleguideAccess";
import ShellDemo from "./ShellDemo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Rahmen-Demo · StayClean", robots: { index: false, follow: false } };

/**
 * Demo des App-Rahmens (D1) zum Vergleich mit Figma (`22:67`, `22:449`, `41:1899`, `41:2140`, `36:2364`).
 * Nur Testdaten, keine Anmeldung; sichtbar wie der Styleguide (Entwicklung oder ENABLE_STYLEGUIDE=1).
 * `?role=` wählt das Menü, `?detail=0` schließt das Detail, `?dialog=1` öffnet den Dialog.
 */
export default async function ShellDemoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!styleguideEnabled({ NODE_ENV: process.env.NODE_ENV, ENABLE_STYLEGUIDE: process.env.ENABLE_STYLEGUIDE })) notFound();
  const sp = await searchParams;
  const role = sp.role ?? "room_attendant";
  return (
    <AppShell title="nav.myRooms" userName="Ingrid Neumann" role={role} subtitle="Deine Zimmer für heute." legacy={false} backHref={sp.sub ? "/dev/shell" : undefined}>
      <ShellDemo initialDetail={sp.detail !== "0"} initialDialog={sp.dialog === "1"} />
    </AppShell>
  );
}
