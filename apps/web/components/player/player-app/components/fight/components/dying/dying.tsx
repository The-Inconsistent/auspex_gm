import { RuleIdLink } from "@/components/ui/rule-link/rule-link";

type DyingProps = { traumatic: number; maxTraumatic: number };

// DYING (Core p.193): what the Agent may still do and how it ends, while pcStatus says Dying. Shown on every Turn, as a
// hit while Dying is a Traumatic Injury whoever is acting.
export function Dying({ traumatic, maxTraumatic }: DyingProps) {
  return (
    <section className="pf-sec" aria-label="Dying">
      <div className="pf-h">
        <h2>DYING</h2>
        <i />
        <span className="mono">
          TRAUMATIC {traumatic} / {maxTraumatic}
        </span>
      </div>
      <ul className="pf-steps pf-plain">
        <li>
          <b>YOUR TURN: ONE OF THESE</b>
          <span>
            <RuleIdLink id="crawling">Crawl</RuleIdLink>, a basic Combat Action with no options such as Aim or
            Multi-Attack, or <RuleIdLink id="fall-back">Fall Back</RuleIdLink>. You can&apos;t stand up (p.193).
          </span>
        </li>
        <li>
          <b>A WOUND NOW IS A TRAUMATIC INJURY</b>
          <span>
            More than {maxTraumatic} and you die. Determination that takes the damage to 0 saves you the Injury (p.193).
          </span>
        </li>
        <li>
          <b>IT ENDS</b>
          <span>
            When you recover any Wounds, from a Medicae (Int) Test (p.124). An ally can drag you with a Combat Action
            (p.193).
          </span>
        </li>
      </ul>
    </section>
  );
}
