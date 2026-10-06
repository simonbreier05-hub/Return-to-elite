"use client";

import { useLocale } from "@/lib/i18n/LocaleContext";
import { floorStats, FLOOR_ORDER, type HouseData, type HouseSupervisor } from "@/lib/planung/model";
import { nextSupervisor } from "@/lib/planung/team";
import FloorOccupancy from "./FloorOccupancy";

export interface FloorSup { id: string; name: string; badge: HouseSupervisor }

const TONE = { 1: "bg-badge-1", 2: "bg-badge-2", 3: "bg-badge-3" } as const;
const Badge = ({ b, size = "h-9 w-9" }: { b: HouseSupervisor; size?: string }) => (
  <span aria-hidden className={`flex ${size} shrink-0 items-center justify-center rounded-full text-sm font-bold text-ink ${TONE[b.tone]}`}>{b.letter}</span>
);

/**
 * Schritt „Etagen": je Etage eine Zeile mit Zimmerzahl, Belegung und Supervisor. Desktop: Chips zur Auswahl.
 * Mobil: die ganze Zeile ist ein Button — Antippen wechselt reihum zum nächsten Supervisor.
 */
export default function FloorStep({
  house, sups, assign, onPick, animateKey,
}: { house: HouseData; sups: FloorSup[]; assign: Record<number, string | null>; onPick: (floor: number, id: string) => void; animateKey: number }) {
  const { t } = useLocale();
  const ids = sups.map((s) => s.id);
  const byId = new Map(sups.map((s) => [s.id, s]));
  return (
    <div className="mt-3">
      <p className="pl-rise mb-4 max-w-md text-[15px] text-pl-muted" style={{ ["--i" as string]: 1 }}>{t("planungTool.floorsIntro")}</p>
      <ul className="space-y-2.5">
        {FLOOR_ORDER.map((f, row) => {
          const fl = house.floors.find((x) => x.floor === f);
          const stats = fl ? floorStats(fl) : null;
          const cur = assign[f] ? byId.get(assign[f]!) : undefined;
          const pickLabel = t("planungTool.floorPick", { n: f });
          return (
            <li key={f} className="pl-rise rounded-[18px] border border-line-1 bg-night-600 p-3" style={{ ["--i" as string]: row + 2 }}>
              <div className="flex items-center gap-3">
                <div aria-hidden className="w-8 text-center font-serif text-4xl font-semibold leading-none">{f}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{t("planungTool.floorN", { n: f })} · <span className="font-normal text-pl-muted">{t("planungTool.roomsN", { n: stats?.total ?? 0 })}</span></div>
                  {stats && <FloorOccupancy stats={stats} hasData={house.hasData} index={row} animateKey={animateKey}
                    textOccupied={t("planungTool.occupiedOf", { n: stats.occupied, total: stats.total })} textNoData={t("planungTool.noData")} />}
                </div>
                <div className="hidden md:block">{cur ? <Badge b={cur.badge} /> : <span aria-hidden className="flex h-9 w-9 rounded-full border-[1.5px] border-dashed border-line-2" />}</div>
              </div>
              {/* Desktop: Chips */}
              <div role="group" aria-label={pickLabel} className="mt-2.5 hidden flex-wrap gap-2 md:flex">
                {sups.map((s) => (
                  <button key={s.id} type="button" aria-pressed={assign[f] === s.id} onClick={() => onPick(f, s.id)}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-full border py-1 pl-1 pr-4 text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-light ${assign[f] === s.id ? "border-brass-light bg-night-800 font-semibold" : "border-line-1 hover:border-line-2"}`}>
                    <Badge b={s.badge} size="h-8 w-8" />{s.name}
                  </button>
                ))}
              </div>
              {/* Mobil: Antippen wechselt reihum */}
              <button type="button" onClick={() => { const n = nextSupervisor(assign[f], ids); if (n) onPick(f, n); }}
                aria-label={`${pickLabel}: ${cur ? cur.name : t("planungTool.floorNone")}. ${t("planungTool.tapToChange")}`}
                className="mt-2.5 flex min-h-14 w-full items-center gap-3 rounded-full border border-line-2 bg-night-800 px-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-light md:hidden">
                {cur ? <Badge b={cur.badge} size="h-10 w-10" /> : <span aria-hidden className="flex h-10 w-10 shrink-0 rounded-full border-[1.5px] border-dashed border-line-2" />}
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{cur ? cur.name : t("planungTool.floorNone")}</span><span className="block text-xs text-pl-muted">{t("planungTool.tapToChange")}</span></span>
                <span aria-hidden className="text-pl-muted">⇄</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
