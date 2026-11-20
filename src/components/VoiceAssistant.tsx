"use client";

import { useCallback, useEffect, useState } from "react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { useLocale } from "@/lib/i18n/LocaleContext";
import CloseButton from "./CloseButton";
import { useEscapeKey } from "./useEscapeKey";

/**
 * Schwebender Sprachassistent (ElevenLabs) für Personal-Seiten im AppShell.
 * Erscheint nur, wenn `GET /api/voice-agent` `enabled` meldet. Sitzungsdaten
 * (Token oder Agent-ID) kommen erst beim Start von `POST /api/voice-agent`.
 */
export default function VoiceAssistant() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    fetch("/api/voice-agent")
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => setEnabled(Boolean(d.enabled)))
      .catch(() => setEnabled(false));
  }, []);
  if (!enabled) return null;
  return (
    <ConversationProvider>
      <VoiceAssistantPanel />
    </ConversationProvider>
  );
}

type SessionData = { conversationToken?: string; agentId?: string };

function VoiceAssistantPanel() {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const conversation = useConversation({
    onError: () => setError(t("voice.error")),
  });
  const { status, isSpeaking, startSession, endSession } = conversation;
  const live = status === "connected";

  const start = useCallback(async () => {
    setError(null);
    setStarting(true);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError(t("voice.micDenied"));
      setStarting(false);
      return;
    }
    try {
      const res = await fetch("/api/voice-agent", { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      const d = (await res.json()) as SessionData;
      if (d.conversationToken) startSession({ conversationToken: d.conversationToken, connectionType: "webrtc" });
      else if (d.agentId) startSession({ agentId: d.agentId, connectionType: "webrtc" });
      else throw new Error("no session data");
    } catch {
      setError(t("voice.error"));
    } finally {
      setStarting(false);
    }
  }, [startSession, t]);

  const close = useCallback(() => {
    if (status === "connected" || status === "connecting") endSession();
    setOpen(false);
  }, [status, endSession]);

  useEscapeKey(close, open);

  // Sitzung beim Verlassen der Seite sauber beenden.
  useEffect(() => () => { endSession(); }, [endSession]);

  const statusText =
    status === "connected" ? (isSpeaking ? t("voice.speaking") : t("voice.listening"))
    : status === "connecting" || starting ? t("voice.connecting")
    : t("voice.idle");

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("voice.open")}
          title={t("voice.open")}
          className="fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-navy text-linen shadow-2xl transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
        >
          <MicIcon />
        </button>
      )}
      {open && (
        <div
          role="dialog"
          aria-label={t("voice.title")}
          className="fixed inset-x-2 bottom-2 z-50 mx-auto max-w-sm rounded-2xl border border-charcoal/10 bg-linen p-4 shadow-2xl sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-80"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-serif text-lg text-navy">{t("voice.title")}</span>
            <CloseButton onClick={close} />
          </div>
          <p className="mt-3 flex items-center gap-2 text-sm text-charcoal" aria-live="polite">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${live ? "bg-gold" : "bg-charcoal/25"}`} aria-hidden />
            {statusText}
          </p>
          {error && <p className="mt-2 text-sm text-status-out-of-order" role="alert">{error}</p>}
          <div className="mt-4">
            {live || status === "connecting" ? (
              <button type="button" onClick={() => endSession()}
                className="h-11 w-full rounded-lg border border-charcoal/15 bg-white text-sm font-medium text-charcoal hover:bg-parchment">
                {t("voice.stop")}
              </button>
            ) : (
              <button type="button" onClick={start} disabled={starting}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-navy text-sm font-medium text-linen hover:opacity-90 disabled:opacity-60">
                <MicIcon small /> {t("voice.start")}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function MicIcon({ small = false }: { small?: boolean }) {
  return (
    <svg className={small ? "h-4 w-4" : "h-6 w-6"} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
    </svg>
  );
}
