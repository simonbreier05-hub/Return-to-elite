"use client";

import { useState } from "react";
import { api } from "@/components/api";
import TwoTapButton from "@/components/TwoTapButton";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { errorText } from "@/lib/i18n/errorText";
import RoomChangeForm from "./RoomChangeForm";

/**
 * Simon-Feedback 19.11.2026: Zimmer-Aktionen dort, wo das Zimmer offen ist (Zimmerfenster) statt in einer eigenen Karte.
 *  - „Reist heute ab (vorzeitig)“ nur für einen Bleiber (belegt, keine Abreise heute) — derselbe Weg wie bisher (F3 Teil 3).
 *  - Zimmerwechsel von diesem Zimmer aus (F3 Teil 4), nur bei belegtem Zimmer.
 * Nur Zimmernummern, keine Gastdaten. Rechte prüft der Server wie bisher.
 */
export default function RoomWindowActions({ room, onChanged }: {
  room: { id: string; number: string; occupancy?: string | null; isCheckoutToday: boolean };
  onChanged?: () => void;
}) {
  const { t } = useLocale();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (room.occupancy !== "OCCUPIED") return null;
  const early = async () => {
    setMsg(null);
    try {
      await api(`/api/rooms/${room.id}/early-departure`, { body: {} });
      setMsg({ ok: true, text: t("roomActions.earlyDone", { n: room.number }) });
      onChanged?.();
    } catch (e) { setMsg({ ok: false, text: errorText(e, t) }); }
  };
  return (
    <section aria-label={t("roomActions.title")} className="mt-4 flex flex-col gap-3" data-testid="room-window-actions">
      <h4 className="text-section text-text-muted">{t("roomActions.title")}</h4>
      {!room.isCheckoutToday && (
        <div className="flex flex-col gap-1">
          <TwoTapButton onConfirm={early}>{t("roomActions.earlyDeparture")}</TwoTapButton>
          <p className="text-label text-text-muted">{t("roomActions.earlyHint")}</p>
        </div>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-body-16 text-status-success-fg" : "text-body-16 text-status-danger-fg"}>{msg.text}</p>}
      <RoomChangeForm fromRoom={room.number} onDone={onChanged} />
    </section>
  );
}
