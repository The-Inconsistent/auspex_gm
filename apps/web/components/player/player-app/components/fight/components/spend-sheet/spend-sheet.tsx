"use client";
import { useRef } from "react";

import type { LiveState } from "@wg/shared";

import { RequestSpend } from "@/components/ui/request-spend/request-spend";
import type { Send } from "@/hooks/use-table/use-table";

type SpendSheetProps = { state: LiveState; me: { id: string; wrath: number }; send: Send };

// One entry button for both pools (no button rows on a page): it opens a dialog holding the two existing RequestSpend
// buttons, each of which lists that pool's spends. Nothing is spent until the GM accepts (§11.122).
export function SpendSheet({ state, me, send }: SpendSheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const spend = { state, characterId: me.id, send };
  return (
    <>
      <button type="button" className="pf-spend-open btn" onClick={() => ref.current?.showModal()}>
        SPEND WRATH OR GLORY
      </button>
      <dialog
        ref={ref}
        className="spend"
        aria-label="Spend Wrath or Glory"
        // A click on the dialog element itself, not its content, is a click on the backdrop.
        onClick={(e) => e.target === ref.current && ref.current.close()}
      >
        <div className="sb-title">
          <span>SPEND · THE GM ANSWERS</span>
        </div>
        <div className="pf-spends">
          <RequestSpend
            pool="wrath"
            {...spend}
            className="pf-spend wrath cut"
            label={
              <>
                <span className="pf-spend-w">WRATH</span>
                <span className="pf-spend-s">REROLL · RESTORE SHOCK</span>
                <span className="mono pf-spend-c">YOU HOLD {me.wrath}</span>
              </>
            }
          />
          <RequestSpend
            pool="glory"
            {...spend}
            className="pf-spend glory cut"
            label={
              <>
                <span className="pf-spend-w">GLORY</span>
                <span className="pf-spend-s">DICE · DAMAGE · SEIZE</span>
                <span className="mono pf-spend-c">PARTY HOLDS {state.campaign.glory}</span>
              </>
            }
          />
        </div>
        <div className="dlg-foot">
          <button className="btn sm" onClick={() => ref.current?.close()}>
            CLOSE
          </button>
        </div>
      </dialog>
    </>
  );
}
