import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";

/**
 * Aufbewahrung Chat (Freigabe: 14 Tage, Setting chatRetentionDays): Nachrichten älter als die Frist werden gelöscht,
 * Direkt-Unterhaltungen ohne Nachricht nach derselben Frist auch. Läuft stündlich (server.js → guest-data-retention)
 * und in der Nachtlöschung (purgeGuestDataNow). Gibt nur Zähler zurück, nie Inhalte.
 */
export async function purgeExpiredChat(now = new Date()): Promise<{ chatMessages: number; chatDirects: number }> {
  const { chatRetentionDays } = await getSettings();
  const cutoff = new Date(now.getTime() - chatRetentionDays * 86_400_000);
  const chatMessages = (await prisma.chatMessage.deleteMany({ where: { createdAt: { lt: cutoff } } })).count;
  const chatDirects = (await prisma.chatChannel.deleteMany({ where: { kind: "DIRECT", createdAt: { lt: cutoff }, messages: { none: {} } } })).count;
  return { chatMessages, chatDirects };
}
