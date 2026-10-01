"use client";
import { useState } from "react";

import type { Character, Weapon } from "@wg/shared";

import type { Send } from "@/hooks/use-table/use-table";

type UpgradeRowProps = {
  me: Character;
  weapon: Weapon;
  send: Send;
  onRefusal: (error: string | null) => void;
};

// Fitting an upgrade to this weapon, and taking one off (Core p.227, rules-flow.md §11.63): instant, no Test, so it is
// a tap. What can be fitted is what the character holds in gear, which the server lists as `ownedUpgrades` because a
// phone doesn't carry the catalogue. The server checks the fit, the maximum of three and the slot again.
export function UpgradeRow({ me, weapon, send, onRefusal }: UpgradeRowProps) {
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const owned = me.ownedUpgrades;
  // `upgradeNames` is built as the build's upgrades then what was fitted in play (withUpgrades), so the tail names the
  // ones that can come off here: an upgrade the build gives the weapon (§11.42) is changed in the builder.
  const fitted = (weapon.fitted ?? []).map((id, i) => ({
    id,
    name: weapon.upgradeNames?.[(weapon.upgrades ?? []).length + i] ?? id,
  }));
  if (owned.length === 0 && fitted.length === 0) return null;

  const act = async (action: "character.fitUpgrade" | "character.removeUpgrade", upgradeId: string) => {
    setBusy(true);
    const r = await send({ type: action, id: me.id, weapon: weapon.name, upgradeId });
    setBusy(false);
    onRefusal(r.ok ? null : r.error);
    if (r.ok) setPick("");
  };

  return (
    <div className="keys" style={{ paddingTop: 2, gap: 4 }}>
      {fitted.map((u) => (
        <button
          key={u.id}
          className="btn sm"
          disabled={busy}
          title={`Take ${u.name} off ${weapon.name}`}
          onClick={() => void act("character.removeUpgrade", u.id)}
        >
          − {u.name.toUpperCase()}
        </button>
      ))}
      {owned.length > 0 && (
        <>
          <label className="label" htmlFor={`fit-${me.id}-${weapon.name}`}>
            FIT
          </label>
          <select
            id={`fit-${me.id}-${weapon.name}`}
            className="input sm"
            value={pick}
            disabled={busy}
            onChange={(e) => setPick(e.target.value)}
          >
            <option value="">…</option>
            {owned.map((u) => (
              <option key={u.id} value={u.id}>
                {`${u.name} (${u.slot})`}
              </option>
            ))}
          </select>
          <button className="btn sm" disabled={busy || !pick} onClick={() => void act("character.fitUpgrade", pick)}>
            FIT
          </button>
        </>
      )}
    </div>
  );
}
