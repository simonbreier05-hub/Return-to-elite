"use client";

import Modal from "@/components/Modal";
import NoteThread from "@/components/NoteThread";
import type { PauseTarget } from "@/lib/domain";
import { useLocale } from "@/lib/i18n/LocaleContext";

/**
 * Nachrichten an eine Aufgabe (Hausmann-Aufgabe, Arbeitsauftrag) — derselbe Verlauf wie im Zimmer-Detail (NoteThread,
 * Tabelle RoomNote), nur direkt aus der Aufgabenkarte geöffnet. Sichtbar für alle Beteiligten, mit Autor, Rolle und Zeit.
 */
export default function TaskMessageModal({ roomId, roomNumber, task, onClose }: { roomId: string; roomNumber: string; task: { type: PauseTarget; id: string }; onClose: () => void }) {
  const { t } = useLocale();
  return (
    <Modal title={t("work.messageTitle", { n: roomNumber })} onClose={onClose}>
      <NoteThread roomId={roomId} initialNotes={[]} task={task} />
    </Modal>
  );
}
