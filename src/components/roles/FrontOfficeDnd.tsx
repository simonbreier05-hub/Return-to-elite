"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { useSocket } from "@/components/useSocket";
import { useCoalescedRefetch } from "@/components/useCoalescedRefetch";
import TwoTapButton from "@/components/TwoTapButton";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { errorText } from "@/lib/i18n/errorText";
import { GlassCard, SectionLabel } from "@/components/ui";

type Row = { id: string; since: string; room: { id: string; number: string; floor: number } };

/**
 * F3 Teil 2 (Annahme, nicht entschieden): Front Office sieht offene „Bitte nicht stören“ der Gäste und hebt eines auf
 * (z. B. Gast ruft an). Logbuch `GUEST_DND_LIFTED`, die zuständige Housekeeperin wird gemeldet. Nur Zimmernummern.
 */
export default function FrontOfficeDnd() {
  const { t, fmt } = useLocale();
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => { const r = await api<{ dnd: Row[] }>("/api/front-office/dnd").catch(() => null); if (r) setRows(r.dnd); }, []);
  useEffect(() => { void load(); }, [load]);
  const soon = useCoalescedRefetch(() => void load(), 800);
  useSocket({ "app:resync": () => soon(), "guestrequest:new": () => soon(), "guestrequest:update": () => soon() });
  if (!rows.length) return null;
  return (
    <GlassCard as="section" aria-labelledby="fo-dnd-title" className="flex flex-col gap-2" data-testid="fo-dnd">
      <SectionLabel as="h2" icon="moon" title={t("frontOffice.dndTitle", { n: rows.length })} />
      {msg && <p role="alert" className="text-body-16 text-status-danger-fg">{msg}</p>}
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3">
            <span className="text-number text-text-primary">{r.room.number}</span>
            <span className="text-body-16 flex-1 text-text-secondary">{t("frontOffice.dndSince", { time: fmt.dateTime(new Date(r.since), { hour: "2-digit", minute: "2-digit" }) })}</span>
            <TwoTapButton onConfirm={async () => { setMsg(null); try { await api(`/api/guest-requests/${r.id}`, { method: "PATCH", body: { status: "DONE" } }); await load(); } catch (e) { setMsg(errorText(e, t)); } }}>
              {t("roomEdit.guestDndClear")}
            </TwoTapButton>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}
