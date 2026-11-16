"use client";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import type { Codex } from "@wg/shared";

import { freshKeys, shownKeys } from "@/lib/seen/seen";

type Shown = Pick<Codex, "handouts" | "npcs" | "locations" | "items">;

const keyOf = (campaignId: string) => `wg:seen:${campaignId}`;
const listeners = new Set<() => void>();

// localStorage may be missing or throw (private window, blocked site data): every read and write is guarded.
const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, keys: Iterable<string>) => {
  try {
    localStorage.setItem(key, JSON.stringify([...keys]));
    listeners.forEach((l) => l());
  } catch {
    // Nothing to remember it in: the badge just stays off (freshKeys treats "no record" as nothing new).
  }
};
const parse = (raw: string | null): Set<string> | null => {
  if (raw === null) return null;
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? new Set(v.filter((k): k is string => typeof k === "string")) : null;
  } catch {
    return null;
  }
};

// External system: localStorage (and its `storage` event, for a second tab). The stored string is the snapshot, so it is
// stable between reads.
const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
};

// What this phone has been shown and opened, per campaign (the NEW badge). `codex` is null until the first snapshot.
// The first visit stores everything already revealed as seen, so a new phone isn't flooded. `markSeen` stores what is
// fresh now.
export function useSeen(campaignId: string, codex: Shown | null) {
  const key = keyOf(campaignId);
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const seen = useMemo(() => parse(raw), [raw]);
  const fresh = useMemo(() => (codex ? freshKeys(codex, seen) : new Set<string>()), [codex, seen]);

  // External system: localStorage. Store the baseline once, on a device with no record of this campaign.
  useEffect(() => {
    if (codex && raw === null) write(key, shownKeys(codex));
  }, [codex, raw, key]);

  // Only what is still shown is kept (seen ∪ fresh, cut to shown), so a hidden-then-revealed entry is new again and the
  // stored set can't grow past the codex.
  const markSeen = useCallback(() => {
    if (codex && fresh.size > 0) write(key, shownKeys(codex));
  }, [codex, fresh, key]);

  return { fresh, markSeen };
}
