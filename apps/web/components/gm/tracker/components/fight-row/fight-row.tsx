"use client";
import Image from "next/image";
import { useId, type ComponentProps, type ReactNode } from "react";

import { THREAT_CLASS_LABEL, Visibility, type Combatant, type TurnMark } from "@wg/shared";

import { StatusChips } from "@/components/ui/status-chips/status-chips";
import { Track } from "@/components/ui/track/track";
import type { CounterField } from "@/lib/command/constants";

import { SETUP_MARK_LABEL, TURN_MARK_LABEL, VISIBILITY_SEEN, VISIBILITY_WORD } from "../../constants";
import type { Vitals } from "../../types";
import { TurnDialog } from "../turn-dialog/turn-dialog";

type FightRowProps = {
  combatant: Combatant;
  name: string;
  vitals: Vitals;
  conditions: string[];
  status: string[];
  mark: TurnMark;
  // Before Round 1 the mark is the ambush toggle (ACTS | AMBUSHED) and has no dialog.
  setup: boolean;
  onAmbush: () => void;
  turn: Omit<ComponentProps<typeof TurnDialog>, "id" | "name" | "mark">;
  portrait: ComponentProps<typeof Image>["src"] | null | undefined;
  showPortrait: boolean;
  now: boolean;
  selected: boolean;
  padField: CounterField | null;
  padId: string;
  onSelect: () => void;
  onCounter: (field: CounterField) => void;
  onVisibility: (v: Visibility) => void;
  // An ally's row (issue #350): the chip that names its category, and RUN BY in place of PLAYERS SEE (an ally is always full).
  allyTag?: string;
  runBy?: ReactNode;
  // The delta pad, when it is open on this row.
  children?: ReactNode;
};

