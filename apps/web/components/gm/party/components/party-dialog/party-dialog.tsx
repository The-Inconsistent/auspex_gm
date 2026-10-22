"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { PartyMsg } from "../../constants";

type PartyDialogProps = {
  label: string; // what a screen reader calls it
  title: string;
  side?: boolean; // a sheet from the right edge (the dossier), not a centred box
  msg: PartyMsg | null; // the page's report line; only one sent since this opened shows, so a refusal appears here
  onClose: () => void;
  children: ReactNode;
};

// PARTY's one dialog: a native modal <dialog>, so Escape, the focus trap, focus into it (the CLOSE button is first) and
// focus back to the control that opened it come from the browser. The parent mounts it only while open.
export function PartyDialog({ label, title, side, msg, onClose, children }: PartyDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [opened] = useState(msg?.id ?? 0); // the line that was already on the page when this opened
  const shown = msg && msg.id !== opened ? msg : null;

  // showModal() is the browser's own top layer, which React can't render into: an external system to sync with.
  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className={`party-dlg ${side ? "side" : ""}`}
      aria-label={label}
      onClose={onClose}
      // A click on the dialog element itself, not its content, is a click on the backdrop.
      onClick={(e) => e.target === ref.current && ref.current.close()}
    >
      <div className="sb-title">
        <span>{title}</span>
        <button className="btn" onClick={() => ref.current?.close()}>
          CLOSE
        </button>
      </div>
      <div className="party-dlg-body stack">
        {shown && (
          <div className={shown.text.startsWith("!") ? "red" : "accent"} role="status">
            {shown.text}
          </div>
        )}
        {children}
      </div>
    </dialog>
  );
}
