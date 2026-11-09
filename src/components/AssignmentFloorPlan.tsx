"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/components/api";
import { useSocket } from "@/components/useSocket";
import { useCoalescedRefetch } from "@/components/useCoalescedRefetch";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { errorText } from "@/lib/i18n/errorText";
import LiveListBoards from "@/components/LiveListBoards";
import HubMissingNotice, { type HubState } from "@/components/HubMissingNotice";
import { useBreakpoint } from "@/components/shell/useBreakpoint";
import Link from "next/link";
import { Banner, FilterChip, GlassCard, Glyph } from "@/components/ui";
import { cx, FOCUS_RING } from "@/components/ui/primitives";
import { GlassRedistribution } from "@/components/supervisor/GlassRedistribution";
import { TagesplanView } from "@/components/tagesplan/TagesplanView";
import { useTagesplanMeta } from "@/components/tagesplan/useTagesplanMeta";

interface DayInfo { date: string; today: string; actionableRoomIds: string[]; attendants: { id: string; name: string }[]; roster: { id: string; name: string; absent: boolean }[]; hub?: HubState }

/**
 * Die einzige Zuteilungsansicht (nur Supervisor/Duty Manager) — „Tagesplan“ (Plan-1, `TagesplanView`) im Design „Glas & Premium“:
 * Etagen-Zeilen mit Grundriss oder Liste je Zimmermädchen, Zwei-Tap-Zuteilung, Mehrfachauswahl, Ziehen zwischen Kräften.
 * Liest und schreibt dieselbe Wahrheit wie alle anderen Ansichten (Room.assignedToId); Änderungen melden die Betroffenen
 * über notifyReassignment (Server), und alle offenen Ansichten laden live nach.
 * Unter 640 px nur ein Hinweis (Entscheidung Simon: Tagesplanung nur am Tablet quer/Desktop).
 */
export default function AssignmentFloorPlan() {
  const { t } = useLocale();
  const bp = useBreakpoint();
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState<DayInfo | null>(null);
  const [version, setVersion] = useState(0);
  const load = useCallback(() => api<DayInfo>("/api/assignments/day").then(setDay).catch(() => {}), []);
  useEffect(() => { void load(); }, [load]);
  const soon = useCoalescedRefetch(() => { void load(); setVersion((v) => v + 1); }, 1200);
  useSocket({ "assignments:applied": () => soon(), "room:update": () => soon(), "dayplan:updated": () => soon() });

  const toggle = async (id: string, absent: boolean) => {
    setError(null);
    try { await api(`/api/housekeepers/${id}/absent`, { body: { absent } }); await load(); setVersion((v) => v + 1); }
    catch (e) { setError(errorText(e, t)); }
  };

  const attendants = useMemo(() => day?.attendants ?? [], [day]);
  const meta = useTagesplanMeta(day?.today ?? null, version);

  if (bp === "phone") {
    return (
      <div className="theme-glass flex flex-col gap-4">
        <Banner tone="info" icon="calendar-days" title={t("supHub.tabletOnlyTitle")} detail={t("supHub.tabletOnlyDetail")} />
        <Link href="/" className={cx("press glass text-body-18 inline-flex min-h-(--size-button-height) w-full items-center justify-center gap-3 rounded-(--glass-radius-md) px-8 text-text-primary", FOCUS_RING)}>
          <Glyph name="arrow-left" size={24} className="rtl:-scale-x-100" />
          {t("supHub.toOverview")}
        </Link>
      </div>
    );
  }
  if (!day || !bp) return null;
  return (
    <div className="theme-glass flex flex-col gap-4 sm:gap-6">
      <HubMissingNotice hub={day.hub} planner />
      <GlassRedistribution />
      <TagesplanView reloadToken={version} onShiftAttendants={attendants} meta={meta} date={day.today} />

      <GlassCard as="section" aria-labelledby="plan-present-title" className="flex flex-col gap-3">
        <h2 id="plan-present-title" className="text-title-22 text-text-primary">{t("planning.presentTitle")}</h2>
        <p className="text-body-16 text-text-muted">{t("planning.presentHint")}</p>
        <div className="flex flex-wrap gap-2">
          {day.roster.map((h) => (
            <FilterChip key={h.id} active={!h.absent} onClick={() => void toggle(h.id, !h.absent)} className="px-5!">
              <span className={h.absent ? "line-through" : undefined}>{h.name}</span>
              {h.absent ? ` · ${t("planning.presentOff")}` : ""}
            </FilterChip>
          ))}
        </div>
        {error && <p role="alert" className="text-body-16 text-status-danger-fg">{error}</p>}
      </GlassCard>

      {day.hub?.ready !== false && (
        <LiveListBoards date={day.today} />
      )}
    </div>
  );
}
