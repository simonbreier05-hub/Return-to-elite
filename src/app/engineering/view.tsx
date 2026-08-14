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

const NEXT: Record<string, { to: string; label: string; cls: string } | undefined> = {
  OPEN: { to: "ACK", label: "Acknowledge", cls: "bg-blue-600 text-white" },
  ACK: { to: "IN_PROGRESS", label: "Start work", cls: "bg-amber-600 text-white" },
  IN_PROGRESS: { to: "RESOLVED", label: "Mark resolved", cls: "bg-emerald-600 text-white" },
};

const STATUS_CHIP: Record<string, string> = {
  OPEN: "bg-red-100 text-red-800",
  ACK: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-amber-100 text-amber-800",
  RESOLVED: "bg-emerald-100 text-emerald-800",
};

export default function EngineeringView() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await api<{ workOrders: WorkOrder[] }>("/api/workorders");
    setOrders(data.workOrders);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useSocket({ "workorder:update": () => load(), "notification:new": () => load() });

  const advance = async (wo: WorkOrder) => {
    const next = NEXT[wo.status];
    if (!next) return;
    setError(null);
    try {
      await api(`/api/workorders/${wo.id}`, { method: "PATCH", body: { status: next.to } });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const open = orders.filter((o) => o.status !== "RESOLVED");
  const resolved = orders.filter((o) => o.status === "RESOLVED");

  return (
    <div>
      <h2 className="mb-1 font-serif text-3xl">Work orders</h2>
      <p className="mb-4 text-sm text-graphite/70">{open.length} open · {resolved.length} resolved</p>
      {error && <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

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
              <button onClick={() => advance(wo)}
                className={`mt-3 h-12 w-full rounded-xl text-base font-semibold active:scale-[0.98] ${NEXT[wo.status]!.cls}`}>
                {NEXT[wo.status]!.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
