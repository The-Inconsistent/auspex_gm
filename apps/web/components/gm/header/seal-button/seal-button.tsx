"use client";
import { useState } from "react";

import { canSpend, poolMax, type ActionResult, type Codex, type LiveState, type Pool } from "@wg/shared";

import { Seal } from "@/components/ui/seal/seal";
import type { Send } from "@/hooks/use-table/use-table";
import { currentScene } from "@/lib/scene/scene";

import { Popover } from "../popover/popover";

type SealButtonProps = {
  pool: Pool;
  state: LiveState;
  codex: Codex;
  send: Send;
  onError: (message: string | null) => void;
};

// A party pool as one seal button. Its pad moves the pool by one, and offers the scene's planned spends from this pool:
// book spends are picked while building the scene, so no others are listed here.
export function SealButton({ pool, state, codex, send, onError }: SealButtonProps) {
  const [busy, setBusy] = useState(false); // a tap in flight: a second would apply twice
  const value = state.campaign[pool];
  const max = poolMax(pool, state.characters.length);
  const planned = (currentScene(codex)?.beat.spends ?? []).filter((s) => s.pool === pool);
  const name = pool === "glory" ? "Glory" : "Ruin";

  // −1 / +1 / SPEND: `pool.adjust` by a delta; a refusal shows the server's reason.
  const adjust = async (delta: number) => {
    setBusy(true);
    const r: ActionResult = await send({ type: "pool.adjust", pool, delta });
    setBusy(false);
    onError(r.ok ? null : r.error);
  };

  return (
    <Popover
      className={`hd-seal ${pool}`}
      label={`${name} ${value} of ${max}. Tap to adjust`}
      title={`Adjust ${name}`}
      align="start"
      button={
        <>
          <span className="label" style={{ color: "inherit" }}>
            {pool}
          </span>
          {/* The button names itself; the seal is its picture. */}
          <span aria-hidden="true" style={{ display: "inline-flex" }}>
            <Seal value={value} pool={pool} size={40} />
          </span>
          <span className="dim" style={{ fontSize: 15 }}>
            /{max}
          </span>
        </>
      }
    >
      {(close) => (
        <div className="hd-pad">
          <div className="hd-pad-row">
            <button
              className="btn sq"
              aria-label={`Spend 1 ${name}`}
              disabled={busy || value < 1}
              onClick={() => adjust(-1)}
            >
              −1
            </button>
            <b className="display" aria-live="polite">
              {name.toUpperCase()} {value} / {max}
            </b>
            <button
              className="btn sq"
              aria-label={`Add 1 ${name}`}
              disabled={busy || value >= max}
              onClick={() => adjust(1)}
            >
              +1
            </button>
          </div>
          {planned.length > 0 && (
            <>
              <div className="label">PLANNED HERE</div>
              {planned.map((s, i) => (
                <button
                  key={`${i}-${s.name}`}
                  className="btn"
                  title={s.text || undefined}
                  disabled={busy || !canSpend(state.campaign, s)}
                  onClick={() => adjust(-s.cost)}
                >
                  SPEND {s.cost} · {s.name.toUpperCase()}
                </button>
              ))}
            </>
          )}
          <div className="dlg-foot">
            <button className="btn sm" onClick={close}>
              CLOSE
            </button>
          </div>
        </div>
      )}
    </Popover>
  );
}
