"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { api } from "@/components/api";
import { Button, Field } from "@/components/ui";
import { cx, FOCUS_RING } from "@/components/ui/primitives";
import { GlassDialog } from "@/components/shell/GlassDialog";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { errorText } from "@/lib/i18n/errorText";
import type { RoomChangeTarget } from "@/lib/rooms/roomChange";
import { roomIdByNumber } from "./RoomActionsCard";

const SELECT = "text-body-16 w-full min-h-(--size-touch-min) rounded-(--glass-radius-md) border border-border-subtle bg-surface-progress-track px-4 py-3 text-text-primary";

/**
 * F3 Teil 4 (H9, Regel B5 neu): Zimmerwechsel in einem Schritt — von Zimmer, nach Zimmer (nur freie, geprüfte, nicht
 * gesperrte Zimmer ohne Anreise heute), Grund ohne Gastdaten — mit einer Rückfrage, die beide Zimmernummern nennt.
 */
export default function RoomChangeForm({ fromRoom, onDone }: {
  /** Simon-Feedback 19.11.: im Zimmerfenster steht das Ausgangszimmer fest (kein Eingabefeld „Von Zimmer“). */
  fromRoom?: string;
  onDone?: () => void;
} = {}) {
  const { t } = useLocale();
  const selectId = useId();
  const [fromInput, setFrom] = useState("");
  const from = fromRoom ?? fromInput;
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [targets, setTargets] = useState<RoomChangeTarget[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(async () => { const r = await api<{ rooms: RoomChangeTarget[] }>("/api/rooms/room-change-targets").catch(() => null); if (r) setTargets(r.rooms); }, []);
  useEffect(() => { void load(); }, [load]);
  const toNumber = targets.find((r) => r.id === to)?.number ?? "";
  const run = async () => {
    setConfirm(false); setBusy(true); setMsg(null);
    try {
      const id = await roomIdByNumber(from);
      if (!id) throw new Error(t("blocked.roomNotFound", { n: from.trim() }));
      await api(`/api/rooms/${id}/room-change`, { body: { toRoomId: to, reason: reason.trim() } });
      setMsg({ ok: true, text: t("roomActions.changeDone", { from: from.trim(), to: toNumber }) });
      setFrom(""); setTo(""); setReason(""); await load(); onDone?.();
    } catch (e) { setMsg({ ok: false, text: errorText(e, t) }); } finally { setBusy(false); }
  };
  return (
    <div className="flex flex-col gap-2 border-t border-border-subtle pt-3" data-testid="room-change">
      <h3 className="text-section text-text-muted">{t("roomActions.changeTitle")}</h3>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        {fromRoom === undefined && <Field className="sm:w-32" label={t("roomActions.changeFrom")} value={from} maxLength={6} inputMode="numeric" onChange={(e) => setFrom(e.target.value)} />}
        <div className="flex flex-col gap-2 sm:w-48">
          <label htmlFor={selectId} className="text-label text-text-muted">{t("roomActions.changeTo")}</label>
          <select id={selectId} className={cx(SELECT, FOCUS_RING)} value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">{t("roomActions.changePick", { n: targets.length })}</option>
            {targets.map((r) => <option key={r.id} value={r.id}>{r.number} · {t("lists.floorN", { n: r.floor })}</option>)}
          </select>
        </div>
        <Field className="min-w-0 flex-1" label={t("roomActions.changeReason")} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
        <Button icon="chevron-right" disabled={!from.trim() || !to || !reason.trim() || busy} onClick={() => setConfirm(true)}>{t("roomActions.changeGo")}</Button>
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-body-16 text-status-success-fg" : "text-body-16 text-status-danger-fg"}>{msg.text}</p>}
      <GlassDialog open={confirm} title={t("roomActions.changeConfirmTitle", { from: from.trim(), to: toNumber })} message={t("roomActions.changeConfirmText", { from: from.trim(), to: toNumber })}
        confirmLabel={t("roomActions.changeGo")} onCancel={() => setConfirm(false)} onConfirm={() => void run()} busy={busy} />
    </div>
  );
}
