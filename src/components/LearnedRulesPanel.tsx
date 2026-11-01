"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";
import type { Pattern } from "@/lib/learning/patterns";

type Row = Pattern & { active: boolean; personName: string | null; targetName: string | null };

/**
 * Einstellungen › „Gelernte Regeln" (H3): jedes Muster mit Beschreibung, Anzahl Beobachtungen und letztem Datum,
 * je Muster Ein/Aus und Löschen, Gesamtschalter „Lernen aus Änderungen". Muster laufen von selbst aus.
 */
export default function LearnedRulesPanel() {
  const { t } = useLocale();
  const [data, setData] = useState<{ enabled: boolean; patterns: Row[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => { api<{ enabled: boolean; patterns: Row[] }>("/api/learning").then(setData).catch((e) => setError(e instanceof Error ? e.message : "?")); }, []);
  useEffect(load, [load]);
  const patch = async (body: Record<string, unknown>) => { await api("/api/learning", { method: "PATCH", body }).catch(() => {}); load(); };
  const remove = async (key: string) => { await api(`/api/learning?key=${encodeURIComponent(key)}`, { method: "DELETE" }).catch(() => {}); load(); };

  const describe = (p: Row) => {
    const who = p.personName ?? "—";
    if (p.kind === "FLOOR") return t("learn.descFloor", { name: who, floor: p.floor ?? "" });
    if (p.kind === "ROOM_PERSON") return t("learn.descRoomPerson", { room: p.roomNumber ?? "", name: p.targetName ?? "—" });
    if (p.kind === "ROOM_LEVEL") return t("learn.descRoomLevel", { room: p.roomNumber ?? "", level: p.minLevel ?? "" });
    return t("learn.descDeferred", { room: p.roomNumber ?? "" });
  };

  return (
    <section className="mb-4 rounded-2xl border border-charcoal/10 bg-linen p-5 shadow-card">
      <h3 className="mb-1 font-serif text-2xl">{t("learn.title")}</h3>
      <p className="mb-3 max-w-2xl text-sm text-graphite/60">{t("learn.hint")}</p>
      {error && <p role="alert" className="mb-2 text-sm text-status-out-of-order">{error}</p>}
      {data && (
        <>
          <label className="mb-4 flex min-h-11 items-center gap-3 text-sm font-medium">
            <input type="checkbox" className="h-5 w-5" checked={data.enabled} onChange={(e) => void patch({ enabled: e.target.checked })} />
            {t("learn.enabled")}
          </label>
          {data.patterns.length === 0 ? (
            <p className="text-sm text-graphite/70">{t("learn.none")}</p>
          ) : (
            <ul className="space-y-2">
              {data.patterns.map((p) => (
                <li key={p.key} className={`flex flex-wrap items-center gap-3 rounded-xl border border-charcoal/10 bg-white p-3 ${p.active ? "" : "opacity-60"}`}>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{describe(p)}</div>
                    <div className="text-xs text-graphite/70">{t("learn.seen", { days: p.days, of: p.of, date: p.lastDate })} · {t(`learn.kind_${p.kind}` as TKey)}</div>
                  </div>
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input type="checkbox" className="h-5 w-5" checked={p.active} disabled={!data.enabled} onChange={(e) => void patch({ key: p.key, active: e.target.checked })} />
                    {t("learn.active")}
                  </label>
                  <button type="button" onClick={() => void remove(p.key)} className="min-h-11 rounded-xl border border-charcoal/15 px-3 text-sm hover:border-status-out-of-order hover:text-status-out-of-order">
                    {t("learn.delete")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
