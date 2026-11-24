"use client";
import { now as clockNow } from "@/lib/clock";

import { useState } from "react";
import Modal from "@/components/Modal";
import { ROOM_TASK_TYPES, type RoomTaskType } from "@/lib/domain";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";
import { useGlassMode } from "@/components/shell/GlassMode";
import { HkWindow } from "@/components/hk/HkParts";
import { Button, Field, FilterChip } from "@/components/ui";

/**
 * Hand the houseman a furniture/bed job for a room. Shared by the supervisor
 * live board and the duty-manager screen — both just pass a room and get a
 * `{ type, note? }` payload back to POST to /api/roomtasks.
 */
export default function RoomTaskModal({
  room,
  onClose,
  onSubmit,
}: {
  room: { number: string };
  onClose: () => void;
  onSubmit: (payload: { type: RoomTaskType; note?: string; dueDate?: string }) => Promise<void>;
}) {
  const { t } = useLocale();
  const [type, setType] = useState<RoomTaskType>("TWIN_SETUP");
  const [note, setNote] = useState("");
  // F7 (Nachtrag): Einmal-Aufgabe für einen späteren Tag (leer = heute); erscheint beim Hausmann erst an diesem Tag
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const needsNote = type === "SONSTIGES";

  const submit = async () => {
    if (needsNote && !note.trim()) return;
    setBusy(true);
    try {
      await onSubmit({ type, note: note.trim() || undefined, ...(dueDate ? { dueDate } : {}) });
    } finally {
      setBusy(false);
    }
  };

  const glass = useGlassMode();
  if (glass) {
    return (
      <HkWindow title={t("supervisor.houseTaskModalTitle", { number: room.number })} subtitle={t("supervisor.houseTaskModalSubtitle")} onClose={onClose} dirty={note.trim() !== ""}>
        <div role="radiogroup" aria-label={t("supervisor.houseTaskModalSubtitle")} className="grid gap-2">
          {ROOM_TASK_TYPES.map((rt) => (
            <FilterChip key={rt} active={type === rt} onClick={() => setType(rt)} className="justify-start! rounded-(--glass-radius-md)! px-5! text-start">
              {t(`roomTaskType.${rt}` as TKey)}
            </FilterChip>
          ))}
        </div>
        <Field multiline label={t("supervisor.houseTaskNotePlaceholder")} value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={t("supervisor.houseTaskNotePlaceholder")} />
        <Field type="date" label={t("supervisor.houseTaskDue")} hint={t("supervisor.houseTaskDueHint")} value={dueDate} min={clockNow().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })} onChange={(e) => setDueDate(e.target.value)} className="sm:max-w-xs" />
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Button variant="secondary" icon="x" onClick={onClose}>{t("common.cancel")}</Button>
          <Button icon="check" onClick={submit} disabled={busy || (needsNote && !note.trim())}>
            {busy ? t("supervisor.houseTaskSending") : t("supervisor.houseTaskSend")}
          </Button>
        </div>
      </HkWindow>
    );
  }
  return (
    <Modal
      title={t("supervisor.houseTaskModalTitle", { number: room.number })}
      subtitle={t("supervisor.houseTaskModalSubtitle")}
      onClose={onClose}
    >
      <div className="mb-3 grid grid-cols-1 gap-2">
        {ROOM_TASK_TYPES.map((rt) => (
          <button
            key={rt}
            onClick={() => setType(rt)}
            className={`h-14 rounded-(--glass-radius-md) border px-4 text-start text-sm font-medium ${
 type === rt ? "border-gold bg-accent-subtle-bg font-semibold" : "border-border-subtle"
 }`}
          >
            {t(`roomTaskType.${rt}` as TKey)}
          </button>
        ))}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder={t("supervisor.houseTaskNotePlaceholder")}
        className="mb-4 w-full rounded-(--glass-radius-sm) border border-border-subtle p-3 text-base"
      />
      <div className="grid grid-cols-2 gap-2">
        <button onClick={onClose} className="h-14 rounded-(--glass-radius-md) border border-border-subtle text-base">
          {t("common.cancel")}
        </button>
        <button
          onClick={submit}
          disabled={busy || (needsNote && !note.trim())}
          className="h-14 rounded-(--glass-radius-md) bg-champagne text-base font-semibold text-text-on-accent disabled:opacity-40"
        >
          {busy ? t("supervisor.houseTaskSending") : t("supervisor.houseTaskSend")}
        </button>
      </div>
    </Modal>
  );
}
