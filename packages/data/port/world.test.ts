import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { HandoutStyle } from "@wg/shared";
import { HANDOUT_STYLE_LABEL } from "../../../apps/web/components/ui/handout-doc/constants.ts";
import { loadEngine, platformFile } from "./engine.ts";
import {
  buildWorld,
  colourOf,
  HANDOUT_DEFAULT_HEADER,
  HANDOUT_LAYOUT,
  MAPPING,
  readLook,
  type Source,
  TERMS,
} from "./world.ts";

// The World: skipped, like the ruleset's tests, when InconsisTable is not checked out beside this repo, and each check
// that needs the World contract skipped when that checkout predates it.
const engine = await loadEngine();
const noEngine = engine === null ? "InconsisTable is not checked out beside this repo" : false;
const noContract = noEngine || (engine!.World ? false : "this InconsisTable checkout has no World contract yet");
const world = buildWorld();
const look = readLook();
const SIDES = [
  ["light", look.day],
  ["dark", look.night],
] as const;

test("buildWorld parses as the contract's World", { skip: noContract }, () => {
  const result = engine!.World!.safeParse(world);
  if (!result.success)
    assert.fail(result.error.issues.map((i) => `${i.path.map(String).join(".")}: ${i.message}`).join("\n"));
});

test(
  "every colour is an opaque six-digit hex, for every token of the contract in both sets",
  { skip: noContract },
  () => {
    for (const [side] of SIDES) {
      const scheme = world.theme.schemes[side];
      assert.deepEqual(Object.keys(scheme).sort(), [...engine!.WORLD_COLOUR_TOKENS!].sort(), `${side}: tokens`);
      for (const [token, hex] of Object.entries(scheme)) assert.match(hex, /^#[0-9a-f]{6}$/, `${side} ${token}`);
    }
  },
);

test("every pick is a member of its list in the contract", { skip: noContract }, () => {
  const { typefaces, texture, shapes } = world.theme;
  for (const [role, face] of Object.entries(typefaces)) assert.ok(engine!.WORLD_TYPEFACES!.includes(face), role);
  assert.ok(engine!.WORLD_TEXTURES!.includes(texture));
  for (const [shape, pick] of Object.entries(shapes))
    assert.ok(engine!.WORLD_SHAPES![shape]?.includes(pick), `${shape}: ${pick}`);
});

test("every value in the mapping traces to a token this repo's stylesheet declares in that set", () => {
  const tokensOf = (s: Source) => (typeof s === "string" ? [s] : [s.token, s.over]);
  for (const [platform, line] of Object.entries(MAPPING))
    for (const [side, set] of SIDES)
      for (const token of tokensOf(line[side]))
        assert.ok(set.has(token), `${platform} (${side}): globals.css declares no --${token} in that set`);
});

test("only the input field is flattened, composited over the panel it sits on, in each set", () => {
  const flattened = Object.entries(MAPPING).flatMap(([t, line]) =>
    SIDES.flatMap(([side]) => (typeof line[side] === "string" ? [] : [`${t} ${side}`])),
  );
  assert.deepEqual(flattened, ["parchment-2 light", "parchment-2 dark"]);
  const set = new Map([
    ["field", "rgba(250, 249, 246, 0.55)"],
    ["vellum-2", "#d6d4cf"],
  ]);
  assert.equal(colourOf({ token: "field", over: "vellum-2" }, set), "#eae8e4");
  assert.throws(() => colourOf("field", set), /translucent/);
});

// ---------- contrast: the World's values laid over the base Theme's, as the platform's own token test reads them ----------

const lanternPath = platformFile("apps/web/app/theme/lantern.css");
const noLantern = noContract || (existsSync(lanternPath) ? false : "the platform's lantern.css is not there");

type Decls = Map<string, string>;
function rulesOf(css: string) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1]!.split(",").map((s) => s.trim()),
    decls: new Map(
      m[2]!
        .split(";")
        .map((d) => [d.slice(0, d.indexOf(":")).trim(), d.slice(d.indexOf(":") + 1).trim()] as const)
        .filter(([k]) => k.startsWith("--")),
    ) as Decls,
  }));
}

