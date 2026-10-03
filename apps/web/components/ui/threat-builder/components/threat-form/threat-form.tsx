"use client";

import { useState, type ChangeEvent } from "react";

import { SKILLS, threatWeapon, type PoolPresetTable, type Skill, type Threat, type Wargear } from "@wg/shared";

import { FieldError } from "@/components/ui/field-error/field-error";
import { WeaponLine } from "@/components/ui/weapon-line/weapon-line";
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
import { threatHints } from "../../hints";

type ThreatFormProps = {
  draft: ThreatDraft;
  wargear: Wargear[];
  ruinActions: PoolPresetTable | null; // Threat Assessment p.7, offered as RUIN abilities
  fields: FieldErrors; // SAVE's marks: NAME and KEYWORDS are required (CustomThreatData), inputs t-<key>
  onChange: (d: ThreatDraft) => void;
};

const SKILL_NAMES = Object.keys(SKILLS) as Skill[];

// A number input that keeps "–" as null where the stat block prints one (Core p.323).
function NumField({
  label,
  value,
  nullable = false,
  min = 0,
  onChange,
}: {
  label: string;
  value: number | null;
  nullable?: boolean;
  min?: number;
  onChange: (n: number | null) => void;
}) {
  const [text, setText] = useState<string | null>(null); // the digits while the GM types; null shows `value`

  // Typing: keep what was typed and commit each number, so clearing a field to retype it commits nothing.
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/[^\d]/g, "");
    setText(digits);
    if (digits !== "") onChange(Math.max(min, Number(digits)));
  };
  // Leaving the field shows the committed value again: one left empty keeps its number, and "–" comes only from its
  // button.
  const handleBlur = () => setText(null);

  return (
    <label className="field" style={{ minWidth: 92 }}>
      <span className="label">{label}</span>
      <div className="keys" style={{ alignItems: "center" }}>
        <input
          className="input"
          style={{ width: 64 }}
          inputMode="numeric"
          aria-label={label}
          value={text ?? (value === null ? "" : value)}
          placeholder={value === null ? "–" : ""}
          onChange={handleChange}
          onBlur={handleBlur}
        />
        {nullable && (
          <button
            className={`btn sm ${value === null ? "primary" : ""}`}
            aria-pressed={value === null}
            title="A printed – : no score at all"
            onClick={() => onChange(value === null ? min : null)}
          >
            –
          </button>
        )}
      </div>
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
        {...marks}
        value={text ?? value.join(", ")}
        onChange={handleChange}
        onBlur={() => setText(null)}
      />
    </label>
  );
}

