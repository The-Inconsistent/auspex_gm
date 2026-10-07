import {
  activeCharacterIds,
  agentsInFight,
  deriveStats,
  plainMentions,
  prepareThreat,
  threatClassAt,
  threatProfile,
  type Codex,
  type LiveState,
  type Marker,
  type Threat,
  type ThreatClass,
  type Wargear,
} from "@wg/shared";

import { weaponLine } from "../weapon-line/weapon-line.ts";

import { CARD_COLS, CARD_H_MM, CARD_ROWS, CARD_W_MM } from "./constants.ts";

type EncounterEntry = Codex["adventures"][number]["beats"][number]["encounter"][number];
type Item = Codex["items"][number];

// What a PRINT button asks for, by id: the GM app resolves it against what it already holds (issue #203).
export type PrintJob = { agents?: string[]; encounter?: EncounterEntry[]; threats?: string[]; items?: string[] };

// The six numbers a tent card's GM side shows (Decision 2 on #203). Null prints as "–", as the stat block does.
export type TentStats = {
  defence: number;
  resilience: number;
  wounds: number;
  shock: number | null;
  conviction: number | null;
  speed: number;
};

// A card's size in poker cells (63 × 88 mm).
export type Span = { cols: 1 | 2 | 3; rows: 1 | 2 | 3 };

export type Card =
  | {
      kind: "tent";
      name: string;
      stats: TentStats;
      // Whose picture goes on the player side: a character's chosen portrait, or a threat's miniature.
      portrait: { characterSlug?: string; threatId?: string };
      marker?: Marker;
    }
  | { kind: "threat"; title: string; t: Threat; tier: number; span: Span; size: number; note: string }
  | { kind: "item"; item: Item; entry: Wargear | undefined };

// Whose tents a print makes: the Agents a fight fields (`agentsInFight`), the seated ones, or the whole roster before
// anyone holds a seat.
export const fieldedAgentIds = (s: Pick<LiveState, "access" | "characters">): string[] => {
  const seated = activeCharacterIds(s.access);
  return s.characters.filter((c) => seated.size === 0 || seated.has(c.id)).map((c) => c.id);
};

export type PrintSource = {
  state: Pick<LiveState, "campaign" | "characters" | "access">;
  codex: Pick<Codex, "items" | "npcs" | "locations" | "handouts">;
  threats: Threat[]; // the bestiary with this campaign's custom threats merged in, as every picker reads it
  wargear: Wargear[];
};

// The sizes a Threat card can take, smallest first: one poker card, two side by side, a 2 × 2 panel, the whole sheet.
const SPANS: Span[] = [
  { cols: 1, rows: 1 },
  { cols: 2, rows: 1 },
  { cols: 2, rows: 2 },
  { cols: 3, rows: 3 },
];
// Where each class starts (Decision 1 on #203): Troops and Mobs one card, Elites two wide, Adversaries and Monstrous
// Creatures a 2 × 2 panel. A block too long to read at MIN_PT there takes the next size up.
const FIRST_SPAN: Record<ThreatClass, number> = { T: 0, E: 1, A: 2, M: 2 };
export const MIN_PT = 6;
const MAX_PT = 8;

// Every character a Threat card prints in its running text, and how many paragraphs it breaks into.
const textOf = (t: Threat) => {
  const lines = [
    t.keywords.join(", "),
    t.resilience.note ?? "",
    t.skills.list.map((k) => `${k.name} 10 (Passive 5), `).join(""),
    ...t.bonuses.map((b) => b.name + b.text),
    ...t.abilities.flatMap((a) => [
      `${a.type ?? ""}${a.name}${a.text ?? ""}`,
      ...a.weapons.map((w) => `${w.name} ${weaponLine({ weapon: w })}`),
    ]),
    t.determination ?? "",
    ...t.options.map((o) => o.name + o.text + o.weapons.map((w) => `${w.name} ${weaponLine({ weapon: w })}`).join("")),
    ...t.mobAbilities.map((m) => `${m.name ?? ""}${m.text ?? ""}`),
  ].filter(Boolean);
  return { chars: lines.join("").length, paras: lines.length };
};

// The card's height in mm at `size` pt across `cols` cards: a least-squares fit to react-pdf's own layout of every
// sixth bestiary threat at 1–3 cards wide and 6–8 pt (worst miss 12 %, hence the margin). Measured, because a card
// that runs past its edge doesn't just clip: react-pdf squeezes the paragraphs into each other.
// ponytail: refit (render, read the page height) if threat-card.tsx's layout changes.
export function cardHeight({ chars, paras }: { chars: number; paras: number }, size: number, cols: number) {
  const width = cols * CARD_W_MM - 6; // the card's 3 mm padding
  return 1.12 * (6.78 * size + (0.0602 * chars * size ** 2) / width + 0.188 * paras * size);
}

// The smallest span at or above the class's own that holds the block at MIN_PT or more, at the largest type that fits;
// past a whole sheet, the sheet at MIN_PT (the text then clips at the foot, which the GM sees in the PDF).
export function fitThreat(t: Threat, cls: ThreatClass): { span: Span; size: number } {
  const text = textOf(t);
  for (const span of SPANS.slice(FIRST_SPAN[cls]))
    for (let size = MAX_PT; size >= MIN_PT; size -= 0.5)
      if (cardHeight(text, size, span.cols) <= span.rows * CARD_H_MM) return { span, size };
  return { span: SPANS.at(-1)!, size: MIN_PT };
}

function threatCard({ title, t, tier, note }: { title: string; t: Threat; tier: number; note: string }): Card {
  return { kind: "threat", title, t, tier, note, ...fitThreat(t, threatClassAt(t, tier)) };
}

