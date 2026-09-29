"use client";
import { useState } from "react";

import { ATTRIBUTES, SKILLS, buildReady, deriveStats, effectiveStrength, skillTotal, type Skill } from "@wg/shared";

import { weaponLine } from "@/lib/weapon-line/weapon-line";

import { useBuilder } from "../../builder-context";
import { toggle } from "../../utils";
import { RecordList } from "@/components/ui/record-list/record-list";
import { XpLedger } from "../xp-ledger/xp-ledger";

type ReviewStepProps = { onSave: () => void };

const TRAITS = [
  ["maxWounds", "WND"],
  ["maxShock", "SHK"],
  ["defence", "DEF"],
  ["resilience", "RES"],
  ["resolve", "RSLV"],
  ["conviction", "CONV"],
  ["influence", "INF"],
  ["speed", "SPD"],
] as const;

// Review and save: the sheet exactly as the play sheet will show it, the ledger, what is left, and the GM's part.
export function ReviewStep({ onSave }: ReviewStepProps) {
  const { draft, resolved: r, tier, role, go, sendDraft, sentDraft, gmLater } = useBuilder();
  const [sendMsg, setSendMsg] = useState<string | null>(null);

  // SEND TO GM: the draft goes on the table; the GM opens it here, ticks what only the GM judges, and saves.
  const handleSendDraft = async () => {
    const error = await sendDraft?.();
    setSendMsg(error ? `! ${error}` : "SENT. YOUR GM CAN OPEN IT FROM PARTY AND SAVE IT.");
  };
  if (!r)
    return (
      <div className="stack">
        <p>Choose an archetype first.</p>
        <div>
          <button className="btn primary" onClick={() => go("archetype")}>
            GO TO ARCHETYPE
          </button>
        </div>
      </div>
    );
  const s = r.sheet;
  const now = r.advancement?.tier ?? tier; // the Tier the group plays at: Traits use it (Core pp.36–37)
  const d = deriveStats({ stats: s, overrides: {}, tier: now });
  const gmItems = r.problems.some((p) => p.severity === "gm");
  // In the library, only GM items left is ready: the campaign's GM ticks them after the import (rules-flow §11.59).
  const ready = buildReady(r) || (gmLater && !r.pending.length && r.problems.every((p) => p.severity === "gm"));
  const left = r.pending.length + r.problems.length;

  return (
    <div className="stack">
      <div className="rule">REVIEW</div>
      <div className="sb">
        <div className="sb-title">
          <span>{(draft.name.trim() || "UNNAMED").toUpperCase()}</span>
          <i>
            {s.archetype} · {s.species} · Tier {now} · Rank {r.advancement?.rank ?? 1}
          </i>
        </div>
        <div className="sb-body">
          {s.keywords.map((k, i) => (
            <span key={k}>
              {i > 0 && ", "}
              <span className="kw">{k}</span>
            </span>
          ))}
        </div>
        <div className="sb-grid" style={{ gridTemplateColumns: `repeat(${ATTRIBUTES.length}, minmax(0, 1fr))` }}>
          {ATTRIBUTES.map((k) => (
            <span key={k} className="sb-head">
              {k.toUpperCase()}
            </span>
          ))}
          {ATTRIBUTES.map((k) => (
            <span key={k} className="sb-v">
              {s.attributes[k]}
            </span>
          ))}
        </div>
        {[TRAITS.slice(0, 4), TRAITS.slice(4)].map((row) => (
          <div key={row[0]![0]} className="sb-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
            {row.map(([, label]) => (
              <span key={label} className="sb-head">
                {label}
              </span>
            ))}
            {row.map(([k, label]) => (
              <span key={label} className="sb-v">
                {d[k]}
              </span>
            ))}
          </div>
        ))}
        <div className="sb-band">SKILLS</div>
        <div className="sb-body">
          {(Object.keys(SKILLS) as Skill[])
            .filter((k) => (s.skills[k] ?? 0) > 0)
            .map((k) => `${k} ${s.skills[k]} (${skillTotal(s, k)})`)
            .join(" · ")}
        </div>
        <div className="sb-band">ABILITIES</div>
        <div className="sb-body">{s.abilities.map((a) => a.name).join(" · ") || "–"}</div>
        <div className="sb-band">TALENTS</div>
        <div className="sb-body">{s.talents.map((t) => t.name).join(" · ") || "–"}</div>
        <div className="sb-band">ARMAMENT</div>
        <div className="sb-body">
          {s.armour.name && (
            <div>
              {s.armour.name}: AR {s.armour.ar}
              {s.armour.powered ? `, Powered (${s.armour.powered})` : ""}
            </div>
          )}
          {s.weapons.map((w, i) => (
            <div key={i}>
              {w.name}
              {w.count ? ` ×${w.count}` : ""}: {weaponLine({ weapon: w, strength: effectiveStrength(s) })}
            </div>
          ))}
        </div>
        <div className="sb-band">GEAR · WEALTH {s.wealth}</div>
        <div className="sb-body">{s.gear.join(" · ") || "–"}</div>
        {r.effects.length > 0 && (
          <>
            <div className="sb-band">IN PLAY</div>
            <div className="sb-body">
              {r.effects.map((e) => `${e.what}${e.cite ? ` (${e.cite})` : ""}`).join(" · ")}
            </div>
          </>
        )}
      </div>

      <XpLedger />
      {role === "gm" && sentDraft && (
        <div className="accent">A draft was sent to the table: tick what it asks, then SAVE CHARACTER.</div>
      )}
      {role === "gm" && <GmPart />}

      <div className="keys" style={{ alignItems: "center" }}>
        <button className="btn primary" disabled={!ready} onClick={onSave}>
          SAVE CHARACTER
        </button>
        {role !== "gm" && sendDraft && (
          <button className="btn" onClick={handleSendDraft}>
            {sentDraft ? "SEND AGAIN TO GM" : "SEND TO GM"}
          </button>
        )}
        <span className="dim">
          {ready
            ? gmItems
              ? "The GM items wait for your campaign's GM, once you bring this character into a game."
              : "The server checks the build again and writes the sheet."
            : `${left} thing${left === 1 ? "" : "s"} to settle first${
                gmItems && role !== "gm" ? "; send it to your GM for the GM items" : ""
              }.`}
        </span>
      </div>
      {sendMsg && <div className={sendMsg.startsWith("!") ? "red" : "accent"}>{sendMsg}</div>}
    </div>
  );
}

