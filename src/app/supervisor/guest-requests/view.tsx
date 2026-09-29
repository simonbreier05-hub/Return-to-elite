"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/components/api";
import { useSocket } from "@/components/useSocket";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";

type Kind = "DND" | "CLEAN_REQUEST" | "CONTACT";
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

const KIND_ICON: Record<Kind, string> = { DND: "🔕", CLEAN_REQUEST: "✨", CONTACT: "💬" };

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
 * The write side of "jede Antwort/Erledigung wird dem Gast als Status
 * angezeigt" (Prompt G2 Teil 4): the guest screen already polls
 * GET /api/guest/{r,s}/.../status (Teil 3) — marking a request IN_PROGRESS/
 * DONE here is what that poll picks up.
 */
export default function GuestRequestsView({ currentUserId }: { currentUserId: string }) {
  const { t } = useLocale();
  const [requests, setRequests] = useState<GuestRequest[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ guestRequests: GuestRequest[] }>(`/api/guest-requests${showAll ? "?all=1" : ""}`);
      setRequests(data.guestRequests);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Konnte Gästeanfragen nicht laden.");
    }
  }, [showAll]);

  useEffect(() => {
    load();
  }, [load]);

  useSocket({
    "guestrequest:new": () => load(),
    "guestrequest:update": () => load(),
  });

  const update = async (id: string, body: { status?: Status; assignedToId?: string | null }) => {
    setBusyId(id);
    setError(null);
    try {
      const { guestRequest } = await api<{ guestRequest: GuestRequest }>(`/api/guest-requests/${id}`, {
        method: "PATCH",
        body,
      });
      setRequests((prev) => prev.map((r) => (r.id === id ? guestRequest : r)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Aktualisieren fehlgeschlagen.");
    } finally {
      setBusyId(null);
    }
  };

  const sorted = useMemo(() => [...requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [requests]);

  return (
    <div className="animate-rise">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-4xl leading-none">Gästeanfragen</h2>
          <div className="rule-gold my-2 w-40" />
          <p className="max-w-2xl text-sm text-graphite/70">
            Bitte-nicht-stören-, Reinigungs- und Abteilungswünsche direkt vom Gästebildschirm. Status hier ändern —
            der Gast sieht die Änderung auf seinem Gerät.
          </p>
        </div>
        <button
          onClick={() => setShowAll((v) => !v)}
          className="h-11 rounded-lg border border-charcoal/15 bg-linen px-4 text-sm font-medium hover:border-gold-line"
        >
          {showAll ? "Nur offene anzeigen" : "Alle anzeigen"}
        </button>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {sorted.length === 0 ? (
        <p className="rounded-2xl border border-charcoal/10 bg-linen p-8 text-center text-graphite/60 shadow-card">
          Keine {showAll ? "" : "offenen "}Gästeanfragen.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {sorted.map((r) => {
            const busy = busyId === r.id;
            return (
              <div key={r.id} className={`rounded-2xl border border-charcoal/10 bg-white p-4 shadow-sm ${r.status === "DONE" || r.status === "CANCELLED" ? "opacity-60" : ""}`}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-serif text-2xl">
                    {KIND_ICON[r.kind]} {t(`guestRequestKind.${r.kind}` as TKey)}
                  </span>
                  <span className="rounded-full bg-navy/10 px-3 py-1 text-xs font-semibold text-navy">
                    {t(`guestRequestStatus.${r.status}` as TKey)}
                  </span>
                </div>
                <p className="text-sm">
                  {t("supervisor.floorN", { floor: r.room.floor })} · Zimmer {r.room.number}
                  {detailText(t, r) && ` — ${detailText(t, r)}`}
                </p>
                <p className="mt-1 text-xs text-graphite/60">
                  {new Date(r.createdAt).toLocaleString([], { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
                  {r.assignedTo && ` · zugewiesen an ${r.assignedTo.name}`}
                </p>

                {r.status !== "DONE" && r.status !== "CANCELLED" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {r.assignedTo?.id !== currentUserId && (
                      <button
                        onClick={() => update(r.id, { assignedToId: currentUserId })}
                        disabled={busy}
                        className="h-10 rounded-lg border border-charcoal/15 px-3 text-sm font-medium disabled:opacity-50"
                      >
                        Übernehmen
                      </button>
                    )}
                    {r.status === "RECEIVED" && (
                      <button
                        onClick={() => update(r.id, { status: "IN_PROGRESS" })}
                        disabled={busy}
                        className="h-10 rounded-lg bg-status-in-progress px-3 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        In Bearbeitung
                      </button>
                    )}
                    <button
                      onClick={() => update(r.id, { status: "DONE" })}
                      disabled={busy}
                      className="h-10 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {busy ? "…" : "Erledigt"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
