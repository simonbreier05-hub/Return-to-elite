"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/components/api";
import { getSocket, useSocket } from "@/components/useSocket";
import { useCoalescedRefetch } from "@/components/useCoalescedRefetch";
import CloseButton from "@/components/CloseButton";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { ChannelSummary, ChatMessageView } from "@/lib/chat/service";
import { channelTitle } from "./labels";

interface ChatState {
  channels: ChannelSummary[];
  unread: number;
  me: { id: string; role: string } | null;
  canReview: boolean;
  refresh: () => void;
  /** Gerade geöffneter Kanal (kein Toast dafür). */
  setActive: (channelId: string | null) => void;
}

const Ctx = createContext<ChatState>({ channels: [], unread: 0, me: null, canReview: false, refresh: () => {}, setActive: () => {} });
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
 * (POST /api/chat/join, bei jeder Verbindung neu), hält Kanäle + Ungelesen-Zähler und zeigt einen Toast bei neuer Nachricht.
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  const pathname = usePathname();
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [me, setMe] = useState<{ id: string; role: string } | null>(null);
  const [canReview, setCanReview] = useState(false);
  const [toast, setToast] = useState<{ channelId: string; title: string; text: string; urgent: boolean } | null>(null);
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
    "chat:message": (p: unknown) => {
      const m = asChatMessage(p);
      soon();
      if (!m || !me || m.author.id === me.id) return;
      if (active.current === m.channelId && pathname?.startsWith("/chat")) return;
      const ch = channels.find((c) => c.id === m.channelId);
      setToast({ channelId: m.channelId, title: `${ch ? channelTitle(ch, t) : t("chat.title")} · ${m.author.name}`, text: m.body.slice(0, 90), urgent: m.urgent });
    },
    "chat:read": () => soon(),
    "chat:retracted": () => soon(),
    "chat:channels": () => { soon(); void join(); },
  });

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), toast.urgent ? 12000 : 6000);
    return () => clearTimeout(id);
  }, [toast]);

  const value = useMemo<ChatState>(() => ({
    channels, me, canReview, refresh: () => { void load(); },
    unread: channels.reduce((n, c) => n + (c.unread || 0), 0),
    setActive: (id) => { active.current = id; },
  }), [channels, me, canReview, load]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {toast && (
        <div role="status" className={`fixed inset-x-3 bottom-4 z-50 mx-auto flex max-w-md items-start gap-2 rounded-2xl border p-3 shadow-2xl ${toast.urgent ? "border-status-out-of-order/40 bg-white" : "border-gold-line/60 bg-linen"}`}>
          <Link href={`/chat?c=${encodeURIComponent(toast.channelId)}`} onClick={() => setToast(null)} className="min-h-11 min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-gold-soft">{toast.urgent ? `⚠ ${t("chat.urgent")} · ` : ""}{toast.title}</p>
            <p className="truncate text-sm">{toast.text}</p>
          </Link>
          <CloseButton onClick={() => setToast(null)} />
        </div>
      )}
    </Ctx.Provider>
  );
}