// One combatant. The row's select button lies under the row's cells (absolute), and the WOUNDS number, the SHOCK number
// and a threat's visibility chip are its sibling buttons, never nested in it. The cells are for the eye: pointer-events
// off, so a tap on them falls through to the select button, whose label says it all.
export function FightRow({
  combatant: c,
  name,
  vitals: v,
  conditions,
  status,
  mark,
  setup,
  onAmbush,
  turn,
  portrait,
  showPortrait,
  now,
  selected,
  padField,
  padId,
  onSelect,
  onCounter,
  onVisibility,
  allyTag,
  runBy,
  children,
}: FightRowProps) {
  const visId = useId();
  const turnId = useId();
  const stateLabel =
    setup && mark !== "out" ? SETUP_MARK_LABEL[mark === "ambushed" ? "ambushed" : "ready"] : TURN_MARK_LABEL[mark];
  const mob = c.kind === "threat" && c.mobCount !== null;
  const woundsLeft = Math.max(0, v.maxWounds - v.wounds);
  const shockLeft = v.maxShock === null ? null : Math.max(0, v.maxShock - v.shock);
  const woundsText = mob ? `×${c.mobCount}/${c.mobStart}` : `${woundsLeft}/${v.maxWounds}`;
  const woundsSaid = mob
    ? `${c.mobCount} of ${c.mobStart} members standing`
    : `Wounds ${woundsLeft} of ${v.maxWounds} left`;
  const summary = [
    name,
    stateLabel.replace("▶ ", "").toLowerCase(),
    ...conditions.map((k) => k.toLowerCase()),
    ...status.map((s) => s.toLowerCase()),
  ].join(", ");
  const harm = `${woundsSaid}. ${shockLeft === null ? "No Shock" : `Shock ${shockLeft} of ${v.maxShock} left`}, Defence ${v.defence ?? "none"}, Resilience ${v.resilience ?? "none"}`;
  const cls = ["fight-row", now && "now", selected && "sel", mark === "done" && "done"].filter(Boolean).join(" ");

  return (
    <div className={cls}>
      <button
        type="button"
        className="fight-select"
        aria-pressed={selected}
        aria-label={`${summary}. ${harm}. ${selected ? "Tap to deselect" : "Tap to select"}`}
        onClick={onSelect}
      />
      <span className="fight-cell tag">
        {mark === "out" ? (
          <span aria-hidden="true">{stateLabel}</span>
        ) : setup ? (
          <button
            type="button"
            className={`turn-mark ${mark}`}
            aria-pressed={mark === "ambushed"}
            aria-label={`${name}: ${mark === "ambushed" ? "ambushed, skips Round 1" : "acts in Round 1"}. Tap to ${mark === "ambushed" ? "let it act" : "mark ambushed"}`}
            onClick={onAmbush}
          >
            {stateLabel}
          </button>
        ) : (
          <button
            type="button"
            className={`turn-mark ${mark}`}
            popoverTarget={turnId}
            aria-label={`${name}: ${stateLabel.replace(/[▶✓] /, "").toLowerCase()}. Tap for turn actions`}
            aria-haspopup="dialog"
          >
            {stateLabel}
          </button>
        )}
      </span>
      {/* Outside the cell: its pointer-events are off, and a popover inherits them. */}
      {!setup && mark !== "out" && <TurnDialog id={turnId} name={name} mark={mark} {...turn} />}
      <span className="fight-cell fight-name" aria-hidden="true">
        {showPortrait &&
          (portrait ? (
            <Image src={portrait} alt="" width={120} className="portrait-thumb hide-sm" />
          ) : (
            <span className="portrait-thumb hide-sm" />
          ))}
        {c.kind === "threat" && c.marker && (
          <span
            className="fight-marker"
            role="img"
            aria-label={`${c.marker} marker`}
            style={{ background: `var(--marker-${c.marker})` }}
          />
        )}
        <b className="fight-label">{name}</b>
        {allyTag ? (
          <span className="chip ally">{allyTag}</span>
        ) : (
          <span className="tag dim hide-sm">{c.kind === "pc" ? "AGENT" : THREAT_CLASS_LABEL[c.threatClass]}</span>
        )}
      </span>
      <span className="fight-cell fight-harm">
        {!mob && <Track value={woundsLeft} max={v.maxWounds} tone="harm" />}
        <button
          type="button"
          className="fight-num"
          aria-label={`${name}, ${woundsSaid}. Tap to adjust`}
          aria-haspopup="dialog"
          aria-expanded={padField === "wounds"}
          aria-controls={padField === "wounds" ? padId : undefined}
          onClick={() => onCounter("wounds")}
        >
          {woundsText}
        </button>
      </span>
      <span className="fight-cell fight-harm">
        {shockLeft === null ? (
          <span className="dim">—</span>
        ) : (
          <button
            type="button"
            className="fight-num"
            aria-label={`${name}, Shock ${shockLeft} of ${v.maxShock} left. Tap to adjust`}
            aria-haspopup="dialog"
            aria-expanded={padField === "shock"}
            aria-controls={padField === "shock" ? padId : undefined}
            onClick={() => onCounter("shock")}
          >
            {shockLeft}/{v.maxShock}
          </button>
        )}
      </span>
      <span className="fight-cell hide-sm fight-stat" aria-hidden="true">
        {v.defence}
      </span>
      <span className="fight-cell hide-sm fight-stat" aria-hidden="true">
        {v.resilience}
      </span>
      <span className="fight-cell fight-status" aria-hidden="true">
        <StatusChips items={status} />
        {conditions.map((k) => (
          <span key={k} className="chip">
            {k.toUpperCase()}
          </span>
        ))}
      </span>
      {c.kind === "threat" && c.ally && runBy}
      {c.kind === "threat" && !c.ally && (
        <>
          <button
            type="button"
            className="fight-vis"
            popoverTarget={visId}
            aria-label={`${name}: players see ${VISIBILITY_SEEN[c.visibility]}. Tap to change`}
          >
            <span className={`chip${c.visibility === "stats" ? "" : " warn"}`}>{VISIBILITY_WORD[c.visibility]}</span>
          </button>
          {/* All three in two taps. FULL sits behind the picker, never a single tap, so a stray one can't send the
              stat block to every phone. A native popover: light dismiss and Escape, as ui/reach-chip. */}
          <span id={visId} popover="auto" className="term-pop" role="dialog" aria-label={`${name}: players see`}>
            <span className="term-pop-head">
              <b className="display">PLAYERS SEE</b>
            </span>
            <span className="term-pop-text">{name}</span>
            {Visibility.options.map((v) => (
              <button
                key={v}
                type="button"
                className="btn vis-pick"
                aria-pressed={v === c.visibility}
                popoverTarget={visId}
                popoverTargetAction="hide"
                onClick={() => v !== c.visibility && onVisibility(v)}
              >
                <b>{VISIBILITY_WORD[v]}</b>
                <span className="dim">{VISIBILITY_SEEN[v]}</span>
              </button>
            ))}
          </span>
        </>
      )}
      {children}
    </div>
  );
}
