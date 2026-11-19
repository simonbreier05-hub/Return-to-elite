"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/components/api";
import Modal from "@/components/Modal";
import RoomDetailModal, { type SearchedRoom } from "@/components/RoomDetailModal";
import LiveRoomModal from "@/components/lists/LiveRoomModal";
import { asChatMessage, useChat } from "@/components/chat/ChatContext";
import { channelTitle } from "@/components/chat/labels";
import { useSocket } from "@/components/useSocket";
import { CHAT_MAX_LENGTH, tokenize } from "@/lib/chat/text";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { errorText } from "@/lib/i18n/errorText";
import type { TKey } from "@/lib/i18n/translations";
import type { ChannelSummary, ChatMessageView } from "@/lib/chat/service";
import { hhmm, dateTime } from "@/lib/i18n/format";

const PRIVACY_KEY = "stayclean.chat.privacySeen";
const RETRACT_MS = 5 * 60_000; // gleich RETRACT_WINDOW_MS im Server (Server prüft)
const portal = (node: React.ReactNode) => (typeof document === "undefined" ? null : createPortal(node, document.body));

/**
 * Chat-Hub: Kanalliste (Abteilungskanäle + Direktnachrichten, Ungelesen-Badges) und Verlauf (neueste unten).
 * Handy: erst Liste, dann Verlauf mit „← Kanäle“; ab md zweispaltig. Alle Rechte prüft der Server — die Oberfläche zeigt nur,
 * was `/api/chat/*` liefert. Nachrichten erscheinen immer im Original (Übersetzung folgt in Prompt K).
 */
