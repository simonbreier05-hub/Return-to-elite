"use client";

import { useRef, useState, type ReactNode } from "react";

/**
 * Vertical drag-to-reorder list, built on Pointer Events rather than native
 * HTML5 drag-and-drop — the native API's touch support on iPad Safari is
 * unreliable (the housekeeping tablets this app targets), while Pointer
 * Events work identically across mouse and touch with no extra dependency.
 *
 * Only the drag handle (rendered by `renderItem`, via the `dragHandleProps`
 * it receives) starts a drag, so the rest of a row stays tappable for its
 * own actions. Reordering commits on release; `onReorder` receives the full
 * new array so the caller can persist it (or ignore the call if the order
 * didn't actually change).
 */
export default function DragReorderList<T>({
  items,
  getId,
  onReorder,
  renderItem,
  className,
}: {
  items: T[];
  getId: (item: T) => string;
  onReorder: (next: T[]) => void;
  renderItem: (item: T, index: number, dragHandleProps: { onPointerDown: (e: React.PointerEvent) => void }) => ReactNode;
  className?: string;
}) {
  const [order, setOrder] = useState(items);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const dragState = useRef<{ id: string; startY: number; index: number } | null>(null);

  // Re-sync from the caller whenever its items identity changes and nothing
  // is being dragged right now — keeps this in step with server refetches
  // without fighting an in-progress gesture.
  const itemsKey = items.map(getId).join(",");
  const orderKey = order.map(getId).join(",");
  if (itemsKey !== orderKey && !draggingId) {
    setOrder(items);
  }

  const startDrag = (id: string, index: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = { id, startY: e.clientY, index };
    setDraggingId(id);
    setDragOffset(0);

    const onMove = (ev: PointerEvent) => {
      const st = dragState.current;
      if (!st) return;
      const offset = ev.clientY - st.startY;
      setDragOffset(offset);

      // Find which row the pointer has crossed the midpoint of, and swap.
      const draggedEl = rowRefs.current.get(st.id);
      if (!draggedEl) return;
      const draggedRect = draggedEl.getBoundingClientRect();
      const draggedMid = draggedRect.top + draggedRect.height / 2 + offset;

      setOrder((prev) => {
        const from = prev.findIndex((it) => getId(it) === st.id);
        if (from === -1) return prev;
        let to = from;
        for (let i = 0; i < prev.length; i++) {
          if (i === from) continue;
          const el = rowRefs.current.get(getId(prev[i]));
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          const mid = rect.top + rect.height / 2;
          if (i < from && draggedMid < mid) to = Math.min(to, i);
          if (i > from && draggedMid > mid) to = Math.max(to, i);
        }
        if (to === from) return prev;
        const next = prev.slice();
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        // The pointer's reference row changed index — rebase startY/index so
        // further movement keeps measuring from where the row now sits.
        dragState.current = { id: st.id, startY: ev.clientY, index: to };
        setDragOffset(0);
        return next;
      });
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      dragState.current = null;
      setDraggingId(null);
      setDragOffset(0);
      setOrder((finalOrder) => {
        const changed =
          finalOrder.length !== items.length || finalOrder.some((it, i) => getId(it) !== getId(items[i]));
        if (changed) onReorder(finalOrder);
        return finalOrder;
      });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div className={className}>
      {order.map((item, index) => {
        const id = getId(item);
        const isDragging = draggingId === id;
        return (
          <div
            key={id}
            ref={(el) => {
              if (el) rowRefs.current.set(id, el);
              else rowRefs.current.delete(id);
            }}
            style={
              isDragging
                ? { transform: `translateY(${dragOffset}px)`, zIndex: 10, position: "relative" }
                : undefined
            }
            className={isDragging ? "shadow-lift" : "transition-transform"}
          >
            {renderItem(item, index, { onPointerDown: startDrag(id, index) })}
          </div>
        );
      })}
    </div>
  );
}
