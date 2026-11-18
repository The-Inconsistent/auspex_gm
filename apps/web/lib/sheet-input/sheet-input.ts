import { CharacterBuild, rankOf, type Character, type CharacterStats, type Overrides } from "@wg/shared";

// What the printed character sheet holds (Cubicle 7's official sheet, the Core pp.40–41 one). Only what's fixed: the
// counters the table tracks (Wrath, Wounds, Shock, Corruption) stay blank for pencil.
export type SheetInput = {
  name: string;
  tier: number;
  rank: number;
  xp: number; // earned
  xpSpent: number;
  stats: CharacterStats;
  overrides: Overrides;
  background: string; // the build's Background rows by name, "" when it has none
  objective: string; // the rolled Objective (Core p.43), "" when none
};

const backgroundOf = (build: unknown) => {
  const bg = CharacterBuild.safeParse(build).data?.background;
  return [bg?.origin, bg?.accomplishment, bg?.goal].filter(Boolean).join(" · ");
};

// A seated Agent at the live table. The caller passes the Character as its own screen shows it (the player's DOSSIER
// already leaves out Codex-given gear).
export const fromCharacter = (me: Character, tier: number): SheetInput => ({
  name: me.name,
  tier,
  rank: rankOf(me.xp),
  xp: me.xp,
  xpSpent: me.xpSpent,
  stats: me.stats,
  overrides: me.overrides,
  background: backgroundOf(me.build),
  objective: me.objectives.find((o) => o.rolled)?.text ?? "",
});

// A build in the builder (a library character, or one being made for a campaign): its resolved sheet.
export const fromBuild = (args: {
  name: string;
  build: unknown;
  stats: CharacterStats;
  overrides: Overrides;
  advancement: { budget: number; spent: number; rank: number; tier: number } | null;
  tier: number;
}): SheetInput => ({
  name: args.name,
  tier: args.advancement?.tier ?? args.tier,
  rank: args.advancement?.rank ?? 1,
  xp: args.advancement?.budget ?? 0,
  xpSpent: args.advancement?.spent ?? 0,
  stats: args.stats,
  overrides: args.overrides,
  background: backgroundOf(args.build),
  objective: "",
});
