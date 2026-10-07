// A set with `id` added if it was missing, or removed if it was there: a new set, so React sees the change.
export const toggleIn = (set: ReadonlySet<string>, id: string): ReadonlySet<string> =>
  set.has(id) ? new Set([...set].filter((x) => x !== id)) : new Set([...set, id]);
