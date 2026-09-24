export const PLAYER_TABS = ["SHEET", "FIGHT", "INTEL", "RULES"] as const;
export type PlayerTab = (typeof PLAYER_TABS)[number];

// Buzz–pause–buzz, in ms, when it becomes your turn.
export const TURN_VIBRATION = [200, 100, 200];
