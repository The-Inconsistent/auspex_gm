"use client";
import { X } from "lucide-react";

import type { Codex } from "@wg/shared";

import { findRevealable } from "@/lib/scene-reveal/scene-reveal";

type BegunNoticeProps = {
  codex: Codex;
  revealed: string[];
  busy: boolean; // an UNDO is running
  onUndo: () => void;
  onDismiss: () => void;
};

// After a scene begins: what reached the phones with it, and UNDO to take the begin back.
export function BegunNotice({ codex, revealed, busy, onUndo, onDismiss }: BegunNoticeProps) {
  const names = revealed.flatMap((id) => {
    const row = findRevealable(codex, id)?.row;
    return row ? ["name" in row ? row.name : row.title] : [];
  });
  return (
    <div className="scene-notice" role="status">
      <span className="scene-notice-tag">SCENE BEGUN</span>
      <span className="scene-notice-text">
        · {names.length ? `shown on entry: ${names.join(", ")}` : "nothing was ticked to show on entry"}
      </span>
      <button type="button" className="btn sm" disabled={busy} onClick={onUndo}>
        UNDO
      </button>
      <button type="button" className="scene-x" aria-label="Dismiss this notice" onClick={onDismiss}>
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
