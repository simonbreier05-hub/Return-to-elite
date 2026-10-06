"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { useLocale } from "@/lib/i18n/LocaleContext";

interface Status {
  purgeHour: number; stayDeleteDays: number; lastOkAt: string | null; lastCounts: Record<string, number> | null;
  latest: { trigger: string; status: string; at: string; error: string | null } | null; due: boolean;
}
interface StayRow { id: string; checkIn: string; checkOut: string; status: string; hasName: boolean }

const fmt = (iso: string) => new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" });
const summary = (c: Record<string, number> | null) => Object.entries(c ?? {}).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(", ") || "—";

/** Einstellungen → Datenschutz: letzter Lauf, Zeitplan, "jetzt löschen", Einzellöschung. Nur Duty Manager. */
export default function PurgePanel() {
  const { t } = useLocale();
  const [st, setSt] = useState<Status | null>(null);
  const [hour, setHour] = useState(22);
  const [days, setDays] = useState(30);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [room, setRoom] = useState("");
  const [stays, setStays] = useState<StayRow[] | null>(null);

  const load = useCallback(() => {
    api<Status>("/api/guest-data/purge-status").then((s) => { setSt(s); setHour(s.purgeHour); setDays(s.stayDeleteDays); }).catch(() => {});
  }, []);
  useEffect(load, [load]);

  const saveSetting = (body: { guestPurgeHour?: number; guestStayDeleteDays?: number }) => api("/api/settings", { method: "PATCH", body }).then(load).catch(() => {});
  const purgeNow = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ counts?: Record<string, number> }>("/api/internal/guest-data-purge", { body: {} });
      setMsg(`${t("purge.done")} ${t("purge.counts", { summary: summary(r.counts ?? null) })}`);
      setConfirm(false); load();
    } catch (e) { setMsg(e instanceof Error ? e.message : "?"); } finally { setBusy(false); }
  };
  const find = async () => {
    setStays(null);
    api<{ stays: StayRow[] }>(`/api/guest-data/stays?room=${encodeURIComponent(room)}`).then((d) => setStays(d.stays)).catch((e) => setMsg(e.message));
  };
  const purgeStay = async (id: string) => {
    await api(`/api/guest-data/stays/${id}/purge`, { body: {} }).catch((e) => setMsg(e.message));
    setMsg(t("purge.stayDone")); find();
  };

  return (
    <section className="mb-4 rounded-2xl border border-charcoal/10 bg-linen p-5 shadow-card">
      <h3 className="mb-1 font-serif text-2xl">{t("purge.title")}</h3>
      <p className="mb-4 max-w-2xl text-sm text-graphite/60">{t("purge.hint")}</p>

      <div className="mb-3 text-sm">
        <span className="font-medium">{t("purge.lastRun")}: </span>
        {st?.latest ? <>{fmt(st.latest.at)} · {st.latest.status === "OK" ? t("purge.statusOk") : st.latest.status === "ERROR" ? t("purge.statusError") : st.latest.status}</> : t("purge.never")}
        {st?.lastCounts && <div className="text-xs text-graphite/60">{t("purge.counts", { summary: summary(st.lastCounts) })}</div>}
        {st?.due && <div className="text-xs text-gold-soft">{t("purge.due")}</div>}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <label className="rounded-xl border border-charcoal/15 bg-white p-4">
          <div className="mb-2 text-sm font-medium">{t("purge.hour")}</div>
          <input type="number" min={0} max={23} value={hour} onChange={(e) => setHour(Number(e.target.value))}
            onBlur={() => hour !== st?.purgeHour && saveSetting({ guestPurgeHour: hour })}
            className="h-12 w-24 rounded-lg border border-charcoal/20 px-3 text-center font-serif text-2xl outline-none focus:border-gold" />
        </label>
        <label className="rounded-xl border border-charcoal/15 bg-white p-4">
          <div className="mb-2 text-sm font-medium">{t("purge.stayDays")}</div>
          <input type="number" min={1} max={3650} value={days} onChange={(e) => setDays(Number(e.target.value))}
            onBlur={() => days !== st?.stayDeleteDays && saveSetting({ guestStayDeleteDays: days })}
            className="h-12 w-24 rounded-lg border border-charcoal/20 px-3 text-center font-serif text-2xl outline-none focus:border-gold" />
          <span className="ml-2 text-sm text-graphite/60">{t("purge.days")}</span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!confirm ? (
          <button type="button" onClick={() => setConfirm(true)} className="h-12 rounded-xl bg-status-out-of-order px-6 text-sm font-medium text-white">{t("purge.now")}</button>
        ) : (
          <>
            <button type="button" disabled={busy} onClick={purgeNow} className="h-12 rounded-xl bg-status-out-of-order px-6 text-sm font-medium text-white disabled:opacity-40">{busy ? t("purge.running") : t("purge.nowConfirm")}</button>
            <button type="button" onClick={() => setConfirm(false)} className="h-12 rounded-xl border border-charcoal/15 bg-white px-5 text-sm">{t("common.cancel")}</button>
          </>
        )}
        {msg && <span className="text-sm text-graphite/70">{msg}</span>}
      </div>

      <div className="mt-6 border-t border-charcoal/10 pt-4">
        <h4 className="mb-2 font-serif text-xl">{t("purge.stayTitle")}</h4>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">{t("purge.stayRoom")}<br />
            <input value={room} onChange={(e) => setRoom(e.target.value.trim())} inputMode="numeric" maxLength={4}
              className="h-12 w-28 rounded-lg border border-charcoal/20 px-3 outline-none focus:border-gold" /></label>
          <button type="button" onClick={find} disabled={!/^\d{3,4}$/.test(room)} className="h-12 rounded-xl border border-charcoal/15 bg-white px-5 text-sm disabled:opacity-40">{t("purge.stayFind")}</button>
        </div>
        {stays && (stays.length === 0 ? <p className="mt-2 text-sm text-graphite/60">{t("purge.stayNone")}</p> : (
          <ul className="mt-3 space-y-2 text-sm">
            {stays.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3">
                <span>{s.checkIn} → {s.checkOut} · {s.status}{s.hasName ? "" : ` ${t("purge.stayNoName")}`}</span>
                <button type="button" onClick={() => purgeStay(s.id)} className="h-10 rounded-lg border border-status-out-of-order/40 px-3 text-status-out-of-order">{t("purge.stayDelete")}</button>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </section>
  );
}
