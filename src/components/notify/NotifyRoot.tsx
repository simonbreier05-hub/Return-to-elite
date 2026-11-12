"use client";

import type { ReactNode } from "react";
import { ChatProvider } from "@/components/chat/ChatContext";
import { NotifyProvider } from "./NotifyContext";
import { NotifyLayer } from "./NotifyLayer";

/**
 * Meldungs-Zentrum einbinden: in AppShell (alle Rollen-Seiten, dort steckt der ChatProvider schon außen) und im
 * Planungstool (`withChat`: bringt den Chat-Zustand mit, damit Chat-Pop-ups überall gleich erscheinen).
 */
export function NotifyRoot({ role, onOpenRoom, withChat = false, children }: { role: string; onOpenRoom?: (roomId: string, number: string | null) => void; withChat?: boolean; children: ReactNode }) {
  const inner = (
    <NotifyProvider role={role} onOpenRoom={onOpenRoom}>
      {children}
      <NotifyLayer />
    </NotifyProvider>
  );
  return withChat ? <ChatProvider>{inner}</ChatProvider> : inner;
}
