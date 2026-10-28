"use client";
import { CharacterBuild, type Character } from "@wg/shared";

import type { Send } from "@/hooks/use-table/use-table";

import { BookBox } from "../book-box/book-box";
import { D6 } from "./constants";

type ObjectiveBoxProps = { me: Character; send: Send; onError: (error: string | null) => void };

// OBJECTIVE as the book's sheet has it, under WRATH (Core p.40): the session's prompt from the Faction's table (p.43).
// The player rolls the d6 at the table and taps what it shows; the server writes that row in (§11.161). Not drawn for
// a sheet with no Background table to roll on, as the sheet leaves out every box it has no data for.
export function ObjectiveBox({ me, send, onError }: ObjectiveBoxProps) {
  const rolled = me.objectives.find((o) => o.rolled);
  if (!rolled && !CharacterBuild.safeParse(me.build).data?.background?.tableId) return null;

  // I ROLLED n: records that row of the Faction's Objectives, or shows why not (no session yet).
  const handleRoll = async (roll: number) => {
    const r = await send({ type: "character.rollObjective", characterId: me.id, roll });
    onError(r.ok ? null : r.error);
  };

  return (
    <BookBox title="OBJECTIVE" id="ps-objective" label="Objective">
      {rolled ? (
        <p className={`bs-obj${rolled.done ? " ps-struck" : ""}`}>
          {rolled.text}
          {rolled.done && <span className="sr-only"> (done)</span>}
        </p>
      ) : (
        <>
          <span className="bs-cap">Roll a d6 when the session starts, then tap what it shows.</span>
          <div className="bs-obj-roll" role="group" aria-label="I rolled">
            <span className="bs-lbl">I ROLLED</span>
            {D6.map((n) => (
              <button
                key={n}
                type="button"
                className="btn mono"
                aria-label={`I rolled ${n}`}
                onClick={() => handleRoll(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </>
      )}
      <span className="bs-cap bs-cap-end">Played well, the GM awards a Wrath Point. Core p.43</span>
    </BookBox>
  );
}
