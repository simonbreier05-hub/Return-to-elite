"use client";

import { useGuestLocale } from "@/lib/guestI18n/GuestLocaleContext";
import { FOCUS_RING } from "@/components/ui/primitives";
import type { GuestLegalLinkUrls } from "@/lib/guestLegalLinks";

/** „Datenschutz · Impressum“ als Textlinks (Figma `41:2892`). Ohne eingetragene Adresse kein Link. */
export default function GuestLegalLinks({ links }: { links: GuestLegalLinkUrls }) {
  const { t } = useGuestLocale();
  const items = [
    links.privacy ? { href: links.privacy, label: t("legal.privacy") } : null,
    links.imprint ? { href: links.imprint, label: t("legal.imprint") } : null,
  ].filter((x): x is { href: string; label: string } => x !== null);
  if (items.length === 0) return null;

  return (
    <nav aria-label={`${t("legal.privacy")} · ${t("legal.imprint")}`} className="flex items-center justify-center gap-1">
      {items.map((item, i) => (
        <span key={item.href} className="flex items-center gap-1">
          {i > 0 && (
            <span aria-hidden="true" className="text-label text-text-muted">
              ·
            </span>
          )}
          <a
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            className={`text-label inline-flex min-h-(--size-touch-min) items-center rounded-(--glass-radius-sm) px-2 text-text-secondary underline-offset-4 hover:underline ${FOCUS_RING}`}
          >
            {item.label}
          </a>
        </span>
      ))}
    </nav>
  );
}
