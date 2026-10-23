"use client";
import { useId, useState, type ReactNode } from "react";

import { ChevronDown, ChevronUp } from "lucide-react";

type FoldRowProps = {
  title: ReactNode;
  cite?: string; // plain text in the head: the body's PageCite can't nest inside this button
  tag?: string; // a small mono stamp before the title (SECRET)
  children: ReactNode;
};

// One folded row: the head always shows, a tap opens the text under it. Closed by default, so a long Talent list stays
// a list of names.
export function FoldRow({ title, cite, tag, children }: FoldRowProps) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <div className="ps-fold" data-open={open}>
      <button
        type="button"
        className="ps-fold-head"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
      >
        {tag && <span className="ps-tag mono">{tag}</span>}
        <span className="ps-fold-title">{title}</span>
        {cite && <span className="ps-cite">{cite}</span>}
        <Chevron size={16} aria-hidden="true" />
      </button>
      {open && (
        <div id={bodyId} className="ps-fold-body">
          {children}
        </div>
      )}
    </div>
  );
}
