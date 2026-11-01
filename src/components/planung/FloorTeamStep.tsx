"use client";

import { useLocale } from "@/lib/i18n/LocaleContext";
import { FLOOR_ORDER } from "@/lib/planung/model";
import type { FloorKpi, FloorWarning, Suggestion, TeamRole } from "@/lib/planung/floorTeam";
import type { FloorPerson, FloorTeamState } from "@/lib/planung/floorTeamData";
import type { TKey } from "@/lib/i18n/translations";

const ROLES: TeamRole[] = ["SUP", "HK", "HM"];
const ROLE_ICON: Record<TeamRole, string> = { SUP: "◆", HK: "●", HM: "▲" };
const TONE_ICON = { ok: "✓", high: "▲", low: "▼", none: "✕" } as const;
const TONE_CLASS = { ok: "border-status-clean/50 text-status-clean", high: "border-brass-light text-brass-ink", low: "border-line-2 text-pl-muted", none: "border-brass-light text-brass-ink" } as const;
const DRAG_TYPE = "text/x-stayclean-person";

export interface FloorTeamProps {
  state: FloorTeamState | null;
  loading: boolean;
  assign: Record<string, number[]>;
  active: string | null;
  open: Suggestion[];
  kpis: Record<number, FloorKpi>;
  warnings: FloorWarning[];
  onTapPerson: (id: string) => void;
  onTapFloor: (floor: number) => void;
  onRemove: (id: string, floor: number) => void;
  onDrop: (id: string, floor: number) => void;
  onAcceptAll: () => void;
  onAccept: (s: Suggestion) => void;
  onDismiss: (s: Suggestion) => void;
  onDone: () => void;
}

/**
 * Schritt 3 „Etagenzuweisung" (H1): Personal-Leiste (mobil oben, waagrecht scrollbar; ab lg feste Spalte links) und
 * je Etage eine Karte mit Kopf (Etage, Zimmer, Credits, Abreisen/Bleiber, Kennzahl) und drei Bereichen.
 * Zuteilen: Person antippen → Etage(n) antippen → Weiter. Desktop zusätzlich Drag-and-Drop. Vorschläge sind gedeckte
 * Messing-Chips mit Grund; „Alle Vorschläge übernehmen" erledigt den Normalfall in einem Tap.
 */
