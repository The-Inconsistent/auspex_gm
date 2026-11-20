// The Wrath & Glory World for InconsisTable (its ADR 0010, decision 2): this app's look, the "Imperial Manuscript" of
// apps/web/app/globals.css, as values for the platform's Theme tokens and picks from the platform's lists. The colours
// are read from that stylesheet when the World is built, never retyped: the day set (`:root`) is the World's light set,
// the night set (`:root[data-theme="vigil"]` over `:root`) its dark set. A World carries no words, no font file and no
// image, so nothing here names the game.
import { readFileSync } from "node:fs";
import { buildRuleset } from "./ruleset.ts";

const STYLESHEET = new URL("../../../apps/web/app/globals.css", import.meta.url);

export type Tokens = Map<string, string>;
/** This app's custom properties, by name without the dashes: the day set, and the night set (day overlaid by vigil). */
export function readLook(css = readFileSync(STYLESHEET, "utf8")): { day: Tokens; night: Tokens } {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const block = (selector: string): Tokens => {
    const at = text.indexOf(`${selector} {`);
    if (at < 0) throw new Error(`globals.css has no "${selector}" block`);
    const body = text.slice(at + selector.length + 2, text.indexOf("}", at));
    return new Map([...body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
  };
  const day = block(":root");
  return { day, night: new Map([...day, ...block(':root[data-theme="vigil"]')]) };
}

/** A token of this app, or a translucent one flattened over the opaque surface it sits on. */
export type Source = string | { token: string; over: string };
export type Line = { light: Source; dark: Source };

/**
 * One line per platform token (apps/web/app/theme/lantern.css in InconsisTable): this app's token for the day set and
 * for the night set. The platform's table is wood with parchment cards lying on it and brass for the main action; here
 * the table is the cold page, the bands are iron, crimson is the main action and "now", and brass is Glory only, so it
 * is not used. Ratios in the notes are WCAG contrast, measured by world.test.ts.
 */
export const MAPPING: Record<string, Line> = {
  // The wood family is the table's ground on the dark set (paper = wood, paper-2 = wood-2) and its fittings in both:
  // bands (wood-3 → wood-0), tabs (wood → wood-0), plates (wood-3 → wood-2). On the light set only the fittings show,
  // so all four are iron; on the dark set wood and wood-2 are the charred page and panel, the ends stay iron.
  "wood-0": { light: "iron", dark: "iron" },
  wood: { light: "iron", dark: "vellum" },
  "wood-2": { light: "iron-2", dark: "vellum-2" },
  // the band's top: iron, so the band is flat as here
  "wood-3": { light: "iron", dark: "iron" },
  // Brass is the platform's main action (plate-main = brass-hi → brass under brass-ink, the active tab) and its rules
  // (band edge, chip and card borders). Here the main action is the crimson fill under bone, and its border red-2.
  brass: { light: "red-fill", dark: "red-fill" },
  "brass-hi": { light: "red-fill", dark: "red-fill" },
  "brass-lo": { light: "red-2", dark: "red-2" },
  "brass-ink": { light: "bone", dark: "bone" },
  // no counterpart: the round number on the fight bar and the lit clock wedge, "now" on a dark band
  candle: { light: "red-on-iron", dark: "red-on-iron" },
  // The platform's crimson: accent and link inside a card, the low health bar. A night card is a dark panel (below),
  // where the night red reads at 4.17:1: the crimson this look keeps for dark iron is used there instead.
  wax: { light: "red", dark: "red-on-iron" },
  // text on wax inside a card: bone on the day crimson, as on every crimson fill here. The night card's crimson is the
  // pale one (above), where bone reads at 2.50:1, so its text is iron, as the night accent's is on the table.
  cream: { light: "bone", dark: "iron" },
  // no counterpart ("ok" inside a card): this app has no success colour, so secondary ink (see ok)
  leaf: { light: "ink-2", dark: "ink-2" },
  // no counterpart: the top of the health bar's fill, beside ok
  moss: { light: "ink-2", dark: "ink-2" },
  // The parchment family is a card lying on the table (.card, .combatant, .bottom-sheet) and the light app page. A
  // card here is a panel: vellum-2 on the vellum page, by day and by night alike. Under a World the platform draws a
  // card in the active set's own colours, so the night card is this look's dark panel with its pale ink.
  parchment: { light: "vellum", dark: "vellum-2" },
  "parchment-hi": { light: "vellum-2", dark: "vellum-2" },
  // the inputs inside a card: this app's input field over a panel
  "parchment-2": { light: { token: "field", over: "vellum-2" }, dark: { token: "field", over: "vellum-2" } },
  "parchment-ink": { light: "ink", dark: "ink" },
  // the card's dim text (ink-2 is the platform's .dim): ink-3 here
  "parchment-ink-2": { light: "ink-3", dark: "ink-3" },
  "parchment-line": { light: "line", dark: "line" },
  // the focus ring inside a card: crimson, as every focus ring here
  "ink-blue": { light: "red", dark: "red" },
  // no counterpart: the halo round a focus ring inside a card; the card itself, so the ring stands alone as here
  "halo-light": { light: "vellum-2", dark: "vellum-2" },
  // no counterpart: the halo round a focus ring on a band (the workspace footer); the band itself
  "halo-dark": { light: "iron", dark: "iron" },

  // The names the components read, on the table and the app page.
  paper: { light: "vellum", dark: "vellum" },
  "paper-2": { light: "vellum-2", dark: "vellum-2" },
  ink: { light: "ink", dark: "ink" },
  // the platform's ink-2 is .dim and captions: ink-3 here
  "ink-2": { light: "ink-3", dark: "ink-3" },
  line: { light: "line", dark: "line" },
  band: { light: "iron", dark: "iron" },
  "band-ink": { light: "bone", dark: "bone" },
  accent: { light: "red", dark: "red" },
  // Night: this look puts bone only on red-fill, which is too dark to be the accent as text on the page (1.92:1), and
  // bone on the night red is 3.48:1. So the night accent keeps the red (4.64:1 on the page) and takes iron for its ink:
  // 5.05:1.
  "accent-ink": { light: "bone", dark: "iron" },
  // links are ink here (a { color: var(--ink) }); crimson is never decoration
  link: { light: "ink", dark: "ink" },
  // no counterpart: this app has no success colour (crimson is "now" or harm, brass is Glory), so secondary ink
  ok: { light: "ink-2", dark: "ink-2" },
  focus: { light: "red", dark: "red" },
  // no counterpart: the halo round the focus ring is the page, so the ring stands alone as here
  "focus-halo": { light: "vellum", dark: "vellum" },
};

export const TYPEFACES = { display: "cinzel", body: "crimson-pro", mono: "ibm-plex-mono" } as const;
export const TEXTURE = "paper";
export const SHAPES = {
  corners: "square",
  cardEdge: "square",
  cardCrest: "spiked",
  bandEdge: "torn",
  headingRule: "quill",
  headingCase: "caps",
  buttonFrame: "double",
} as const;

type Rgba = { rgb: [number, number, number]; alpha: number };
function parse(token: string, set: Tokens): Rgba {
  const v = set.get(token);
  if (v === undefined) throw new Error(`globals.css declares no --${token} in this set`);
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex) return { rgb: [0, 2, 4].map((i) => parseInt(hex[1]!.slice(i, i + 2), 16)) as Rgba["rgb"], alpha: 1 };
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(v);
  if (rgba) return { rgb: [+rgba[1]!, +rgba[2]!, +rgba[3]!], alpha: rgba[4] === undefined ? 1 : +rgba[4] };
  throw new Error(`--${token} is not a colour this reads: ${v}`);
}
const hexOf = (rgb: number[]) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;

/** A source's opaque colour in a set. A translucent token is composited over its surface in sRGB. */
export function colourOf(source: Source, set: Tokens): string {
  const token = typeof source === "string" ? source : source.token;
  const fg = parse(token, set);
  if (typeof source === "string") {
    if (fg.alpha !== 1) throw new Error(`--${token} is translucent: name the surface it sits on`);
    return hexOf(fg.rgb);
  }
  const bg = parse(source.over, set);
  if (bg.alpha !== 1) throw new Error(`--${source.over} is translucent: a surface must be opaque`);
  return hexOf(fg.rgb.map((c, i) => c * fg.alpha + bg.rgb[i]! * (1 - fg.alpha)));
}

export function buildWorld(look = readLook()) {
  const scheme = (side: keyof Line, set: Tokens) =>
    Object.fromEntries(Object.entries(MAPPING).map(([token, line]) => [token, colourOf(line[side], set)]));
  return {
    id: "wrath-and-glory",
    version: "0.1.0",
    core: buildRuleset().core,
    name: "Imperial Manuscript",
    theme: {
      schemes: { light: scheme("light", look.day), dark: scheme("dark", look.night) },
      typefaces: { ...TYPEFACES },
      texture: TEXTURE,
      shapes: { ...SHAPES },
    },
  };
}