const threatTent = (name: string, t: Threat, marker?: Marker): Card => ({
  kind: "tent",
  name,
  stats: {
    defence: t.defence,
    resilience: t.resilience.value,
    wounds: t.wounds,
    shock: t.shock,
    conviction: t.conviction,
    speed: t.speed,
  },
  portrait: { threatId: t.id },
  marker,
});

// Tents first (the table needs them before the fight), then Threat cards, then items. A prepared row prints the way
// `beat.startEncounter` will field it (encounter.actions.ts): Profiles and scaling applied (VoA p.126, Core p.326), one
// tent per combatant with the tracker's label, and a Mob as one combatant (Core p.324).
export function printCards(job: PrintJob, { state, codex, threats, wargear }: PrintSource): Card[] {
  const tier = state.campaign.tier;
  const byId = new Map(threats.map((t) => [t.id, t]));
  const tents: Card[] = [];
  const blocks: Card[] = [];

  for (const id of job.agents ?? []) {
    const c = state.characters.find((x) => x.id === id);
    if (!c) continue;
    const d = deriveStats({ stats: c.stats, overrides: c.overrides, tier });
    tents.push({
      kind: "tent",
      name: c.name,
      stats: {
        defence: d.defence,
        resilience: d.resilience,
        wounds: d.maxWounds,
        shock: d.maxShock,
        conviction: d.conviction,
        speed: d.speed,
      },
      portrait: { characterSlug: c.detail.portrait },
    });
  }

  const agents = agentsInFight(state);
  for (const e of job.encounter ?? []) {
    const printed = byId.get(e.threatId);
    if (!printed) continue; // a threat the bestiary no longer holds: START ENCOUNTER refuses it too
    const mob = e.asMob && e.count > 1;
    const t = prepareThreat(printed, { tier, agents, asMob: mob, profiles: e.profiles, scale: e.scale });
    const name = e.label ?? t.name;
    // A Mob is one combatant named `label ?? "Name ×N"` (encounter.actions.ts `addThreat`), a GM's label taken as is.
    if (mob) tents.push(threatTent(e.label ?? `${t.name} ×${e.count}`, t, e.marker));
    else for (let i = 0; i < e.count; i++) tents.push(threatTent(e.count > 1 ? `${name} ${i + 1}` : name, t, e.marker));
    const note = [...e.profiles.map((p) => threatProfile(p).name), ...(e.scale ? ["Scaled"] : [])].join(" · ");
    blocks.push(
      threatCard({
        title: mob ? `${name} ×${e.count} (mob)` : e.count > 1 ? `${name} ×${e.count}` : name,
        t,
        tier,
        note,
      }),
    );
  }

  for (const id of job.threats ?? []) {
    const t = byId.get(id);
    if (t) blocks.push(threatCard({ title: t.name, t, tier, note: "" }));
  }

  const gear = new Map(wargear.map((w) => [w.id, w]));
  // The card goes on the table, so a codex mention (issue #200) prints as every phone would show it (toPlayerCodex):
  // the name of a revealed NPC or place, or of a revealed handout meant for every player, and "(unknown)" otherwise. A
  // private handout's title stays with its audience.
  const known = new Map(
    [
      ...codex.npcs,
      ...codex.locations,
      ...codex.handouts.filter((h) => !h.audience.length).map((h) => ({ ...h, name: h.title })),
    ]
      .filter((e) => e.revealed)
      .map((e) => [e.id, e.name]),
  );
  for (const id of job.items ?? []) {
    const found = codex.items.find((x) => x.id === id);
    if (!found) continue;
    const item = {
      ...found,
      description: plainMentions({ text: found.description, nameOf: (i) => known.get(i), missing: "(unknown)" }),
    };
    blocks.push({ kind: "item", item, entry: item.wargearId ? gear.get(item.wargearId) : undefined });
  }

  return [...tents, ...blocks];
}

export type Placed = { card: Card; col: number; row: number; span: Span };

const spanOf = (c: Card): Span => (c.kind === "threat" ? c.span : { cols: 1, rows: 1 });

// Cards onto pages of 3 × 3 poker cells, first fit: each card takes the first free spot on any page, so a 2 × 2 panel
// leaves its gap for the next single card instead of a hole. Absolute cells mean a card never splits across pages.
export function layoutCards(cards: Card[]): Placed[][] {
  const pages: { taken: boolean[][]; cards: Placed[] }[] = [];
  const fits = (taken: boolean[][], col: number, row: number, s: Span) => {
    if (col + s.cols > CARD_COLS || row + s.rows > CARD_ROWS) return false;
    for (let r = row; r < row + s.rows; r++) for (let c = col; c < col + s.cols; c++) if (taken[r]![c]) return false;
    return true;
  };
  for (const card of cards) {
    const span = spanOf(card);
    let spot: { page: (typeof pages)[number]; col: number; row: number } | null = null;
    for (const page of pages) {
      for (let row = 0; row < CARD_ROWS && !spot; row++)
        for (let col = 0; col < CARD_COLS && !spot; col++)
          if (fits(page.taken, col, row, span)) spot = { page, col, row };
      if (spot) break;
    }
    if (!spot) {
      const page = { taken: Array.from({ length: CARD_ROWS }, () => Array<boolean>(CARD_COLS).fill(false)), cards: [] };
      pages.push(page);
      spot = { page, col: 0, row: 0 };
    }
    for (let r = spot.row; r < spot.row + span.rows; r++)
      for (let c = spot.col; c < spot.col + span.cols; c++) spot.page.taken[r]![c] = true;
    spot.page.cards.push({ card, col: spot.col, row: spot.row, span });
  }
  return pages.map((p) => p.cards);
}
