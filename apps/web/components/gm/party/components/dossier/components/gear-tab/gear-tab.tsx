"use client";
import { useState, type FormEvent } from "react";

import { AMMO_TYPES, type ActionResult, type Character, type Wargear } from "@wg/shared";

import type { Send } from "@/hooks/use-table/use-table";

import { RequisitionForm } from "../../../requisition-form/requisition-form";
import { TapValue } from "../tap-value/tap-value";

type GearTabProps = {
  character: Character;
  influence: number;
  wargear: Wargear[];
  sessionId: string | null;
  send: Send;
  onResult: (r: ActionResult, ok: string) => void;
};

// GEAR: WEALTH (a tapped value, p.206), AMMO by type, a requisition, and what the Agent carries.
export function GearTab({ character: c, influence, wargear, sessionId, send, onResult }: GearTabProps) {
  const [requisitioning, setRequisitioning] = useState(false);

  // ±1 AMMO: loot or an award of one type (§11.57), starting the type if it's new; −1 takes back a slip, and at 0
  // drops the type. The type stays typed for repeat taps.
  const adjAmmo = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const kind = String(new FormData(e.currentTarget).get("kind") ?? "").trim();
    const delta = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "-1" ? -1 : 1;
    if (!kind) return;
    onResult(
      await send({ type: "character.supply", id: c.id, ammo: { kind, delta } }),
      `${c.name.toUpperCase()} ${delta > 0 ? "+" : ""}${delta} ${kind.toUpperCase()} AMMO`,
    );
  };

  // A recorded requisition closes its form.
  const requisitioned = (r: ActionResult, ok: string) => {
    onResult(r, ok);
    if (r.ok) setRequisitioning(false);
  };

  const ammo = Object.entries(c.stats.ammo);
  return (
    <div className="stack">
      <div className="party-values">
        <TapValue field="wealth" character={c} shown={String(c.stats.wealth)} send={send} onResult={onResult} />
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <span className="label">AMMO</span>
        <div className="dim">{ammo.map(([k, n]) => `${n} ${k}`).join(", ") || "NONE"}</div>
        <form className="keys" style={{ paddingTop: 0 }} onSubmit={adjAmmo}>
          <input
            className="input"
            style={{ flex: 1, minWidth: 140 }}
            name="kind"
            list="ammo-types"
            aria-label={`Ammo type for ${c.name}`}
            placeholder="AMMO TYPE"
          />
          <button className="btn" value="1">
            +1 AMMO
          </button>
          <button className="btn" value="-1">
            −1 AMMO
          </button>
        </form>
        <datalist id="ammo-types">
          {AMMO_TYPES.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </div>
      <div className="keys">
        <button className="btn" aria-expanded={requisitioning} onClick={() => setRequisitioning(!requisitioning)}>
          REQUISITION
        </button>
      </div>
      {requisitioning && (
        <RequisitionForm
          character={c}
          catalogue={wargear}
          influence={influence}
          sessionId={sessionId}
          send={send}
          onResult={requisitioned}
          onCancel={() => setRequisitioning(false)}
        />
      )}
      <div className="stack" style={{ gap: 4 }}>
        <span className="label">CARRIED</span>
        <div className="dim">{c.stats.gear.join(" · ") || "NOTHING LISTED"}</div>
      </div>
    </div>
  );
}
