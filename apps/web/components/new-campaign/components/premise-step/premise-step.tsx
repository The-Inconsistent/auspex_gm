"use client";
import { Info } from "lucide-react";
import { useState, type ReactNode } from "react";

import type { FrameworkCatalogue } from "@wg/shared";

import { FrameworkPicker } from "@/components/gm/setup/components/framework-picker/framework-picker";
import { Pop } from "@/components/ui/term/term";

import type { Draft } from "../../constants";

type Premise = Pick<Draft, "framework" | "frameworkBonus" | "patron">;
type PremiseStepProps = Premise & {
  catalogue: FrameworkCatalogue;
  tier: number;
  onChange: (patch: Partial<Premise>) => void;
};
type HelpProps = { title: string; cite: string; children: ReactNode };

// ⓘ beside a field's label: what the book means by it, in our words, with its page.
function Help({ title, cite, children }: HelpProps) {
  return (
    <Pop title={title} cite={cite} body={children}>
      <Info size={15} aria-hidden="true" style={{ verticalAlign: "-2px" }} />
    </Pop>
  );
}

// PREMISE: the Framework, "a sentence or two" saying who the Agents are, what they do and their shared goal (Core p.18).
// SETUP's picker fills in the printed names only (rules-flow §11.80). The book's advice for writing one sits beside it.
export function PremiseStep({ catalogue, tier, framework, frameworkBonus, patron, onChange }: PremiseStepProps) {
  const [picking, setPicking] = useState(false);

  // START FROM A FRAMEWORK › USE: the picked names fill the fields, and the list closes.
  const use = (picked: { patron: string; framework: string }) => {
    onChange(picked);
    setPicking(false);
  };

  return (
    <>
      <div className="rule">WHAT&apos;S THE CAMPAIGN ABOUT?</div>
      <div className="nc-split">
        <div className="stack" style={{ gap: 16 }}>
          <div className="field">
            <span className="label">
              <label htmlFor="nc-framework">
                FRAMEWORK · WHO THE AGENTS ARE, WHAT THEY DO, THEIR SHARED GOAL (P.18)
              </label>{" "}
              <Help title="Framework" cite="Core Rulebook p.18">
                A sentence or two that describes the Agents as a group: who they are, the kind of adventures they go on,
                and their goal as a team. Players build their Agents with it in mind, and the table looks back at it to
                stay on track. It goes on the party sheet (p.374).
              </Help>
            </span>
            <textarea
              id="nc-framework"
              className="input"
              rows={3}
              maxLength={5000}
              placeholder="A Rogue Trader's retinue chasing a lost archeotech vault…"
              value={framework}
              onChange={(e) => onChange({ framework: e.target.value })}
            />
            <i className="dim">Every phone shows it under MISSION. Write your own, or start from a printed one.</i>
          </div>
          <div className="keys" style={{ alignItems: "center", paddingTop: 0 }}>
            <button
              className={`btn ${picking ? "primary" : ""}`}
              aria-expanded={picking}
              onClick={() => setPicking(!picking)}
            >
              START FROM A FRAMEWORK
            </button>
            <i className="dim">The printed ones, by book and patron. USE fills in the names.</i>
          </div>
          <div className="field">
            <span className="label">
              <label htmlFor="nc-patron">PATRON · OPTIONAL (PP.310–313)</label>{" "}
              <Help title="Patron" cite="Core Rulebook pp.19, 310">
                A powerful figure who sponsors the group, giving Wargear, resources and the weight of their authority in
                return for missions that serve their own goals. A patron is the easiest way to build a Framework: the
                Core Rulebook gives each of its patrons two.
              </Help>
            </span>
            <input
              id="nc-patron"
              className="input"
              maxLength={200}
              placeholder="Rogue Trader Jakel Varonius, or your own"
              value={patron}
              onChange={(e) => onChange({ patron: e.target.value })}
            />
            <i className="dim">Who sends the Agents out, and what they want in return.</i>
          </div>
          <div className="field">
            <span className="label">
              <label htmlFor="nc-bonus">FRAMEWORK BONUS · OPTIONAL (P.19)</label>{" "}
              <Help title="Framework bonus" cite="Core Rulebook p.19">
                Some Frameworks give a bonus in play. Experienced groups can also ask the GM for bonus dice when they do
                something tied to their Framework or Keywords: a band of militant missionaries preaching to the masses,
                say. New groups can leave it empty.
              </Help>
            </span>
            <textarea
              id="nc-bonus"
              className="input"
              rows={2}
              maxLength={1000}
              placeholder="+1 bonus die when preaching to the masses…"
              value={frameworkBonus}
              onChange={(e) => onChange({ frameworkBonus: e.target.value })}
            />
            <i className="dim">Goes in the FRAMEWORK BONUS box of the party sheet.</i>
          </div>
        </div>
        <aside className="plate stack" aria-label="Writing a good Framework">
          <span className="label">WRITING A GOOD FRAMEWORK · CORE PP.316–317</span>
          <span>Aim for one that:</span>
          <ul className="nc-tips">
            <li>sounds fun for the whole group</li>
            <li>fits the adventures you have planned</li>
            <li>makes the Agents cooperate</li>
            <li>fits the setting</li>
            <li>gives the group one clear shared goal</li>
            <li>suggests which Archetypes suit it, and which won&apos;t</li>
          </ul>
          <span>
            If the Agents come from different Factions, say why they work together: ordered to, volunteered, hired one
            by one, or the last survivors of a failed mission.
          </span>
          <i className="dim">
            Ask the table: it&apos;s the moment to agree what kind of game you&apos;ll play (next step).
          </i>
        </aside>
      </div>
      {picking && (
        <FrameworkPicker
          catalogue={catalogue}
          tier={tier}
          patron={patron}
          onUse={use}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  );
}
