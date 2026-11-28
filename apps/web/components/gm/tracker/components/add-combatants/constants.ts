// ADD TO FIGHT's three ways in, and which side a threat joins (issue #350).
export const ADD_MODES = {
  bestiary: "FROM THE BESTIARY",
  codex: "FROM CODEX",
  followers: "+ FOLLOWERS",
} as const;
export type AddMode = keyof typeof ADD_MODES;

export const JOIN_SIDES = { enemy: "AS AN ENEMY", ally: "AS AN ALLY" } as const;
export type JoinSide = keyof typeof JOIN_SIDES;

// Why an NPC can't be added to a fight yet (a Quick NPC is built from Core p.326's row, not a stat block).
export const NO_STATS_HINT = "No stat block yet: give it one in CODEX › THREATS, then add it.";
