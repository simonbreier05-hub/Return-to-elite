import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { broadcast, emitTo } from "@/lib/realtime";
import { getChatSettings, LANGUAGE_CODE_RE } from "@/lib/settings";
import { ROLES, type Role } from "@/lib/domain";
import { ALL_CHANNEL_ROLES, CHANNEL_ROLES, CHAT_CHANNELS, canDirectMessage, canUseChannel, channelsForRole, directKey, type ChatChannelKey } from "./policy";
import { resolveMentions } from "./text";
import { keyed } from "@/lib/i18n/notificationText";

/**
 * Chat-Hub — Datenbankseite. Jede Funktion bekommt die Session und prüft selbst über `policy.ts`; die API-Routen sind dünn.
 * Datenschutz: nie Nachrichtentext in AuditLog, Notification oder Server-Log.
 */
export interface ChatSession { userId: string; role: string; name: string }

/** Retract-Fenster: so lange darf der Autor eine Nachricht zurückziehen. */
export const RETRACT_WINDOW_MS = 5 * 60_000;
/** Seitengröße beim Laden des Verlaufs. */
export const MESSAGE_PAGE = 50;

/** Hotel-Bezug (Multi-Tenant, Prompt F): heute leer — später die eine Stelle, die hotelId einschränkt. */
export const chatScope = (): Record<string, never> => ({});

const room = (channelId: string) => `chat:${channelId}`;
const userRoom = (userId: string) => `user:${userId}`;

export async function ensureChannels() {
  for (const key of CHAT_CHANNELS) {
    await prisma.chatChannel.upsert({ where: { key }, update: {}, create: { key, kind: "CHANNEL" } });
  }
}

/** Kanal/Unterhaltung, falls die Person sie lesen darf — sonst null (Route antwortet 403/404). */
export async function accessibleChannel(s: ChatSession, channelId: string) {
  const ch = await prisma.chatChannel.findFirst({ where: { id: channelId, ...chatScope() }, include: { members: { select: { userId: true } } } });
  if (!ch) return null;
  if (ch.kind === "CHANNEL") return canUseChannel(s.role, ch.key) ? ch : null;
  return ch.members.some((m) => m.userId === s.userId) ? ch : null;
}

async function unread(channelId: string, userId: string, since: Date | null): Promise<number> {
  return prisma.chatMessage.count({
    where: { channelId, authorId: { not: userId }, retractedAt: null, hiddenAt: null, ...(since ? { createdAt: { gt: since } } : {}) },
  });
}

export interface ChannelSummary {
  id: string; kind: "CHANNEL" | "DIRECT"; key: string;
  partner: { id: string; name: string; role: string } | null;
  unread: number; lastAt: string | null;
}

