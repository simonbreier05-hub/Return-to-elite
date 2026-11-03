"use client";

import Link from "next/link";
import { Banner } from "@/components/ui";
import { useLocale } from "@/lib/i18n/LocaleContext";

/** Stand des Arbeitstags laut Server (`hubDay`): gibt es für heute einen Tagesplan aus dem Planungshub? */
export interface HubState { date: string; ready: boolean }

/**
 * Hinweis statt Tagesdaten: Die App arbeitet nur mit dem, was im Planungshub für heute eingelesen wurde.
 * Supervisor/Duty Manager bekommen den Weg dorthin, Zimmermädchen den Hinweis, dass ihre Zimmer nach der Planung kommen.
 */
export default function HubMissingNotice({ hub, planner, glass }: { hub: HubState | null | undefined; planner: boolean; glass?: boolean }) {
  const { t, intl } = useLocale();
  if (!hub || hub.ready) return null;
  const date = new Date(`${hub.date}T12:00:00Z`).toLocaleDateString(intl, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
  if (glass) {
    // Glas-Variante (D4): gleicher Text und gleicher Link, Glas-Banner statt heller Karte.
    return (
      <div role="status" className="flex flex-col gap-3">
        <Banner tone="warning" title={t("hubDay.missingTitle", { date })} detail={planner ? t("hubDay.missingPlanner") : t("hubDay.missingAttendant")} />
        {planner && (
          <Link href="/planung" className="press text-body-18 glass inline-flex min-h-(--size-touch-min) items-center self-start rounded-(--glass-radius-md) px-6 py-2 text-text-primary focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-accent-default">
            {t("hubDay.toHub")}
          </Link>
        )}
      </div>
    );
  }
  return (
    <div role="status" className="mb-4 rounded-xl border border-gold-line/60 bg-parchment/70 p-4 text-sm text-graphite">
      <p className="font-medium">{t("hubDay.missingTitle", { date })}</p>
      <p className="mt-1 text-graphite/75">{planner ? t("hubDay.missingPlanner") : t("hubDay.missingAttendant")}</p>
      {planner && (
        <Link href="/planung" className="mt-3 inline-flex min-h-11 items-center rounded-full border border-gold-line px-5 font-medium hover:bg-gold-line/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-line">
          {t("hubDay.toHub")}
        </Link>
      )}
    </div>
  );
}
