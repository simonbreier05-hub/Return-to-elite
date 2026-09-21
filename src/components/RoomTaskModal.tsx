"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { ROOM_TASK_TYPES, type RoomTaskType } from "@/lib/domain";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";

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
  onSubmit: (payload: { type: RoomTaskType; note?: string }) => Promise<void>;
}) {
  const { t } = useLocale();
  const [type, setType] = useState<RoomTaskType>("TWIN_SETUP");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const needsNote = type === "SONSTIGES";

  const submit = async () => {
    if (needsNote && !note.trim()) return;
    setBusy(true);
    try {
      await onSubmit({ type, note: note.trim() || undefined });
    } finally {
      setBusy(false);
    }
  };

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
            className={`h-14 rounded-xl border px-4 text-left text-sm font-medium ${
              type === rt ? "border-gold bg-parchment font-semibold" : "border-charcoal/20"
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
        className="mb-4 w-full rounded-lg border border-charcoal/20 p-3 text-base outline-none focus:border-gold"
      />
      <div className="grid grid-cols-2 gap-2">
        <button onClick={onClose} className="h-14 rounded-xl border border-charcoal/20 text-base">
          {t("common.cancel")}
        </button>
        <button
          onClick={submit}
          disabled={busy || (needsNote && !note.trim())}
          className="h-14 rounded-xl bg-navy text-base font-semibold text-ivory disabled:opacity-40"
        >
          {busy ? t("supervisor.houseTaskSending") : t("supervisor.houseTaskSend")}
        </button>
      </div>
    </Modal>
  );
}
