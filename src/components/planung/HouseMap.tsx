"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { floorStats, houseTotals, orderedFloors, TILE_LABEL_DE, waveDelay, type HouseData, type HouseTile, type TileKind } from "@/lib/planung/model";
import FloorOccupancy from "./FloorOccupancy";

const TILE_CLASS: Record<TileKind, string> = {
  DEPARTURE: "bg-tile-departure",
  TURN: "bg-tile-turn",
  STAYOVER: "bg-tile-stayover",
  ARRIVAL: "bg-transparent ring-[1.5px] ring-inset ring-tile-arrival",
  EMPTY: "bg-tile-empty",
};
const BADGE_TONE = { 1: "bg-badge-1", 2: "bg-badge-2", 3: "bg-badge-3" } as const;

/**
 * Haus-Ansicht: je Etage eine Zeile (5 oben, 1 unten) mit Kachelleiste (eine Kachel je Zimmer), Auslastungsbalken und
 * Supervisor-Badge. Die Kachelleiste ist KEIN Grundriss. Keine Gastdaten. Textalternative als versteckte Tabelle.
 */
export default function HouseMap({
  house, animateKey = 0, highlight, beamKey = 0, dateLabel,
}: { house: HouseData; animateKey?: number; highlight?: Set<string>; beamKey?: number; dateLabel: string }) {
  const { t } = useLocale();
  const [sel, setSel] = useState<{ floor: number; tile: HouseTile } | null>(null);
  const floors = orderedFloors(house.floors);
  const totals = houseTotals(house.floors);
  const kpi = (n: number) => (house.hasData ? n : "–");

  // Ein einziger Tab-Stopp für alle Kacheln (Pfeiltasten wechseln das Zimmer) — sonst wären es 145 Tab-Stopps vor dem Rest der Seite.
  const grid = useRef<HTMLDivElement>(null);
  const [roving, setRoving] = useState<string | null>(null);
  const firstNo = floors[0]?.tiles[0]?.number ?? null;
  const activeNo = roving && floors.some((f) => f.tiles.some((x) => x.number === roving)) ? roving : firstNo;
  const onTileKey = (e: KeyboardEvent, row: number, i: number) => {
    const dRow = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    const dCol = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dRow && !dCol) return;
    e.preventDefault();
    const r = Math.min(Math.max(row + dRow, 0), floors.length - 1);
    const tiles = floors[r].tiles;
    const next = tiles[Math.min(Math.max((dRow ? i : i + dCol), 0), tiles.length - 1)];
    if (!next) return;
    setRoving(next.number);
    requestAnimationFrame(() => grid.current?.querySelector<HTMLButtonElement>(`[data-room="${next.number}"]`)?.focus());
  };

  return (
    <section aria-labelledby="house-title" className="relative">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <div className="text-[12px] font-medium uppercase tracking-[2px] text-brass-light">StayClean · {dateLabel}</div>
          <h2 id="house-title" className="font-serif text-4xl font-semibold leading-none sm:text-5xl">{t("planungTool.houseToday")}</h2>
        </div>
        <dl className="flex gap-6 text-center">
          {([["kpiOccupied", totals.occupied, false], ["kpiDepartures", totals.departures, true], ["kpiArrivals", totals.arrivals, false]] as const).map(([k, n, accent]) => (
            <div key={k}>
              <dd className={`font-serif text-4xl font-semibold leading-none ${accent ? "text-brass-light" : ""}`}>{kpi(n)}</dd>
              <dt className="mt-1 text-xs text-pl-muted">{t(`planungTool.${k}` as "planungTool.kpiOccupied")}</dt>
            </div>
          ))}
        </dl>
      </div>

      <div className="relative overflow-hidden rounded-[22px] border border-line-1 bg-night-800 p-3 sm:p-5">
        {beamKey > 0 && (
          <div key={beamKey} aria-hidden className="pl-beam pointer-events-none absolute inset-x-0 top-0 z-10 h-10 bg-gradient-to-b from-transparent via-brass-light/35 to-transparent" />
        )}
        <div className="space-y-2.5" ref={grid}>
          {floors.map((f, row) => {
            const stats = floorStats(f);
            const sup = house.supervisors[f.floor];
            return (
              <div key={f.floor} className="flex items-center gap-3 sm:gap-4">
                <div className="w-6 shrink-0 text-center font-serif text-3xl font-semibold leading-none sm:w-8 sm:text-4xl" aria-hidden>{f.floor}</div>
                <div className="grid min-w-0 flex-1 gap-[3px]" style={{ gridTemplateColumns: "repeat(33, minmax(0, 1fr))" }}>
                  {f.tiles.map((tile, i) => (
                    <button
                      key={`${animateKey}-${tile.number}`}
                      type="button"
                      data-room={tile.number}
                      tabIndex={tile.number === activeNo ? 0 : -1}
                      onKeyDown={(e) => onTileKey(e, row, i)}
                      onFocus={() => setRoving(tile.number)}
                      onClick={() => setSel(sel?.tile.number === tile.number ? null : { floor: f.floor, tile })}
                      aria-pressed={sel?.tile.number === tile.number}
                      aria-label={`${tile.number}, ${TILE_LABEL_DE[tile.kind]}`}
                      className={`relative aspect-square rounded-[3px] after:absolute after:-inset-1 after:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass-light ${TILE_CLASS[tile.kind]} ${animateKey > 0 && house.hasData ? "pl-tile" : ""} ${highlight?.has(tile.number) ? "pl-flash" : ""}`}
                      style={{ ["--d" as string]: waveDelay(row, i) }}
                    />
                  ))}
                </div>
                <FloorOccupancy stats={stats} hasData={house.hasData} index={row} animateKey={animateKey}
                  textOccupied={t("planungTool.occupiedOf", { n: stats.occupied, total: stats.total })} textNoData={t("planungTool.noData")} />
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${sup ? `${BADGE_TONE[sup.tone]} text-ink` : "border-[1.5px] border-dashed border-line-2"}`}
                  role="img" aria-label={sup ? t("planungTool.supervisorOf", { letter: sup.letter }) : t("planungTool.noSupervisor")}
                >
                  {sup && <span key={sup.letter} className="pl-pop">{sup.letter}</span>}
                </div>
              </div>
            );
          })}
        </div>

        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-line-1 pt-3 text-xs text-pl-muted" aria-label="Legende">
          {(["DEPARTURE", "TURN", "STAYOVER", "ARRIVAL", "EMPTY"] as const).map((k) => (
            <li key={k} className="flex items-center gap-1.5">
              <span aria-hidden className={`inline-block h-3 w-3 rounded-[3px] ${TILE_CLASS[k]}`} />
              {t(`planungTool.legend${k === "TURN" ? "Turn" : k[0] + k.slice(1).toLowerCase()}` as "planungTool.legendTurn")}
            </li>
          ))}
        </ul>
      </div>

      {sel && (
        <p role="status" className="mt-3 rounded-full border border-line-1 bg-night-600 px-4 py-2 text-sm">
          <strong>{sel.tile.number}</strong> · {t("planungTool.colFloor")} {sel.floor} · {TILE_LABEL_DE[sel.tile.kind]}
          {sel.tile.vip ? " · VIP" : ""}{sel.tile.laundry ? " · Wäschewechsel" : ""}{sel.tile.eta ? ` · ${sel.tile.eta}` : ""}
          {sel.tile.openTraces ? ` · ${sel.tile.openTraces} Traces` : ""}
        </p>
      )}

      {/* Textalternative: dieselben Zahlen als Tabelle (nur für Screenreader sichtbar) */}
      <table className="sr-only">
        <caption>{t("planungTool.houseTableCaption")}</caption>
        <thead><tr><th>{t("planungTool.colFloor")}</th><th>{t("planungTool.colOccupied")}</th><th>{t("planungTool.colDepartures")}</th><th>{t("planungTool.colStayovers")}</th></tr></thead>
        <tbody>
          {floors.map((f) => { const s = floorStats(f); return (
            <tr key={f.floor}><th scope="row">{f.floor}</th><td>{house.hasData ? t("planungTool.occupiedOf", { n: s.occupied, total: s.total }) : t("planungTool.noData")}</td><td>{house.hasData ? s.departures : "–"}</td><td>{house.hasData ? s.stayovers : "–"}</td></tr>
          ); })}
        </tbody>
      </table>
    </section>
  );
}
