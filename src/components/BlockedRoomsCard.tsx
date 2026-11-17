"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { useSocket } from "@/components/useSocket";
import { useCoalescedRefetch } from "@/components/useCoalescedRefetch";
import TwoTapButton from "@/components/TwoTapButton";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { errorText } from "@/lib/i18n/errorText";
import type { BlockedRoom } from "@/lib/rooms/blockedRooms";
import { Field, GlassCard, Pill, SectionLabel } from "@/components/ui";
import { cx, FOCUS_RING } from "@/components/ui/primitives";

/**
 * F2: Kachel „Gesperrte Zimmer“ (Startseiten Duty Manager, Supervisor, Front Office): Zimmer, Art, Grund, bis wann,
 * „Gast im Zimmer“ / „Anreise heute“ / „Abgelaufen“ / „Bereit zur Freigabe“. Supervisor und Duty Manager haben den Knopf
 * „Wieder in Betrieb“ (setzt DIRTY, Server prüft die Rolle); der Duty Manager ändert Grund und Ende. Keine Gastdaten.
 */
export default function BlockedRoomsCard({ role }: { role: "duty_manager" | "supervisor" | "front_office" | "engineering" }) {
  const { t, fmt } = useLocale();
  const [rooms, setRooms] = useState<BlockedRoom[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ id: string; reason: string; until: string } | null>(null);
  const load = useCallback(async () => { const r = await api<{ rooms: BlockedRoom[] }>("/api/rooms/blocked").catch(() => null); if (r) setRooms(r.rooms); }, []);
  useEffect(() => { void load(); }, [load]);
  const soon = useCoalescedRefetch(() => void load(), 800);
  useSocket({ "app:resync": () => soon(), "room:update": () => soon(), "workorder:update": () => soon(), "dayplan:updated": () => soon() });
  const canRelease = role === "supervisor" || role === "duty_manager";
  const run = async (fn: () => Promise<unknown>) => { setMsg(null); try { await fn(); setEdit(null); await load(); } catch (e) { setMsg(errorText(e, t, "roomEdit.failed")); } };
  const when = (iso: string | null) => (iso ? fmt.dateTime(new Date(iso)) : "—");
  if (!rooms) return null;
  if (!rooms.length && (role === "front_office" || role === "engineering")) return null; // dort nur, wenn es etwas zu sehen gibt
  return (
    <GlassCard as="section" aria-labelledby="blocked-title" className="flex flex-col gap-3" data-testid="blocked-rooms">
      <SectionLabel as="h2" icon="wrench" title={t("blocked.title", { n: rooms.length })} />
      {msg && <p role="alert" className="text-body-16 text-status-danger-fg">{msg}</p>}
      {rooms.length === 0 ? (
        <p className="text-body-16 text-text-secondary">{t("blocked.none")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rooms.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 rounded-(--glass-radius-sm) bg-surface-card-raised p-3" data-room={r.number}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-title-22 text-text-primary">{r.number}</span>
                <Pill tone="danger">{t(r.status === "OUT_OF_SERVICE" ? "blocked.legacyOos" : "status.OUT_OF_ORDER")}</Pill>
                {r.occupied && <Pill tone="warning">{t("blocked.guestInRoom")}</Pill>}
                {r.arrivalToday && <Pill tone="warning">{t(role === "front_office" ? "blocked.arrivalIntoBlocked" : "blocked.arrivalToday")}</Pill>}
                {r.expired && <Pill tone="warning">{t("blocked.expired")}</Pill>}
                {r.readyForRelease && <Pill tone="success">{t("blocked.ready")}</Pill>}
              </div>
              <p className="text-body-16 text-text-secondary">
                {t("blocked.reason")}: <span className="text-text-primary">{r.reason ?? t("blocked.noReason")}</span>
                {" · "}{t("blocked.until")}: <span className="text-text-primary">{when(r.until)}</span>
              </p>
              {canRelease && (
                <div className="flex flex-wrap gap-2">
                  {canRelease && (
                    <TwoTapButton onConfirm={() => run(() => api(`/api/rooms/${r.id}/status`, { body: { status: "DIRTY" } }))}>{t("blocked.release")}</TwoTapButton>
                  )}
                  {role === "duty_manager" && (
                    <button type="button" className={cx("press text-body-16 min-h-(--size-touch-min) rounded-pill px-3 text-accent-text underline underline-offset-4", FOCUS_RING)}
                      onClick={() => setEdit(edit?.id === r.id ? null : { id: r.id, reason: r.reason ?? "", until: r.until ? r.until.slice(0, 16) : "" })}>
                      {t("blocked.edit")}
                    </button>
                  )}
                </div>
              )}
              {edit?.id === r.id && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <Field className="min-w-0 flex-1" label={t("blocked.reason")} value={edit.reason} maxLength={200} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} />
                  <Field className="min-w-0 flex-1" type="datetime-local" label={t("blocked.until")} value={edit.until} onChange={(e) => setEdit({ ...edit, until: e.target.value })} />
                  <TwoTapButton disabled={!edit.reason.trim() || !edit.until}
                    onConfirm={() => run(() => api(`/api/rooms/${r.id}/ooo`, { method: "PATCH", body: { reason: edit.reason.trim(), until: new Date(edit.until).toISOString() } }))}>
                    {t("roomEdit.save")}
                  </TwoTapButton>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}
