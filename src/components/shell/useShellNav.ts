"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useChat } from "@/components/chat/ChatContext";
import { api } from "@/components/api";
import { useCoalescedRefetch } from "@/components/useCoalescedRefetch";
import { useSocket } from "@/components/useSocket";
import { activeEntryId, navFor, tabsFor, type NavEntry } from "@/lib/nav";

/*
 * Simon-Feedback 19.11.: Zahl der Zimmer in der Freigabe-Warteschlange neben „Freigabe“ — nur wenn die Rolle den Punkt hat,
 * bei 0 ausgeblendet, ruhig dargestellt (kein Rot, kein Ton). Seitenleiste, Icon-Leiste und Tab-Leiste teilen sich eine
 * Abfrage (gemeinsamer Stand im Modul); Zimmer-Änderungen lösen gebündelt ein Neuladen aus.
 */
let releaseCount = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<(n: number) => void>();
function reloadReleaseCount() {
  inflight ??= api<{ count: number }>("/api/rooms/release-count")
    .then((r) => { releaseCount = r.count; listeners.forEach((l) => l(releaseCount)); })
    .catch(() => { /* Zahl bleibt stehen */ })
    .finally(() => { inflight = null; });
}

function useReleaseCount(enabled: boolean): number {
  const [count, setCount] = useState(releaseCount);
  useEffect(() => {
    if (!enabled) return;
    listeners.add(setCount);
    reloadReleaseCount();
    return () => { listeners.delete(setCount); };
  }, [enabled]);
  const refetch = useCoalescedRefetch(() => { if (enabled) reloadReleaseCount(); }, 2000);
  useSocket({ "room:update": refetch, "dayplan:updated": refetch });
  return enabled ? count : 0;
}

/** Menü der Rolle mit aktivem Eintrag und Zählern (Chat-Ungelesen aus ChatProvider, Freigabe-Warteschlange). */
export function useShellNav(role: string) {
  const pathname = usePathname() ?? "";
  const { unread } = useChat();
  const entries = navFor(role);
  const release = useReleaseCount(entries.some((e) => e.count === "release"));
  const countOf = (e: NavEntry): number | undefined => {
    const n = e.count === "chat" ? unread : e.count === "release" ? release : 0;
    return n > 0 ? n : undefined;
  };
  /** Ruhiger Zähler (gedämpft, zählt nicht in „Mehr“). */
  const quietOf = (e: NavEntry): boolean => e.count === "release";
  return { entries, active: activeEntryId(role, pathname), countOf, quietOf, ...tabsFor(role) };
}
