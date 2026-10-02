// The Core Rulebook's campaign set-up, in the order a GM meets it (docs/campaign-model.md "Building a campaign",
// issue #45). The book has no adventure-writing procedure of its own; it points at the GM's guide online (pp.315, 317).
export const SETUP_STEPS = [
  {
    key: "kind",
    title: "KIND OF GAME",
    hint: "Agree the kind of game and what to leave out.",
    cite: "Core Rulebook p.316",
  },
  {
    key: "framework",
    title: "FRAMEWORK",
    hint: "Who the Agents are, what they want, their shared goal.",
    cite: "Core Rulebook pp.18–20, 316–317, 374",
  },
  { key: "tier", title: "TIER", hint: "Set in the lobby; ASCEND raises it.", cite: "Core Rulebook pp.19–20, 160" },
  {
    key: "setting",
    title: "SETTING",
    hint: "Keep the adventures to one limited area.",
    cite: "Core Rulebook pp.296–309, 320",
  },
  {
    key: "patron",
    title: "PATRON",
    hint: "Each patron offers two Frameworks.",
    cite: "Core Rulebook pp.310–313; Forsaken System Player's Guide pp.64–89",
    optional: true,
  },
  {
    key: "factions",
    title: "FACTIONS AND KEYWORDS",
    hint: "Who can work together, and who needs a reason.",
    cite: "Core Rulebook pp.42–87, 167, 317, 375–378",
  },
  {
    key: "characters",
    title: "CHARACTERS",
    hint: "Build the Agents, or bring them from your library.",
    cite: "Core Rulebook p.17",
  },
  {
    key: "npcs",
    title: "NPCS AND LOCATIONS",
    hint: "A few vivid features for each person and place.",
    cite: "Core Rulebook pp.315, 317, 168, 326",
  },
  {
    key: "scenes",
    title: "SCENES",
    hint: "Set the scene, ask, listen, show consequences.",
    cite: "Core Rulebook pp.317–319, 160–161, 165–166",
  },
  {
    key: "combat",
    title: "COMBAT",
    hint: "Two Troops per Agent, half in a Mob, one Elite or Adversary.",
    cite: "Core Rulebook p.176; Threat Assessment p.8",
  },
  {
    key: "session",
    title: "SESSION",
    hint: "START resets the pools; END awards 8, 10 or 12 XP.",
    cite: "Core Rulebook pp.30, 43, 162, 317, 320–321",
  },
] as const;
export type SetupKey = (typeof SETUP_STEPS)[number]["key"];
