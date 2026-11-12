"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { api } from "@/components/api";
import { getSocket, useSocket } from "@/components/useSocket";
import { useCoalescedRefetch } from "@/components/useCoalescedRefetch";
import type { ChannelSummary, ChatMessageView } from "@/lib/chat/service";

interface ChatState {
  channels: ChannelSummary[];
  unread: number;
  me: { id: string; role: string } | null;
  canReview: boolean;
  refresh: () => void;
  /** Gerade geöffneter Kanal (kein Pop-up dafür). */
  setActive: (channelId: string | null) => void;
  /** Welcher Kanal ist gerade offen? (Meldungs-Zentrum: kein Pop-up für den offenen Kanal.) */
  activeChannel: () => string | null;
}

const Ctx = createContext<ChatState>({ channels: [], unread: 0, me: null, canReview: false, refresh: () => {}, setActive: () => {}, activeChannel: () => null });
export const useChat = () => useContext(Ctx);

/** Live-Payload prüfen — unvollständige Nachrichten dürfen nichts zum Absturz bringen. */
export function asChatMessage(p: unknown): ChatMessageView | null {
  const m = (p as { message?: Partial<ChatMessageView> } | null)?.message;
  if (!m || typeof m.id !== "string" || typeof m.channelId !== "string" || !m.author || typeof m.author.id !== "string") return null;
  return {
    id: m.id, channelId: m.channelId, body: typeof m.body === "string" ? m.body : "", originalLanguage: m.originalLanguage ?? "",
    urgent: !!m.urgent, createdAt: typeof m.createdAt === "string" ? m.createdAt : new Date().toISOString(),
    author: { id: m.author.id, name: m.author.name ?? "", role: m.author.role ?? "" }, retracted: !!m.retracted, hidden: !!m.hidden,
  };
}

/**
 * Chat-Zustand für jede Staff-Seite (in AppShell): setzt den eigenen Socket serverseitig in die erlaubten Räume
 * (POST /api/chat/join, bei jeder Verbindung neu) und hält Kanäle + Ungelesen-Zähler. Das Pop-up bei neuer Nachricht zeigt
 * das Meldungs-Zentrum (`src/components/notify/`), im selben Glas-System wie alle anderen Meldungen.
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [me, setMe] = useState<{ id: string; role: string } | null>(null);
  const [canReview, setCanReview] = useState(false);
  const active = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<{ channels?: ChannelSummary[]; me?: { id: string; role: string }; canReview?: boolean }>("/api/chat/channels");
      setChannels(Array.isArray(d.channels) ? d.channels : []);
      setMe(d.me ?? null);
      setCanReview(!!d.canReview);
    } catch { /* Chat nicht erreichbar — Hub läuft ohne Badge weiter */ }
  }, []);
  const join = useCallback(async () => {
    const s = getSocket();
    if (!s.id) return;
    try { await api("/api/chat/join", { body: { socketId: s.id } }); } catch { /* nächster Versuch beim nächsten Verbinden */ }
  }, []);
  const soon = useCoalescedRefetch(() => { void load(); }, 800);

  useEffect(() => {
    void load();
    const s = getSocket();
    const onConnect = () => { void join(); };
    if (s.connected) void join();
    s.on("connect", onConnect);
    return () => { s.off("connect", onConnect); };
  }, [load, join]);

  useSocket({
    "chat:message": () => soon(),
    "chat:read": () => soon(),
    "chat:retracted": () => soon(),
    "chat:channels": () => { soon(); void join(); },
  });

  const value = useMemo<ChatState>(() => ({
    channels, me, canReview, refresh: () => { void load(); },
    unread: channels.reduce((n, c) => n + (c.unread || 0), 0),
    setActive: (id) => { active.current = id; },
    activeChannel: () => (pathname?.startsWith("/chat") ? active.current : null),
  }), [channels, me, canReview, load, pathname]);

  return (
    <Ctx.Provider value={value}>
      {children}
    </Ctx.Provider>
  );
}