// The stat block the GM is writing (Threat Assessment p.5's order: name and Tier row, keywords, Attributes, the derived
// line, Skills, Bonuses, Abilities, then Mob content). Every field is the GM's; the hints never block a save (§11.109).
export function ThreatForm({ draft: d, wargear, ruinActions, fields, onChange }: ThreatFormProps) {
  const [weaponQuery, setWeaponQuery] = useState("");
  // An edit clears the mark on the field it changed.
  const set = (patch: Partial<ThreatDraft>) => {
    onChange({ ...d, ...patch });
    Object.keys(patch).forEach((k) => fields.clear(k));
  };
  const hints = threatHints(d);
  const weapons = wargear.filter((w) => w.weapon);
  const found = weaponQuery.trim()
    ? weapons.filter((w) => w.name.toLowerCase().includes(weaponQuery.trim().toLowerCase())).slice(0, 8)
    : [];

  // Abilities, and the weapons under an ACTION one (the books' convention, CLAUDE.md).
  const abilities = d.abilities ?? [];
  const setAbility = (i: number, patch: Partial<NonNullable<ThreatDraft["abilities"]>[number]>) =>
    set({ abilities: abilities.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  const addWeapon = (entry: Wargear, i: number) => {
    const w = threatWeapon({ name: entry.name, weapon: entry.weapon! }, d.attributes.S);
    setAbility(i, { weapons: [...(abilities[i]?.weapons ?? []), w] });
    setWeaponQuery("");
  };

  return (
    <div className="stack">
      <div className="keys" style={{ alignItems: "flex-end" }}>
        <label className="field" style={{ flex: 1, minWidth: 200 }}>
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
            aria-label="Faction"
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
          <select
            className="input"
            aria-label="Size"
            value={d.size}
            onChange={(e) => set({ size: e.target.value as Threat["size"] })}
          >
            {SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* The Tier row: a class per Tier, four or five of them (Core p.323). */}
      <div className="field">
        <span className="label">THREAT BY TIER</span>
        <div className="keys" style={{ alignItems: "center" }}>
          {d.threat.map((c, i) => (
            <label key={i} className="keys" style={{ alignItems: "center", gap: 4 }}>
              <span className="dim">T{i + 1}</span>
              <select
                className="input"
                style={{ width: 86 }}
                aria-label={`Class at Tier ${i + 1}`}
                value={c ?? ""}
                onChange={(e) =>
                  set({
                    threat: d.threat.map((x, j) =>
                      j === i ? ((e.target.value || null) as Threat["threat"][number]) : x,
                    ),
                  })
                }
              >
                {CLASS_OPTIONS.map((o) => (
                  <option key={o ?? "none"} value={o ?? ""}>
                    {o ?? "–"}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {d.threat.length === 4 ? (
            <button className="btn sm" onClick={() => set({ threat: [...d.threat, "A"] })}>
              + TIER 5
            </button>
          ) : (
            <button className="btn sm" onClick={() => set({ threat: d.threat.slice(0, 4) })}>
              − TIER 5
            </button>
          )}
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

      <div className="field">
        <span className="label">ATTRIBUTES</span>
        <div className="keys">
          {ATTR_FIELDS.map(([key, label, nullable]) => (
            <NumField
              key={key}
              label={label}
              value={d.attributes[key]}
              nullable={nullable}
              min={1}
              onChange={(n) => set({ attributes: { ...d.attributes, [key]: n } })}
            />
          ))}
        </div>
      </div>

      <div className="field">
        <span className="label">DERIVED</span>
        <div className="keys">
          <NumField
            label="RESILIENCE"
            value={d.resilience.value}
            min={1}
            onChange={(n) => set({ resilience: { ...d.resilience, value: n ?? 1 } })}
          />
          <label className="field" style={{ flex: 1, minWidth: 160 }}>
            <span className="label">ARMOUR NOTE</span>
            <input
              className="input"
              aria-label="Armour note"
              placeholder="Flak Armour (2)"
              value={d.resilience.note ?? ""}
              onChange={(e) => set({ resilience: { ...d.resilience, note: e.target.value || undefined } })}
            />
          </label>
          <NumField label="DEFENCE" value={d.defence} onChange={(n) => set({ defence: n ?? 0 })} />
          <NumField label="WOUNDS" value={d.wounds} min={1} onChange={(n) => set({ wounds: n ?? 1 })} />
          <NumField label="SHOCK" value={d.shock} nullable min={1} onChange={(shock) => set({ shock })} />
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
      </div>

      {/* Skills: the Default pool any unlisted Skill rolls (Core p.323), then the listed ones. */}
      <div className="field">
        <span className="label">SKILLS</span>
        <div className="keys" style={{ alignItems: "flex-end" }}>
          <NumField
            label="DEFAULT"
            value={d.skills.default}
            nullable
            onChange={(n) => set({ skills: { ...d.skills, default: n } })}
          />
          <button
            className="btn sm"
            onClick={() => set({ skills: { ...d.skills, list: [...d.skills.list, { name: "Awareness", dice: 1 }] } })}
          >
            + SKILL
          </button>
        </div>
        {d.skills.list.map((s, i) => {
          const setSkill = (patch: Partial<typeof s>) =>
            set({ skills: { ...d.skills, list: d.skills.list.map((x, j) => (j === i ? { ...x, ...patch } : x)) } });
          return (
            <div key={i} className="keys" style={{ alignItems: "flex-end" }}>
              <label className="field">
                <span className="label">SKILL</span>
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
              </label>
              <NumField label="DICE" value={s.dice} min={1} onChange={(n) => setSkill({ dice: n ?? 1 })} />
              <NumField
                label="PASSIVE"
                value={s.passive ?? null}
                nullable
                onChange={(n) => setSkill({ passive: n ?? undefined })}
              />
              <button
                className="btn sm danger"
                aria-label={`Remove skill ${i + 1}`}
                onClick={() => set({ skills: { ...d.skills, list: d.skills.list.filter((_, j) => j !== i) } })}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      {/* Bonuses and Abilities. A weapon sits under an ACTION ability, as the books print it (CLAUDE.md). */}
      <div className="field">
        <span className="label">BONUSES</span>
        {(d.bonuses ?? []).map((b, i) => {
          const setBonus = (patch: Partial<typeof b>) =>
            set({ bonuses: (d.bonuses ?? []).map((x, j) => (j === i ? { ...x, ...patch } : x)) });
          return (
            <div key={i} className="keys" style={{ alignItems: "flex-end" }}>
              <label className="field" style={{ minWidth: 160 }}>
                <span className="label">NAME</span>
                <input className="input" value={b.name} onChange={(e) => setBonus({ name: e.target.value })} />
              </label>
              <label className="field" style={{ flex: 1, minWidth: 220 }}>
                <span className="label">TEXT</span>
                <textarea className="input" value={b.text} onChange={(e) => setBonus({ text: e.target.value })} />
              </label>
              <button
                className="btn sm danger"
                aria-label={`Remove bonus ${i + 1}`}
                onClick={() => set({ bonuses: (d.bonuses ?? []).filter((_, j) => j !== i) })}
              >
                ×
              </button>
            </div>
          );
        })}
        <div>
          <button className="btn sm" onClick={() => set({ bonuses: [...(d.bonuses ?? []), { name: "", text: "" }] })}>
            + BONUS
          </button>
        </div>
      </div>

      <div className="field">
        <span className="label">ABILITIES</span>
        {abilities.map((ab, i) => (
          <div key={i} className="panel pad stack">
            <div className="keys" style={{ alignItems: "flex-end" }}>
              <label className="field">
                <span className="label">TYPE</span>
                <select
                  className="input"
                  aria-label={`Ability ${i + 1} type`}
                  value={ab.type ?? ""}
                  onChange={(e) =>
                    setAbility(i, { type: (e.target.value || undefined) as (typeof ABILITY_TYPES)[number] })
                  }
                >
                  <option value="">— (a plain rule)</option>
                  {ABILITY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field" style={{ flex: 1, minWidth: 180 }}>
                <span className="label">NAME</span>
                <input
                  className="input"
                  value={ab.name ?? ""}
                  onChange={(e) => setAbility(i, { name: e.target.value || undefined })}
                />
              </label>
              <button
                className="btn sm danger"
                aria-label={`Remove ability ${i + 1}`}
                onClick={() => set({ abilities: abilities.filter((_, j) => j !== i) })}
              >
                ×
              </button>
            </div>
            <label className="field">
              <span className="label">TEXT</span>
              <textarea
                className="input"
                value={ab.text ?? ""}
                onChange={(e) => setAbility(i, { text: e.target.value || undefined })}
              />
            </label>
            {(ab.weapons ?? []).map((w, wi) => (
              <div key={wi} className="keys" style={{ alignItems: "center" }}>
                <span>
                  <WeaponLine weapon={{ ...w, traits: w.traits ?? [] }} />
                </span>
                <button
                  className="btn sm danger"
                  aria-label={`Remove weapon ${wi + 1}`}
                  onClick={() => setAbility(i, { weapons: (ab.weapons ?? []).filter((_, j) => j !== wi) })}
                >
                  ×
                </button>
              </div>
            ))}
            {/* The catalogue fills a profile's numbers, Strength included for a melee "(S) + X" (Core pp.211-213). */}
            <div className="keys" style={{ alignItems: "center" }}>
              <input
                className="input"
                style={{ maxWidth: 220 }}
                placeholder="+ WEAPON: search the catalogue"
                aria-label="Search wargear"
                value={weaponQuery}
                onChange={(e) => setWeaponQuery(e.target.value)}
              />
              {found.map((w) => (
                <button key={w.id} className="btn sm" onClick={() => addWeapon(w, i)}>
                  {w.name}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div>
          <button className="btn sm" onClick={() => set({ abilities: [...abilities, { weapons: [] }] })}>
            + ABILITY
          </button>
        </div>
        {/* p.7 warns against giving common Elites many unique Ruin Actions; these five are the shared ones. */}
        {ruinActions && (
          <div className="keys" role="group" aria-label="Additional Ruin Actions" style={{ paddingTop: 0 }}>
            {ruinActions.rows
              .filter((row) => !abilities.some((a) => a.type === "RUIN" && a.name === row.name))
              .map((row) => (
                <button
                  key={row.name}
                  className="btn sm"
                  title={row.text}
                  onClick={() => set({ abilities: [...abilities, ruinAbility(ruinActions, row)] })}
                >
                  + RUIN: {row.name.toUpperCase()}
                </button>
              ))}
          </div>
        )}
      </div>

      <label className="field">
        <span className="label">DETERMINATION</span>
        <input
          className="input"
          aria-label="Determination"
          value={d.determination ?? ""}
          onChange={(e) => set({ determination: e.target.value || undefined })}
        />
      </label>

      {/* Mob Abilities sit on top of the Threat's own (TA p.5); a Mob is Troops only (Core p.324). */}
      <div className="field">
        <span className="label">MOB ABILITIES</span>
        {(d.mobAbilities ?? []).map((ab, i) => {
          const setMob = (patch: Partial<typeof ab>) =>
            set({ mobAbilities: (d.mobAbilities ?? []).map((x, j) => (j === i ? { ...x, ...patch } : x)) });
          return (
            <div key={i} className="keys" style={{ alignItems: "flex-end" }}>
              <label className="field" style={{ minWidth: 160 }}>
                <span className="label">NAME</span>
                <input
                  className="input"
                  value={ab.name ?? ""}
                  onChange={(e) => setMob({ name: e.target.value || undefined })}
                />
              </label>
              <label className="field" style={{ flex: 1, minWidth: 220 }}>
                <span className="label">TEXT</span>
                <textarea
                  className="input"
                  value={ab.text ?? ""}
                  onChange={(e) => setMob({ text: e.target.value || undefined })}
                />
              </label>
              <button
                className="btn sm danger"
                aria-label={`Remove mob ability ${i + 1}`}
                onClick={() => set({ mobAbilities: (d.mobAbilities ?? []).filter((_, j) => j !== i) })}
              >
                ×
              </button>
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
      </div>

      <label className="field">
        <span className="label">NOTE</span>
        <input
          className="input"
          aria-label="Note"
          value={d.note ?? ""}
          onChange={(e) => set({ note: e.target.value || undefined })}
        />
      </label>

      {hints.length > 0 && (
        <div className="field plate">
          <span className="label warn">WORTH A LOOK</span>
          {hints.map((h) => (
            <div key={h} className="dim">
              {h}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