// The GM's part of the build: ticks on what only the GM judges, and this character's rulings (a species, keywords,
// gear the books don't give). Players never send it; the server keeps the GM's.
function GmPart() {
  const { draft, update, resolved: r, catalogue, lookups } = useBuilder();
  const [keyword, setKeyword] = useState("");
  const gm = draft.gm ?? {};
  const approved = gm.approved ?? [];
  const questions = r?.problems.filter((p) => p.severity === "gm" && p.path) ?? [];
  const ticked = approved.filter((p) => !questions.some((q) => q.path === p));
  const gear = gm.gear ?? {};

  // Edits the GM's part of the draft.
  const setGm = (patch: Partial<NonNullable<typeof draft.gm>>) => update((d) => ({ ...d, gm: { ...d.gm, ...patch } }));

  // ADD (keyword): a keyword the GM grants this character, e.g. DEATHWATCH.
  const addKeyword = () => {
    const k = keyword
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9' [\]-]/g, "");
    if (k) setGm({ keywords: [...new Set([...(gm.keywords ?? []), k])] });
    setKeyword("");
  };

  return (
    <div className="plate stack">
      <div className="rule">GM · RULINGS AND TICKS</div>
      {questions.length === 0 && ticked.length === 0 && <div className="dim">Nothing here needs a GM ruling.</div>}
      {questions.map((q) => (
        <label key={q.path} className="bld-opt">
          <input type="checkbox" checked={false} onChange={() => setGm({ approved: [...approved, q.path!] })} />
          <span>
            {q.what}
            {q.cite && <span className="dim"> · {q.cite}</span>}
          </span>
        </label>
      ))}
      {ticked.length > 0 && (
        <div className="dim">
          {ticked.length} ticked.{" "}
          <button className="btn sm" onClick={() => setGm({ approved: [] })}>
            CLEAR TICKS
          </button>
        </div>
      )}

      <div className="field">
        <label className="label" htmlFor="bld-gm-species">
          SPECIES BY RULING
        </label>
        <select
          id="bld-gm-species"
          className="input"
          value={gm.species ?? ""}
          onChange={(e) => setGm({ species: e.target.value || undefined })}
        >
          <option value="">As the archetype prints it</option>
          {[...lookups.species.values()].map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <span className="label">KEYWORDS BY RULING</span>
        <div className="keys">
          {(gm.keywords ?? []).map((k) => (
            <button
              key={k}
              className="btn sm"
              aria-label={`Remove ${k}`}
              onClick={() => setGm({ keywords: (gm.keywords ?? []).filter((x) => x !== k) })}
            >
              {k} ×
            </button>
          ))}
          <input
            className="input"
            style={{ flex: "1 1 160px", width: "auto" }}
            aria-label="Keyword to add"
            placeholder="DEATHWATCH"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <button className="btn sm" onClick={addKeyword}>
            ADD
          </button>
        </div>
      </div>

      <div className="field">
        <span className="label">GEAR SWAPS · take out</span>
        <div className="keys">
          {(r?.sheet.gear ?? [])
            .concat(r?.sheet.weapons.map((w) => w.name) ?? [], r?.sheet.armour.name ? [r.sheet.armour.name] : [])
            .map((g) => g.split(" (")[0]!.replace(/ ×\d+$/, ""))
            .map((name) => (
              <button
                key={name}
                className="btn sm"
                aria-label={`Take out ${name}`}
                onClick={() => setGm({ gear: { ...gear, remove: toggle(gear.remove ?? [], name) } })}
              >
                {name} ×
              </button>
            ))}
          {(gear.remove ?? []).map((name) => (
            <button
              key={`r-${name}`}
              className="btn sm danger"
              aria-label={`Put back ${name}`}
              onClick={() => setGm({ gear: { ...gear, remove: toggle(gear.remove ?? [], name) } })}
            >
              ↺ {name}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="label">GEAR SWAPS · put in</span>
        <RecordList
          label="Search wargear to add"
          searchable
          items={[...catalogue.wargear.values()]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((w) => ({ id: w.id, label: w.name, meta: `${w.category} · ${w.rarity ?? "–"}` }))}
          selected={(gear.add ?? []).flatMap((g) => (g.wargearId ? [g.wargearId] : []))}
          onPick={(id) => {
            const w = catalogue.wargear.get(id);
            const add = gear.add ?? [];
            const has = add.some((g) => g.wargearId === id);
            setGm({
              gear: {
                ...gear,
                add: has ? add.filter((g) => g.wargearId !== id) : [...add, { name: w?.name ?? id, wargearId: id }],
              },
            });
          }}
        />
      </div>
    </div>
  );
}
