"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/components/api";
import { useSocket } from "@/components/useSocket";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { errorText } from "@/lib/i18n/errorText";
import type { TKey } from "@/lib/i18n/translations";
import type { IconName } from "@/lib/ui/icons";
import type { Tone } from "@/lib/ui/tone";
import { Banner, Button, FilterChip, GlassCard, Pill, SectionLabel } from "@/components/ui";
import { Glyph } from "@/components/ui/primitives";

type Kind = "DND" | "CLEAN_REQUEST" | "CONTACT" | "GREEN"; // GREEN = Betrieb L2 Green Option (sofort erledigt)
type Status = "RECEIVED" | "IN_PROGRESS" | "DONE" | "CANCELLED";

interface GuestRequest {
  id: string;
  kind: Kind;
  detail: string | null;
  status: Status;
  room: { id: string; number: string; floor: number };
  assignedTo: { id: string; name: string } | null;
  createdAt: string;
}

const KIND_ICON: Record<Kind, IconName> = { DND: "moon", CLEAN_REQUEST: "zap", CONTACT: "message", GREEN: "leaf" };
const STATUS_TONE: Record<Status, Tone> = { RECEIVED: "accent", IN_PROGRESS: "info", DONE: "success", CANCELLED: "neutral" };

function parseDetail(json: string | null): Record<string, string> {
  if (!json) return {};
  try {
    return JSON.parse(json) as Record<string, string>;
  } catch {
    return {};
  }
}

function detailText(t: (k: TKey, vars?: Record<string, string | number>) => string, r: GuestRequest): string {
  const d = parseDetail(r.detail);
  if (r.kind === "DND") return d.window ? t(`dndWindow.${d.window}` as TKey) : "";
  if (r.kind === "CLEAN_REQUEST") {
    if (d.timing === "LATER" && d.time) return `${t("cleanTiming.LATER" as TKey)} – ${d.time}`;
    return d.timing ? t(`cleanTiming.${d.timing}` as TKey) : "";
  }
  if (r.kind === "CONTACT") return d.department ? t(`department.${d.department}` as TKey) : "";
  return "";
}

/**
 * Gästeanfragen (Supervisor). Simon-Feedback 19.11.2026: im Design der App („Glas & Premium“) — Karten, Pillen, Knöpfe und
 * Texte wie auf den übrigen Seiten, alle Texte übersetzt. Daten und Aktionen unverändert: Status hier ändern — der
 * Gastbildschirm fragt GET /api/guest/{r,s}/.../status ab und zeigt die Änderung (Prompt G2 Teil 4).
 */
export default function GuestRequestsView({ currentUserId }: { currentUserId: string }) {
  const { t, fmt } = useLocale();
  const [requests, setRequests] = useState<GuestRequest[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ guestRequests: GuestRequest[] }>(`/api/guest-requests${showAll ? "?all=1" : ""}`);
      setRequests(data.guestRequests);
      setError(null);
    } catch (e) {
      setError(errorText(e, t));
    }
  }, [showAll, t]);

  useEffect(() => { void load(); }, [load]);

  useSocket({
    "app:resync": () => void load(),
    "guestrequest:new": () => void load(),
    "guestrequest:update": () => void load(),
  });

  const update = async (id: string, body: { status?: Status; assignedToId?: string | null }) => {
    setBusyId(id);
    setError(null);
    try {
      const { guestRequest } = await api<{ guestRequest: GuestRequest }>(`/api/guest-requests/${id}`, { method: "PATCH", body });
      setRequests((prev) => (prev ?? []).map((r) => (r.id === id ? guestRequest : r)));
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusyId(null);
    }
  };

  const sorted = useMemo(() => [...(requests ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [requests]);
  const openCount = sorted.filter((r) => r.status === "RECEIVED" || r.status === "IN_PROGRESS").length;

  return (
    <div className="theme-glass flex flex-col gap-4 sm:gap-6" data-testid="guest-requests">
      <GlassCard as="section" aria-label={t("guestRequestsPage.title")} className="flex flex-col gap-3">
        <SectionLabel as="h2" icon="bell" title={t("guestRequestsPage.title")} count={openCount} />
        <p className="text-body-16 text-text-muted">{t("guestRequestsPage.intro")}</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("guestRequestsPage.filter")}>
          <FilterChip active={!showAll} onClick={() => setShowAll(false)}>{t("guestRequestsPage.onlyOpen")}</FilterChip>
          <FilterChip active={showAll} onClick={() => setShowAll(true)}>{t("guestRequestsPage.all")}</FilterChip>
        </div>
      </GlassCard>

      {error && <Banner tone="warning" title={error} />}

      {requests && sorted.length === 0 ? (
        <GlassCard className="flex items-center gap-3">
          <Glyph name="check" size={22} className="text-status-success-fg" />
          <p className="text-body-16 text-text-secondary">{showAll ? t("guestRequestsPage.emptyAll") : t("guestRequestsPage.emptyOpen")}</p>
        </GlassCard>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {sorted.map((r) => {
            const busy = busyId === r.id;
            const closed = r.status === "DONE" || r.status === "CANCELLED";
            const detail = detailText(t, r);
            return (
              <li key={r.id}>
                <GlassCard as="article" aria-label={`${t(`guestRequestKind.${r.kind}` as TKey)} · ${t("guestRequestsPage.room", { n: r.room.number })}`}
                  className={closed ? "flex h-full flex-col gap-3 opacity-60" : "flex h-full flex-col gap-3"}>
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-3">
                      <Glyph name={KIND_ICON[r.kind]} size={24} className="shrink-0 text-accent-text" />
                      <span className="text-title-22 min-w-0 text-text-primary">{t(`guestRequestKind.${r.kind}` as TKey)}</span>
                    </span>
                    <Pill tone={STATUS_TONE[r.status]}>{t(`guestRequestStatus.${r.status}` as TKey)}</Pill>
                  </div>
                  <p className="text-body-16 text-text-primary">
                    {t("guestRequestsPage.room", { n: r.room.number })} · {t("supervisor.floorN", { floor: r.room.floor })}
                    {detail && <span className="text-text-secondary"> — {detail}</span>}
                  </p>
                  <p className="text-label text-text-muted">
                    {fmt.dateTime(r.createdAt, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    {r.assignedTo && ` · ${t("guestRequestsPage.assignedTo", { name: r.assignedTo.name })}`}
                  </p>
                  {!closed && (
                    <div className="mt-auto flex flex-wrap gap-2">
                      {r.assignedTo?.id !== currentUserId && (
                        <Button variant="secondary" icon="user" disabled={busy} onClick={() => void update(r.id, { assignedToId: currentUserId })}>
                          {t("guestRequestsPage.take")}
                        </Button>
                      )}
                      {r.status === "RECEIVED" && (
                        <Button variant="secondary" icon="refresh" disabled={busy} onClick={() => void update(r.id, { status: "IN_PROGRESS" })}>
                          {t("guestRequestsPage.inProgress")}
                        </Button>
                      )}
                      <Button icon="check" disabled={busy} onClick={() => void update(r.id, { status: "DONE" })}>
                        {t("guestRequestsPage.done")}
                      </Button>
                    </div>
                  )}
                </GlassCard>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
