"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale } from "@/lib/i18n/LocaleContext";
import { useGlassMode } from "@/components/shell/GlassMode";
import { cx, FOCUS_RING } from "@/components/ui/primitives";

export interface BoardItem { id: string; label: string; sub?: string; /** z. B. begonnenes Zimmer */ mark?: string; title?: string }
export interface BoardColumn {
  /** `null` = „Offen" (nicht zugeteilt). */
  id: string | null;
  title: string;
  /** Zusatzzeile im Kopf (z. B. Credits). */
  summary?: ReactNode;
  items: BoardItem[];
  /** Schnellauswahl in diesem Feld (z. B. „Alle offenen", „Etage 2"). */
  quick?: { label: string; ids: string[] }[];
  tone?: "open" | "normal";
}

const colKey = (id: string | null) => id ?? "__open";

/**
 * Gemeinsames Zuteil-Brett (Zimmer → Zimmermädchen, Etagen → Supervisor, Aufgaben → Hausmann): Felder mit Chips.
 *  - Antippen wählt aus (Mehrfachauswahl; Umschalt+Klick wählt einen Bereich). Danach ein Tipp auf das Ziel-Feld in der
 *    Leiste unten speichert alles in einem Schritt (zwei Taps).
 *  - Gedrückt halten (Touch, ~0,25 s) bzw. ziehen (Maus) und auf ein anderes Feld loslassen verschiebt das Chip — oder
 *    die ganze Auswahl, wenn das gezogene Chip dazugehört.
 * Das Brett lädt nie die Seite neu: es meldet nur `onMove`; der Aufrufer aktualisiert optimistisch und rollt bei Fehlern zurück.
 */