export default function FloorTeamStep(p: FloorTeamProps) {
  const { t } = useLocale();
  if (!p.state) return <p className="mt-3 text-sm text-pl-muted">{p.loading ? t("planungTool.ftLoading") : t("planungTool.noData")}</p>;
  const { people, loads } = p.state;
  const byId = new Map(people.map((x) => [x.id, x]));
  const activePerson = p.active ? byId.get(p.active) : undefined;
  const label = (x: FloorPerson) => (x.role === "HK" && x.level ? `${x.name} · ${t("planungTool.levelN", { n: x.level })}` : x.name);

  const personChip = (x: FloorPerson) => {
    const floors = p.assign[x.id] ?? [];
    const isActive = p.active === x.id;
    return (
      <li key={x.id} className="shrink-0">
        <button type="button" draggable onDragStart={(e) => { e.dataTransfer.setData(DRAG_TYPE, x.id); e.dataTransfer.effectAllowed = "copy"; }}
          onClick={() => p.onTapPerson(x.id)} aria-pressed={isActive}
          aria-label={`${label(x)} — ${floors.length ? t("planungTool.ftOnFloors", { list: floors.join(", ") }) : t("planungTool.floorNone")}`}
          className={`inline-flex min-h-11 w-full items-center gap-2 rounded-full border px-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-light ${isActive ? "border-brass-light bg-night-800 font-semibold" : "border-line-1 hover:border-line-2"} ${floors.length && !isActive ? "opacity-60" : ""}`}>
          <span aria-hidden className="text-xs text-brass-ink">{ROLE_ICON[x.role]}</span>
          <span className="min-w-0 flex-1 truncate">{label(x)}</span>
          {floors.length > 0 && <span aria-hidden className="text-xs text-pl-muted">{floors.join("·")}</span>}
        </button>
      </li>
    );
  };

  const warnText = (w: FloorWarning) => t(`planungTool.ftW_${w.code}` as TKey, { floor: w.floor ?? "", name: w.userId ? byId.get(w.userId)?.name ?? "" : "" });
  const personWarnings = p.warnings.filter((w) => !w.floor);

  return (
    <div className="mt-3">
      <p className="pl-rise mb-3 max-w-md text-[15px] text-pl-muted" style={{ ["--i" as string]: 1 }}>{t("planungTool.ftIntro")}</p>

      {p.open.length > 0 && (
        <div className="pl-rise mb-3 flex flex-wrap items-center gap-2 rounded-[18px] border border-dashed border-brass-light/60 bg-night-600 p-3" style={{ ["--i" as string]: 2 }}>
          <span className="flex-1 text-sm"><span aria-hidden>✦ </span>{t("planungTool.ftSuggestCount", { n: p.open.length })}</span>
          <button type="button" onClick={p.onAcceptAll} className="min-h-11 rounded-full bg-btn px-5 text-sm font-semibold text-btn-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-light">
            {t("planungTool.ftAcceptAll")}
          </button>
        </div>
      )}

      <div className="lg:grid lg:grid-cols-[10rem_minmax(0,1fr)] lg:gap-4">
        {/* Personal-Leiste: mobil waagrecht scrollbar (einziger horizontaler Scroll), ab lg feste Spalte */}
        <nav aria-label={t("planungTool.ftPeople")} className="-mx-4 mb-3 overflow-x-auto px-4 pb-1 lg:mx-0 lg:mb-0 lg:overflow-visible lg:px-0">
          <div className="flex gap-4 lg:sticky lg:top-4 lg:flex-col lg:gap-3">
            {ROLES.map((role) => {
              const list = people.filter((x) => x.role === role);
              if (!list.length) return null;
              return (
                <section key={role} className="shrink-0">
                  <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[1.5px] text-pl-muted"><span aria-hidden>{ROLE_ICON[role]} </span>{t(`planungTool.ftRole${role}` as TKey)}</h3>
                  <ul className="flex gap-2 lg:flex-col">{list.map(personChip)}</ul>
                </section>
              );
            })}
          </div>
        </nav>

        <div>
          <p role="status" className="mb-2 min-h-5 text-sm text-brass-ink">
            {activePerson ? <>{t("planungTool.ftPickHint", { name: activePerson.name })} <button type="button" onClick={p.onDone} className="ml-1 min-h-11 rounded-full px-2 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-light">{t("planungTool.ftDone")}</button></> : ""}
          </p>
          <ul className="space-y-2.5">
            {FLOOR_ORDER.map((f, row) => {
              const l = loads.find((x) => x.floor === f) ?? { floor: f, rooms: 0, credits: 0, departures: 0, stayovers: 0, demanding: 0 };
              const k = p.kpis[f];
              const on = people.filter((x) => (p.assign[x.id] ?? []).includes(f));
              const sugg = p.open.filter((s) => s.floor === f);
              const fw = p.warnings.filter((w) => w.floor === f);
              const activeOn = activePerson ? on.includes(activePerson) : false;
              return (
                <li key={f} className="pl-rise rounded-[18px] border border-line-1 bg-night-600 p-3" style={{ ["--i" as string]: row + 3 }}
                  onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_TYPE)) e.preventDefault(); }}
                  onDrop={(e) => { const id = e.dataTransfer.getData(DRAG_TYPE); if (id) { e.preventDefault(); p.onDrop(id, f); } }}>
                  <button type="button" disabled={!activePerson} onClick={() => p.onTapFloor(f)} aria-pressed={activePerson ? activeOn : undefined}
                    aria-label={activePerson ? t(activeOn ? "planungTool.ftTapRemove" : "planungTool.ftTapAdd", { name: activePerson.name, floor: f }) : t("planungTool.floorN", { n: f })}
                    className={`flex w-full min-h-11 items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-light ${activePerson ? "cursor-pointer hover:bg-night-800" : "cursor-default"} ${activeOn ? "ring-1 ring-brass-light" : ""}`}>
                    <span aria-hidden className="w-8 text-center font-serif text-4xl font-semibold leading-none">{f}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{t("planungTool.floorN", { n: f })} · <span className="font-normal text-pl-muted">{t("planungTool.ftRoomsCredits", { rooms: l.rooms, credits: l.credits })}</span></span>
                      <span className="block text-xs text-pl-muted">{t("planungTool.ftDepStay", { dep: l.departures, stay: l.stayovers })}</span>
                    </span>
                    {k && l.rooms > 0 && (
                      <span className={`shrink-0 rounded-full border px-2 py-1 text-xs ${TONE_CLASS[k.tone]}`}>
                        <span aria-hidden>{TONE_ICON[k.tone]} </span>
                        {k.roomsPerHk === null ? t("planungTool.ftToneNone") : t("planungTool.ftPerHk", { n: k.roomsPerHk, lo: k.targetLo, hi: k.targetHi })}
                        <span className="sr-only"> — {t(`planungTool.ftTone_${k.tone}` as TKey)}</span>
                      </span>
                    )}
                  </button>

                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {ROLES.map((role) => {
                      const here = on.filter((x) => x.role === role);
                      const sr = sugg.filter((s) => byId.get(s.userId)?.role === role);
                      return (
                        <div key={role} className="min-w-0">
                          <div className="mb-1 text-[11px] uppercase tracking-[1.5px] text-pl-muted"><span aria-hidden>{ROLE_ICON[role]} </span>{t(`planungTool.ftRole${role}` as TKey)}</div>
                          <ul className="flex flex-wrap gap-1.5">
                            {here.map((x) => (
                              <li key={x.id}>
                                <button type="button" onClick={() => p.onRemove(x.id, f)} aria-label={t("planungTool.ftRemove", { name: x.name, floor: f })}
                                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-2 bg-night-800 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-light">
                                  {label(x)} <span aria-hidden className="text-pl-muted">×</span>
                                </button>
                              </li>
                            ))}
                            {sr.map((s) => {
                              const x = byId.get(s.userId)!;
                              const why = t("planungTool.ftReason", { days: s.reason.days, of: s.reason.of, floor: f });
                              return (
                                <li key={`s-${s.userId}`} className="inline-flex flex-wrap items-center gap-1 rounded-2xl border border-dashed border-brass-light/60 bg-brass-light/10 p-1 pl-3 text-sm text-brass-ink">
                                  <span><span aria-hidden>✦ </span>{t("planungTool.ftSuggestion")}: {label(x)}<span className="block text-xs">{why}</span></span>
                                  <button type="button" onClick={() => p.onAccept(s)} aria-label={`${t("planungTool.ftAccept")}: ${x.name}, ${why}`} className="min-h-11 min-w-11 rounded-full px-2 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-light">✓</button>
                                  <button type="button" onClick={() => p.onDismiss(s)} aria-label={`${t("planungTool.ftDismiss")}: ${x.name}`} className="min-h-11 min-w-11 rounded-full px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-light">✕</button>
                                </li>
                              );
                            })}
                            {!here.length && !sr.length && <li className="py-2 text-xs text-pl-muted">{t("planungTool.ftNoOne")}</li>}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                  {l.rooms === 0 && <p className="mt-1 text-xs text-pl-muted">{t("planungTool.ftEmptyFloor")}</p>}
                  {fw.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-xs text-brass-ink">{fw.map((w, i) => <li key={i}><span aria-hidden>⚠ </span>{warnText(w)}</li>)}</ul>
                  )}
                </li>
              );
            })}
          </ul>
          {personWarnings.length > 0 && (
            <ul className="mt-3 space-y-0.5 text-sm text-brass-ink">{personWarnings.map((w, i) => <li key={i}><span aria-hidden>⚠ </span>{warnText(w)}</li>)}</ul>
          )}
        </div>
      </div>
    </div>
  );
}
