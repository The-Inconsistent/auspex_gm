"use client";
import Image from "next/image";
import type { ComponentProps, ReactNode } from "react";

import { THREAT_CLASS_LABEL, type Combatant } from "@wg/shared";

import { StatusChips } from "@/components/ui/status-chips/status-chips";
import { Track } from "@/components/ui/track/track";
import type { CounterField } from "@/lib/command/constants";

import { VISIBILITY_SEEN, VISIBILITY_TAP, VISIBILITY_WORD } from "../../constants";
import type { Vitals } from "../../types";

type FightRowProps = {
  combatant: Combatant;
  name: string;
  vitals: Vitals;
  conditions: string[];
  status: string[];
  stateLabel: string;
  portrait: ComponentProps<typeof Image>["src"] | null | undefined;
  showPortrait: boolean;
  now: boolean;
  selected: boolean;
  padField: CounterField | null;
  padId: string;
  onSelect: () => void;
  onCounter: (field: CounterField) => void;
  onVisibility: () => void;
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
  stateLabel,
  portrait,
  showPortrait,
  now,
  selected,
  padField,
  padId,
  onSelect,
  onCounter,
  onVisibility,
  children,
}: FightRowProps) {
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
  const cls = ["fight-row", now && "now", selected && "sel", c.acted && "done"].filter(Boolean).join(" ");

  return (
    <div className={cls}>
      <button
        type="button"
        className="fight-select"
        aria-pressed={selected}
        aria-label={`${summary}. ${harm}. ${selected ? "Tap to deselect" : "Tap to select"}`}
        onClick={onSelect}
      />
      <span className="fight-cell tag" aria-hidden="true">
        {stateLabel}
      </span>
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
        <span className="tag dim hide-sm">{c.kind === "pc" ? "AGENT" : THREAT_CLASS_LABEL[c.threatClass]}</span>
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
      {c.kind === "threat" && (
        <button
          type="button"
          className="fight-vis"
          aria-label={`${name}: players see ${VISIBILITY_SEEN[c.visibility]}. Tap for ${VISIBILITY_WORD[VISIBILITY_TAP[c.visibility]]}`}
          onClick={onVisibility}
        >
          <span className={`chip${c.visibility === "stats" ? "" : " warn"}`}>{VISIBILITY_WORD[c.visibility]}</span>
        </button>
      )}
      {children}
    </div>
  );
}
