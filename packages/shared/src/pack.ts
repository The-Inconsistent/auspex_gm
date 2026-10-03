import { z } from "zod";
import { CharacterBuild } from "./build.ts";
import { BeatExit, CodexInput, MAX_EXITS } from "./codex.ts";
import { CharacterDetail, CharacterStats, Objectives, TableLines, Tier } from "./state.ts";
import { CUSTOM_THREAT_CAP, CustomThreatData } from "./threat.ts";

// A content pack: a whole campaign start (framework, codex, adventure, characters) as data, loaded by
// `apps/api/scripts/seed.ts` through the normal action pipeline. Entries reference each other by `key`.

const key = z.string().regex(/^[a-z0-9-]+$/);
const keys = z.array(key).default([]);

export const Pack = z
  .object({
    campaign: z.object({
      name: z.string().min(1).max(100),
      tier: Tier,
      framework: z.string().max(5000).default(""),
      frameworkBonus: z.string().max(1000).default(""),
      patron: z.string().max(200).default(""),
      kind: TableLines.default([]),
      limits: TableLines.default([]),
      homebrew: z.boolean().default(false), // the builds may use the homebrew books (issue #9 decision 1)
    }),
    // Stat blocks the pack brings with it (issue #43), as `threat.save` takes them: the seeder sends these first, and
    // a beat or an NPC then names one as `custom-<slug>`, where the slug comes from the name.
    threats: z.array(CustomThreatData).max(CUSTOM_THREAT_CAP).default([]),
    factions: z.array(CodexInput.faction.extend({ key })).default([]),
    locations: z
      .array(CodexInput.location.omit({ parentId: true }).extend({ key, parent: key.optional() }))
      .default([]),
    npcs: z.array(CodexInput.npc.omit({ factionId: true }).extend({ key, faction: key.optional() })).default([]),
    handouts: z.array(CodexInput.handout.extend({ key })).default([]),
    // Never given: a pack is a campaign start, so an item lies in a place or with an NPC, or nowhere yet (issue #51).
    items: z
      .array(
        CodexInput.item
          .omit({ locationId: true, npcId: true })
          .extend({ key, location: key.optional(), npc: key.optional() }),
      )
      .default([]),
    adventures: z
      .array(
        CodexInput.adventure.extend({
          key,
          beats: z.array(
            CodexInput.beat
              .omit({ adventureId: true, locationId: true, npcIds: true, handoutIds: true, itemIds: true, exits: true })
              // A pack beat has no key to point at, so its exits are labels; the GM wires them in the app.
              .extend({
                location: key.optional(),
                npcs: keys,
                handouts: keys,
                items: keys,
                exits: z
                  .array(BeatExit.pick({ label: true }))
                  .max(MAX_EXITS)
                  .default([]),
              }),
          ),
        }),
      )
      .default([]),
    characters: z
      .array(
        z.object({
          name: z.string().min(1).max(100),
          stats: CharacterStats,
          detail: CharacterDetail.optional(),
          objectives: Objectives.optional(),
          // How the sheet was made, so the builder opens it filled in (issue #18). `stats` stays the sheet as printed;
          // the seeder saves the build through `character.build`, and the server derives the live sheet from it.
          build: CharacterBuild.optional(),
        }),
      )
      .default([]),
  })
  .superRefine((p, ctx) => {
    const has = (list: { key: string }[]) => new Set(list.map((x) => x.key));
    const factions = has(p.factions),
      locations = has(p.locations),
      npcs = has(p.npcs),
      handouts = has(p.handouts),
      items = has(p.items);
    const check = (ok: boolean, path: (string | number)[], msg: string) =>
      ok || ctx.addIssue({ code: "custom", path, message: msg });
    // Parents must come first so the seeder can resolve them in one pass.
    p.locations.forEach((l, i) =>
      check(
        !l.parent || p.locations.slice(0, i).some((x) => x.key === l.parent),
        ["locations", i, "parent"],
        `unknown or later location "${l.parent}"`,
      ),
    );
    p.npcs.forEach((n, i) =>
      check(!n.faction || factions.has(n.faction), ["npcs", i, "faction"], `unknown faction "${n.faction}"`),
    );
    p.items.forEach((it, i) => {
      check(!it.location || locations.has(it.location), ["items", i, "location"], `unknown location "${it.location}"`);
      check(!it.npc || npcs.has(it.npc), ["items", i, "npc"], `unknown npc "${it.npc}"`);
      check(!(it.location && it.npc), ["items", i], "an item lies in a place or is carried by an NPC, not both");
    });
    p.adventures.forEach((a, ai) =>
      a.beats.forEach((b, bi) => {
        const at = ["adventures", ai, "beats", bi];
        check(!b.location || locations.has(b.location), [...at, "location"], `unknown location "${b.location}"`);
        b.npcs.forEach((k) => check(npcs.has(k), [...at, "npcs"], `unknown npc "${k}"`));
        b.handouts.forEach((k) => check(handouts.has(k), [...at, "handouts"], `unknown handout "${k}"`));
        b.items.forEach((k) => check(items.has(k), [...at, "items"], `unknown item "${k}"`));
      }),
    );
  });
export type Pack = z.infer<typeof Pack>;
