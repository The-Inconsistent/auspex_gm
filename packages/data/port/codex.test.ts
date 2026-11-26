import assert from "node:assert/strict";
import { test } from "node:test";
import { AdventureStatus, Attitude, BeatType, CodexInput, FactionStance, toPlayerCodex, type Codex } from "@wg/shared";
import { checksCodex, loadEngine } from "./engine.ts";
import { buildPack } from "./pack.ts";
import { buildRuleset, CODEX } from "./ruleset.ts";

// The codex block (InconsisTable's house decision #71): what this repo's codex holds, declared in both rulesets.
// Skipped when InconsisTable is not checked out here, or when that checkout does not check the block yet.
const engine = await loadEngine();
const rulesets = [
  ["by hand", buildRuleset()],
  ["ledger", buildRuleset({ builder: "ledger" })],
] as const;
const skip =
  engine === null
    ? "InconsisTable is not checked out beside this repo"
    : !checksCodex(engine, rulesets[0][1]) && "this InconsisTable checkout does not check the codex block yet";

type Def = {
  type: string;
  label: string;
  visibility: string;
  maxLength?: number;
  entity?: string;
  kind?: string;
  cite?: string;
};
type Kinds = Record<string, { fields: Record<string, Def & Record<string, unknown>> }>;

test("both rulesets compile with the codex block, which the platform keeps as written", { skip }, () => {
  for (const [name, ruleset] of rulesets) {
    const c = engine!.compileRuleset(ruleset);
    if (!c.ok) assert.fail(`${name}: ${c.problems.map((p) => `${p.path}: ${p.message}`).join("\n")}`);
    assert.deepEqual((c.compiled.ruleset as { codex?: unknown }).codex, ruleset.codex, name);
    // The ledger ruleset's item also names its catalogue entry, which GIVE reads (house decision #95).
    const { item, ...rest } = ruleset.codex.kinds;
    assert.deepEqual(rest, (({ item: _, ...k }) => k)(CODEX.kinds), name);
    assert.deepEqual(Object.keys(item.fields), [
      ...Object.keys(CODEX.kinds.item.fields),
      ...("wargear" in item.fields ? ["wargear"] : []),
    ]);
  }
});

test("every field has its type, visibility and wording", () => {
  const brief = (d: Def) => [d.type, d.visibility, d.label, d.maxLength ?? d.entity ?? d.kind ?? null, d.cite ?? null];
  const got = Object.fromEntries(
    Object.entries(CODEX.kinds as unknown as Kinds).flatMap(([kind, k]) =>
      Object.entries(k.fields).map(([id, d]) => [`${kind}.${id}`, brief(d)]),
    ),
  );
  assert.deepEqual(got, {
    "npc.attitude": ["enum", "party", "Attitude", null, "Core p.168"],
    "npc.role": ["text", "party", "Role", 200, null],
    "npc.stats": ["ref", "gm", "Stat block", "threat", null],
    "npc.faction": ["entry", "gm", "Faction", "faction", null],
    "faction.stance": ["enum", "gm", "Stance", null, null],
    "faction.keywords": ["text", "gm", "Keywords", 20 * 60 + 19 * 3, "Core pp.375-378"],
    "scene.type": ["enum", "gm", "Type", null, null],
    "scene.goal": ["text", "gm", "Goal", 500, null],
    "scene.outcome": ["text", "gm", "Outcome", 5000, null],
    "adventure.status": ["enum", "party", "Status", null, null],
    "adventure.brief": ["text", "party", "Brief", 300, null],
    "location.hazards": ["text", "gm", "Hazards", 5000, null],
    "item.location": ["entry", "gm", "Where it lies", "location", null],
    "item.holder": ["entry", "gm", "Who carries it", "npc", null],
  });
  const { attitude } = CODEX.kinds.npc.fields;
  assert.deepEqual(attitude.labels, {
    hostile: "HOSTILE",
    uncooperative: "UNCOOPERATIVE",
    neutral: "NEUTRAL",
    friendly: "FRIENDLY",
    helpful: "HELPFUL",
  });
  // As the chip words them (attitude-chip.tsx), with no note for Neutral, which draws no chip.
  assert.deepEqual(attitude.notes, { hostile: "+4 DN", uncooperative: "+2 DN", friendly: "−2 DN", helpful: "−4 DN" });
  // The chip's warning colour is a harder DN; it has no positive colour (attitude-chip.tsx).
  assert.deepEqual(attitude.tones, { hostile: "bad", uncooperative: "bad" });
  // As STORY's status select words them (prep/constants.ts): `running` reads ACTIVE.
  assert.deepEqual(CODEX.kinds.adventure.fields.status.labels, {
    planned: "PLANNED",
    running: "ACTIVE",
    done: "DONE",
    failed: "FAILED",
  });
  assert.deepEqual(CODEX.kinds.faction.fields.stance.labels, {
    ally: "ALLY",
    neutral: "NEUTRAL",
    rival: "RIVAL",
    enemy: "ENEMY",
  });
  assert.equal(CODEX.kinds.scene.fields.type.labels.investigation, "INVESTIGATION");
});

