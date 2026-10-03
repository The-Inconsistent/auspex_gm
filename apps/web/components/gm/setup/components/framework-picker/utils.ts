import {
  BOOKS,
  MAX_TIER,
  describeFilter,
  type FrameworkBody,
  type FrameworkCatalogue,
  type Grant,
  type Source,
} from "@wg/shared";

// One pickable Framework: a patron's option (cited at the patron's page), or one printed on its own.
export type FrameworkEntry = {
  key: string;
  name: string;
  source: Source;
  page: number;
  patron: string | null;
  body: FrameworkBody;
};

const bookOrder = Object.keys(BOOKS);

// Every Framework the catalogue holds, grouped by book in BOOKS order, patrons before patron-less ones.
export function frameworkEntries({ patrons, frameworks }: FrameworkCatalogue): FrameworkEntry[] {
  const entries: FrameworkEntry[] = [
    ...patrons.flatMap((p) =>
      p.options.map((o) => ({
        key: `${p.id}/${o.name}`,
        name: o.name,
        source: p.source,
        page: p.page,
        patron: p.name,
        body: o,
      })),
    ),
    ...frameworks.map(({ id, name, source, page, note: _, factionId: __, ...body }) => ({
      key: id,
      name,
      source,
      page,
      patron: null,
      body: { name, ...body },
    })),
  ];
  return entries.sort((a, b) => bookOrder.indexOf(a.source) - bookOrder.indexOf(b.source));
}

// The Tiers a Framework is printed for: its Tier limit, else the Tier Core p.20 suggests. A hint only; the picker
// never changes the campaign's Tier.
export function tierRange(body: FrameworkBody): { min: number; max: number } | null {
  const limit = body.limitations.find((r) => r.kind === "tier");
  if (limit?.kind === "tier") return { min: limit.min ?? 1, max: limit.max ?? MAX_TIER };
  return body.tier ? { min: body.tier, max: body.tier } : null;
}

export const tierLabel = ({ min, max }: { min: number; max: number }) =>
  min === max ? `TIER ${min}` : max >= MAX_TIER ? `TIER ${min}+` : `TIER ${min}–${max}`;

type Item = Extract<Grant, { wargear: unknown }>["wargear"];
const itemText = (w: Item) =>
  `${w.qty === 1 ? "" : `${w.qty} × `}${w.name}${w.scope === "group" ? " (one for the group)" : ""}`;
const count = (n: unknown) => (typeof n === "number" ? String(n) : "some");

// A Wargear grant as one line for the GM's preview. The Framework forms only; anything else points at the book.
export function grantText(g: Grant): string {
  if ("wargear" in g) return itemText(g.wargear);
  if ("bundle" in g) return g.bundle.map(itemText).join(" and ");
  if ("from" in g && "choose" in g) return `${count(g.choose)} of: ${g.from.map(grantText).join("; ")}`;
  if ("all" in g) return g.all.map(grantText).join(" and ");
  if ("pick" in g) return `${count(g.pick)} × ${describeFilter(g.wargearOf)}`;
  if ("story" in g) return g.story;
  if ("keyword" in g) return `the ${g.keyword} Keyword`;
  if ("ammoPer" in g) return `${g.ammo} Ammo per ${g.ammoPer}`;
  return "as printed in the book";
}
