"use client";
import { GripVertical } from "lucide-react";
import { useRef, type KeyboardEvent, type PointerEvent } from "react";

// `list` with the item at `from` moved to `to`.
export const moveItem = <T,>(list: readonly T[], from: number, to: number) => {
  const next = [...list];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
};

// Drag a row by its handle to a new place in its list (touch, pen or mouse). The list reorders live as the pointer
// crosses a neighbour's middle, so there is no ghost to draw; ↑ and ↓ on the focused handle move it one place.
export function useReorder({ count, onMove }: { count: number; onMove: (from: number, to: number) => void }) {
  const rows = useRef<(HTMLElement | null)[]>([]);
  const dragging = useRef<number | null>(null); // the dragged row's index now, which changes as it moves

  const rowRef = (i: number) => (el: HTMLElement | null) => {
    rows.current[i] = el;
  };

  const handle = (i: number) => {
    const stop = () => {
      dragging.current = null;
    };
    return {
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging.current = i;
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        const from = dragging.current;
        if (from === null) return;
        const above = rows.current[from - 1]?.getBoundingClientRect();
        const below = rows.current[from + 1]?.getBoundingClientRect();
        const to =
          above && e.clientY < above.top + above.height / 2
            ? from - 1
            : below && e.clientY > below.top + below.height / 2
              ? from + 1
              : null;
        if (to === null) return;
        onMove(from, to);
        dragging.current = to;
      },
      onPointerUp: stop,
      onPointerCancel: stop,
      onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
        const to = e.key === "ArrowUp" ? i - 1 : e.key === "ArrowDown" ? i + 1 : null;
        if (to === null || to < 0 || to >= count) return;
        e.preventDefault();
        onMove(i, to);
      },
    };
  };

  return { rowRef, handle };
}

// A row's drag handle: the grip the GM holds to move it.
export function DragHandle({
  label,
  ...events
}: { label: string } & ReturnType<ReturnType<typeof useReorder>["handle"]>) {
  return (
    <button type="button" className="drag" aria-label={`Drag to reorder: ${label}`} {...events}>
      <GripVertical size={18} aria-hidden="true" />
    </button>
  );
}
