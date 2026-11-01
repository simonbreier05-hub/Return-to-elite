import type { TKey } from "@/lib/i18n/translations";

type T = (key: TKey, vars?: Record<string, string | number>) => string;

/** Anzeigename eines Kanals / einer Direkt-Unterhaltung. */
export function channelTitle(c: { kind: string; key: string; partner?: { name: string } | null }, t: T): string {
  if (c.kind === "DIRECT") return c.partner?.name ?? t("chat.direct");
  return t(`chat.channel${c.key}` as TKey);
}
