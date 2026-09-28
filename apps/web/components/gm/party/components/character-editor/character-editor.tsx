"use client";
import { useState, type FormEvent } from "react";

import {
  deriveStats,
  SKILLS,
  type ActionResult,
  type CharacterStats,
  type Character,
  type Overrides,
  type Skill,
} from "@wg/shared";

import type { Send } from "@/hooks/use-table/use-table";
import { PORTRAITS } from "@/lib/portraits/portraits";
import type { SheetRules } from "@/lib/sheet-rules/sheet-rules";

import { OVERRIDE_LABELS } from "../../constants";
import { RuleListEditor } from "./components/rule-list-editor/rule-list-editor";

type CharacterEditorProps = {
  character: Character;
  tier: number;
  sheetRules: SheetRules; // the book Talents and Abilities a hand-made sheet can pick
  send: Send;
  onResult: (r: ActionResult, ok: string) => void;
  onClose: () => void;
};

// Only rated Skills are kept, in sheet order, so an unchanged sheet compares equal.
const ratedSkills = (read: (k: Skill) => number | undefined): CharacterStats["skills"] =>
  Object.fromEntries((Object.keys(SKILLS) as Skill[]).map((k) => [k, read(k)]).filter(([, v]) => v));

const DETAIL_FIELDS = [
  ["appearance", "APPEARANCE (pp.32–33)"],
  ["past", "YOUR PAST (pp.34–35)"],
  ["personality", "YOUR PERSONALITY (pp.35–36)"],
] as const;

