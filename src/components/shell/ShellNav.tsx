"use client";

import Link from "next/link";
import { useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { HEADER_PHOTO_URL } from "@/lib/branding";
import { NavItem } from "@/components/ui/NavItem";
import { TabItem } from "@/components/ui/TabItem";
import { cx, FOCUS_RING } from "@/components/ui/primitives";
import type { TKey } from "@/lib/i18n/translations";
import { Overlay } from "./Overlay";
import { GlassIconButton } from "./GlassIconButton";
import { useShellNav } from "./useShellNav";

/** Seitenleiste ab 1280 px: schwebende Glaskarte 264 px (Figma `22:68`). */
export function Sidebar({ role, home, profile }: { role: string; home: string; profile: React.ReactNode }) {
  const { t } = useLocale();
  const { entries, active, countOf } = useShellNav(role);
  return (
    <aside className="glass fixed inset-y-2 start-2 z-30 hidden w-(--size-sidebar-wide) flex-col gap-1 overflow-hidden rounded-(--glass-radius-xl) px-4 py-6 xl:flex">
      <Link href={home} className={cx("text-title-22 self-start rounded-(--glass-radius-sm) text-text-primary", FOCUS_RING)}>
        StayClean
      </Link>
      <span className="glass text-label mt-1 self-start rounded-pill px-3 py-1 text-text-primary">{t(`role.${role}` as TKey)}</span>
      <span aria-hidden="true" className="h-4" />
      <nav aria-label={t("nav.mainMenu")} className="relative z-10 -mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-2">
        <ul className="flex flex-col gap-1">
          {entries.map((e) => (
            <li key={e.id}>
              <NavItem icon={e.icon} label={t(e.labelKey)} href={e.href} active={active === e.id} count={countOf(e)} />
            </li>
          ))}
        </ul>
      </nav>
      {HEADER_PHOTO_URL && (
        // Foto nur in der breiten Leiste, hinter dem unteren Bereich, weich ausgeblendet, nie hochskaliert (Spezifikation Abschnitt 1/3)
        // eslint-disable-next-line @next/next/no-img-element
        <img src={HEADER_PHOTO_URL} alt="" aria-hidden="true" loading="lazy" width={701} height={394} className="sidebar-photo-mask pointer-events-none absolute inset-x-0 bottom-28 h-[170px] w-full max-w-none object-cover opacity-35" />
      )}
      <div className="relative z-10 flex flex-col gap-3">{profile}</div>
      <p className="text-label relative z-10 pt-2 text-center text-text-muted">{t("appShell.hotelBerlin")}</p>
    </aside>
  );
}

/** Icon-Leiste 640–1279 px: 80 px, Beschriftung als aria-label/Tooltip (Figma `22:450`). */
export function Rail({ role, home, monogram, footer }: { role: string; home: string; monogram: string; footer: React.ReactNode }) {
  const { t } = useLocale();
  const { entries, active, countOf } = useShellNav(role);
  return (
    <aside className="glass fixed inset-y-2 start-2 z-30 hidden w-(--size-sidebar-rail) flex-col items-center gap-1 rounded-(--glass-radius-xl) py-6 sm:flex xl:hidden">
      <Link
        href={home}
        aria-label="StayClean"
        title="StayClean"
        className={cx("bg-champagne text-title-22 flex size-12 items-center justify-center rounded-(--glass-radius-md) text-text-on-accent", FOCUS_RING)}
      >
        {monogram}
      </Link>
      <span aria-hidden="true" className="h-4" />
      <nav aria-label={t("nav.mainMenu")}>
        <ul className="flex flex-col items-center gap-1">
          {entries.map((e) => (
            <li key={e.id}>
              <NavItem mode="rail" icon={e.icon} label={t(e.labelKey)} href={e.href} active={active === e.id} count={countOf(e)} />
            </li>
          ))}
        </ul>
      </nav>
      <span className="flex-1" />
      {footer}
    </aside>
  );
}

/** Tab-Leiste unter 640 px: höchstens vier Punkte, sonst drei + „Mehr“ (Figma `41:1914`). */
export function TabBar({ role }: { role: string }) {
  const { t } = useLocale();
  const { tabs, more, active, countOf } = useShellNav(role);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = more.some((e) => e.id === active);
  const moreCount = more.reduce((n, e) => n + (countOf(e) ?? 0), 0);
  return (
    <>
      <nav
        aria-label={t("nav.mainMenu")}
        className="glass fixed inset-x-0 bottom-0 z-30 flex items-center gap-1 rounded-t-(--glass-radius-xl) rounded-b-none px-3 pt-2.5 pb-[max(1rem,env(safe-area-inset-bottom))] sm:hidden"
      >
        {tabs.map((e) => (
          <TabItem key={e.id} icon={e.icon} label={t(e.labelKey)} href={e.href} active={active === e.id} count={countOf(e)} className="min-w-0 flex-1" />
        ))}
        {more.length > 0 && (
          <TabItem icon="list" label={t("nav.more")} active={moreActive} count={moreCount || undefined} onClick={() => setMoreOpen(true)} className="min-w-0 flex-1" />
        )}
      </nav>
      {moreOpen && (
        <Overlay placement="sheet" onClose={() => setMoreOpen(false)} labelledBy="shell-more-title" className="w-full">
          <div className="glass flex max-h-[71dvh] w-full flex-col gap-3 rounded-t-(--glass-radius-xl) rounded-b-none px-6 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <span aria-hidden="true" className="mx-auto h-[5px] w-11 rounded-pill bg-surface-progress-track" />
            <div className="flex items-center gap-3">
              <h2 id="shell-more-title" className="text-title-28 flex-1 text-text-primary">
                {t("nav.more")}
              </h2>
              <GlassIconButton icon="x" label={t("common.close")} onClick={() => setMoreOpen(false)} />
            </div>
            <ul className="flex flex-col gap-1 overflow-y-auto">
              {more.map((e) => (
                <li key={e.id}>
                  <NavItem icon={e.icon} label={t(e.labelKey)} href={e.href} active={active === e.id} count={countOf(e)} />
                </li>
              ))}
            </ul>
          </div>
        </Overlay>
      )}
    </>
  );
}
