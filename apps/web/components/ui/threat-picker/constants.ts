import type { Threat } from "@wg/shared";

// At most this many rows render; the GM narrows the search for the rest.
// ponytail: 50 rows, virtualise if the bestiary grows past a thousand
export const PICK_LIMIT = 50;

// The faction as the books name it, on the chips and on every row.
export const FACTION_LABEL: Record<Threat["faction"], string> = {
  imperial: "IMPERIUM",
  heretic: "HERETIC",
  daemon: "DAEMON",
  ork: "ORK",
  aeldari: "AELDARI",
  drukhari: "DRUKHARI",
  genestealer: "GENESTEALER",
  necron: "NECRON",
  tau: "T'AU",
  mechanicus: "MECHANICUS",
  votann: "VOTANN",
};
