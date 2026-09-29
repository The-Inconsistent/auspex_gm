"use client";
import { useState } from "react";

import { LibraryCharacter, LibraryEntry } from "@wg/shared";

import { useBuilder } from "../../builder-context";

// Bring a character from your own library into this campaign (issue #14 step 4). The import is a copy: it lands in this
// builder's draft, resolves against the campaign's catalogue, and is saved by the flow that was already here (a player
// sends it to the GM, the GM ticks and saves). Later library edits don't reach the campaign character.
export function ImportLibrary() {
  const { tier, homebrew, update, go } = useBuilder();
  const [list, setList] = useState<LibraryCharacter[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Why a character can't come in as it stands. The campaign's Tier and books are the GM's, so the library bends first.
  const blocked = (c: LibraryCharacter): string | null => {
    if (!c.done) return "still being built";
    if (c.tier !== tier) return `Tier ${c.tier}`;
    if (c.homebrew && !homebrew) return "homebrew";
    return null;
  };

  const openList = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/library");
      if (res.status === 401) throw new Error("Your library needs an account. Guests on a QR code don't have one.");
      if (!res.ok) throw new Error("Couldn't reach your library. Try again.");
      const parsed = LibraryCharacter.array().safeParse(await res.json());
      if (!parsed.success) throw new Error("Couldn't read your library.");
      setList(parsed.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reach your library. Try again.");
    } finally {
      setBusy(false);
    }
  };

  // The build becomes this draft, minus the GM's part: rulings and ticks are made at a table, about that table's
  // character, so they stay the GM's here.
  const pick = async (c: LibraryCharacter) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/library/${c.id}`);
      if (!res.ok) throw new Error("Couldn't open that character.");
      const parsed = LibraryEntry.safeParse(await res.json());
      if (!parsed.success) throw new Error("Couldn't read that character.");
      const entry = parsed.data;
      if (!entry.build) throw new Error("That character has no finished build yet.");
      const { gm: _, ...choices } = entry.build;
      update(() => ({ ...choices, gm: {}, tier, name: entry.name, detail: entry.detail }));
      go("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open that character.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="plate stack">
      <div className="rule">FROM YOUR LIBRARY</div>
      {list === null ? (
        <>
          <p className="dim">
            Characters you built outside a game. A copy comes in here; the one in your library stays as it is.
          </p>
          <div>
            <button className="btn" disabled={busy} onClick={openList}>
              IMPORT FROM LIBRARY
            </button>
          </div>
        </>
      ) : list.length === 0 ? (
        <p className="dim">
          Nothing in your library yet. Build one from the lobby, then bring it in here.{" "}
          <a href="/library/new">NEW CHARACTER</a>
        </p>
      ) : (
        <div className="list">
          {list.map((c) => {
            const why = blocked(c);
            return (
              <div key={c.id} className="item">
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <b style={{ flex: 1 }}>{(c.name.trim() || "UNNAMED").toUpperCase()}</b>
                  <button className="btn sm primary" disabled={busy || !!why} onClick={() => pick(c)}>
                    USE THIS ONE
                  </button>
                </div>
                <div className="dim">
                  {[c.tier ? `T${c.tier}` : "NO TIER", c.archetype?.toUpperCase(), why && `· ${why.toUpperCase()}`]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
            );
          })}
          <p className="dim">
            This campaign is Tier {tier}
            {homebrew ? ", homebrew allowed" : ", official books only"}: a character built otherwise has to be rebuilt
            for it.
          </p>
        </div>
      )}
      {error && <div className="red">! {error}</div>}
    </div>
  );
}
