import { MOB_MIN, type EncounterBudget, type RosterTally } from "@wg/shared";

type BudgetLinesProps = { tally: RosterTally; budget: EncounterBudget };

// How a line reads, in words as well as colour.
const verdict = ({ have, target }: { have: number; target: number }) =>
  have > target ? "OVER" : have === target ? "ON TARGET" : "UNDER";

// One line of a roster against the book's target. `text` replaces the whole value cell, for a line whose target isn't a
// bare number to read "have / target" against.
function Line({ label, have, target, text }: { label: string; have: number; target: number; text?: string }) {
  const word = verdict({ have, target });
  return (
    <div className="keys" style={{ alignItems: "center" }}>
      <span className="label" style={{ minWidth: 150 }}>
        {label}
      </span>
      <span>{text ?? `${have} / ${target}`}</span>
      <span className={`chip ${word === "OVER" ? "warn" : ""}`}>{word}</span>
    </div>
  );
}

// A roster checked against Building Encounters (Threat Assessment p.8). The Mob line targets half the Troops, but a
// Mob needs two Troops (Core p.324), so a target of one reads "needs 2". Monstrous Creatures get their own line: the
// book names only Elites and Adversaries (rules-flow §11.82). ENEMIES counts tracked combatants, where a Mob is one,
// because keeping track is the problem p.8 names — the models are printed beside it.
export function BudgetLines({ tally, budget }: BudgetLinesProps) {
  const mobTarget = Math.max(budget.inMobs, MOB_MIN);
  return (
    <div className="stack" style={{ gap: 4 }}>
      <Line label="TROOPS" have={tally.troops} target={budget.troops} />
      <Line
        label="OF THOSE, IN MOBS"
        have={tally.inMobs}
        target={mobTarget}
        // Half the Troops target can be one model, which is no Mob at all, so the line says what a Mob needs instead.
        text={budget.inMobs < MOB_MIN ? `${tally.inMobs} / needs ${MOB_MIN}` : undefined}
      />
      <Line label="ELITE OR ADVERSARY" have={tally.elites} target={budget.elites} />
      {tally.monstrous > 0 && (
        <div className="keys" style={{ alignItems: "center" }}>
          <span className="label" style={{ minWidth: 150 }}>
            MONSTROUS
          </span>
          <span>{tally.monstrous}</span>
          <span className="chip">NO TARGET IN THE BOOK</span>
        </div>
      )}
      <Line
        label="ENEMIES"
        have={tally.tracked}
        target={budget.enemies}
        // The 10 bounds what the GM tracks, not the models, so it goes inside the sentence rather than after it.
        text={`${tally.tracked} of at most ${budget.enemies} tracked · ${tally.models} models`}
      />
      {tally.unclassed > 0 && (
        <div className="dim" style={{ fontSize: 12 }}>
          {tally.unclassed} not in the loaded bestiary, so they count as enemies only.
        </div>
      )}
    </div>
  );
}