export default function ChatView() {
  const { t } = useLocale();
  const { channels, me, canReview, refresh, setActive } = useChat();
  const [selected, setSelected] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [review, setReview] = useState(false);
  const [retentionDays, setRetentionDays] = useState(14);

  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("c");
    if (c) setSelected(c);
    try { if (!window.localStorage.getItem(PRIVACY_KEY)) setPrivacy(true); } catch { setPrivacy(true); }
    api<{ settings?: { chatRetentionDays?: number } }>("/api/settings").then((d) => { if (d.settings?.chatRetentionDays) setRetentionDays(d.settings.chatRetentionDays); }).catch(() => {});
  }, []);
  useEffect(() => { setActive(selected); return () => setActive(null); }, [selected, setActive]);

  const current = channels.find((c) => c.id === selected) ?? null;
  const groups = useMemo(() => ({ ch: channels.filter((c) => c.kind === "CHANNEL"), dm: channels.filter((c) => c.kind === "DIRECT") }), [channels]);
  const closePrivacy = () => { try { window.localStorage.setItem(PRIVACY_KEY, "1"); } catch { /* nur Komfort */ } setPrivacy(false); };

  const item = (c: ChannelSummary) => (
    <li key={c.id}>
      <button type="button" onClick={() => setSelected(c.id)} aria-current={c.id === selected}
        className={`flex min-h-12 w-full items-center gap-2 rounded-(--glass-radius-md) px-3 text-start text-sm transition ${c.id === selected ? "bg-champagne text-text-on-accent" : ""}`}>
        <span aria-hidden>{c.kind === "DIRECT" ? "👤" : "#"}</span>
        <span className="min-w-0 flex-1 truncate font-medium">{channelTitle(c, t)}</span>
        {c.kind === "DIRECT" && c.partner && <span className={`hidden text-xs sm:inline ${c.id === selected ? "text-text-on-accent/70" : "text-text-muted"}`}>{t(`role.${c.partner.role}` as TKey)}</span>}
        {c.unread > 0 && <span aria-label={t("chat.unreadAria", { n: c.unread })} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${c.id === selected ? "bg-surface-card-raised text-accent-text" : "bg-champagne text-text-on-accent"}`}>{c.unread}</span>}
      </button>
    </li>
  );

  return (
    <div className="theme-glass grid gap-4 md:grid-cols-[17rem_1fr]">
      <aside className={`${current ? "hidden md:block" : ""} glass rounded-(--glass-radius-lg) p-3`}>
        {groups.ch.length > 0 && <>
          <h3 className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wider text-text-muted">{t("chat.channels")}</h3>
          <ul className="mb-3 space-y-1">{groups.ch.map(item)}</ul>
        </>}
        <h3 className="px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">{t("chat.directs")}</h3>
        <ul className="mb-2 space-y-1">{groups.dm.map(item)}</ul>
        <button type="button" onClick={() => setPicker(true)} className="mb-2 h-11 w-full rounded-(--glass-radius-md) border border-border-subtle bg-surface-progress-track text-sm font-medium">+ {t("chat.newDirect")}</button>
        <div className="flex flex-wrap gap-x-3 px-2">
          <button type="button" onClick={() => setPrivacy(true)} className="min-h-11 text-xs text-text-secondary underline underline-offset-2">{t("chat.privacyLink")}</button>
          {canReview && <button type="button" onClick={() => setReview(true)} className="min-h-11 text-xs text-text-secondary underline underline-offset-2">{t("chat.review")}</button>}
        </div>
      </aside>

      <section className={`${current ? "" : "hidden md:block"} min-w-0`}>
        {current && me ? (
          <Conversation key={current.id} channel={current} me={me} onBack={() => setSelected(null)} onRead={refresh} />
        ) : (
          <p className="rounded-(--glass-radius-lg) border border-border-subtle bg-surface-card-raised p-6 text-sm text-text-secondary">{t("chat.pickChannel")}</p>
        )}
      </section>

      {picker && <PeoplePicker onClose={() => setPicker(false)} onPick={async (userId) => {
        const r = await api<{ channelId: string }>("/api/chat/direct", { body: { userId } });
        setPicker(false); refresh(); setSelected(r.channelId);
      }} />}
      {privacy && portal(
        <Modal title={t("chat.privacyTitle")} onClose={closePrivacy}>
          <p className="mb-4 text-sm leading-relaxed">{t("chat.privacyText", { days: retentionDays })}</p>
          <button type="button" onClick={closePrivacy} className="h-12 w-full rounded-(--glass-radius-md) bg-champagne text-sm font-semibold text-text-on-accent">{t("chat.privacyOk")}</button>
        </Modal>,
      )}
      {review && <ReviewPanel onClose={() => setReview(false)} />}
    </div>
  );
}

function Conversation({ channel, me, onBack, onRead }: { channel: ChannelSummary; me: { id: string; role: string }; onBack: () => void; onRead: () => void }) {
  const { t, fmt } = useLocale();
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const markRead = useCallback(() => { api(`/api/chat/channels/${channel.id}/read`, { method: "POST" }).then(onRead).catch(() => {}); }, [channel.id, onRead]);
  const loadMessages = () => {
    api<{ messages: ChatMessageView[]; hasMore: boolean }>(`/api/chat/channels/${channel.id}/messages`)
      .then((d) => { setMessages(Array.isArray(d.messages) ? d.messages : []); setHasMore(!!d.hasMore); markRead(); })
      .catch((e) => setError(errorText(e, t)));
  };
  useEffect(() => {
    loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length]);

  useSocket({
    "app:resync": () => loadMessages(), // App wieder offen/online: verpasste Nachrichten nachladen
    "chat:message": (p: unknown) => {
      const m = asChatMessage(p);
      if (!m || m.channelId !== channel.id) return;
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      if (m.author.id !== me.id) markRead();
    },
    "chat:retracted": (p: { channelId?: string; messageId?: string; kind?: string } | null) => {
      if (!p || p.channelId !== channel.id || !p.messageId) return;
      setMessages((prev) => prev.map((x) => (x.id === p.messageId ? { ...x, body: "", retracted: p.kind !== "hidden", hidden: p.kind === "hidden" } : x)));
    },
    // Betrieb L2 (Punkt 10): jemand hat gelesen → nur die Lesebestätigungen nachladen (nie selbst „gelesen“ melden: keine Schleife)
    "chat:receipt": (p: { channelId?: string } | null) => {
      if (!p || p.channelId !== channel.id) return;
      api<{ messages: ChatMessageView[] }>(`/api/chat/channels/${channel.id}/messages`)
        .then((d) => {
          const by = new Map((d.messages ?? []).map((x) => [x.id, x.readBy]));
          setMessages((prev) => prev.map((x) => (by.has(x.id) ? { ...x, readBy: by.get(x.id) } : x)));
        })
        .catch(() => {});
    },
  });

  const older = async () => {
    const first = messages[0];
    if (!first) return;
    const d = await api<{ messages: ChatMessageView[]; hasMore: boolean }>(`/api/chat/channels/${channel.id}/messages?before=${encodeURIComponent(first.createdAt)}`);
    setMessages((prev) => [...(d.messages ?? []), ...prev]);
    setHasMore(!!d.hasMore);
  };
  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true); setError(null);
    try {
      const r = await api<{ message: ChatMessageView }>(`/api/chat/channels/${channel.id}/messages`, { body: { body, urgent } });
      setMessages((prev) => (prev.some((x) => x.id === r.message.id) ? prev : [...prev, r.message]));
      setText(""); setUrgent(false);
    } catch (e) { setError(errorText(e, t, "chat.sendFailed")); }
    finally { setBusy(false); }
  };
  const retract = async (id: string) => {
    try { await api(`/api/chat/messages/${id}/retract`, { method: "POST" }); } catch (e) { setError(errorText(e, t)); }
  };

  return (
    <div className="glass flex h-[calc(100dvh-8.5rem)] min-h-[24rem] flex-col rounded-(--glass-radius-lg)">
      <header className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
        <button type="button" onClick={onBack} className="flex h-11 items-center rounded-(--glass-radius-sm) px-2 text-sm font-medium text-accent-text md:hidden">← {t("chat.back")}</button>
        <h3 className="min-w-0 flex-1 truncate text-title-22 text-text-primary">{channel.kind === "CHANNEL" ? "# " : ""}{channelTitle(channel, t)}</h3>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto overflow-x-hidden px-3 py-3">
        {hasMore && <button type="button" onClick={() => void older()} className="mx-auto block min-h-11 text-sm text-accent-text underline underline-offset-2">{t("chat.loadOlder")}</button>}
        {messages.length === 0 && <p className="text-sm text-text-muted">{t("chat.empty")}</p>}
        {messages.map((m, idx) => {
          const mine = m.author.id === me.id;
          // F5-Nachtrag (M16): Datum im Verlauf — Trenner, wenn ein neuer Tag beginnt (Berlin)
          const dayOf = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
          const newDay = idx === 0 || dayOf(messages[idx - 1].createdAt) !== dayOf(m.createdAt);
          const canRetract = !m.retracted && !m.hidden && ((mine && Date.now() - Date.parse(m.createdAt) < RETRACT_MS) || me.role === "duty_manager");
          return (
            <Fragment key={m.id}>
            {newDay && (
              <div role="separator" aria-label={fmt.date(m.createdAt, { weekday: "long", day: "2-digit", month: "2-digit" })} className="my-2 flex items-center gap-3 text-xs text-text-muted" data-testid="chat-day">
                <span className="h-px flex-1 bg-border-subtle" />{fmt.date(m.createdAt, { weekday: "long", day: "2-digit", month: "2-digit" })}<span className="h-px flex-1 bg-border-subtle" />
              </div>
            )}
            <article className={`max-w-[85%] rounded-(--glass-radius-lg) border px-3 py-2 ${mine ? "ms-auto border-border-accent bg-accent-subtle-bg" : "border-border-subtle bg-surface-card-raised"} ${m.urgent ? "border-s-4 border-s-status-danger-fg" : ""}`}>
              <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-text-secondary">
                <span className="font-semibold text-text-primary">{mine ? t("chat.you") : m.author.name}</span>
                <span>{t(`role.${m.author.role}` as TKey)}</span>
                <span>{hhmm(m.createdAt)}</span>
                {m.urgent && <span className="font-semibold text-status-danger-fg">⚠ {t("chat.urgent")}</span>}
                {m.originalLanguage && <span title={t("chat.lang", { lang: m.originalLanguage })} className="uppercase">{m.originalLanguage}</span>}
              </div>
              {m.retracted || m.hidden ? (
                <p className="text-sm italic text-text-muted">{m.hidden ? t("chat.hidden") : t("chat.retracted")}</p>
              ) : (
                <p className="whitespace-pre-wrap break-words text-sm">
                  {tokenize(m.body).map((tok, i) => tok.kind === "room"
                    ? <button key={i} type="button" onClick={() => setRoom(tok.number)} className="-my-3 inline-block px-0.5 py-3 font-semibold text-accent-text underline underline-offset-2">#{tok.number}</button>
                    : tok.kind === "mention" ? <span key={i} className="font-semibold text-accent-text">{tok.text}</span> : <span key={i}>{tok.text}</span>)}
                </p>
              )}
              {/* Betrieb L2 (Punkt 10): Lesebestätigung der eigenen Nachricht — Text + Zeichen, nie nur Farbe */}
              {mine && m.readBy && m.readBy.total > 0 && (channel.kind === "DIRECT" ? (
                <p className="mt-1 text-xs text-text-secondary" data-testid="chat-receipt">
                  <span aria-hidden="true">{m.readBy.read >= m.readBy.total ? "✓✓ " : "✓ "}</span>
                  {m.readBy.read > 0 ? t("chat.readDirect") : t("chat.delivered")}
                </p>
              ) : (
                // F5-Nachtrag (M16, B10): „gelesen: 5 von 13“ aufklappbar mit Namen
                <details className="mt-1 text-xs text-text-secondary" data-testid="chat-receipt">
                  <summary className="min-h-11 cursor-pointer list-none py-2 underline-offset-2 hover:underline">
                    <span aria-hidden="true">{m.readBy.read >= m.readBy.total ? "✓✓ " : "✓ "}</span>
                    {t("chat.readBy", { read: m.readBy.read, total: m.readBy.total })}
                  </summary>
                  {!!m.readBy.readNames?.length && <p><span className="font-semibold">{t("chat.readNames")}</span> {m.readBy.readNames.join(", ")}</p>}
                  {!!m.readBy.unreadNames?.length && <p><span className="font-semibold">{t("chat.unreadNames")}</span> {m.readBy.unreadNames.join(", ")}</p>}
                </details>
              ))}
              {canRetract && (
                <button type="button" onClick={() => void retract(m.id)} className="mt-1 min-h-11 text-xs text-text-secondary underline underline-offset-2">
                  {mine ? t("chat.retract") : t("chat.hide")}
                </button>
              )}
            </article>
            </Fragment>
          );
        })}
        <div ref={endRef} />
      </div>
      <footer className="border-t border-border-subtle p-3">
        <p className="mb-1 text-xs text-text-muted">{t("chat.noGuestNames")}</p>
        {error && <p role="alert" className="mb-1 text-sm text-status-danger-fg">{error}</p>}
        <div className="flex items-end gap-2">
          <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, CHAT_MAX_LENGTH))} rows={2} maxLength={CHAT_MAX_LENGTH}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
            placeholder={t("chat.placeholder")} aria-label={t("chat.placeholder")}
            className="min-h-12 min-w-0 flex-1 resize-none rounded-(--glass-radius-md) border border-border-subtle bg-surface-card-raised px-3 py-2 text-sm" />
          <button type="button" onClick={() => void send()} disabled={busy || !text.trim()} className="h-12 shrink-0 rounded-(--glass-radius-md) bg-champagne px-4 text-sm font-semibold text-text-on-accent disabled:opacity-40">{t("chat.send")}</button>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="h-5 w-5 accent-[#A9843F]" />
            {t("chat.urgentToggle")}
          </label>
          {text.length > CHAT_MAX_LENGTH - 100 && <span className="text-xs text-text-muted">{t("chat.charsLeft", { n: CHAT_MAX_LENGTH - text.length })}</span>}
        </div>
      </footer>
      {room && <ChatRoomModal number={room} role={me.role} onClose={() => setRoom(null)} />}
    </div>
  );
}

/** `#312` öffnet das Zimmer-Detail: Supervisor/Duty Manager das volle (LiveRoomModal), alle anderen die schreibgeschützte Schnellsuche. */
function ChatRoomModal({ number, role, onClose }: { number: string; role: string; onClose: () => void }) {
  const [room, setRoom] = useState<SearchedRoom | null>(null);
  const full = role === "supervisor" || role === "duty_manager";
  useEffect(() => {
    if (full) return;
    api<{ rooms: SearchedRoom[] }>(`/api/rooms?q=${encodeURIComponent(number)}`)
      .then((d) => { const r = (d.rooms ?? []).find((x) => x.number === number); if (r) setRoom(r); else onClose(); })
      .catch(onClose);
  }, [full, number, onClose]);
  if (full) return <LiveRoomModal roomRef={number} onClose={onClose} />;
  return room ? portal(<RoomDetailModal room={room} onClose={onClose} />) : null;
}

function PeoplePicker({ onClose, onPick }: { onClose: () => void; onPick: (userId: string) => Promise<void> }) {
  const { t } = useLocale();
  const { me } = useChat();
  const [people, setPeople] = useState<{ id: string; name: string; role: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<{ people: { id: string; name: string; role: string }[] }>("/api/chat/people").then((d) => setPeople(d.people ?? [])).catch((e) => setError(errorText(e, t))); }, []);
  return portal(
    <Modal title={t("chat.newDirect")} subtitle={t("chat.pickPerson")} onClose={onClose}>
      {me?.role === "room_attendant" && <p className="mb-3 text-xs text-text-secondary">{t("chat.hkRuleHint")}</p>}
      {error && <p role="alert" className="mb-2 text-sm text-status-danger-fg">{error}</p>}
      {people && people.length === 0 && <p className="text-sm text-text-muted">{t("chat.noPeople")}</p>}
      <ul className="space-y-1">
        {(people ?? []).map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => onPick(p.id).catch((e) => setError(errorText(e, t)))}
              className="flex min-h-12 w-full items-center justify-between gap-2 rounded-(--glass-radius-md) border border-border-subtle bg-surface-card-raised px-3 text-start text-sm">
              <span className="font-medium">{p.name}</span><span className="text-xs text-text-muted">{t(`role.${p.role}` as TKey)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>,
  );
}

/** Einsicht im Streitfall (nur Duty Manager; Server prüft und protokolliert): Unterhaltung + Aktenzeichen wählen. */
function ReviewPanel({ onClose }: { onClose: () => void }) {
  const { t } = useLocale();
  const [directs, setDirects] = useState<{ id: string; members: { name: string; role: string }[] }[]>([]);
  const [pick, setPick] = useState("");
  const [caseRef, setCaseRef] = useState("");
  const [result, setResult] = useState<ChatMessageView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<{ directs: typeof directs }>("/api/chat/review").then((d) => setDirects(d.directs ?? [])).catch((e) => setError(errorText(e, t))); }, []);
  const open = async () => {
    setError(null);
    try { setResult((await api<{ messages: ChatMessageView[] }>(`/api/chat/review/${encodeURIComponent(pick)}?caseRef=${encodeURIComponent(caseRef.trim())}`)).messages ?? []); }
    catch { setError(t("chat.reviewFailed")); }
  };
  return portal(
    <Modal title={t("chat.review")} subtitle={t("chat.reviewHint")} onClose={onClose}>
      <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label={t("chat.directs")} className="mb-2 h-12 w-full rounded-(--glass-radius-md) border border-border-subtle bg-surface-card-raised px-3 text-sm">
        <option value="">{t("chat.directs")} …</option>
        {directs.map((d) => <option key={d.id} value={d.id}>{d.members.map((m) => m.name).join(" ↔ ")}</option>)}
      </select>
      <input value={caseRef} onChange={(e) => setCaseRef(e.target.value)} placeholder={t("chat.caseRef")} aria-label={t("chat.caseRef")} maxLength={40}
        className="mb-2 h-12 w-full rounded-(--glass-radius-md) border border-border-subtle bg-surface-card-raised px-3 text-sm" />
      <button type="button" disabled={!pick || caseRef.trim().length < 3} onClick={() => void open()} className="mb-3 h-12 w-full rounded-(--glass-radius-md) bg-champagne text-sm font-semibold text-text-on-accent disabled:opacity-40">{t("chat.reviewOpen")}</button>
      {error && <p role="alert" className="mb-2 text-sm text-status-danger-fg">{error}</p>}
      {result && (
        <ul className="max-h-80 space-y-1 overflow-y-auto text-sm">
          {result.map((m) => (
            <li key={m.id} className="rounded-(--glass-radius-sm) bg-surface-progress-track p-2">
              <span className="text-xs text-text-muted">{dateTime(m.createdAt)} · {m.author.name}</span>
              <p className="whitespace-pre-wrap break-words">{m.retracted ? t("chat.retracted") : m.hidden ? t("chat.hidden") : m.body}</p>
            </li>
          ))}
        </ul>
      )}
    </Modal>,
  );
}
