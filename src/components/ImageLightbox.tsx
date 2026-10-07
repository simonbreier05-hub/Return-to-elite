"use client";

import { useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";
import CloseButton from "./CloseButton";
import { useEscapeKey } from "./useEscapeKey";

/**
 * Bild zum Anklicken: Vorschau → Vollbild. Das Vollbild hat immer einen sichtbaren Schließen-Button
 * (außerdem Esc und Klick neben das Bild). `className` formt die Vorschau.
 */
export default function ImageLightbox({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  useEscapeKey(() => setOpen(false), open);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`${alt} — ${t("common.enlarge")}`} title={t("common.enlarge")}
        className="block cursor-zoom-in rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold print:pointer-events-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className={className} />
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label={alt} className="fixed inset-0 z-[60] flex flex-col bg-black/80 print:hidden" onClick={() => setOpen(false)}>
          <div className="flex justify-end p-3"><CloseButton onClick={() => setOpen(false)} /></div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-3 pt-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} className="max-h-full max-w-full rounded-lg bg-white object-contain" onClick={(e) => e.stopPropagation()} />
          </div>
        </div>
      )}
    </>
  );
}
