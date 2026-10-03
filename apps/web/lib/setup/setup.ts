import { startingXp } from "@wg/shared";

import { SETUP_STEPS, type SetupKey } from "./constants.ts";

// Only what the ticks read, so a live Codex and a content pack both fit.
type SetupInput = {
  campaign: { tier: number; framework: string; patron: string; kind: readonly string[] };
  codex: {
    locations: unknown[];
    factions: unknown[];
    npcs: unknown[];
    sessions: unknown[];
    adventures: { beats: { encounter: unknown[] }[] }[];
  };
  characters: unknown[];
};

export type SetupStep = (typeof SETUP_STEPS)[number] & {
  n: number;
  now: string;
  done: boolean;
};

const count = ({ n, noun, none }: { n: number; noun: string; none: string }) =>
  n ? `${n} ${noun}${n === 1 ? "" : "S"}` : none;
const has = (n: number, noun: string) => ({ now: count({ n, noun, none: "NONE YET" }), done: n > 0 });

// SETUP on PARTY (issue #45): each step ticked from what the campaign already holds. Nothing is stored.
export function setupSteps({ campaign, codex, characters }: SetupInput): SetupStep[] {
  const beats = codex.adventures.flatMap((a) => a.beats);
  const prepared = beats.filter((b) => b.encounter.length).length;
  const set = (text: string) => ({ now: text.trim() ? "SET" : "EMPTY", done: !!text.trim() });
  const ticks: Record<SetupKey, { now: string; done: boolean }> = {
    // The limits may rightly stay empty, so the kind of game the table agreed on is what ticks (rules-flow §11.79).
    kind: { now: campaign.kind.join(" · ").toUpperCase() || "NOT AGREED YET", done: campaign.kind.length > 0 },
    framework: set(campaign.framework),
    // Tiers 1–4 start with 100–400 XP (Core p.20).
    tier: { now: `TIER ${campaign.tier} · ${startingXp(campaign.tier)} XP TO START`, done: true },
    setting: has(codex.locations.length, "LOCATION"),
    patron: set(campaign.patron),
    factions: has(codex.factions.length, "FACTION"),
    characters: has(characters.length, "AGENT"),
    npcs: has(codex.npcs.length, "NPC"),
    scenes: has(beats.length, "SCENE"),
    combat: { now: count({ n: prepared, noun: "ENCOUNTER", none: "NO ENCOUNTER YET" }), done: prepared > 0 },
    session: {
      now: count({ n: codex.sessions.length, noun: "SESSION", none: "NO SESSION YET" }),
      done: codex.sessions.length > 0,
    },
  };
  return SETUP_STEPS.map((s, i) => ({ ...s, n: i + 1, ...ticks[s.key] }));
}
