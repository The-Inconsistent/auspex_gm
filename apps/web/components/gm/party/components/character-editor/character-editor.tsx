"use client";
import { Fragment, useState, type FormEvent, type ReactNode } from "react";

import {
  deriveStats,
  ATTRIBUTES,
  SKILLS,
  type ActionResult,
  type CharacterStats,
  type Character,
  type Overrides,
  type Skill,
} from "@wg/shared";

import { ATTRIBUTE_NAMES } from "@/components/builder/constants";
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

const MAX_SKILL = 8; // the sheet's Skill ratings (Core p.25)
const MAX_ATTRIBUTE = 12; // ATTRIBUTE_XP's last rating (Core p.24)

type RatingRowProps = {
  label: ReactNode;
  name: string; // for the buttons' screen-reader labels
  value: number;
  min: number;
  max: number;
  dice?: number; // a Skill's pool; none on an Attribute row
  onChange: (v: number) => void;
};

// One −/+ rating line, laid out like the builder's CUSTOMISE rows (.bld-rate).
function RatingRow({ label, name, value, min, max, dice, onChange }: RatingRowProps) {
  return (
    <div className={value || dice === undefined ? "bld-rate" : "bld-rate dim"}>
      <span>{label}</span>
      <span className="bld-v">{value}</span>
      <button
        type="button"
        className="btn sq sm"
        aria-label={`Lower ${name}`}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <button
        type="button"
        className="btn sq sm"
        aria-label={`Raise ${name}`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
      <span className="bld-cite">{dice !== undefined && `${dice} dice`}</span>
    </div>
  );
}

const DETAIL_FIELDS = [
  ["appearance", "APPEARANCE (pp.32–33)"],
  ["past", "YOUR PAST (pp.34–35)"],
  ["personality", "YOUR PERSONALITY (pp.35–36)"],
] as const;

// The GM's edit of a character outside the builder: name, portrait, detail, Trait overrides, which win over the
// derived value (deriveStats), and a hand-made sheet's Attributes, Skills, Talents and Abilities. The rest of the sheet changes through the builder or
// LOAD STATS. The fields start from the character as it was when EDIT opened; SAVE sends them all at once.
export function CharacterEditor({ character: c, tier, sheetRules, send, onResult, onClose }: CharacterEditorProps) {
  // The Traits without overrides, shown as each field's placeholder.
  const derived = deriveStats({ stats: c.stats, overrides: {}, tier });
  // A built character's Attributes, Skills, Talents and Abilities are re-derived from its build on every save, so they change in the
  // builder, which checks prerequisites and XP. A hand-made sheet (a pack pregen, LOAD STATS) keeps its lists as written.
  // No XP is charged here: the GM is writing the sheet, not buying it.
  const handMade = !c.build;
  const [attributes, setAttributes] = useState(c.stats.attributes);
  const [skills, setSkills] = useState(c.stats.skills);
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
    // Stats only if the sheet changed, spread over the live sheet so a Wealth or Ammo change since EDIT opened stays.
    const listsChanged =
      handMade &&
      JSON.stringify({ attributes, skills: ratedSkills((k) => skills[k]), talents, abilities }) !==
        JSON.stringify({
          attributes: c.stats.attributes,
          skills: ratedSkills((k) => c.stats.skills[k]),
          talents: c.stats.talents,
          abilities: c.stats.abilities,
        });
    const r = await send({
      type: "character.update",
      id: c.id,
      name,
      overrides,
      ...(listsChanged && {
        stats: { ...c.stats, attributes, skills: ratedSkills((k) => skills[k]), talents, abilities },
      }),
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
          <div className="label" style={{ display: "flex" }}>
            <span style={{ flex: 1 }}>ATTRIBUTES AND SKILLS</span>
            <span>DICE = Skill + Attribute (Core p.21)</span>
          </div>
          <div className="list table">
            {ATTRIBUTES.map((a) => (
              <Fragment key={a}>
                <RatingRow
                  label={<b>{ATTRIBUTE_NAMES[a].toUpperCase()}</b>}
                  name={ATTRIBUTE_NAMES[a]}
                  value={attributes[a]}
                  min={1}
                  max={MAX_ATTRIBUTE}
                  onChange={(v) => setAttributes({ ...attributes, [a]: v })}
                />
                {(Object.keys(SKILLS) as Skill[])
                  .filter((k) => SKILLS[k] === a)
                  .map((k) => (
                    <RatingRow
                      key={k}
                      label={<span style={{ paddingLeft: 16 }}>{k}</span>}
                      name={k}
                      value={skills[k] ?? 0}
                      min={0}
                      max={MAX_SKILL}
                      dice={(skills[k] ?? 0) + attributes[a]}
                      onChange={(v) => setSkills({ ...skills, [k]: v })}
                    />
                  ))}
              </Fragment>
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
            An Attribute feeds its Traits (Defence, Resilience, Wounds…). A Skill, Talent or Ability changed here
            doesn&apos;t change bonuses (Wounds, Resolve, Keywords…), and nothing here costs XP: set bonuses with
            OVERRIDES.
          </div>
        </>
      ) : (
        <div className="dim" style={{ fontSize: 12 }}>
          This character&apos;s Attributes, Skills, Talents and Abilities come from its build: change them with REBUILD,
          which checks prerequisites and XP.
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
