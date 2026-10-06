"use client";

import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TeamState } from "@/lib/planung/teamData";
import type { TeamMissing, TeamSelection, Verdict } from "@/lib/planung/team";
import CapacityBar from "./CapacityBar";

type Group = keyof TeamSelection;

/** Auswahl-Chip: Avatar mit Initiale, Name, optional eine zweite Zeile (Typ/Stufe, nur für berechtigte Rollen), Häkchen mit Pop. */
function Chip({ name, line, on, onToggle }: { name: string; line?: string; on: boolean; onToggle: () => void }) {
  return (
    <button type="button" aria-pressed={on} onClick={onToggle}
      className={`flex min-h-11 w-full items-center gap-3 rounded-full border py-1.5 pl-1.5 pr-3 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-light md:w-auto ${on ? "border-brass-light bg-night-800" : "border-line-1 hover:border-line-2"}`}>
      <span aria-hidden className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors duration-200 ${on ? "bg-brass-light text-btn-text" : "bg-line-1 text-pl-text"}`}>{name.trim().charAt(0).toUpperCase() || "?"}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{name}</span>
        {line && <span className="block truncate text-xs text-pl-muted">{line}</span>}
      </span>
      <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center">
        {on && <svg key="on" className="pl-pop h-5 w-5 text-brass-ink" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5l4 4 8-9" /></svg>}
      </span>
    </button>
  );
}

/**
 * Schritt „Team": drei Gruppen (Housekeeper, Supervisor, Hausmänner) als Chips, darunter Bedarf gegen Besetzung.
 * Mobil: Wischkarten (Scroll-Snap), eine je Gruppe. Typ/Stufe kommen nur vom Server, wenn die Rolle sie sehen darf.
 */
export default function TeamStep({
  state, sel, onToggle, verdict, missing, loading, previous,
}: { state: TeamState | null; sel: TeamSelection; onToggle: (g: Group, id: string) => void; verdict: Verdict; missing: TeamMissing[]; loading: boolean; previous: boolean }) {
  const { t } = useLocale();
  if (loading || !state) return <p className="mt-3 text-sm text-pl-muted" role="status">{loading ? t("planungTool.saving") : t("planungTool.noPlanYet")}</p>;
  if (!state.hasPlan) return <p className="mt-3 text-sm text-pl-muted" role="status">{t("planungTool.noPlanYet")}</p>;

  const groups: { key: Group; title: string; items: { id: string; name: string; line?: string }[] }[] = [
    { key: "hk", title: t("planungTool.groupHk"), items: state.members.hk.map((h) => ({ id: h.id, name: h.name, line: `${t(`planungTool.type${h.kind}` as "planungTool.typeVOLLZEIT")} · ${t("planungTool.levelN", { n: h.level })}` })) },
    { key: "sup", title: t("planungTool.groupSup"), items: state.members.sup.map((s) => ({ id: s.id, name: s.name })) },
    { key: "hm", title: t("planungTool.groupHm"), items: state.members.hm.map((m) => ({ id: m.id, name: m.name })) },
  ];
  const hint = missing.length === 2 ? t("planungTool.missingBoth") : missing[0] === "HK" ? t("planungTool.missingHk") : missing[0] === "SUP" ? t("planungTool.missingSup") : "";

  return (
    <div className="mt-3">
      <p className="pl-rise mb-4 max-w-md text-[15px] text-pl-muted" style={{ ["--i" as string]: 1 }}>{previous ? t("planungTool.teamPrev") : t("planungTool.teamIntro")}</p>
      <div role="group" data-swipe aria-label={t("planungTool.step2")} className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:block md:space-y-3 md:overflow-visible md:px-0">
        {groups.map((g, gi) => (
          <section key={g.key} aria-labelledby={`grp-${g.key}`} className="pl-rise max-h-[46vh] min-w-[86%] snap-center overflow-y-auto rounded-[18px] border border-line-1 bg-night-600 p-3 md:max-h-none md:min-w-0 md:overflow-visible" style={{ ["--i" as string]: gi + 2 }}>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 id={`grp-${g.key}`} className="text-xs font-medium uppercase tracking-[2px] text-pl-muted">{g.title}</h2>
              <span className="text-xs text-pl-muted">{t("planungTool.selectedN", { n: sel[g.key].length })}</span>
            </div>
            {g.items.length === 0 ? <p className="text-sm text-pl-muted">–</p> : (
              <div className="flex flex-col gap-2 md:flex-row md:flex-wrap">
                {g.items.map((m) => <Chip key={m.id} name={m.name} line={m.line} on={sel[g.key].includes(m.id)} onToggle={() => onToggle(g.key, m.id)} />)}
              </div>
            )}
          </section>
        ))}
      </div>
      <p className="mb-3 mt-1 text-center text-[11px] text-pl-muted md:hidden" aria-hidden>{t("planungTool.swipeHint")} →</p>
      <div className="pl-rise mt-3 rounded-[18px] border border-line-1 bg-night-600 p-4" style={{ ["--i" as string]: 5 }}>
        <CapacityBar need={verdict.need} have={verdict.have} needLabel={t("planungTool.needLabel")} haveLabel={t("planungTool.haveLabel")} ok={verdict.ok}
          verdict={verdict.ok ? t("planungTool.verdictOk") : t("planungTool.verdictShort", { n: verdict.missing })} />
      </div>
      <p role="status" className="mt-3 min-h-5 text-sm text-brass-ink">{hint}</p>
    </div>
  );
}
