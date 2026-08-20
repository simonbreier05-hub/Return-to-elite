"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { useSocket } from "@/components/useSocket";

interface WorkOrder {
  id: string;
  status: "OPEN" | "ACK" | "IN_PROGRESS" | "RESOLVED";
  createdAt: string;
  assignedTo?: { name: string } | null;
  defect: {
    category: string;
    note: string;
    photoPath?: string | null;
    room: { number: string; status: string; floor: number };
    reportedBy: { name: string; role: string };
  };
}

/** Work-order colours borrow the house's status palette (globals.css) so a
 * "start work" button reads the same navy/brass/muted family as a room
 * status tile, rather than stock Tailwind blues/ambers. */
const NEXT: Record<string, { to: string; label: string; cls: string } | undefined> = {
  OPEN: { to: "ACK", label: "Acknowledge", cls: "bg-status-dirty text-linen" },
  ACK: { to: "IN_PROGRESS", label: "Start work", cls: "bg-status-in-progress text-linen" },
  IN_PROGRESS: { to: "RESOLVED", label: "Mark resolved", cls: "bg-status-clean text-linen" },
};

const STATUS_CHIP: Record<string, string> = {
  OPEN: "bg-status-dirty/10 text-status-dirty",
  ACK: "bg-status-inspected/10 text-status-inspected",
  IN_PROGRESS: "bg-status-in-progress/10 text-status-in-progress",
  RESOLVED: "bg-status-clean/10 text-status-clean",
};

export default function EngineeringView() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await api<{ workOrders: WorkOrder[] }>("/api/workorders");
    setOrders(data.workOrders);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Patch the affected work order; a brand-new one is prepended. */
  const upsert = (wo: WorkOrder) =>
    setOrders((prev) => (prev.some((o) => o.id === wo.id) ? prev.map((o) => (o.id === wo.id ? { ...o, ...wo } : o)) : [wo, ...prev]));

  useSocket({
    "workorder:update": (p: { workOrder: WorkOrder }) => {
      if (p.workOrder?.id) upsert(p.workOrder);
    },
  });

  const advance = async (wo: WorkOrder) => {
    const next = NEXT[wo.status];
    if (!next || busyId) return;
    setBusyId(wo.id);
    setError(null);
    try {
      const res = await api<{ workOrder: WorkOrder }>(`/api/workorders/${wo.id}`, {
        method: "PATCH",
        body: { status: next.to },
      });
      upsert(res.workOrder);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const open = orders.filter((o) => o.status !== "RESOLVED");
  const resolved = orders.filter((o) => o.status === "RESOLVED");

  return (
    <div>
      <h2 className="mb-1 font-serif text-3xl">Work orders</h2>
      <p className="mb-4 text-sm text-graphite/70">{open.length} open · {resolved.length} resolved</p>
      {error && (
        <div className="mb-4 rounded-lg border border-status-out-of-order/30 bg-status-out-of-order/10 p-3 text-sm text-status-out-of-order">
          {error}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {[...open, ...resolved].map((wo) => (
          <div key={wo.id} className={`rounded-2xl border border-charcoal/10 bg-white p-4 shadow-sm ${wo.status === "RESOLVED" ? "opacity-60" : ""}`}>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-serif text-2xl">Room {wo.defect.room.number}</span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_CHIP[wo.status]}`}>
                {wo.status.replace(/_/g, " ")}
              </span>
            </div>
            <p className="text-sm">
              <strong>{wo.defect.category.replace(/_/g, " / ")}</strong> — {wo.defect.note}
            </p>
            {wo.defect.photoPath && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={wo.defect.photoPath} alt="Defect photo" className="mt-2 max-h-40 rounded-lg object-cover" />
            )}
            <p className="mt-2 text-xs text-graphite/60">
              Reported by {wo.defect.reportedBy.name} ·{" "}
              {new Date(wo.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              {wo.assignedTo && ` · assigned to ${wo.assignedTo.name}`}
            </p>
            {NEXT[wo.status] && (
              <button
                onClick={() => advance(wo)}
                disabled={busyId === wo.id}
                className={`mt-3 h-12 w-full rounded-xl text-base font-semibold transition active:scale-[0.98] disabled:opacity-50 ${NEXT[wo.status]!.cls}`}
              >
                {busyId === wo.id ? "…" : NEXT[wo.status]!.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