// light-dark(a, b) picks one side by the scheme; var(--x) is replaced by the context's declaration.
function resolve(value: string, decls: Decls, mode: "light" | "dark"): string {
  let v = value;
  for (let guard = 0; guard < 50 && /var\(|light-dark\(/.test(v); guard++) {
    v = v.replace(/var\(\s*(--[\w-]+)\s*\)/g, (_, name: string) => decls.get(name) ?? `?${name}`);
    const at = v.indexOf("light-dark(");
    if (at < 0) continue;
    let depth = 0;
    let comma = -1;
    let end = -1;
    for (let i = at + "light-dark".length; i < v.length; i++) {
      if (v[i] === "(") depth++;
      else if (v[i] === ")" && --depth === 0) {
        end = i;
        break;
      } else if (v[i] === "," && depth === 1 && comma < 0) comma = i;
    }
    const side = mode === "light" ? v.slice(at + "light-dark(".length, comma) : v.slice(comma + 1, end);
    v = v.slice(0, at) + side.trim() + v.slice(end + 1);
  }
  return v;
}

function luminance(hex: string) {
  assert.match(hex, /^#[0-9a-f]{6}$/i, `a plain hex colour, got ${hex}`);
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

test(
  "every contrast pair of the contract holds in both sets, on the table and inside a card",
  { skip: noLantern },
  () => {
    const rules = rulesOf(readFileSync(lanternPath, "utf8"));
    const root = rules.find((r) => r.selectors.includes(":root"));
    const card = rules.find((r) => r.selectors.includes(".parchment"));
    assert.ok(root && card, "lantern.css has its :root and the .parchment card scope");
    const failures: string[] = [];
    for (const [side] of SIDES) {
      const laid = new Map([
        ...root.decls,
        ...Object.entries(world.theme.schemes[side]).map(([t, hex]) => [`--${t}`, hex] as const),
      ]);
      for (const [where, decls] of [
        ["table", laid],
        ["card", new Map([...laid, ...card.decls])],
      ] as const) {
        const colour = (token: string) => resolve(`var(--${token})`, decls, side);
        // The slate readout holds the band's pair to its own floor (the platform's house decision #204).
        const slate = world.theme.shapes.readout === "slate" && engine!.WORLD_SLATE_PAIR;
        for (const { fg, bg, min } of [...engine!.WORLD_CONTRAST_PAIRS!, ...(slate ? [slate] : [])]) {
          const r = ratio(colour(fg), colour(bg));
          console.log(`${side} ${where}: ${fg} ${colour(fg)} on ${bg} ${colour(bg)} = ${r.toFixed(2)} (≥ ${min})`);
          if (r < min) failures.push(`${side} ${where}: ${fg} on ${bg} is ${r.toFixed(2)}, under ${min}`);
        }
      }
    }
    assert.deepEqual(failures, []);
  },
);

const noValidator =
  noContract || (engine!.validateWorld ? false : "this InconsisTable checkout has no World validator yet");
test("the World passes InconsisTable's World validator", { skip: noValidator }, () => {
  const result = engine!.validateWorld!(world);
  if (!result.ok) assert.fail(result.problems.map((p) => `${p.path}: ${p.message}`).join("\n"));
  // The validator judges contrast too: a pair under its floor is refused, at the set it is in.
  const dim = structuredClone(world) as { theme: { schemes: { light: Record<string, string> } } };
  dim.theme.schemes.light.ink = dim.theme.schemes.light.paper!;
  const refused = engine!.validateWorld!(dim);
  assert.equal(refused.ok, false);
  assert.ok(!refused.ok && refused.problems.some((p) => p.path === "theme.schemes.light"));
});

test("the World is 0.1.2", () => assert.equal(world.version, "0.1.2"));

// ---------- terms (InconsisTable's house decisions #212, #213) ----------

const noTerms = noContract || (engine!.TERM_IDS ? false : "this InconsisTable checkout has no terms yet");

test("every term is one the platform reads, and the contract keeps the terms as written", { skip: noTerms }, () => {
  for (const id of Object.keys(TERMS)) assert.ok(engine!.TERM_IDS!.includes(id), id);
  const parsed = engine!.World!.safeParse(world);
  assert.ok(parsed.success);
  assert.deepEqual((parsed.data as { terms?: unknown }).terms, TERMS);
});

test("every term has its English word, and a Vietnamese one only where Auspex's word is not the platform's", () => {
  // Agent and Threat are this app's own words; the rest are the platform's, at most capitalised (Round, Turn, Mob).
  for (const [id, words] of Object.entries(TERMS)) {
    assert.ok("en" in words, `${id}: English`);
    assert.equal("vi" in words, ["character", "creature", "foe"].includes(id), `${id}: Vietnamese`);
  }
});

// ---------- handouts (InconsisTable's house decision #72) ----------

const noLayouts =
  noContract || (engine!.HANDOUT_LAYOUTS ? false : "this InconsisTable checkout has no handout layouts");

test("every handout style of this app has one layout and one default header, a sixth style fails here", () => {
  assert.deepEqual(Object.keys(HANDOUT_LAYOUT), HandoutStyle.options);
  assert.deepEqual(Object.keys(HANDOUT_DEFAULT_HEADER), HandoutStyle.options);
  assert.deepEqual(HANDOUT_LAYOUT, {
    plain: "plain",
    slate: "tablet",
    form: "form",
    vox: "transcript",
    decree: "proclamation",
  });
  // A plain handout prints no header.
  assert.equal(HANDOUT_DEFAULT_HEADER.plain, "");
});

test("the World offers every layout in the editor's order, under the editor's names", () => {
  assert.deepEqual(
    world.handouts.layouts,
    HandoutStyle.options.map((s) => HANDOUT_LAYOUT[s]),
  );
  for (const s of HandoutStyle.options)
    assert.equal(world.handouts.names[HANDOUT_LAYOUT[s]], HANDOUT_STYLE_LABEL[s], s);
});

test("the layouts are the platform's list, and the contract keeps the part as written", { skip: noLayouts }, () => {
  assert.deepEqual([...world.handouts.layouts].sort(), [...engine!.HANDOUT_LAYOUTS!].sort());
  const parsed = engine!.World!.safeParse(world);
  assert.ok(parsed.success);
  assert.deepEqual((parsed.data as { handouts?: unknown }).handouts, world.handouts);
});
