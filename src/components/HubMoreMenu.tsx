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
        className="relative flex h-14 items-center gap-2 rounded-(--glass-radius-md) border border-border-subtle bg-surface-card-raised px-5 text-sm font-medium"
      >
        {extraBadge}
        {t("supervisor.more")}
        {unread > 0 && <span aria-label={t("chat.unreadAria", { n: unread })} className="rounded-full bg-champagne px-2 py-0.5 text-xs font-semibold text-text-on-accent">{unread}</span>}
        <span aria-hidden className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <div className="theme-glass order-last flex w-full flex-wrap gap-2">
          <Link href="/chat" className="flex h-12 items-center gap-2 rounded-(--glass-radius-md) border border-navy/30 bg-champagne px-5 text-sm font-semibold text-text-on-accent">
            💬 {t("chat.title")}
            {unread > 0 && <span className="rounded-full bg-surface-card-raised px-2 py-0.5 text-xs font-semibold text-accent-text">{unread}</span>}
          </Link>
          {children}
        </div>
      )}
    </div>
  );
}