export default function DragDropBoard({ columns, onMove, hint }: { columns: BoardColumn[]; onMove: (ids: string[], to: string | null) => void | Promise<void>; hint?: string }) {
  const { t } = useLocale();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<{ ids: string[]; label: string; x: number; y: number; over: string | null | undefined } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const st = useRef<{ ids: string[]; label: string; x0: number; y0: number; active: boolean; touch: boolean; timer?: number } | null>(null);
  const last = useRef<string | null>(null);
  const suppressClick = useRef(false);
  const cols = useRef(columns); cols.current = columns;
  const moveRef = useRef(onMove); moveRef.current = onMove;

  // Items, die es nicht mehr gibt, fallen aus der Auswahl (z. B. nach dem Zuteilen)
  useEffect(() => {
    const all = new Set(columns.flatMap((c) => c.items.map((i) => i.id)));
    setSelected((s) => { const n = new Set([...s].filter((id) => all.has(id))); return n.size === s.size ? s : n; });
  }, [columns]);

  // Beim Ziehen mit dem Finger darf die Seite nicht scrollen
  useEffect(() => {
    const el = root.current; if (!el) return;
    const block = (e: TouchEvent) => { if (st.current?.active) e.preventDefault(); };
    el.addEventListener("touchmove", block, { passive: false });
    return () => el.removeEventListener("touchmove", block);
  }, []);

  useEffect(() => () => stopRef.current(), []);

  const colAt = (x: number, y: number): string | null | undefined => {
    const el = document.elementFromPoint(x, y)?.closest("[data-board-col]") as HTMLElement | null;
    if (!el) return undefined;
    const v = el.dataset.boardCol!;
    return v === "__open" ? null : v;
  };

  // Stabile Listener (gleiche Funktion beim Hinzufügen und Entfernen), die auf den jeweils aktuellen Stand zeigen
  const live = useRef<{ move: (e: PointerEvent) => void; up: (e: PointerEvent) => void }>({ move: () => {}, up: () => {} });
  const wrap = useRef({ move: (e: PointerEvent) => live.current.move(e), up: (e: PointerEvent) => live.current.up(e), cancel: () => stopRef.current() });
  const stopRef = useRef<() => void>(() => {});
  const stop = useCallback(() => {
    if (st.current?.timer) window.clearTimeout(st.current.timer);
    st.current = null; setDrag(null);
    window.removeEventListener("pointermove", wrap.current.move); window.removeEventListener("pointerup", wrap.current.up); window.removeEventListener("pointercancel", wrap.current.cancel);
  }, []);
  stopRef.current = stop;
  const begin = () => { const s = st.current; if (!s) return; s.active = true; setDrag({ ids: s.ids, label: s.label, x: s.x0, y: s.y0, over: undefined }); };
  const onMoveEvt = (e: PointerEvent) => {
    const s = st.current; if (!s) return;
    if (!s.active) {
      if (Math.hypot(e.clientX - s.x0, e.clientY - s.y0) < 8) return;
      if (s.touch) { stop(); return; } // Finger bewegt sich vor dem Halten → die Seite scrollt
      begin();
    }
    // Am oberen/unteren Rand scrollt die Seite mit, damit auch weit entfernte Felder erreichbar sind
    const edge = 70;
    if (e.clientY < edge) window.scrollBy(0, -14); else if (e.clientY > window.innerHeight - edge) window.scrollBy(0, 14);
    setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY, over: colAt(e.clientX, e.clientY) } : d));
  };
  const onUpEvt = (e: PointerEvent) => {
    const s = st.current;
    if (s?.active) {
      suppressClick.current = true; window.setTimeout(() => { suppressClick.current = false; }, 60);
      const to = colAt(e.clientX, e.clientY);
      const from = (id: string) => cols.current.find((c) => c.items.some((i) => i.id === id))?.id;
      const moving = to === undefined ? [] : s.ids.filter((id) => from(id) !== to);
      if (to !== undefined && moving.length) { void moveRef.current(moving, to); setSelected(new Set()); }
    }
    stop();
  };
  live.current = { move: onMoveEvt, up: onUpEvt };

  const down = (e: React.PointerEvent, item: BoardItem) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const ids = selected.has(item.id) ? [...selected] : [item.id];
    st.current = { ids, label: ids.length > 1 ? t("board.nSelected", { n: ids.length }) : item.label, x0: e.clientX, y0: e.clientY, active: false, touch: e.pointerType !== "mouse" };
    if (st.current.touch) st.current.timer = window.setTimeout(begin, 250);
    window.addEventListener("pointermove", wrap.current.move); window.addEventListener("pointerup", wrap.current.up); window.addEventListener("pointercancel", wrap.current.cancel);
  };

  const toggle = (e: React.MouseEvent, colItems: BoardItem[], item: BoardItem) => {
    if (suppressClick.current) return;
    setSelected((s) => {
      const n = new Set(s);
      if (e.shiftKey && last.current) {
        const a = colItems.findIndex((i) => i.id === last.current), b = colItems.findIndex((i) => i.id === item.id);
        if (a >= 0 && b >= 0) { for (const i of colItems.slice(Math.min(a, b), Math.max(a, b) + 1)) n.add(i.id); return n; }
      }
      if (n.has(item.id)) n.delete(item.id); else n.add(item.id);
      return n;
    });
    last.current = item.id;
  };

  const assignSelected = (to: string | null) => { const ids = [...selected]; setSelected(new Set()); void onMove(ids, to); };
  const currentCol = (id: string) => columns.find((c) => c.items.some((i) => i.id === id))?.id;
  const targets = columns.filter((c) => [...selected].some((id) => currentCol(id) !== c.id));
  const g = useGlassMode();
  // Glas (D3b): nur andere Klassen — Auswahl, Ziehen, Leiste und Speichern bleiben genau gleich.
  const cls = g ? {
    hint: "text-label mb-2 text-text-muted",
    col: (over: boolean, open: boolean) => cx("rounded-(--glass-radius-md) border p-3 transition-colors", over ? "border-border-accent bg-surface-selected" : open ? "border-status-warning-fg bg-surface-card-raised" : "border-border-subtle bg-surface-card-raised"),
    title: "text-body-18 text-text-primary", count: "text-label text-text-muted",
    quick: cx("text-label min-h-(--size-touch-min) rounded-pill border border-dashed border-border-default px-4 text-text-secondary", FOCUS_RING),
    empty: "text-label text-text-muted",
    chip: (on: boolean) => cx("text-body-16 min-h-(--size-touch-min) cursor-grab touch-manipulation rounded-(--glass-radius-sm) border px-3", on ? "bg-champagne border-border-accent text-text-on-accent" : "glass-fill border-border-subtle text-text-primary", FOCUS_RING),
    sub: "text-label ms-1 opacity-80",
    ghost: "pointer-events-none fixed z-[70] rounded-(--glass-radius-sm) border border-border-accent bg-surface-card-raised px-3 py-2 text-body-16 text-text-primary shadow-card",
    bar: "glass fixed inset-x-3 bottom-3 z-[60] rounded-(--glass-radius-lg) p-4 sm:start-auto sm:end-4 sm:w-[28rem]",
    barTitle: "text-body-18 text-text-primary",
    barClear: cx("text-label min-h-(--size-touch-min) rounded-(--glass-radius-sm) border border-border-subtle px-3 text-text-primary", FOCUS_RING),
    barHint: "text-label mb-1 text-text-muted",
    target: cx("bg-champagne text-body-16 min-h-(--size-touch-min) rounded-(--glass-radius-sm) border border-border-accent px-4 text-text-on-accent", FOCUS_RING),
  } : {
    hint: "mb-2 text-xs text-graphite/65",
    col: (over: boolean, open: boolean) => `rounded-2xl border p-3 transition-colors ${over ? "border-gold-line bg-parchment" : open ? "border-status-in-progress/40 bg-white" : "border-charcoal/10 bg-white"}`,
    title: "font-serif text-lg", count: "text-sm text-graphite/60",
    quick: "min-h-11 rounded-full border border-dashed border-charcoal/25 px-3 text-xs font-medium hover:border-gold-line",
    empty: "text-xs text-graphite/50",
    chip: (on: boolean) => `min-h-11 cursor-grab touch-manipulation rounded-lg border px-3 text-sm font-medium ${on ? "border-gold-line bg-parchment ring-2 ring-gold-line" : "border-charcoal/15 bg-white hover:border-gold-line"}`,
    sub: "ms-1 text-xs text-graphite/60",
    ghost: "pointer-events-none fixed z-[70] rounded-lg border border-gold-line bg-parchment px-3 py-2 text-sm font-medium shadow-lift",
    bar: "fixed inset-x-3 bottom-3 z-[60] rounded-2xl border border-charcoal/10 bg-linen/95 p-3 shadow-lift backdrop-blur sm:start-auto sm:end-4 sm:w-[28rem]",
    barTitle: "font-medium",
    barClear: "min-h-11 rounded-lg border border-charcoal/15 px-3 text-xs font-medium hover:border-gold-line",
    barHint: "mb-1 text-xs text-graphite/65",
    target: "min-h-11 rounded-lg bg-navy px-3 text-sm font-medium text-white hover:bg-navy-line",
  };

  return (
    <div ref={root} className="pb-24">
      {hint && <p className={cls.hint}>{hint}</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {columns.map((c) => {
          const over = drag?.over !== undefined && drag.over === c.id;
          return (
            <section key={colKey(c.id)} data-board-col={colKey(c.id)}
              className={cls.col(over, c.tone === "open" && c.items.length > 0)}>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h4 className={cls.title}>{c.title} <span className={cls.count}>· {c.items.length}</span></h4>
                {c.summary}
              </div>
              {c.quick && c.items.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {c.quick.map((q) => (
                    <button key={q.label} type="button" onClick={() => setSelected((s) => new Set([...s, ...q.ids]))}
                      className={cls.quick}>{q.label}</button>
                  ))}
                </div>
              )}
              {c.items.length === 0 ? <p className={cls.empty}>{t("board.empty")}</p> : (
                <ul className="flex flex-wrap gap-1.5">
                  {c.items.map((i) => {
                    const on = selected.has(i.id);
                    return (
                      <li key={i.id}>
                        <button type="button" aria-pressed={on} title={i.title}
                          onPointerDown={(e) => down(e, i)} onClick={(e) => toggle(e, c.items, i)}
                          style={{ WebkitTouchCallout: "none", userSelect: "none" }}
                          className={`${cls.chip(on)} ${drag?.ids.includes(i.id) ? "opacity-40" : ""}`}>
                          {i.label}{i.mark ? ` ${i.mark}` : ""}
                          {i.sub && <span className={cls.sub}>{i.sub}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {drag && (
        <div className={cls.ghost} style={{ left: drag.x + 12, top: drag.y + 12 }}>{drag.label}</div>
      )}

      {selected.size > 0 && (
        <div role="region" aria-label={t("board.bar")} className={cls.bar}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className={cls.barTitle}>{t("board.nSelected", { n: selected.size })}</span>
            <button type="button" onClick={() => setSelected(new Set())} className={cls.barClear}>{t("board.clear")}</button>
          </div>
          <p className={cls.barHint}>{t("board.assignTo")}</p>
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {targets.map((c) => (
              <button key={colKey(c.id)} type="button" onClick={() => assignSelected(c.id)} className={cls.target}>{c.title}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
