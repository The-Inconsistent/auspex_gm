"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import type { PopoverAlign } from "../constants";

type PopoverProps = {
  /** The trigger button's content and accessible name. */
  button: ReactNode;
  label: string;
  /** The panel's accessible name. */
  title: string;
  className?: string;
  align?: PopoverAlign;
  children: (close: () => void) => ReactNode;
};

// A header button that opens a small panel under it. One open at a time falls out of the outside tap closing the other.
// Escape and an outside tap close it; focus moves into the panel on open and back to the button on close.
export function Popover({ button, label, title, className = "btn", align = "end", children }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const [restore, setRestore] = useState(false); // closed from inside: focus goes back to the button
  const close = () => {
    setOpen(false);
    setRestore(true);
  };
  const toggle = () => {
    setRestore(false);
    setOpen(!open);
  };

  // External system: the document. A tap anywhere outside this popover closes it (no focus pull: the tap moved focus).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (e.target instanceof Node && !root.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // External system: DOM focus. Into the panel when it opens, back to the button when it was closed from inside.
  useEffect(() => {
    if (open) panel.current?.focus();
    else if (restore) trigger.current?.focus();
  }, [open, restore]);

  // Escape closes, from anywhere inside.
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !open) return;
    e.stopPropagation();
    close();
  };

  return (
    <div className="hd-pop" ref={root} onKeyDown={handleKeyDown}>
      <button
        ref={trigger}
        className={className}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-haspopup="dialog"
        onClick={toggle}
      >
        {button}
      </button>
      {open && (
        <div
          id={panelId}
          ref={panel}
          className={`hd-pop-panel band ${align}`}
          role="dialog"
          aria-label={title}
          tabIndex={-1}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}
