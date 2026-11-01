"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { api } from "@/components/api";
import Modal from "@/components/Modal";
import { StatusIcon, IconBan } from "@/components/icons";
import { STATUS_STYLES } from "@/components/status";
import { RoomFlagIcons } from "@/components/RoomFlags";
import type { RoomStatus } from "@/lib/domain";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";

/** Statuses that mean "nothing left to do here today" for the roster's done/current/upcoming split. */
const DONE_STATUSES = new Set<RoomStatus>(["CLEAN", "INSPECTED"]);

export interface RosterRoom {
  id: string;
  number: string;
  floor: number;
  status: RoomStatus;
  routeOrder?: number | null;
  blockReason?: string | null;
  occupancy?: string | null;
  isCheckoutToday: boolean;
  arrivals: { guestName: string }[];
  assignedTo?: { id: string; name: string } | null;
}

export interface RosterAttendant {
  id: string;
  name: string;
  currentRoomId?: string | null;
  /** Radio-friendly daily number set when a morning plan is applied (see src/lib/assignment/dailyNumbers.ts) — null before that. */
  dailyNumber?: number | null;
}

/** "#3 Maria Silva" once a plan has assigned a daily number, otherwise just the name — mirrors supervisor/view.tsx's own attendantLabel so the same person reads the same way everywhere on this screen. */
function attendantLabel(a: { name: string; dailyNumber?: number | null }): string {
  return a.dailyNumber ? `#${a.dailyNumber} ${a.name}` : a.name;
}

/**
 * Clickable roster of today's housekeepers (v4 Aufgabe A). Each row opens a
 * detail list of that person's rooms in Laufplan order, split into
 * done / current / upcoming — with DND called out separately, independent of
 * that grouping — and a "move to…" control per room (v4 Aufgabe B) so a
 * supervisor can hand a room to a faster/slower colleague in three taps:
 * open the row, open the move dropdown, pick a name.
 */
export default function HousekeeperRoster({
  attendants,
  rooms,
  onMoved,
}: {
  attendants: RosterAttendant[];
  rooms: RosterRoom[];
  /** Called after a successful move so the parent can patch/refetch its room list. */
  onMoved: () => void;
}) {
  const { t } = useLocale();
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Stable, deterministic numbering for the day — alphabetical, not arrival order.
  const sorted = useMemo(() => [...attendants].sort((a, b) => a.name.localeCompare(b.name)), [attendants]);

  const roomsFor = (attendantId: string) =>
    rooms
      .filter((r) => r.assignedTo?.id === attendantId)
      .sort((a, b) => (a.routeOrder ?? Infinity) - (b.routeOrder ?? Infinity) || a.number.localeCompare(b.number));

  const openAttendant = sorted.find((a) => a.id === openId) ?? null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {sorted.length === 0 && <p className="text-sm text-graphite/60">{t("roster.noAttendants")}</p>}
        {sorted.map((a, i) => {
          const theirRooms = roomsFor(a.id);
          const done = theirRooms.filter((r) => DONE_STATUSES.has(r.status)).length;
          return (
            <button
              key={a.id}
              onClick={() => setOpenId(a.id)}
              className="flex items-center gap-2 rounded-xl border border-charcoal/15 bg-ivory px-3 py-2 text-start text-sm hover:border-gold-line active:scale-[0.98]"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy text-[0.68rem] font-semibold text-ivory">
                {a.dailyNumber ?? i + 1}
              </span>
              <span>
                <div className="font-medium">{a.name}</div>
                <div className="text-xs text-graphite/60">{t("roster.roomsDone", { done, total: theirRooms.length })}</div>
              </span>
            </button>
          );
        })}
      </div>

      {openAttendant && (
        <Modal
          title={t("roster.detailTitle", { name: attendantLabel(openAttendant) })}
          subtitle={t("roster.detailSubtitle")}
          onClose={() => setOpenId(null)}
        >
          {error && (
            <div className="mb-3 rounded-lg border border-status-out-of-order/30 bg-status-out-of-order/10 px-3 py-2 text-sm text-status-out-of-order">
              {error}
            </div>
          )}
          <div className="space-y-1.5">
            {roomsFor(openAttendant.id).length === 0 && <p className="text-sm text-graphite/60">{t("roster.noRooms")}</p>}
            {roomsFor(openAttendant.id).map((room) => {
              const style = STATUS_STYLES[room.status];
              const isCurrent = room.id === openAttendant.currentRoomId;
              const isDone = DONE_STATUSES.has(room.status);
              const isDnd = room.blockReason === "DND";
              const notArrivedYet = room.occupancy !== "OCCUPIED" && room.arrivals.length > 0;
              const groupLabel = isCurrent ? t("roster.current") : isDone ? t("roster.done") : t("roster.upcoming");
              const others = sorted.filter((a) => a.id !== openAttendant.id);
              return (
                <div
                  key={room.id}
                  className={`rounded-lg border px-3 py-2 ${
                    isCurrent
                      ? "border-gold bg-parchment"
                      : isDone
                        ? "border-charcoal/10 bg-linen/60 opacity-70"
                        : "border-charcoal/10 bg-white"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    {isDone && <span aria-hidden className="text-status-inspected">✓</span>}
                    <span className="font-serif text-lg">{room.number}</span>
                    <span className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.65rem] font-medium ${style.chip}`}>
                      <StatusIcon iconKey={style.iconKey} className="h-3 w-3 shrink-0" />
                      {t(`status.${room.status}` as TKey)}
                    </span>
                    <span className="rounded-full bg-charcoal/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-graphite/70">
                      {groupLabel}
                    </span>
                    {notArrivedYet && (
                      <span className="rounded-full border border-gold-line/60 bg-gold-soft/30 px-2 py-0.5 text-[0.65rem] font-medium text-gold-soft">
                        {t("roster.notArrivedYet")}
                      </span>
                    )}
                    {isDnd && (
                      <span className="flex items-center gap-1 rounded-full border border-status-blocked/40 bg-status-blocked/10 px-2 py-0.5 text-[0.65rem] font-semibold text-status-blocked">
                        <IconBan className="h-3 w-3 shrink-0" />
                        {t("roster.dnd")}
                      </span>
                    )}
                    <RoomFlagIcons occupancy={room.occupancy} isCheckoutToday={room.isCheckoutToday} badgeClassName="h-4 w-4" iconClassName="h-2.5 w-2.5" />
                  </div>

                  <Link href="/floor-plan" className="mt-1.5 inline-flex min-h-11 items-center text-xs font-medium text-gold-soft hover:underline">
                    {t("roster.changeInFloorPlan")}
                  </Link>
                </div>
              );
            })}
          </div>
        </Modal>
      )}
    </>
  );
}