test("every enum's values are this repo's own constants, each with its label", () => {
  const { npc, faction, scene, adventure } = CODEX.kinds;
  assert.deepEqual(npc.fields.attitude.values, Attitude.options);
  assert.deepEqual(faction.fields.stance.values, FactionStance.options);
  assert.deepEqual(scene.fields.type.values, BeatType.options);
  assert.deepEqual(adventure.fields.status.values, AdventureStatus.options);
  for (const def of [npc.fields.attitude, faction.fields.stance, scene.fields.type, adventure.fields.status])
    assert.deepEqual(Object.keys(def.labels), def.values);
});

test("a field is party exactly when toPlayerCodex sends its value to a revealed entry", () => {
  const id = () => crypto.randomUUID();
  const [adventureId, factionId, locationId, npcId, characterId] = [id(), id(), id(), id(), id()];
  const codex: Codex = {
    factions: [{ id: factionId, ...CodexInput.faction.parse({ name: "F", keywords: ["IMPERIUM"], stance: "ally" }) }],
    adventures: [
      {
        id: adventureId,
        ...CodexInput.adventure.parse({ title: "A", brief: "b", status: "running", shown: true }),
        beats: [
          {
            id: id(),
            order: 0,
            ...CodexInput.beat.parse({ adventureId, title: "S", goal: "g", outcome: "o", type: "combat" }),
          },
        ],
      },
    ],
    locations: [{ id: locationId, ...CodexInput.location.parse({ name: "L", hazards: "h", revealed: true }) }],
    npcs: [
      {
        id: npcId,
        ...CodexInput.npc.parse({
          name: "N",
          role: "r",
          attitude: "hostile",
          statSource: { kind: "bestiary", threatId: "t" },
          factionId,
          revealed: true,
        }),
      },
    ],
    handouts: [],
    // Given to the player's own Agent, so the item itself is sent; one lies at the place, one is carried.
    items: [
      { id: id(), ...CodexInput.item.parse({ name: "I", locationId }), givenTo: characterId },
      { id: id(), ...CodexInput.item.parse({ name: "J", npcId }), givenTo: characterId },
    ],
    sessions: [],
    customThreats: [],
  };
  const read: Record<string, (c: Codex) => unknown> = {
    "npc.attitude": (c) => c.npcs[0]?.attitude,
    "npc.faction": (c) => c.npcs[0]?.factionId ?? undefined,
    "npc.role": (c) => c.npcs[0]?.role,
    "npc.stats": (c) => {
      const s = c.npcs[0]?.statSource;
      return s?.kind === "bestiary" ? s.threatId : undefined;
    },
    "faction.stance": (c) => c.factions[0]?.stance,
    "faction.keywords": (c) => c.factions[0]?.keywords,
    "scene.type": (c) => c.adventures[0]?.beats[0]?.type,
    "scene.goal": (c) => c.adventures[0]?.beats[0]?.goal,
    "scene.outcome": (c) => c.adventures[0]?.beats[0]?.outcome,
    "adventure.brief": (c) => c.adventures[0]?.brief,
    "adventure.status": (c) => c.adventures[0]?.status,
    "location.hazards": (c) => c.locations[0]?.hazards,
    "item.location": (c) => c.items[0]?.locationId ?? undefined,
    "item.holder": (c) => c.items[1]?.npcId ?? undefined,
  };
  const player = toPlayerCodex(codex, characterId);
  assert.equal(player.items.length, 2);
  const declared = Object.entries(CODEX.kinds as unknown as Kinds).flatMap(([kind, k]) =>
    Object.entries(k.fields).map(([f, d]) => [`${kind}.${f}`, d.visibility] as const),
  );
  assert.deepEqual(declared.map(([f]) => f).sort(), Object.keys(read).sort());
  for (const [f, visibility] of declared) {
    const sent = read[f]!(player);
    assert.ok(read[f]!(codex), `${f}: the GM's copy holds a value`);
    assert.equal(
      sent !== undefined && JSON.stringify(sent) === JSON.stringify(read[f]!(codex)),
      visibility === "party",
      f,
    );
  }
});

test("every ref names an entity type the Threat pack has entries of", () => {
  const types = new Set(buildPack().pack.entries.map((e) => e.type));
  const refs = Object.values(CODEX.kinds as unknown as Kinds).flatMap((k) =>
    Object.values(k.fields).filter((d) => d.type === "ref"),
  );
  assert.ok(refs.length > 0);
  for (const d of refs) assert.ok(types.has(d.entity as never), `${d.label}: ${d.entity}`);
});
