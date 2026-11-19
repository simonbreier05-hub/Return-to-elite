"use client";

import { useState } from "react";
import { api } from "@/components/api";
import TwoTapButton from "@/components/TwoTapButton";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { errorText } from "@/lib/i18n/errorText";
import { Field, GlassCard, SectionLabel } from "@/components/ui";

/** Zimmer-Id zur Nummer über die Schnellsuche (`/api/rooms?q=`) — nur exakte Treffer. */
export async function roomIdByNumber(n: string): Promise<string | null> {
  const r = await api<{ rooms: { id: string; number: string }[] }>(`/api/rooms?q=${encodeURIComponent(n.trim())}`).catch(() => null);
  return r?.rooms.find((x) => x.number === n.trim())?.id ?? null;
}

/**
 * F3 (Front Office, Supervisor, Duty Manager): Zimmer-Aktionen ohne Umweg über das Zimmerfenster.
 *  - Teil 3 (H8): „Reist heute ab“ für einen Bleiber → Art Abreise (Handeingabe, Import überschreibt nicht), danach normaler Check-out.
 *  - Teil 4 (H9): Zimmerwechsel kommt als `roomChange` dazu.
 * Nur Zimmernummern, keine Gastdaten.
 */
export default function RoomActionsCard({ roomChange, title }: { roomChange?: React.ReactNode; title?: string }) {
  const { t } = useLocale();
  const [n, setN] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const early = async () => {
    setMsg(null);
    const id = await roomIdByNumber(n);
    if (!id) { setMsg({ ok: false, text: t("blocked.roomNotFound", { n: n.trim() }) }); return; }
    try { await api(`/api/rooms/${id}/early-departure`, { body: {} }); setMsg({ ok: true, text: t("roomActions.earlyDone", { n: n.trim() }) }); setN(""); }
    catch (e) { setMsg({ ok: false, text: errorText(e, t) }); }
  };
  return (
    <GlassCard as="section" aria-labelledby="room-actions-title" className="flex flex-col gap-3" data-testid="room-actions">
      <SectionLabel as="h2" icon="bed-single" title={title ?? t("roomActions.title")} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field className="sm:w-32" label={t("blocked.roomNumber")} value={n} maxLength={6} inputMode="numeric" onChange={(e) => setN(e.target.value)} />
        <TwoTapButton disabled={!n.trim()} onConfirm={early}>{t("roomActions.earlyDeparture")}</TwoTapButton>
      </div>
      <p className="text-label text-text-muted">{t("roomActions.earlyHint")}</p>
      {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-body-16 text-status-success-fg" : "text-body-16 text-status-danger-fg"}>{msg.text}</p>}
      {roomChange}
    </GlassCard>
  );
}
