"use client";
import { useState } from "react";

import type { ActionInput, Character, UpgradeHost } from "@wg/shared";

import type { Send } from "@/hooks/use-table/use-table";

// As much of a weapon or a suit as fitting reads: its name and the three upgrade fields.
type Host = { name: string; upgrades?: string[]; fitted?: string[]; upgradeNames?: string[] };

type UpgradeRowProps = {
  me: Character;
  item: Host;
  host?: UpgradeHost;
  named?: boolean; // print the item's name first, where the row doesn't sit under it (the DOSSIER's datacard)
  send: Send;
  onRefusal: (error: string | null) => void;
};

// Fitting an upgrade to this weapon or suit, and taking one off (Core p.227, rules-flow.md §11.63): instant, no Test, so
// it is a tap. What can be fitted is what the character holds in gear, which the server lists as `ownedUpgrades` because
// a phone doesn't carry the catalogue. The server checks the fit, the maximum of three and the slot again.
export function UpgradeRow({ me, item, host = "weapon", named = false, send, onRefusal }: UpgradeRowProps) {
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  // Only what fits this host, and never Matched Pair, which reads on two weapons and stays the GM's (§11.64).
  const owned = me.ownedUpgrades.filter((u) => u.hosts.includes(host) && !u.gmOnly);
  // `upgradeNames` is built as the build's upgrades then what was fitted in play (withUpgrades), so the tail names the
  // ones that can come off here: an upgrade the build gives the item (§11.42) is changed in the builder.
  const fitted = (item.fitted ?? []).map((id, i) => ({
    id,
    name: item.upgradeNames?.[(item.upgrades ?? []).length + i] ?? id,
  }));
  if (owned.length === 0 && fitted.length === 0) return null;
  const field = `fit-${me.id}-${host}-${item.name}`;

  // Fits or removes one upgrade on this host, then shows the server's refusal if there is one.
  const act = async (
    action: Extract<ActionInput["type"], "character.fitUpgrade" | "character.removeUpgrade">,
    upgradeId: string,
  ) => {
    setBusy(true);
    const r = await send({
      type: action,
      id: me.id,
      host,
      ...(host === "weapon" ? { weapon: item.name } : {}),
      upgradeId,
    });
    setBusy(false);
    onRefusal(r.ok ? null : r.error);
    if (r.ok) setPick("");
  };

  return (
    <div className="keys" style={{ paddingTop: 2, gap: 4 }}>
      {named && <b className="label">{item.name.toUpperCase()}</b>}
      {fitted.map((u) => (
        <button
          key={u.id}
          className="btn sm"
          disabled={busy}
          aria-label={`Remove ${u.name} from ${item.name}`}
          title={`Take ${u.name} off ${item.name}`}
          onClick={() => void act("character.removeUpgrade", u.id)}
        >
          − {u.name.toUpperCase()}
        </button>
      ))}
      {owned.length > 0 && (
        <>
          <label className="label" htmlFor={field}>
            FIT
          </label>
          <select
            id={field}
            className="input sm"
            aria-label={`Upgrade to fit to ${item.name}`}
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
          <button
            className="btn sm"
            aria-label={`Fit upgrade to ${item.name}`}
            disabled={busy || !pick}
            onClick={() => void act("character.fitUpgrade", pick)}
          >
            FIT
          </button>
        </>
      )}
    </div>
  );
}
