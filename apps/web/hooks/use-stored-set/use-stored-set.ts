"use client";
import { useCallback, useMemo, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

// localStorage may be missing or throw (private window, blocked site data): every read and write is guarded.
const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
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

// A set of strings this device remembers under `key`, e.g. the whispers it has shown. `null` until anything was stored
// (or when storage is blocked), so a caller can tell a first visit from an empty set. `save` replaces the whole set.
export function useStoredSet(key: string) {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const set = useMemo(() => {
    if (raw === null) return null;
    try {
      const v: unknown = JSON.parse(raw);
      return Array.isArray(v) ? new Set(v.filter((k): k is string => typeof k === "string")) : null;
    } catch {
      return null;
    }
  }, [raw]);

  const save = useCallback(
    (keys: Iterable<string>) => {
      try {
        localStorage.setItem(key, JSON.stringify([...keys]));
        listeners.forEach((l) => l());
      } catch {
        // Nothing to remember it in: the caller treats everything as unseen, which is the safe side.
      }
    },
    [key],
  );

  return [set, save] as const;
}
