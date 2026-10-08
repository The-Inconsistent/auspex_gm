// The mission log's order and labels: what the party is on first, then what's offered, then how the rest went.
export const MISSION_GROUPS = [
  ["running", "ACTIVE"],
  ["planned", "OFFERED"],
  ["done", "DONE"],
  ["failed", "FAILED"],
] as const;
