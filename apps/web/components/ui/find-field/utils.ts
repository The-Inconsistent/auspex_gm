import { fold } from "@/lib/fold/fold";

// What a find field lists for `query`: names that start with it first, then names with a word that does, then any
// other match, as @ mentions rank (mention-field), then a match in `also` only, each group in the order given.
export function findHits<T extends { name: string; also?: string }>(options: readonly T[], query: string): T[] {
  const q = fold(query);
  if (!q) return [];
  const rank = ({ name, also }: T) =>
    fold(name).startsWith(q)
      ? 0
      : name.split(/\s+/).some((w) => fold(w).startsWith(q))
        ? 1
        : fold(name).includes(q)
          ? 2
          : also && fold(also).includes(q)
            ? 3
            : 4;
  return options
    .map((o) => ({ o, r: rank(o) }))
    .filter((h) => h.r < 4)
    .sort((x, y) => x.r - y.r)
    .map((h) => h.o);
}
