"use client";
import type { CharacterDetail } from "@wg/shared";

import { useRules } from "@/components/ui/rules-provider/rules-provider";

// Adding Detail (Core pp.32–36): what each part covers, with a few of the book's prompts as the placeholder.
const DETAIL_FIELDS = [
  {
    key: "appearance",
    label: "APPEARANCE",
    prompt:
      "Age, eyes, hair, height; an augmetic, a habit, a tell; a Memorable Injury someone else at the table describes…",
  },
  {
    key: "past",
    label: "YOUR PAST",
    prompt: "Where are you from? How were you raised? How did you join your Faction? Who are your friends?",
  },
  {
    key: "personality",
    label: "YOUR PERSONALITY",
    prompt: "What do you desire? What do you fear? What do you believe in? To whom are you loyal?",
  },
] as const;

type DetailFieldsProps = {
  value: Partial<CharacterDetail>;
  onChange: (value: Partial<CharacterDetail>) => void;
  idPrefix: string;
};

// The three parts as text boxes: the builder's DETAIL step and the sheet's EDIT.
export function DetailFields({ value, onChange, idPrefix }: DetailFieldsProps) {
  return (
    <>
      {DETAIL_FIELDS.map((f) => (
        <div key={f.key} className="field">
          <label className="label" htmlFor={`${idPrefix}-${f.key}`}>
            {f.label}
          </label>
          <textarea
            id={`${idPrefix}-${f.key}`}
            className="input"
            maxLength={4000}
            placeholder={f.prompt}
            value={value[f.key] ?? ""}
            onChange={(e) => onChange({ ...value, [f.key]: e.target.value })}
          />
        </div>
      ))}
    </>
  );
}

// The parts written so far, read-only, each folded (they can run long); nothing when none are.
export function DetailView({ detail }: { detail: CharacterDetail }) {
  return DETAIL_FIELDS.filter((f) => detail[f.key].trim()).map((f) => (
    <details key={f.key} className="item">
      <summary className="item-head">
        <b>{f.label}</b>
      </summary>
      <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{detail[f.key]}</div>
    </details>
  ));
}

// (?) beside WHO YOU ARE: opens Bringing Your Character to Life (Core p.34). Nothing when the rules didn't load.
export function DetailHelp() {
  const { get, open } = useRules();
  const rule = get("bringing-your-character-to-life");
  if (!rule) return null;
  return (
    <button type="button" className="rule-link" aria-label={`Rule: ${rule.name}`} onClick={() => open([rule])}>
      (?)
    </button>
  );
}

export const hasDetail = (d: CharacterDetail) => DETAIL_FIELDS.some((f) => d[f.key].trim());