/** Alle Kanäle/Unterhaltungen der Person mit Ungelesen-Zähler — Grundlage für Kanalliste und Badge. */
export async function listChannels(s: ChatSession): Promise<ChannelSummary[]> {
  await ensureChannels();
  const keys = channelsForRole(s.role);
  const [channels, directs] = await Promise.all([
    prisma.chatChannel.findMany({ where: { kind: "CHANNEL", key: { in: keys }, ...chatScope() } }),
    prisma.chatChannel.findMany({
      where: { kind: "DIRECT", members: { some: { userId: s.userId } }, ...chatScope() },
      include: { members: { include: { user: { select: { id: true, name: true, role: true } } } } },
    }),
  ]);
  const all = [...channels.map((c) => ({ c, partner: null })), ...directs.map((c) => ({ c, partner: c.members.find((m) => m.userId !== s.userId)?.user ?? null }))];
  const reads = await prisma.chatReadState.findMany({ where: { userId: s.userId, channelId: { in: all.map((x) => x.c.id) } } });
  const readAt = new Map(reads.map((r) => [r.channelId, r.lastReadAt]));
  const out: ChannelSummary[] = [];
  for (const { c, partner } of all) {
    const last = await prisma.chatMessage.findFirst({ where: { channelId: c.id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
    out.push({
      id: c.id, kind: c.kind as "CHANNEL" | "DIRECT", key: c.key, partner,
      unread: await unread(c.id, s.userId, readAt.get(c.id) ?? null), lastAt: last?.createdAt.toISOString() ?? null,
    });
  }
  const order = (x: ChannelSummary) => (x.kind === "CHANNEL" ? CHAT_CHANNELS.indexOf(x.key as ChatChannelKey) : 100);
  return out.sort((a, b) => order(a) - order(b) || (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
}

/** Räume, in die der Socket dieser Person gehört (für POST /api/chat/join). */
export async function roomsFor(s: ChatSession): Promise<string[]> {
  return [userRoom(s.userId), ...(await listChannels(s)).map((c) => room(c.id))];
}

export interface ChatMessageView {
  id: string; channelId: string; body: string; originalLanguage: string; urgent: boolean; createdAt: string;
  author: { id: string; name: string; role: string };
  retracted: boolean; hidden: boolean;
}

type MessageRow = { id: string; channelId: string; body: string; originalLanguage: string; urgent: boolean; createdAt: Date; retractedAt: Date | null; hiddenAt: Date | null; author: { id: string; name: string; role: string } };
const view = (m: MessageRow): ChatMessageView => ({
  id: m.id, channelId: m.channelId, originalLanguage: m.originalLanguage, urgent: m.urgent, createdAt: m.createdAt.toISOString(),
  author: m.author, retracted: !!m.retractedAt, hidden: !!m.hiddenAt,
  body: m.retractedAt || m.hiddenAt ? "" : m.body,
});
const AUTHOR = { select: { id: true, name: true, role: true } } as const;

/** Verlauf: die neuesten MESSAGE_PAGE (vor `before`), aufsteigend sortiert (neueste unten). */
export async function listMessages(channelId: string, before?: Date): Promise<{ messages: ChatMessageView[]; hasMore: boolean }> {
  const rows = await prisma.chatMessage.findMany({
    where: { channelId, ...(before ? { createdAt: { lt: before } } : {}) },
    orderBy: { createdAt: "desc" }, take: MESSAGE_PAGE + 1, include: { author: AUTHOR },
  });
  return { messages: rows.slice(0, MESSAGE_PAGE).reverse().map(view), hasMore: rows.length > MESSAGE_PAGE };
}

/** Wer kann diesen Kanal lesen? (für Erwähnungen und „dringend“ — nie Personen außerhalb benachrichtigen). */
async function readersOf(ch: { kind: string; key: string; members: { userId: string }[] }) {
  if (ch.kind === "DIRECT") return prisma.user.findMany({ where: { id: { in: ch.members.map((m) => m.userId) } }, select: { id: true, name: true, role: true } });
  const roles = [...ALL_CHANNEL_ROLES, ...(CHANNEL_ROLES[ch.key as ChatChannelKey] ?? [])];
  return prisma.user.findMany({ where: { role: { in: roles as string[] } }, select: { id: true, name: true, role: true } });
}

export function channelLabel(ch: { kind: string; key: string }, partnerName?: string | null): string {
  if (ch.kind === "DIRECT") return partnerName ? `Direkt: ${partnerName}` : "Direktnachricht";
  return { HOUSEKEEPING: "#Housekeeping", ENGINEERING: "#Technik", FRONT_OFFICE: "#Front Office", HOUSEMAN: "#Hausmann" }[ch.key] ?? ch.key;
}

/** Originalsprache: Profilsprache der Person, sonst Hotel-Standard. Wird nie übersetzt oder verändert. */
export async function languageFor(userId: string): Promise<string> {
  const [u, cfg] = await Promise.all([prisma.user.findUnique({ where: { id: userId }, select: { language: true } }), getChatSettings()]);
  return u?.language && LANGUAGE_CODE_RE.test(u.language) ? u.language : cfg.hotelDefaultLanguage;
}

export async function postMessage(s: ChatSession, ch: NonNullable<Awaited<ReturnType<typeof accessibleChannel>>>, body: string, urgent: boolean): Promise<ChatMessageView> {
  const readers = await readersOf(ch);
  const mentions = resolveMentions(body, readers.filter((r) => r.id !== s.userId));
  const msg = await prisma.chatMessage.create({
    data: {
      channelId: ch.id, authorId: s.userId, body, urgent, originalLanguage: await languageFor(s.userId),
      mentions: mentions.users.length || mentions.depts.length ? JSON.stringify(mentions) : null,
    },
    include: { author: AUTHOR },
  });
  await markRead(s, ch.id, msg.createdAt);
  const out = view(msg);
  emitTo(room(ch.id), "chat:message", { channelId: ch.id, message: out });

  // Glocke (bestehendes Meldungssystem) nur für „dringend“ und Erwähnungen — ohne Nachrichtentext.
  const label = channelLabel(ch, s.name); // Direkt: aus Sicht des Empfängers „Direkt: <Absender>“
  const targets = new Set<string>(mentions.users);
  for (const dept of mentions.depts) for (const r of readers) if ((CHANNEL_ROLES[dept] as readonly string[]).includes(r.role)) targets.add(r.id);
  if (urgent) for (const r of readers) targets.add(r.id);
  targets.delete(s.userId);
  for (const id of targets) {
    const r = readers.find((x) => x.id === id);
    if (!r || !(ROLES as readonly string[]).includes(r.role)) continue;
    const notification = await prisma.notification.create({
      data: {
        type: "CHAT", level: urgent ? "warning" : "info", targetRole: r.role as Role, targetUserId: r.id,
        message: `${urgent ? "Dringend" : "Erwähnt"} im Chat ${label} von ${s.name}`,
        ...keyed(urgent ? "notify.chatUrgent" : "notify.chatMention", { channel: label, name: s.name }),
      },
    });
    broadcast("notification:new", { notification });
  }
  return out;
}

export async function markRead(s: ChatSession, channelId: string, at = new Date()) {
  await prisma.chatReadState.upsert({
    where: { channelId_userId: { channelId, userId: s.userId } },
    create: { channelId, userId: s.userId, lastReadAt: at },
    update: { lastReadAt: at },
  });
  emitTo(userRoom(s.userId), "chat:read", { channelId });
}

/** Personen, denen ich direkt schreiben darf (Housekeeper-Regel aus den Einstellungen). */
export async function peopleFor(s: ChatSession) {
  const cfg = await getChatSettings();
  const users = await prisma.user.findMany({ where: { id: { not: s.userId }, role: { in: [...ROLES] } }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } });
  return users.filter((u) => canDirectMessage({ id: s.userId, role: s.role }, u, cfg.housekeeperDmRoles));
}

/** Direkt-Unterhaltung öffnen (oder die bestehende liefern). `null` = nicht erlaubt bzw. Person unbekannt. */
export async function openDirect(s: ChatSession, targetUserId: string) {
  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, name: true, role: true } });
  if (!target || !(ROLES as readonly string[]).includes(target.role)) return null;
  const cfg = await getChatSettings();
  if (!canDirectMessage({ id: s.userId, role: s.role }, target, cfg.housekeeperDmRoles)) return null;
  const key = directKey(s.userId, target.id);
  const ch = await prisma.chatChannel.upsert({ where: { key }, update: {}, create: { key, kind: "DIRECT" } });
  for (const userId of [s.userId, target.id]) {
    await prisma.chatMember.upsert({ where: { channelId_userId: { channelId: ch.id, userId } }, update: {}, create: { channelId: ch.id, userId } });
  }
  emitTo(userRoom(target.id), "chat:channels", {});
  emitTo(userRoom(s.userId), "chat:channels", {});
  return ch;
}

/**
 * Darf in eine bestehende Direkt-Unterhaltung noch geschrieben werden? Die Housekeeper-Regel gilt bei jedem Senden
 * (eine Einstellungsänderung wirkt sofort, auch für alte Unterhaltungen).
 */
export async function directStillAllowed(s: ChatSession, ch: { kind: string; members: { userId: string }[] }): Promise<boolean> {
  if (ch.kind !== "DIRECT") return true;
  const otherId = ch.members.find((m) => m.userId !== s.userId)?.userId;
  const other = otherId ? await prisma.user.findUnique({ where: { id: otherId }, select: { id: true, role: true } }) : null;
  if (!other) return false;
  const cfg = await getChatSettings();
  return canDirectMessage({ id: s.userId, role: s.role }, other, cfg.housekeeperDmRoles);
}

/** Zurückziehen (Autor, binnen RETRACT_WINDOW_MS) oder Ausblenden (Duty Manager): Text weg, Eintrag bleibt gekennzeichnet. */
export async function retractOrHide(s: ChatSession, messageId: string, now = new Date()): Promise<"ok" | "forbidden" | "notFound" | "tooLate"> {
  const m = await prisma.chatMessage.findUnique({ where: { id: messageId }, select: { id: true, channelId: true, authorId: true, createdAt: true, retractedAt: true, hiddenAt: true } });
  if (!m || !(await accessibleChannel(s, m.channelId))) return "notFound";
  const own = m.authorId === s.userId;
  if (own) {
    if (now.getTime() - m.createdAt.getTime() > RETRACT_WINDOW_MS) return s.role === "duty_manager" ? hide() : "tooLate";
    await prisma.chatMessage.update({ where: { id: m.id }, data: { body: "", retractedAt: now } });
    await audit({ action: "CHAT_RETRACTED", userId: s.userId, meta: { channelId: m.channelId, messageId: m.id } });
  } else if (s.role === "duty_manager") {
    return hide();
  } else return "forbidden";
  emitTo(room(m.channelId), "chat:retracted", { channelId: m.channelId, messageId: m.id, kind: "retracted" });
  return "ok";

  async function hide(): Promise<"ok"> {
    await prisma.chatMessage.update({ where: { id: m!.id }, data: { body: "", hiddenAt: now } });
    await audit({ action: "CHAT_HIDDEN", userId: s.userId, meta: { channelId: m!.channelId, messageId: m!.id } });
    emitTo(room(m!.channelId), "chat:retracted", { channelId: m!.channelId, messageId: m!.id, kind: "hidden" });
    return "ok";
  }
}

/** Aktenzeichen für eine Einsicht im Streitfall: kurz, ohne Freitext (kein Name, keine Begründung im Logbuch). */
export const CASE_REF_RE = /^[A-Za-z0-9][A-Za-z0-9/._-]{2,39}$/;

/**
 * Einsicht im Streitfall (Freigabe: HR und Duty Manager; HR hat keine eigene Rolle → über den Duty Manager).
 * Nur mit Aktenzeichen, jede Einsicht steht im Logbuch (CHAT_REVIEWED, ohne Inhalt).
 */
export async function reviewChannel(s: ChatSession, channelId: string, caseRef: string) {
  if (s.role !== "duty_manager" || !CASE_REF_RE.test(caseRef)) return null;
  const ch = await prisma.chatChannel.findFirst({ where: { id: channelId, ...chatScope() }, include: { members: { include: { user: { select: { id: true, name: true, role: true } } } } } });
  if (!ch) return null;
  await audit({ action: "CHAT_REVIEWED", userId: s.userId, meta: { channelId, caseRef } });
  const rows = await prisma.chatMessage.findMany({ where: { channelId }, orderBy: { createdAt: "asc" }, include: { author: AUTHOR } });
  return { channel: { id: ch.id, kind: ch.kind, key: ch.key, members: ch.members.map((m) => m.user) }, messages: rows.map(view) };
}

/** Alle Direkt-Unterhaltungen (nur Metadaten, ohne Inhalt) — Auswahl für die Einsicht im Streitfall. */
export async function listAllDirects(s: ChatSession) {
  if (s.role !== "duty_manager") return null;
  const rows = await prisma.chatChannel.findMany({ where: { kind: "DIRECT", ...chatScope() }, include: { members: { include: { user: { select: { name: true, role: true } } } } }, orderBy: { createdAt: "desc" } });
  return rows.map((c) => ({ id: c.id, members: c.members.map((m) => m.user) }));
}
