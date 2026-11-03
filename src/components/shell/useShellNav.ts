"use client";

import { usePathname } from "next/navigation";
import { useChat } from "@/components/chat/ChatContext";
import { activeEntryId, navFor, tabsFor, type NavEntry } from "@/lib/nav";

/** Menü der Rolle mit aktivem Eintrag und Zählern aus bestehenden Quellen (Chat-Ungelesen aus ChatProvider). */
export function useShellNav(role: string) {
  const pathname = usePathname() ?? "";
  const { unread } = useChat();
  const countOf = (e: NavEntry): number | undefined => (e.count === "chat" && unread > 0 ? unread : undefined);
  return { entries: navFor(role), active: activeEntryId(role, pathname), countOf, ...tabsFor(role) };
}
