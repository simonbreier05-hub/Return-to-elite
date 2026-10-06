"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/components/api";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { buildResult } from "@/lib/autoplan/result";
import type { Assignment, PlanInput, PlanResult, PlanRoom } from "@/lib/autoplan/types";

interface Proposal { id: string; status: "DRAFT" | "CONFIRMED"; payload: { input: PlanInput; result: PlanResult } }
interface Hk { id: string; name: string; hkActive: boolean; absentToday: boolean }

const TONE = { WARNING: "text-status-in-progress", INFO: "text-graphite/70" } as const;
const fmt = (n: number) => (Math.round(n * 10) / 10).toString().replace(".", ",");

/** "Plan vorschlagen": Entwurf prüfen, einzelne Zimmer ändern, in zwei Taps bestätigen. Nur Supervisor/Duty Manager. */
export default function AutoPlanPanel() {
  const { t } = useLocale();
  const [hks, setHks] = useState<Hk[]>([]);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [assignment, setAssignment] = useState<Assignment>({});
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadHks = useCallback(() => api<{ housekeepers: Hk[] }>("/api/housekeepers").then((d) => setHks(d.housekeepers)).catch(() => {}), []);
  const loadProposal = useCallback(() => api<{ proposal: Proposal | null }>("/api/autoplan").then((d) => {
    setProposal(d.proposal);
    setAssignment(d.proposal?.payload.result.assignment ?? {});
  }).catch(() => {}), []);
  useEffect(() => { loadHks(); loadProposal(); }, [loadHks, loadProposal]);

  const propose = async () => {
    setBusy(true); setError(null); setMsg(null); setConfirm(false);
    try {
      const present = hks.filter((h) => h.hkActive && !h.absentToday).map((h) => h.id);
      const r = await api<{ proposalId: string; input: PlanInput; result: PlanResult }>("/api/autoplan/propose", { body: { attendantIds: present } });
      setProposal({ id: r.proposalId, status: "DRAFT", payload: { input: r.input, result: r.result } });
      setAssignment(r.result.assignment);
    } catch (e) { setError(e instanceof Error ? e.message : "?"); } finally { setBusy(false); }
  };
  const toggleAbsent = async (h: Hk) => {
    await api(`/api/housekeepers/${h.id}/absent`, { body: { absent: !h.absentToday } }).catch((e) => setError(e.message));
    loadHks();
  };
  const doConfirm = async () => {
    if (!proposal) return;
    setBusy(true); setError(null);
    try {
      const r = await api<{ assigned: number; changed: number; open: number }>("/api/autoplan/confirm", { body: { proposalId: proposal.id, assignment } });
      setMsg(t("autoplan.confirmedMsg", { assigned: r.assigned, changed: r.changed, open: r.open }));
      setConfirm(false); loadProposal();
    } catch (e) { setError(e instanceof Error ? e.message : "?"); } finally { setBusy(false); }
  };

  const input = proposal?.payload.input;
  // Kennzahlen, Warnungen und Begründungen live neu rechnen, wenn von Hand geändert wird
  const view = useMemo(() => (input ? buildResult(input, assignment) : null), [input, assignment]);
  const roomById = useMemo(() => new Map((input?.rooms ?? []).map((r) => [r.id, r])), [input]);
  const edited = useMemo(() => (proposal ? Object.keys(assignment).filter((id) => assignment[id] !== proposal.payload.result.assignment[id]).length : 0), [proposal, assignment]);
  const readOnly = proposal?.status === "CONFIRMED";
  const kindLabel = (r: PlanRoom) => (r.kind === "STAYOVER" && r.laundry ? t("autoplan.kindLinen") : t(`autoplan.kind${r.kind}` as "autoplan.kindTURN"));

  const roomRow = (id: string) => {
    const r = roomById.get(id)!;
    return (
      <li key={id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-charcoal/5 py-1.5 text-sm">
        <span className="w-12 font-medium">{r.number}{r.vip ? " ★" : ""}</span>
        <span className="w-32 text-xs text-graphite/70">{kindLabel(r)}</span>
        <span className="min-w-0 flex-1 text-xs text-graphite/60">{view?.reasons[id]?.join(" · ")}</span>
        <select value={assignment[id] ?? ""} disabled={readOnly || !!r.fixedTo || busy}
          onChange={(e) => setAssignment((a) => ({ ...a, [id]: e.target.value || null }))}
          className="h-10 rounded-lg border border-charcoal/20 bg-white px-2 text-xs disabled:opacity-60" aria-label={t("autoplan.assignTo")}>
          <option value="">{t("autoplan.unassigned")}</option>
          {input!.housekeepers.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
        {r.fixedTo && <span className="text-[11px] text-gold-soft">🔒 {t("autoplan.fixed")}</span>}
      </li>
    );
  };

  return (
    <section className="mb-4 rounded-2xl border border-charcoal/10 bg-linen p-5 shadow-card">
      <h3 className="font-serif text-2xl">{t("autoplan.title")}</h3>
      <p className="mb-3 max-w-2xl text-xs text-graphite/60">{t("autoplan.hint")}</p>

      {hks.length > 0 && (
        <div className="mb-3">
          <div className="mb-1 text-xs font-medium text-graphite/60">{t("autoplan.present")}</div>
          <div className="flex flex-wrap gap-2">
            {hks.filter((h) => h.hkActive).map((h) => (
              <button key={h.id} type="button" onClick={() => toggleAbsent(h)}
                title={h.absentToday ? t("autoplan.markPresent") : t("autoplan.markAbsent")}
                className={`h-10 rounded-full border px-4 text-sm ${h.absentToday ? "border-status-out-of-order/40 bg-status-out-of-order/10 text-status-out-of-order line-through" : "border-charcoal/15 bg-white"}`}>
                {h.name}{h.absentToday ? ` · ${t("autoplan.absent")}` : ""}
              </button>
            ))}
          </div>
        </div>
      )}

      <button type="button" disabled={busy} onClick={propose}
        className="h-12 rounded-xl bg-navy px-6 text-sm font-medium text-white hover:bg-navy-line disabled:opacity-40">
        {busy && !confirm ? t("autoplan.proposing") : t("autoplan.propose")}
      </button>
      {error && <p className="mt-2 text-sm text-status-out-of-order">{error}</p>}
      {msg && <p className="mt-2 text-sm text-status-clean">{msg} <Link href="/supervisor" className="font-medium text-gold-soft hover:underline">{t("autoplan.goBoard")}</Link></p>}

      {view && input && (
        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-parchment px-3 py-1 text-xs font-medium">{readOnly ? t("autoplan.confirmedTag") : t("autoplan.draft")}</span>
            <span>{t("autoplan.needed", { n: view.needed.housekeepers, target: fmt(view.needed.targetCredits), present: view.needed.present })}</span>
            {edited > 0 && <span className="text-xs text-gold-soft">{t("autoplan.edited", { n: edited })}</span>}
          </div>

          {view.warnings.length > 0 && (
            <div className="mb-3 rounded-xl border border-charcoal/10 bg-white p-3">
              <div className="mb-1 text-xs font-medium text-graphite/60">{t("autoplan.warnings")}</div>
              <ul className="space-y-1 text-sm">{view.warnings.map((w, i) => <li key={i} className={TONE[w.severity]}>{w.severity === "WARNING" ? "⚠" : "ℹ"} {w.message}</li>)}</ul>
            </div>
          )}

          <div className="grid gap-3 lg:grid-cols-2">
            {input.housekeepers.map((h) => {
              const m = view.metrics.find((x) => x.hkId === h.id)!;
              const route = view.routes.find((x) => x.hkId === h.id)!;
              const outOfBand = m.credits > m.hi + 0.25 || (m.rooms > 0 && m.credits < m.lo - 0.25);
              return (
                <div key={h.id} className="rounded-xl border border-charcoal/10 bg-white p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="font-medium">{h.name} <span className="text-xs text-graphite/60">· {t("autoplan.level", { n: h.level })}</span></div>
                    <div className={`font-serif text-xl ${outOfBand ? "text-status-in-progress" : ""}`}>{fmt(m.credits)} <span className="text-xs text-graphite/60">/ {fmt(m.lo)}–{fmt(m.hi)}</span></div>
                  </div>
                  <div className="mb-1 text-xs text-graphite/60">
                    {t("autoplan.rooms", { n: m.rooms })} · {t("autoplan.departures")} {m.departures} · {t("autoplan.stayovers")} {m.stayovers} · {t("autoplan.linen")} {m.linen} · {t("autoplan.floors")} {m.floors.join(", ") || "—"} · {t("autoplan.demanding")} {m.demanding}
                  </div>
                  <ul>{route.roomIds.map(roomRow)}</ul>
                </div>
              );
            })}
          </div>

          {view.unassigned.length > 0 && (
            <div className="mt-3 rounded-xl border border-status-in-progress/40 bg-white p-3">
              <div className="mb-1 text-sm font-medium">{t("autoplan.open")}</div>
              <ul>{view.unassigned.map(roomRow)}</ul>
            </div>
          )}

          {!readOnly && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {!confirm ? (
                <button type="button" disabled={busy} onClick={() => setConfirm(true)} className="h-12 rounded-xl bg-navy px-6 text-sm font-medium text-white hover:bg-navy-line disabled:opacity-40">{t("autoplan.confirm")}</button>
              ) : (
                <>
                  <button type="button" disabled={busy} onClick={doConfirm} className="h-12 rounded-xl bg-gold-soft px-6 text-sm font-medium text-white disabled:opacity-40">{t("autoplan.confirmNow")}</button>
                  <button type="button" onClick={() => setConfirm(false)} className="h-12 rounded-xl border border-charcoal/15 bg-white px-5 text-sm">{t("common.cancel")}</button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
