"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/api";
import { useCoalescedRefetch } from "@/components/useCoalescedRefetch";
import { useSocket } from "@/components/useSocket";
import { GlanceDetailHost, useGlanceDetail, type DetailContent } from "@/components/GlanceDetailSheet";
import { FEED_PAGE_SIZE, type FeedItem } from "@/lib/supervisorFeed/rules";
import { useLocale } from "@/lib/i18n/LocaleContext";
import type { TKey } from "@/lib/i18n/translations";
import { hhmm } from "@/lib/i18n/format";
import { useGlassMode } from "@/components/shell/GlassMode";
import { cx, FOCUS_RING } from "@/components/ui/primitives";
import { Pill } from "@/components/ui/Pill";

/** Zuletzt gesehen (je Gerät/Browser, nur Komfort): Einträge danach gelten als „neu“. */
const SEEN_KEY = "stayclean.supervisorFeed.seenAt";
const readSeen = () => { try { return Number(window.localStorage.getItem(SEEN_KEY)) || 0; } catch { return 0; } };
const writeSeen = (ms: number) => { try { window.localStorage.setItem(SEEN_KEY, String(ms)); } catch { /* Speicher gesperrt */ } };

/**
 * Ereignis-Feed unter den Zählern von „Das ist jetzt wichtig“ (nur Supervisor-Startansicht): heutige Ereignisse der eigenen
 * Etagen aus `/api/supervisor/feed` (Regeln: `src/lib/supervisorFeed/rules.ts`), live per Socket.IO nachgeladen.
 * Jeder Eintrag öffnet die Detailansicht (Zimmer, Zeit, Auslöser, Änderung) und von dort das Zimmer mit Verlauf.
 */
