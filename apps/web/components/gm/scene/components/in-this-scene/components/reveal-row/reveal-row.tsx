"use client";
import { Eye, Lock } from "lucide-react";
import type { ReactNode } from "react";

type RevealRowProps = {
  name: string;
  shown: boolean;
  only?: string; // a private handout: the names of the Agents whose phones it reaches
  onPeek: () => void;
  onToggle?: () => void; // not with `children`
};

// One entry of the scene: its name opens the peek, and ONE toggle says the state (SHOWN / SEALED) while its accessible
// name says the action it will do. A row with a different control (an item's GIVE) passes it as `children` instead.
export function RevealRow({
  name,
  shown,
  only,
  onPeek,
  onToggle,
  children,
}: RevealRowProps & { children?: ReactNode }) {
  return (
    <div className={`scene-row ${children ? "wraps" : ""} ${shown || children ? "" : "sealed"}`}>
      <button type="button" className="scene-peek" aria-label={`Peek: ${name}`} onClick={onPeek}>
        {name}
      </button>
      {only && (
        <span className="chip warn reach" title={`${only} only`}>
          <Lock size={12} strokeWidth={2.4} aria-hidden="true" />
          <span className="reach-names">{only}</span>&nbsp;ONLY
        </span>
      )}
      <span className="scene-leader" aria-hidden="true" />
      {children ?? (
        <button
          type="button"
          className={`scene-toggle ${shown ? "on" : ""}`}
          aria-label={shown ? `Hide ${name} from the players` : `Show ${name} to the players`}
          onClick={onToggle}
        >
          {shown ? <Eye size={16} aria-hidden="true" /> : <Lock size={14} aria-hidden="true" />}
          {shown ? "SHOWN" : "SEALED"}
        </button>
      )}
    </div>
  );
}