// The GM's edit of a character outside the builder: name, portrait, detail, Trait overrides, which win over the
// derived value (deriveStats), and a hand-made sheet's Skills, Talents and Abilities. The rest of the sheet changes through the builder or
// LOAD STATS. The fields start from the character as it was when EDIT opened; SAVE sends them all at once.
export function CharacterEditor({ character: c, tier, sheetRules, send, onResult, onClose }: CharacterEditorProps) {
  // The Traits without overrides, shown as each field's placeholder.
  const derived = deriveStats({ stats: c.stats, overrides: {}, tier });
  // A built character's Skills, Talents and Abilities are re-derived from its build on every save, so they change in the
  // builder, which checks prerequisites and XP. A hand-made sheet (a pack pregen, LOAD STATS) keeps its lists as written.
  // No XP is charged here: the GM is writing the sheet, not buying it.
  const handMade = !c.build;
  const [talents, setTalents] = useState(c.stats.talents);
  const [abilities, setAbilities] = useState(c.stats.abilities);

  // SAVE: a blank override field drops that override.
  const handleSave = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "");
    const name = text("name").trim();
    if (!name) return onResult({ ok: false, error: "A character needs a name" }, "");
    const overrides: Overrides = {};
    for (const k of Object.keys(OVERRIDE_LABELS) as (keyof Overrides)[]) {
      const v = text(k).trim();
      if (!v) continue;
      if (!/^\d+$/.test(v)) return onResult({ ok: false, error: `${OVERRIDE_LABELS[k]} must be a whole number` }, "");
      overrides[k] = Number(v);
    }
    let skills: CharacterStats["skills"] = {};
    if (handMade) {
      for (const k of Object.keys(SKILLS) as Skill[]) {
        const v = text(`skill-${k}`).trim();
        if (v && !/^[0-8]$/.test(v)) return onResult({ ok: false, error: `${k} must be a rating from 0 to 8` }, "");
      }
      skills = ratedSkills((k) => Number(text(`skill-${k}`).trim() || 0)); // Skill ratings run 0–8 (Core p.25)
    }
    // Stats only if the sheet changed, spread over the live sheet so a Wealth or Ammo change since EDIT opened stays.
    const listsChanged =
      handMade &&
      JSON.stringify({ skills, talents, abilities }) !==
        JSON.stringify({
          skills: ratedSkills((k) => c.stats.skills[k]),
          talents: c.stats.talents,
          abilities: c.stats.abilities,
        });
    const r = await send({
      type: "character.update",
      id: c.id,
      name,
      overrides,
      ...(listsChanged && { stats: { ...c.stats, skills, talents, abilities } }),
      detail: {
        appearance: text("appearance"),
        past: text("past"),
        personality: text("personality"),
        portrait: text("portrait"),
      },
    });
    onResult(r, `${name.toUpperCase()} SAVED`);
    if (r.ok) onClose();
  };

  return (
    <form className="stack" onSubmit={handleSave}>
      <div className="field">
        <label className="label" htmlFor={`name-${c.id}`}>
          NAME
        </label>
        <input id={`name-${c.id}`} className="input" name="name" maxLength={100} defaultValue={c.name} />
      </div>
      <div className="field">
        <label className="label" htmlFor={`portrait-${c.id}`}>
          PORTRAIT
        </label>
        <select id={`portrait-${c.id}`} className="input" name="portrait" defaultValue={c.detail.portrait}>
          <option value="">NONE</option>
          {Object.keys(PORTRAITS).map((slug) => (
            <option key={slug} value={slug}>
              {slug.replaceAll("-", " ").toUpperCase()}
            </option>
          ))}
        </select>
      </div>
      {DETAIL_FIELDS.map(([k, label]) => (
        <div key={k} className="field">
          <label className="label" htmlFor={`${k}-${c.id}`}>
            {label}
          </label>
          <textarea id={`${k}-${c.id}`} className="input" name={k} maxLength={4000} defaultValue={c.detail[k]} />
        </div>
      ))}
      {handMade ? (
        <>
          <span className="label">SKILLS (rating; blank or 0 removes it)</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(Object.entries(SKILLS) as [Skill, string][]).map(([k, attr]) => (
              <div key={k} className="field" style={{ width: 120 }}>
                <label className="label" htmlFor={`skill-${k}-${c.id}`}>
                  {k.toUpperCase()} ({attr.toUpperCase()})
                </label>
                <input
                  id={`skill-${k}-${c.id}`}
                  className="input"
                  name={`skill-${k}`}
                  inputMode="numeric"
                  placeholder="0"
                  defaultValue={c.stats.skills[k] || ""}
                />
              </div>
            ))}
          </div>
          <RuleListEditor
            title="TALENTS"
            owner={c.name}
            rules={talents}
            options={sheetRules.talents}
            onChange={setTalents}
          />
          <RuleListEditor
            title="ABILITIES"
            owner={c.name}
            rules={abilities}
            options={sheetRules.abilities}
            onChange={setAbilities}
          />
          <div className="dim" style={{ fontSize: 12 }}>
            A Skill, Talent or Ability changed here doesn&apos;t change bonuses (Wounds, Resolve, Keywords…) or XP: set
            those with OVERRIDES.
          </div>
        </>
      ) : (
        <div className="dim" style={{ fontSize: 12 }}>
          This character&apos;s Skills, Talents and Abilities come from its build: change them with REBUILD, which
          checks prerequisites and XP.
        </div>
      )}
      <span className="label">OVERRIDES (GM only; blank keeps the derived value, shown greyed)</span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {(Object.entries(OVERRIDE_LABELS) as [keyof Overrides, string][]).map(([k, label]) => (
          <div key={k} className="field" style={{ width: 120 }}>
            <label className="label" htmlFor={`${k}-${c.id}`}>
              {label}
            </label>
            <input
              id={`${k}-${c.id}`}
              className="input"
              name={k}
              inputMode="numeric"
              placeholder={String(derived[k])}
              defaultValue={c.overrides[k] ?? ""}
            />
          </div>
        ))}
      </div>
      <div className="keys">
        <button className="btn primary">SAVE</button>
        <button type="button" className="btn" onClick={onClose}>
          CANCEL
        </button>
      </div>
    </form>
  );
}
