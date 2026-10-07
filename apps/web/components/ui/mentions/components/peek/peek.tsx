"use client";
import type { Attitude } from "@wg/shared";

import { AttitudeChip } from "@/components/ui/attitude-chip/attitude-chip";

import { KIND_LABEL, PEEK_FIELDS, PEEK_GM_ONLY } from "../../constants";
import { Mentions } from "../../mentions";
import type { MentionEntry } from "../../mentions-provider";

type PeekProps = { entry: MentionEntry };

// A mentioned entry, read-only: its name and the text fields its CODEX row shows. Links inside open in the same dialog.
export function Peek({ entry }: PeekProps) {
  const { kind, id, name, hidden, row } = entry;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div>
        <span className="label">{KIND_LABEL[kind]}</span>
        {hidden && <span className="dim"> · HIDDEN</span>}
      </div>
      <b>{name.toUpperCase()}</b>
      {kind === "npc" && <AttitudeChip attitude={row.attitude as Attitude} />}
      {PEEK_FIELDS[kind].map(([key, label]) => {
        const text = row[key];
        if (typeof text !== "string" || !text) return null;
        return (
          <div key={key} className={PEEK_GM_ONLY.has(key) ? "field plate" : "field"}>
            <span className="label">{label}</span>
            <pre className="text">
              <Mentions text={text} self={id} />
            </pre>
          </div>
        );
      })}
    </div>
  );
}
