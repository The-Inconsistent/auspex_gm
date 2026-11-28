// Who swings in StrikeSteps (Core p.323): an Agent, or a follower by its class (a Troop rolls Wrath but lands no Critical).
export const STRIKE_BY = ["agent", "troop", "threat"] as const;
export type StrikeBy = (typeof STRIKE_BY)[number];
