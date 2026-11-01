"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useChat } from "@/components/chat/ChatContext";
import { useLocale } from "@/lib/i18n/LocaleContext";

/**
 * „Mehr“-Menü jedes Hubs. Erster Eintrag ist immer der Chat (mit Ungelesen-Badge); darunter die hub-eigenen Einträge
 * (`children`, z. B. Übergabe/Gästezugang beim Supervisor). Ein gemeinsames Menü statt einer Kopie je Hub.
 */
export default function HubMoreMenu({ children, extraBadge }: { children?: ReactNode; extraBadge?: ReactNode }) {
  const { t } = useLocale();
  const { unread } = useChat();
  const [open, setOpen] = useState(false);
  return (
    <div className="contents">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="relative flex h-14 items-center gap-2 rounded-xl border border-charcoal/15 bg-linen px-5 text-sm font-medium hover:border-gold-line"
      >
        {extraBadge}
        {t("supervisor.more")}
        {unread > 0 && <span aria-label={t("chat.unreadAria", { n: unread })} className="rounded-full bg-navy px-2 py-0.5 text-xs font-semibold text-ivory">{unread}</span>}
        <span aria-hidden className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <div className="animate-rise order-last flex w-full flex-wrap gap-2">
          <Link href="/chat" className="flex h-12 items-center gap-2 rounded-xl border border-navy/30 bg-navy px-5 text-sm font-semibold text-ivory hover:bg-navy-line">
            💬 {t("chat.title")}
            {unread > 0 && <span className="rounded-full bg-ivory px-2 py-0.5 text-xs font-semibold text-navy">{unread}</span>}
          </Link>
          {children}
        </div>
      )}
    </div>
  );
}
