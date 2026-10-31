"use client";

import { X } from "lucide-react";
import { useState, type ChangeEvent } from "react";

import {
  SKILLS,
  THREAT_CLASS_LABEL,
  type PoolPresetTable,
  type Skill,
  type Threat,
  type ThreatClass,
  type Wargear,
} from "@wg/shared";

import { FieldError } from "@/components/ui/field-error/field-error";
import { FindField } from "@/components/ui/find-field/find-field";
import type { FieldErrors } from "@/hooks/use-field-errors/use-field-errors";

import {
  ABILITY_TYPES,
  ATTR_FIELDS,
  CLASS_OPTIONS,
  FACTIONS,
  ruinAbility,
  SIZES,
  type ThreatDraft,
} from "../../constants";
import { withStrength } from "../weapon-table/utils";
import { WeaponTable } from "../weapon-table/weapon-table";

type ThreatFormProps = {
  draft: ThreatDraft;
  tier: number; // this campaign's, marked on the Tier row
  wargear: Wargear[];
  ruinActions: PoolPresetTable | null; // Threat Assessment p.7, offered as RUIN abilities
  fields: FieldErrors; // SAVE's marks: NAME and KEYWORDS are required (CustomThreatData), inputs t-<key>
  onChange: (d: ThreatDraft) => void;
};

const SKILL_NAMES = Object.keys(SKILLS) as Skill[];

// A number cell under a printed header. A nullable one takes a typed "–" for the stat block's dash (Core p.323), and
// shows it as a placeholder, so a number typed into it isn't "–5".
function NumField({
  label,
  name = label,
  value,
  nullable = false,
  min = 0,
  onChange,
}: {
  label: string; // the header as printed: S, WIL, RESILIENCE
  name?: string; // what a screen reader says, where the header is an abbreviation
  value: number | null;
  nullable?: boolean;
  min?: number;
  onChange: (n: number | null) => void;
}) {
  const [text, setText] = useState<string | null>(null); // as typed; null shows `value`

  // Typing commits each number, and a dash where one may be printed; clearing a field to retype it commits nothing.
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const typed = e.target.value.trim();
    setText(typed);
    if (nullable && /^[-–]$/.test(typed)) onChange(null);
    else if (/^\d+$/.test(typed)) onChange(Math.max(min, Number(typed)));
  };

  return (
    <label className="th-num">
      <span>{label}</span>
      <input
        aria-label={name}
        inputMode={nullable ? "text" : "numeric"}
        placeholder={nullable ? "–" : undefined}
        value={text ?? value ?? ""}
        onChange={handleChange}
        onBlur={() => setText(null)}
      />
    </label>
  );
}

// A list of short strings (keywords), edited as one comma-separated line: a row per keyword would fill the tablet.
type WordsProps = { id: string; label: string; value: string[]; marks: object; onChange: (v: string[]) => void };

function Words({ id, label, value, marks, onChange }: WordsProps) {
  const [text, setText] = useState<string | null>(null); // the line as typed; null shows `value`

  // Typing: keep the raw line, so a comma or a space between words survives, and commit the parsed list as it goes.
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
    onChange(
      e.target.value
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    );
  };

  return (
    <label className="field">
      <span className="label">{label}</span>
      <input
        id={id}
        className="input"
        aria-label={label}
        placeholder="NECRON, [DYNASTY]"
        {...marks}
        value={text ?? value.join(", ")}
        onChange={handleChange}
        onBlur={() => setText(null)}
      />
    </label>
  );
}

const Remove = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button type="button" className="th-x" aria-label={label} onClick={onClick}>
    <X size={16} aria-hidden="true" />
  </button>
);

