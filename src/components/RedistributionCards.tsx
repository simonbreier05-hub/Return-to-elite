"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { useSocket } from "@/components/useSocket";
import { useLocale } from "@/lib/i18n/LocaleContext";

export interface RedistMove { roomId: string; roomNumber: string; fromId: string | null; fromName: string; toId: string; toName: string }
export interface RedistSuggestion { id: string; kind: "ABSENT" | "EARLY_FINISH" | "UNASSIGNED"; params: Record<string, string | number>; moves: RedistMove[] }

/**
 * Logik der Umverteilungsvorschläge (Laden, Live-Update, Bestätigen/Ablehnen/Ändern) — geteilt von der alten Karte
 * und der Glas-Variante (`GlassRedistribution`), damit es nur einen API-Weg gibt.
 */
export function useRedistribution() {
  const { t } = useLocale();
  const [items, setItems] = useState<RedistSuggestion[]>([]);
  const [attendants, setAttendants] = useState<{ id: string; name: string }[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [override, setOverride] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ suggestions: RedistSuggestion[]; attendants: { id: string; name: string }[] }>("/api/redistribution").then((d) => { setItems(d.suggestions); setAttendants(d.attendants); }).catch(() => {});
  }, []);
  useEffect(() => { load(); const id = setInterval(load, 60_000); return () => clearInterval(id); }, [load]);
  useSocket({ "redistribution:new": load, "assignments:applied": load, "room:update": () => {} });

  const decide = async (s: RedistSuggestion, action: "confirm" | "reject") => {
    setBusy(true); setError(null);
    try {
      const moves = action === "confirm" && editing === s.id ? s.moves.map((m) => ({ roomId: m.roomId, toId: override[m.roomId] ?? m.toId })) : undefined;
      await api(`/api/redistribution/${s.id}`, { body: { action, moves } });
      setEditing(null); setOverride({}); load();
    } catch (e) { setError(e instanceof Error ? e.message : "?"); } finally { setBusy(false); }
  };

  const head = (s: RedistSuggestion) => t(`redist.${s.kind}` as "redist.ABSENT", {
    from: String(s.params.fromName ?? ""), to: String(s.params.toName ?? ""), minutes: Number(s.params.minutes ?? 0), n: s.moves.length,
  });
  const moveText = (s: RedistSuggestion, m: RedistMove) =>
    t("redist.move", { room: m.roomNumber, from: m.fromName || t("redist.nobody"), to: editing === s.id ? "" : m.toName }).replace(/ → $/, " →");
  const toggleEdit = (id: string) => setEditing((cur) => (cur === id ? null : id));
  const setTarget = (roomId: string, toId: string) => setOverride((o) => ({ ...o, [roomId]: toId }));

  return { items, attendants, editing, override, busy, error, decide, head, moveText, toggleEdit, setTarget };
}

/** Umverteilungsvorschläge tagsüber als Karten (Banner + Bestätigen / Ablehnen / Ändern). Rendert nichts, wenn nichts offen ist. */
export default function RedistributionCards() {
  const { t } = useLocale();
  const r = useRedistribution();
  if (!r.items.length) return null;

  return (
    <div className="mb-4 rounded-2xl border border-gold-line bg-parchment p-4" role="status">
      <div className="mb-2 text-sm font-medium">{t("redist.banner", { n: r.items.length })}</div>
      {r.error && <p className="mb-2 text-sm text-status-out-of-order">{r.error}</p>}
      <div className="space-y-3">
        {r.items.map((s) => (
          <div key={s.id} className="rounded-xl border border-charcoal/10 bg-white p-3">
            <div className="mb-1 font-serif text-lg">{r.head(s)}</div>
            <ul className="mb-2 space-y-1 text-sm">
              {s.moves.map((m) => (
                <li key={m.roomId} className="flex flex-wrap items-center gap-2">
                  <span>{r.moveText(s, m)}</span>
                  {r.editing === s.id && (
                    <select value={r.override[m.roomId] ?? m.toId} onChange={(e) => r.setTarget(m.roomId, e.target.value)}
                      className="h-10 rounded-lg border border-charcoal/20 bg-white px-2 text-sm">
                      {r.attendants.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  )}
                </li>
              ))}
            </ul>
            <p className="mb-2 text-xs text-graphite/60">{t("redist.startedStay")}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={r.busy} onClick={() => r.decide(s, "confirm")} className="h-12 rounded-xl bg-navy px-5 text-sm font-medium text-white hover:bg-navy-line disabled:opacity-40">{t("redist.confirm")}</button>
              <button type="button" disabled={r.busy} onClick={() => r.toggleEdit(s.id)} className="h-12 rounded-xl border border-charcoal/15 bg-white px-5 text-sm">{t("redist.change")}</button>
              <button type="button" disabled={r.busy} onClick={() => r.decide(s, "reject")} className="h-12 rounded-xl border border-charcoal/15 bg-white px-5 text-sm">{t("redist.reject")}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
