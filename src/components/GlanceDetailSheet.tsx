"use client";

import { useState, type ReactNode } from "react";
import Modal from "@/components/Modal";
import LiveRoomModal from "@/components/lists/LiveRoomModal";
import { useLocale } from "@/lib/i18n/LocaleContext";

/**
 * Das eine Detail-Muster hinter jeder Kachel der Startscreens (Supervisor + Duty Manager): `Modal` (Bottom-Sheet auf dem
 * Handy, Dialog ab `sm`) mit Abschnitten aus Zeilen. Eine Zeile mit `roomRef` ist antippbar und öffnet das gemeinsame
 * Zimmer-Detail-Modal (`LiveRoomModal`, mit Logbuch); `actions` stehen rechts daneben (z. B. Freigeben). Keine Sonderlösung je Kachel.
 */
export interface DetailItem {
  key: string;
  title: string;
  meta?: string;
  /** Zimmer-Id oder -Nummer → antippbar. */
  roomRef?: string;
  tone?: "accent" | "ok";
  actions?: ReactNode;
}
export interface DetailSection { title?: string; items: DetailItem[]; empty?: string }
export interface DetailContent { title: string; subtitle?: string; sections: DetailSection[]; header?: ReactNode }

/** Zustand „welche Kachel ist offen / welches Zimmer darin“. Solange ein Zimmer offen ist, ruht das Sheet und kommt danach zurück. */
export function useGlanceDetail<K extends string>() {
  const [key, setKey] = useState<K | null>(null);
  const [room, setRoom] = useState<string | null>(null);
  return { key, room, open: (k: K) => setKey(k), close: () => setKey(null), openRoom: (r: string) => setRoom(r), closeRoom: () => setRoom(null) };
}

export function GlanceDetailHost({ state, content, onChanged }: {
  state: { key: string | null; room: string | null; close: () => void; openRoom: (r: string) => void; closeRoom: () => void };
  content: DetailContent | null;
  onChanged?: () => void;
}) {
  if (state.room) return <LiveRoomModal roomRef={state.room} onClose={state.closeRoom} onChanged={onChanged} />;
  if (!state.key || !content) return null;
  return <GlanceDetailSheet content={content} onClose={state.close} onOpenRoom={state.openRoom} />;
}

export default function GlanceDetailSheet({ content, onClose, onOpenRoom }: { content: DetailContent; onClose: () => void; onOpenRoom: (ref: string) => void }) {
  const { t } = useLocale();
  return (
    <Modal title={content.title} subtitle={content.subtitle} onClose={onClose}>
      {content.header}
      <div className="space-y-4">
        {content.sections.map((section, i) => (
          <section key={section.title ?? i}>
            {section.title && <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-graphite/60">{section.title} <span className="font-normal">· {section.items.length}</span></h4>}
            {section.items.length === 0 ? (
              <p className="text-sm text-graphite/60">{section.empty ?? t("glance.empty")}</p>
            ) : (
              <ul className="space-y-1.5">
                {section.items.map((item) => {
                  const tone = item.tone === "accent" ? "border-gold/40 bg-gold/10" : item.tone === "ok" ? "border-status-clean/30 bg-status-clean/10" : "border-charcoal/10 bg-white";
                  const body = (
                    <>
                      <span className="font-serif text-lg leading-tight">{item.title}</span>
                      {item.meta && <span className="block text-xs text-graphite/70">{item.meta}</span>}
                    </>
                  );
                  return (
                    <li key={item.key} className={`flex items-center gap-2 rounded-lg border px-3 py-1 ${tone}`}>
                      {item.roomRef ? (
                        <button type="button" onClick={() => onOpenRoom(item.roomRef!)} aria-label={t("glance.openRoom", { n: item.title })}
                          className="min-h-11 flex-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold">
                          {body}
                        </button>
                      ) : (
                        <div className="min-h-11 flex-1 py-1">{body}</div>
                      )}
                      {item.actions && <div className="flex shrink-0 gap-1.5">{item.actions}</div>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </div>
    </Modal>
  );
}

/** Einheitliche Kachel der Startscreens: ganze Fläche antippbar (≥ 44 px), optional mit Untertitel und Fortschrittsbalken. */
export function GlanceTile({ label, value, sub, accent, bar, onClick }: { label: string; value: string | number; sub?: string; accent?: boolean; bar?: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`min-h-11 w-full rounded-2xl border p-4 text-left shadow-sm transition hover:border-gold-line active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold ${accent ? "border-gold/40 bg-gold/10" : "border-charcoal/10 bg-white"}`}>
      <div className="text-xs uppercase tracking-wider text-graphite/60">{label}</div>
      <div className="mt-1 font-serif text-3xl">{value}</div>
      {sub && <div className="text-xs text-graphite/70">{sub}</div>}
      {bar != null && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-parchment" role="progressbar" aria-valuenow={bar} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${Math.max(0, Math.min(100, bar))}%` }} />
        </div>
      )}
    </button>
  );
}
