import type { MouseEvent, RefObject } from "react";

import { X } from "lucide-react";

import type { Codex } from "@wg/shared";

import { AttitudeChip } from "@/components/ui/attitude-chip/attitude-chip";
import { CodexPicture } from "@/components/ui/codex-picture/codex-picture";
import { HandoutDoc } from "@/components/ui/handout-doc/handout-doc";
import { Mentions } from "@/components/ui/mentions/mentions";

import { canShowTable, entryName, parentName, stampOf, type IntelEntry } from "../../utils";

type EntrySheetProps = {
  ref: RefObject<HTMLDialogElement | null>;
  codex: Codex;
  names: Map<string, string>; // Agent names, for an NPC's FOLLOWS line (issue #350)
  entry: IntelEntry | null;
  onClose: () => void; // the dialog closed (any way): the caller forgets the entry
  onShow: (e: IntelEntry) => void;
};

// One entry in full, over INTEL: a native modal <dialog> (Escape, focus trap, focus return, backdrop click), as the
// codebase's other dialogs. The Intel shell calls showModal, so the entry is rendered before focus is placed.
export function EntrySheet({ ref, codex, names, entry, onClose, onShow }: EntrySheetProps) {
  const close = () => ref.current?.close();
  // A click on the dialog element itself, not its content, is a click on the backdrop: close.
  const handleBackdrop = (ev: MouseEvent<HTMLDialogElement>) => {
    if (ev.target === ref.current) close();
  };
  return (
    <dialog
      ref={ref}
      className="pl-entry"
      aria-label={entry ? entryName(entry) : "Codex entry"}
      onClose={onClose}
      onClick={handleBackdrop}
    >
      {entry && (
        <>
          <div className="slate-card pl-entry-head">
            <span className="xmit">+++ {stampOf(entry)} +++</span>
            <button type="button" className="pl-entry-close" aria-label={`Close ${entryName(entry)}`} onClick={close}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="pl-entry-body">
            <h2 className="pl-entry-name">{entryName(entry)}</h2>
            <Body codex={codex} names={names} e={entry} />
          </div>
          <div className="pl-entry-keys">
            {canShowTable(entry) && (
              <button type="button" className="pl-big cut pl-big-fill" onClick={() => onShow(entry)}>
                SHOW THE TABLE
              </button>
            )}
            <button type="button" className="pl-big cut" onClick={close}>
              BACK
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}

function Body({ codex, names, e }: { codex: Codex; names: Map<string, string>; e: IntelEntry }) {
  if (e.kind === "handout") {
    return (
      <>
        {/* toPlayerCodex leaves the viewer alone in a private handout's audience. */}
        {e.entry.audience.length > 0 && <span className="label">FOR YOUR EYES ONLY</span>}
        <HandoutDoc handout={e.entry} />
      </>
    );
  }
  // A given item: what the GM read out when it was found. Its rules, if any, are on the sheet.
  if (e.kind === "item")
    return e.entry.description ? (
      <pre className="text">
        <Mentions text={e.entry.description} self={e.entry.id} />
      </pre>
    ) : (
      <span className="dim">Nothing more is known about it.</span>
    );
  const { description, id, imageId, name } = e.entry;
  const parent = e.kind === "location" ? parentName(codex, e.entry) : null;
  return (
    <>
      {e.kind === "npc" && e.entry.role && <span className="pl-entry-role">{e.entry.role}</span>}
      {parent && <span className="pl-entry-role">In {parent}</span>}
      {e.kind === "npc" && <AttitudeChip attitude={e.entry.attitude} />}
      {e.kind === "npc" && e.entry.followsId && (
        <span className="mono pl-entry-role">FOLLOWS {(names.get(e.entry.followsId) ?? "AN AGENT").toUpperCase()}</span>
      )}
      {/* Only once the GM shows it: toPlayerCodex drops a held-back picture's id (issue #199). */}
      {imageId && <CodexPicture imageId={imageId} alt={name} large />}
      {description && (
        <pre className="text">
          <Mentions text={description} self={id} />
        </pre>
      )}
    </>
  );
}
