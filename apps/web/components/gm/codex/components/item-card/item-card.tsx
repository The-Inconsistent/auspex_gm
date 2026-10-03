"use client";
import { applyMods, sheetWeapon, sourceCite, type Codex, type Wargear, type WargearWeapon } from "@wg/shared";

import { WeaponLine } from "@/components/ui/weapon-line/weapon-line";

type ItemCardProps = {
  item: Codex["items"][number];
  entry: Wargear | undefined; // its catalogue entry, when it has one
};

// An opened item (issue #51): the catalogue entry it was linked to, and what GIVE puts on the sheet. A relic's Powers
// show applied to the profile, with what a profile can't hold printed under it (rules-flow.md §11.116).
export function ItemCard({ item, entry }: ItemCardProps) {
  if (!entry)
    return item.wargearId ? <div className="red">! The catalogue no longer holds “{item.wargearId}”</div> : null;
  const weapon = entry.weapon
    ? applyMods(sheetWeapon(entry as { name: string; weapon: WargearWeapon }, 0), item.mods)
    : null;
  return (
    <div className="panel pad stack" style={{ gap: 6 }}>
      <span className="label">FROM THE CATALOGUE</span>
      <div>
        <b>{entry.name.toUpperCase()}</b> <span className="dim">{sourceCite(entry)}</span>
      </div>
      <div className="keys" style={{ padding: 0 }}>
        <span className="chip">{entry.kind.toUpperCase()}</span>
        {entry.value !== null && <span className="chip">VALUE {entry.value}</span>}
        {entry.rarity && <span className="chip">{entry.rarity.toUpperCase()}</span>}
      </div>
      {weapon && (
        <div>
          <WeaponLine weapon={{ ...weapon.weapon, notes: weapon.notes }} />
        </div>
      )}
      {entry.effect && <pre className="text">{entry.effect}</pre>}
      <span className="dim">
        <i>
          {entry.weapon
            ? "Given, it joins the Agent's armament with this profile."
            : entry.upgrade
              ? "Given, it arrives as a gear line; fit it to a weapon from the sheet."
              : "Given, it becomes a gear line with its cite."}
        </i>
      </span>
    </div>
  );
}