export default function SupervisorFeed() {
  const { t } = useLocale();
  const [limit, setLimit] = useState(FEED_PAGE_SIZE);
  const [data, setData] = useState<{ items: FeedItem[]; hasMore: boolean; noFloors: boolean; house: boolean } | null>(null);
  const [failed, setFailed] = useState(false);
  const [seenAt, setSeenAt] = useState(0);
  const [read, setRead] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const detail = useGlanceDetail<"item">();
  const glass = useGlassMode();

  useEffect(() => { setSeenAt(readSeen()); }, []);
  const load = useCallback(async () => {
    try {
      const res = await api<{ items?: FeedItem[]; hasMore?: boolean; noFloors?: boolean; scope?: string }>(`/api/supervisor/feed?limit=${limit}`);
      setData({ items: Array.isArray(res.items) ? res.items : [], hasMore: !!res.hasMore, noFloors: !!res.noFloors, house: res.scope === "house" });
      setFailed(false);
    } catch { setFailed(true); }
  }, [limit]);
  useEffect(() => { void load(); }, [load]);
  const soon = useCoalescedRefetch(() => { void load(); }, 2500);
  useSocket({
    "app:resync": () => soon(),
    "room:status": () => soon(), "room:update": () => soon(), "work:pause": () => soon(), "workorder:update": () => soon(),
    "guestrequest:new": () => soon(), "guestrequest:update": () => soon(), "notification:new": () => soon(), "user:floors": () => soon(),
  });

  const kindLabel = (i: FeedItem) => t(`feed.kind${i.kind}` as TKey);
  const who = (i: FeedItem) => i.actorRole === "guest" ? t("feed.roleGuest") : i.actorRole === "system" ? t("feed.roleSystem")
    : [i.actorName, i.actorRole ? t(`role.${i.actorRole}` as TKey) : null].filter(Boolean).join(" · ");
  const extra = (i: FeedItem) => [
    i.blockReason ? t(`blockReason.${i.blockReason}` as TKey) : null,
    i.defectCategory ? t(`defectCategory.${i.defectCategory}` as TKey) : null,
  ].filter(Boolean).join(" · ");
  const isNew = (i: FeedItem) => Date.parse(i.at) > seenAt && !read.has(i.id);

  const open = (i: FeedItem) => { setRead((s) => new Set(s).add(i.id)); setOpenId(i.id); detail.open("item"); };
  const item = data?.items.find((i) => i.id === openId) ?? null;
  const dtCls = glass ? "text-text-muted" : "text-graphite/60";
  const content: DetailContent | null = item ? {
    title: `${item.roomNumber} · ${kindLabel(item)}`,
    subtitle: t("feed.detailRoom", { n: item.roomNumber, floor: item.floor }),
    header: (
      <dl className={glass ? "text-body-16 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-text-primary" : "mb-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm"}>
        <dt className={dtCls}>{t("feed.detailTime")}</dt><dd>{hhmm(item.at)}</dd>
        {who(item) && <><dt className={dtCls}>{t("feed.detailTrigger")}</dt><dd>{who(item)}</dd></>}
        {item.fromStatus && item.toStatus && <><dt className={dtCls}>{t("feed.detailChange")}</dt><dd>{t(`status.${item.fromStatus}` as TKey)} → {t(`status.${item.toStatus}` as TKey)}</dd></>}
        {extra(item) && <><dt className={dtCls}>{t("feed.detailInfo")}</dt><dd>{extra(item)}</dd></>}
        {item.count > 1 && <><dt className={dtCls}>{t("feed.detailCount")}</dt><dd>{t("feed.detailCountValue", { n: item.count, from: hhmm(item.firstAt), to: hhmm(item.at) })}</dd></>}
      </dl>
    ),
    sections: [{ items: [{ key: "room", title: t("feed.openRoom"), meta: t("feed.detailRoom", { n: item.roomNumber, floor: item.floor }), roomRef: item.roomId }] }],
  } : null;

  if (failed && !data) return <p role="status" className={glass ? "text-body-16 text-text-muted" : "mt-3 text-sm text-graphite/60"}>{t("feed.loadFailed")}</p>;
  if (!data) return null;
  const anyNew = data.items.some(isNew);
  if (glass) {
    return (
      <div className="flex flex-col gap-2 border-t border-border-subtle pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-section text-text-muted">{data.house ? t("feed.titleHouse") : t("feed.title")}</h3>
          {anyNew && (
            <button type="button" className={cx("text-body-16 min-h-(--size-touch-min) px-2 text-accent-text underline underline-offset-4", FOCUS_RING)}
              onClick={() => { const now = Date.now(); writeSeen(now); setSeenAt(now); }}>{t("feed.markRead")}</button>
          )}
        </div>
        {data.noFloors ? <p className="text-body-16 text-text-secondary">{t("feed.noFloors")}</p>
          : data.items.length === 0 ? <p className="text-body-16 text-text-muted">{t("feed.empty")}</p> : (
          <ul className="flex flex-col gap-1">
            {data.items.map((i) => (
              <li key={i.id}>
                <button type="button" onClick={() => open(i)}
                  className={cx("press flex min-h-(--size-touch-min) w-full items-center gap-3 rounded-(--glass-radius-sm) px-3 py-2 text-start", i.weight >= 3 ? "bg-accent-subtle-bg" : "bg-surface-card-raised", FOCUS_RING)}>
                  <span className="text-label w-12 shrink-0 tabular-nums text-text-muted">{hhmm(i.at)}</span>
                  <span className="text-body-18 w-12 shrink-0 text-text-primary">{i.roomNumber}</span>
                  <span className="text-body-16 min-w-0 flex-1 truncate text-text-secondary">{kindLabel(i)}{extra(i) ? ` · ${extra(i)}` : ""}{i.count > 1 ? ` · ${t("feed.times", { n: i.count })}` : ""}</span>
                  {isNew(i) && <Pill tone="accent">{t("feed.new")}</Pill>}
                </button>
              </li>
            ))}
          </ul>
        )}
        {data.hasMore && (
          <button type="button" onClick={() => setLimit((n) => n + FEED_PAGE_SIZE)} className={cx("press glass text-body-16 min-h-(--size-touch-min) self-start rounded-(--glass-radius-md) px-5 text-text-primary", FOCUS_RING)}>{t("feed.showMore")}</button>
        )}
        <GlanceDetailHost state={detail} content={content} />
      </div>
    );
  }
  return (
    <div className="mt-4 border-t border-charcoal/10 pt-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-graphite/60">{data.house ? t("feed.titleHouse") : t("feed.title")}</p>
        {anyNew && (
          <button type="button" className="min-h-11 text-sm font-medium text-gold-soft underline underline-offset-2"
            onClick={() => { const now = Date.now(); writeSeen(now); setSeenAt(now); }}>{t("feed.markRead")}</button>
        )}
      </div>
      {data.noFloors ? <p className="text-sm text-graphite/70">{t("feed.noFloors")}</p>
        : data.items.length === 0 ? <p className="text-sm text-graphite/60">{t("feed.empty")}</p> : (
        <ul className="space-y-1">
          {data.items.map((i) => (
            <li key={i.id}>
              <button type="button" onClick={() => open(i)}
                className={`flex min-h-11 w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-start text-sm transition hover:border-gold-line focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold ${i.weight >= 3 ? "border-gold/40 bg-gold/10" : "border-charcoal/10 bg-white"}`}>
                <span className="w-12 shrink-0 tabular-nums text-xs text-graphite/60">{hhmm(i.at)}</span>
                <span className="font-serif text-lg leading-none">{i.roomNumber}</span>
                <span className="min-w-0 flex-1 truncate">{kindLabel(i)}{extra(i) ? ` · ${extra(i)}` : ""}{i.count > 1 ? ` · ${t("feed.times", { n: i.count })}` : ""}</span>
                {isNew(i) && <span className="shrink-0 rounded-full bg-navy px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-ivory">{t("feed.new")}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {data.hasMore && (
        <button type="button" onClick={() => setLimit((n) => n + FEED_PAGE_SIZE)} className="mt-2 min-h-11 rounded-lg border border-charcoal/15 bg-white px-4 text-sm font-medium">{t("feed.showMore")}</button>
      )}
      <GlanceDetailHost state={detail} content={content} />
    </div>
  );
}
