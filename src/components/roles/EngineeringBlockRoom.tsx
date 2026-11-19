"use client";

import { useState } from "react";
import { api } from "@/components/api";
import TwoTapButton from "@/components/TwoTapButton";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { Field, GlassCard, SectionLabel } from "@/components/ui";

/**
 * F2 (M4, Annahme B8): Der Techniker sperrt ein Zimmer auch ohne Arbeitsauftrag — Zimmernummer, Grund (Pflicht), Ende.
 * Gleicher Status-Weg wie überall (`onBlock` → POST /api/rooms/[id]/status mit Rückfrage bei Belegung). Keine Gastdaten.
 */
export default function EngineeringBlockRoom({ onBlock }: { onBlock: (roomId: string, untilIso: string, reason: string) => Promise<void> }) {
  const { t } = useLocale();
  const [number, setNumber] = useState("");
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const submit = async () => {
    setMsg(null);
    const r = await api<{ rooms: { id: string; number: string }[] }>(`/api/rooms?q=${encodeURIComponent(number.trim())}`).catch(() => null);
    const room = r?.rooms.find((x) => x.number === number.trim());
    if (!room) { setMsg(t("blocked.roomNotFound", { n: number.trim() })); return; }
    await onBlock(room.id, new Date(until).toISOString(), reason.trim());
    setNumber(""); setReason(""); setUntil("");
  };
  return (
    <GlassCard as="section" aria-labelledby="eng-block-title" className="flex flex-col gap-3" data-testid="eng-block-room">
      <SectionLabel as="h2" icon="wrench" title={t("blocked.engTitle")} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field className="sm:w-32" label={t("blocked.roomNumber")} value={number} maxLength={6} inputMode="numeric" onChange={(e) => setNumber(e.target.value)} />
        <Field className="min-w-0 flex-1" label={t("blocked.reason")} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
        <Field className="sm:w-56" type="datetime-local" label={t("blocked.until")} value={until} onChange={(e) => setUntil(e.target.value)} />
        <TwoTapButton disabled={!number.trim() || !reason.trim() || !until} onConfirm={submit}>{t("engineering.setOoo")}</TwoTapButton>
      </div>
      {msg && <p role="alert" className="text-body-16 text-status-danger-fg">{msg}</p>}
    </GlassCard>
  );
}
