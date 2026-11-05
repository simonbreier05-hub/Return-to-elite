import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AppShell from "@/components/AppShell";
import type { TKey } from "@/lib/i18n/translations";
import { styleguideEnabled } from "@/lib/ui/styleguideAccess";
import RolesDemo, { type DemoRole } from "./RolesDemo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Rollen-Demo · StayClean", robots: { index: false, follow: false } };

const ROLES: Record<DemoRole, { title: TKey; user: string; role: string }> = {
  engineering: { title: "roleHub.engSubtitle", user: "Jonas Meier", role: "engineering" },
  houseman: { title: "roleHub.hmSubtitle", user: "Karl Winter", role: "houseman" },
  front_office: { title: "roleHub.foSubtitle", user: "Anna Sommer", role: "front_office" },
  concierge: { title: "roleHub.ccSubtitle", user: "Lea Brandt", role: "concierge" },
};

/**
 * Demo der Rollen-Hubs (D5) zum Vergleich mit Figma (`36:1351`, `36:1589`, `36:1839`, `36:2108`, `41:2654`).
 * Nur erfundene Testdaten, keine Anmeldung; sichtbar wie der Styleguide (Entwicklung oder ENABLE_STYLEGUIDE=1).
 * `?role=engineering|houseman|front_office|concierge`, `?new=1` Fenster „Neu“, `?detail=0` ohne Auswahl, `?state=loading|error|empty`, `?confirm=1` Bestätigungsdialog.
 */
export default async function RolesDemoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!styleguideEnabled({ NODE_ENV: process.env.NODE_ENV, ENABLE_STYLEGUIDE: process.env.ENABLE_STYLEGUIDE })) notFound();
  const sp = await searchParams;
  const role = (sp.role && sp.role in ROLES ? sp.role : "engineering") as DemoRole;
  const r = ROLES[role];
  return (
    <AppShell title={r.title} userName={r.user} role={r.role} legacy={false} backHref={sp.sub ? "/dev/roles" : undefined}>
      <RolesDemo role={role} detail={sp.detail !== "0"} state={sp.state ?? null} confirm={sp.confirm === "1"} newOpen={sp.new === "1"} />
    </AppShell>
  );
}
