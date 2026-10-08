"use client";
import { useState } from "react";

import { QUICK_NPC, SKILLS, quickRow, type Skill, type StatSource, type Threat } from "@wg/shared";

import { NumberInput } from "@/components/ui/number-input/number-input";
import { ThreatPicker } from "@/components/ui/threat-picker/threat-picker";

type StatSourceFieldProps = {
  id: string; // the label's id, for the radio group
  value: StatSource;
  bestiary: Threat[];
  tier: number;
  onChange: (s: StatSource) => void;
};

const KINDS = [
  ["bestiary", "BESTIARY THREAT", "A threat from the books' stat blocks."],
  ["quick", "QUICK NPC", "Core p.326's row for a Tier."],
  ["none", "NONE", "Talk only."],
] as const;
const TIERS = Object.keys(QUICK_NPC).map(Number);

// Where an NPC's stats come from (issue #47). BESTIARY keeps the old source until a threat is picked, since a
// bestiary source without a threat can't be saved.
export function StatSourceField({ id, value, bestiary, tier, onChange }: StatSourceFieldProps) {
  const [kind, setKind] = useState<StatSource["kind"]>(value.kind);

  const pickKind = (k: StatSource["kind"]) => {
    setKind(k);
    if (k === "none") onChange({ kind: "none" });
    // A new Quick NPC starts at the campaign's Tier, Tier 4 past the table's last row (rules-flow §11.86).
    if (k === "quick" && value.kind !== "quick") onChange({ kind: "quick", tier: quickRow(tier).tier });
  };

  // Specialty select: "" drops it; a new one starts at the row's Default Skills pool for the GM to tweak (p.326).
  const pickSkill = (q: Extract<StatSource, { kind: "quick" }>, skill: string) => {
    const { specialty, ...rest } = q;
    onChange(
      skill
        ? { ...rest, specialty: { skill: skill as Skill, dice: specialty?.dice ?? quickRow(q.tier).row.skills } }
        : rest,
    );
  };

  return (
    <div className="stack" role="radiogroup" aria-labelledby={id} style={{ gap: 8 }}>
      {KINDS.map(([k, label, hint]) => (
        <label key={k} className="check">
          <input type="radio" name={id} checked={kind === k} onChange={() => pickKind(k)} />
          <b>{label}</b> <span className="dim">{hint}</span>
        </label>
      ))}
      {kind === "bestiary" && value.kind !== "bestiary" && (
        <span className="dim">Pick a threat. Until then the NPC keeps its {value.kind.toUpperCase()} stat source.</span>
      )}
      {kind === "bestiary" && (
        <ThreatPicker
          bestiary={bestiary}
          tier={tier}
          value={value.kind === "bestiary" ? value.threatId : undefined}
          label="PICK A THREAT…"
          onPick={(t) => onChange({ kind: "bestiary", threatId: t.id })}
        />
      )}
      {kind === "quick" && value.kind === "quick" && (
        <div className="keys" style={{ alignItems: "center", paddingTop: 0 }}>
          <span className="label">TIER</span>
          {TIERS.map((t) => (
            <button
              key={t}
              className={`btn sm ${value.tier === t ? "primary" : ""}`}
              aria-pressed={value.tier === t}
              onClick={() => onChange({ ...value, tier: t })}
            >
              {t}
            </button>
          ))}
          <label className="label" htmlFor={`${id}-skill`}>
            SPECIALTY
          </label>
          <select
            id={`${id}-skill`}
            className="input"
            style={{ width: "auto" }}
            value={value.specialty?.skill ?? ""}
            onChange={(e) => pickSkill(value, e.target.value)}
          >
            <option value="">—</option>
            {Object.keys(SKILLS).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {value.specialty && (
            <NumberInput
              label="Specialty dice"
              max={20}
              value={value.specialty.dice}
              onChange={(n) => n && onChange({ ...value, specialty: { ...value.specialty!, dice: n } })}
            />
          )}
        </div>
      )}
    </div>
  );
}