// The stat block the GM is writing, part by part in Threat Assessment p.5's order (canvas Threat-Editor): identity and
// the Tier row, Attributes and the derived numbers, Skills, Bonuses, Abilities with their weapons, Mob content, notes.
// Every field is the GM's; the hints never block a save (§11.109).
export function ThreatForm({ draft: d, tier, wargear, ruinActions, fields, onChange }: ThreatFormProps) {
  // An edit clears the mark on the field it changed.
  const set = (patch: Partial<ThreatDraft>) => {
    onChange({ ...d, ...patch });
    Object.keys(patch).forEach((k) => fields.clear(k));
  };

  const abilities = d.abilities ?? [];
  const setAbility = (i: number, patch: Partial<(typeof abilities)[number]>) =>
    set({ abilities: abilities.map((a, j) => (j === i ? { ...a, ...patch } : a)) });

  // The Tier row: four or five classes (Core p.323). The fifth can be left off; "–" is a class not yet available.
  const setTier = (i: number, v: string) => {
    if (i === 4 && v === "none") return set({ threat: d.threat.slice(0, 4) });
    const cls = (v || null) as ThreatClass | null;
    set({ threat: i < d.threat.length ? d.threat.map((x, j) => (j === i ? cls : x)) : [...d.threat, cls] });
  };

  // An Attribute: a new Strength carries the weapons that follow it (rules-flow.md §11.165).
  const setAttribute = (key: keyof ThreatDraft["attributes"], n: number | null) => {
    if (key === "S" && n !== null) onChange(withStrength(d, n));
    else set({ attributes: { ...d.attributes, [key]: n } });
  };

  // A picked Ruin Action joins as a RUIN ability with its cite (Threat Assessment p.7).
  const addRuinAction = (name: string) => {
    const row = ruinActions?.rows.find((r) => r.name === name);
    if (ruinActions && row) set({ abilities: [...abilities, ruinAbility(ruinActions, row)] });
  };

  return (
    <div className="th-form">
      <section id="th-identity" className="ed-sec" aria-labelledby="th-identity-h">
        <div className="rule" id="th-identity-h">
          IDENTITY
        </div>
        <div className="th-idrow">
          <label className="field">
            <span className="label">NAME</span>
            <input
              id="t-name"
              className="input"
              aria-label="Name"
              maxLength={100}
              value={d.name}
              onChange={(e) => set({ name: e.target.value })}
              {...fields.marks("name")}
            />
            <FieldError {...fields.reason("name")} />
          </label>
          <label className="field">
            <span className="label">FACTION</span>
            <select
              className="input"
              value={d.faction}
              onChange={(e) => set({ faction: e.target.value as Threat["faction"] })}
            >
              {FACTIONS.map((f) => (
                <option key={f} value={f}>
                  {f.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">SIZE</span>
            <select className="input" value={d.size} onChange={(e) => set({ size: e.target.value as Threat["size"] })}>
              {SIZES.map((s) => (
                <option key={s} value={s}>
                  {s.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="field">
          <span className="label">THREAT BY TIER · THIS CAMPAIGN PLAYS TIER {tier}</span>
          <div className="th-tiers">
            {[0, 1, 2, 3, 4].map((i) => (
              <label key={i} className="th-tier" aria-current={i === tier - 1 || undefined}>
                <span>TIER {i + 1}</span>
                <select
                  aria-label={`Class at Tier ${i + 1}`}
                  value={i < d.threat.length ? (d.threat[i] ?? "") : "none"}
                  onChange={(e) => setTier(i, e.target.value)}
                >
                  {CLASS_OPTIONS.map((o) => (
                    <option key={o ?? "dash"} value={o ?? ""}>
                      {o ? THREAT_CLASS_LABEL[o] : "–"}
                    </option>
                  ))}
                  {i === 4 && <option value="none">NOT PRINTED</option>}
                </select>
              </label>
            ))}
          </div>
        </div>
        <Words
          id="t-keywords"
          label="KEYWORDS"
          value={d.keywords}
          marks={fields.marks("keywords")}
          onChange={(keywords) => set({ keywords })}
        />
        <FieldError {...fields.reason("keywords")} />
      </section>

      <section id="th-attributes" className="ed-sec" aria-labelledby="th-attributes-h">
        <div className="rule" id="th-attributes-h">
          ATTRIBUTES
        </div>
        <div className="th-nums" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
          {ATTR_FIELDS.map(([key, name, nullable]) => (
            <NumField
              key={key}
              label={key.toUpperCase()}
              name={name}
              value={d.attributes[key]}
              nullable={nullable}
              min={1}
              onChange={(n) => setAttribute(key, n)}
            />
          ))}
        </div>
        <span className="dim">Type – where the book prints no score.</span>
        <div className="th-nums" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
          <NumField
            label="RESILIENCE"
            value={d.resilience.value}
            min={1}
            onChange={(n) => set({ resilience: { ...d.resilience, value: n ?? 1 } })}
          />
          <NumField label="DEFENCE" value={d.defence} onChange={(n) => set({ defence: n ?? 0 })} />
          <NumField label="WOUNDS" value={d.wounds} min={1} onChange={(n) => set({ wounds: n ?? 1 })} />
          <NumField label="SHOCK" value={d.shock} nullable min={1} onChange={(shock) => set({ shock })} />
        </div>
        <label className="field">
          <span className="label">ARMOUR, AS PRINTED BESIDE RESILIENCE</span>
          <input
            className="input"
            placeholder="AR 3"
            value={d.resilience.note ?? ""}
            onChange={(e) => set({ resilience: { ...d.resilience, note: e.target.value || undefined } })}
          />
        </label>
        <div className="th-nums" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
          <NumField label="CONVICTION" value={d.conviction} nullable onChange={(conviction) => set({ conviction })} />
          <NumField label="RESOLVE" value={d.resolve} nullable onChange={(resolve) => set({ resolve })} />
          <NumField label="SPEED" value={d.speed} onChange={(n) => set({ speed: n ?? 0 })} />
          <NumField
            label="PERSONAL RUIN"
            value={d.personalRuin ?? null}
            nullable
            min={1}
            onChange={(n) => set({ personalRuin: n ?? undefined })}
          />
        </div>
      </section>

      {/* Skills: the Default pool any unlisted Skill rolls (Core p.323), then the listed ones. */}
      <section id="th-skills" className="ed-sec" aria-labelledby="th-skills-h">
        <div className="rule" id="th-skills-h">
          SKILLS
        </div>
        <div className="th-nums" style={{ gridTemplateColumns: "120px" }}>
          <NumField
            label="DEFAULT"
            name="Default Skill pool"
            value={d.skills.default}
            nullable
            onChange={(n) => set({ skills: { ...d.skills, default: n } })}
          />
        </div>
        {d.skills.list.map((s, i) => {
          const setSkill = (patch: Partial<typeof s>) =>
            set({ skills: { ...d.skills, list: d.skills.list.map((x, j) => (j === i ? { ...x, ...patch } : x)) } });
          return (
            <div key={i} className="th-line">
              <select
                className="input"
                aria-label={`Skill ${i + 1}`}
                value={s.name}
                onChange={(e) => setSkill({ name: e.target.value })}
              >
                {SKILL_NAMES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <div className="th-nums" style={{ gridTemplateColumns: "repeat(2, 84px)" }}>
                <NumField
                  label="DICE"
                  name={`${s.name} dice`}
                  value={s.dice}
                  min={1}
                  onChange={(n) => setSkill({ dice: n ?? 1 })}
                />
                <NumField
                  label="PASSIVE"
                  name={`${s.name} passive`}
                  value={s.passive ?? null}
                  nullable
                  onChange={(n) => setSkill({ passive: n ?? undefined })}
                />
              </div>
              <Remove
                label={`Remove ${s.name}`}
                onClick={() => set({ skills: { ...d.skills, list: d.skills.list.filter((_, j) => j !== i) } })}
              />
            </div>
          );
        })}
        <div>
          <button
            className="btn sm"
            onClick={() => set({ skills: { ...d.skills, list: [...d.skills.list, { name: "Awareness", dice: 1 }] } })}
          >
            + SKILL
          </button>
        </div>
      </section>

      <section id="th-bonuses" className="ed-sec" aria-labelledby="th-bonuses-h">
        <div className="rule" id="th-bonuses-h">
          BONUSES
        </div>
        {(d.bonuses ?? []).map((b, i) => {
          const setBonus = (patch: Partial<typeof b>) =>
            set({ bonuses: (d.bonuses ?? []).map((x, j) => (j === i ? { ...x, ...patch } : x)) });
          return (
            <div key={i} className="th-card">
              <div className="th-line">
                <input
                  className="input"
                  aria-label={`Bonus ${i + 1} name`}
                  placeholder="Name"
                  value={b.name}
                  onChange={(e) => setBonus({ name: e.target.value })}
                />
                <Remove
                  label={`Remove bonus ${b.name || i + 1}`}
                  onClick={() => set({ bonuses: (d.bonuses ?? []).filter((_, j) => j !== i) })}
                />
              </div>
              <textarea
                className="input"
                aria-label={`Bonus ${i + 1} text`}
                value={b.text}
                onChange={(e) => setBonus({ text: e.target.value })}
              />
            </div>
          );
        })}
        <div>
          <button className="btn sm" onClick={() => set({ bonuses: [...(d.bonuses ?? []), { name: "", text: "" }] })}>
            + BONUS
          </button>
        </div>
      </section>

      {/* A weapon sits under an ACTION ability, as the books print it (CLAUDE.md). */}
      <section id="th-abilities" className="ed-sec" aria-labelledby="th-abilities-h">
        <div className="rule" id="th-abilities-h">
          ABILITIES
        </div>
        {abilities.map((ab, i) => (
          <div key={i} className="th-card">
            <div className="th-line">
              <select
                className="input th-type"
                aria-label={`Ability ${i + 1} type`}
                value={ab.type ?? ""}
                onChange={(e) =>
                  setAbility(i, { type: (e.target.value || undefined) as (typeof ABILITY_TYPES)[number] })
                }
              >
                <option value="">A PLAIN RULE</option>
                {ABILITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                className="input"
                aria-label={`Ability ${i + 1} name`}
                placeholder={ab.type === "ACTION" ? "no name: the block prints ACTION alone" : "Name"}
                value={ab.name ?? ""}
                onChange={(e) => setAbility(i, { name: e.target.value || undefined })}
              />
              <Remove
                label={`Remove ability ${ab.name || i + 1}`}
                onClick={() => set({ abilities: abilities.filter((_, j) => j !== i) })}
              />
            </div>
            <textarea
              className="input"
              aria-label={`Ability ${i + 1} text`}
              placeholder="Rule text, if any"
              value={ab.text ?? ""}
              onChange={(e) => setAbility(i, { text: e.target.value || undefined })}
            />
            {(ab.type === "ACTION" || !!ab.weapons?.length) && (
              <WeaponTable
                label={`Ability ${i + 1}`}
                weapons={ab.weapons ?? []}
                strength={d.attributes.S}
                wargear={wargear}
                onChange={(weapons) => setAbility(i, { weapons })}
              />
            )}
          </div>
        ))}
        <div>
          <button
            className="btn sm"
            onClick={() => set({ abilities: [...abilities, { type: "ACTION", weapons: [] }] })}
          >
            + ABILITY
          </button>
        </div>
        {/* p.7 warns against giving common Elites many unique Ruin Actions; these five are the shared ones. */}
        {ruinActions && (
          <FindField
            label="Ruin Action from Threat Assessment p.7"
            options={ruinActions.rows
              .filter((row) => !abilities.some((a) => a.type === "RUIN" && a.name === row.name))
              .map((row) => ({ id: row.name, name: row.name, detail: row.text }))}
            onPick={addRuinAction}
          />
        )}
      </section>

      {/* Mob Abilities sit on top of the Threat's own (TA p.5); a Mob is Troops only (Core p.324). */}
      <section id="th-mob" className="ed-sec" aria-labelledby="th-mob-h">
        <div className="rule" id="th-mob-h">
          MOB ABILITIES
        </div>
        {(d.mobAbilities ?? []).map((ab, i) => {
          const setMob = (patch: Partial<typeof ab>) =>
            set({ mobAbilities: (d.mobAbilities ?? []).map((x, j) => (j === i ? { ...x, ...patch } : x)) });
          return (
            <div key={i} className="th-card">
              <div className="th-line">
                <input
                  className="input"
                  aria-label={`Mob ability ${i + 1} name`}
                  placeholder="Name"
                  value={ab.name ?? ""}
                  onChange={(e) => setMob({ name: e.target.value || undefined })}
                />
                <Remove
                  label={`Remove mob ability ${ab.name || i + 1}`}
                  onClick={() => set({ mobAbilities: (d.mobAbilities ?? []).filter((_, j) => j !== i) })}
                />
              </div>
              <textarea
                className="input"
                aria-label={`Mob ability ${i + 1} text`}
                value={ab.text ?? ""}
                onChange={(e) => setMob({ text: e.target.value || undefined })}
              />
            </div>
          );
        })}
        <div>
          <button
            className="btn sm"
            onClick={() => set({ mobAbilities: [...(d.mobAbilities ?? []), { weapons: [] }] })}
          >
            + MOB ABILITY
          </button>
        </div>
      </section>

      <section id="th-notes" className="ed-sec" aria-labelledby="th-notes-h">
        <div className="rule" id="th-notes-h">
          NOTES
        </div>
        <label className="field">
          <span className="label">DETERMINATION</span>
          <input
            className="input"
            placeholder="Spend 1 Ruin to roll 4d6."
            value={d.determination ?? ""}
            onChange={(e) => set({ determination: e.target.value || undefined })}
          />
        </label>
        <label className="field">
          <span className="label">NOTE</span>
          <input className="input" value={d.note ?? ""} onChange={(e) => set({ note: e.target.value || undefined })} />
        </label>
      </section>
    </div>
  );
}
