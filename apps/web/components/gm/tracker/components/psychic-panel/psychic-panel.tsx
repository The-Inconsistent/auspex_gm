"use client";
import { useState, type FormEvent } from "react";

import { isSustain, isSustained, sustainEntry, sustainedPowers, type SheetPower } from "@wg/shared";

type PsychicPanelProps = {
  name: string;
  manifested: boolean; // already activated a power this Round (rules-flow §8, §11.181)
  conditions: string[];
  // A PC's own powers (stats.powers, from a saved build); threats and hand-made sheets pass [] and type the name.
  known: Pick<SheetPower, "name" | "duration">[];
  // Writes the whole Conditions list back, logging `text` (the tracker's conditionsAction + run).
  onChange: ({ conditions, text }: { conditions: string[]; text: string }) => void;
  // MANIFEST: the tracker sends combatant.manifest and opens PERILS for Wrath 1s; true when the server took it.
  onManifest: ({ power, ones }: { power: string; ones: number }) => Promise<boolean>;
};

// Psychic powers on the selected combatant: one activation per Round (MANIFEST), and each Sustained power costs +2 DN
// to all its Tests (Core pp.259, 265, rules-flow §8, §11.180–181). The GM enters what was rolled; the app never rolls.
export function PsychicPanel({ name, manifested, conditions, known, onChange, onManifest }: PsychicPanelProps) {
  const [power, setPower] = useState("");
  const [ones, setOnes] = useState("0"); // Wrath Dice showing 1 on the activation
  const [offer, setOffer] = useState<string | null>(null); // a Sustained power just manifested: SUSTAIN is next
  const powers = sustainedPowers(conditions);
  const typed = power.trim();
  const sustainNext =
    !!typed &&
    offer === typed &&
    !conditions.includes(sustainEntry(typed)) &&
    known.some((p) => p.name === typed && isSustained(p.duration));
  const who = name.toUpperCase();

  // A blank or already sustained power is refused.
  const add = (p: string) => {
    if (!p.trim()) return;
    const entry = sustainEntry(p);
    if (conditions.includes(entry)) return;
    onChange({ conditions: [...conditions, entry], text: `${who} +${entry.toUpperCase()}` });
  };

  // MANIFEST: the typed power, with the Wrath 1s the GM read off the dice.
  const handleManifest = async () => {
    if (!typed || manifested) return;
    const ok = await onManifest({ power: typed, ones: Math.max(0, Math.min(9, Math.trunc(Number(ones)) || 0)) });
    if (!ok) return;
    setOnes("0");
    // Not added automatically: the activation may have failed. Offer it.
    setOffer(known.some((p) => p.name === typed && isSustained(p.duration)) ? typed : null);
  };

  // SUSTAIN: the typed power.
  const handleAdd = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    add(power);
    setPower("");
    setOffer(null);
  };

  // ×: the power stops being sustained.
  const handleDrop = (p: string) => {
    const entry = sustainEntry(p);
    onChange({ conditions: conditions.filter((k) => k !== entry), text: `${who} −${entry.toUpperCase()}` });
  };

  // END ALL: a failed Willpower Test, or the psyker stands down.
  const handleEndAll = () =>
    onChange({ conditions: conditions.filter((k) => !isSustain(k)), text: `${who} ENDED ALL SUSTAINED POWERS` });

  return (
    <div className="stack" style={{ gap: 6 }}>
      {manifested && <span className="chip warn">MANIFESTED THIS ROUND</span>}
      {known.length > 0 && (
        <div className="keys" style={{ paddingTop: 0 }}>
          {known.map((p) => (
            <button key={p.name} className="btn sm" type="button" onClick={() => setPower(p.name)}>
              {p.name.toUpperCase()}
              {isSustained(p.duration) ? " ⟳" : ""}
            </button>
          ))}
        </div>
      )}
      <form className="keys" style={{ paddingTop: 0 }} onSubmit={handleAdd}>
        <input
          className="input sm"
          aria-label={`Power ${name} manifests or sustains`}
          value={power}
          onChange={(e) => setPower(e.target.value)}
          placeholder="Power"
        />
        <input
          className="input sm"
          type="number"
          min={0}
          max={9}
          style={{ width: 64 }}
          aria-label="Wrath Dice showing 1"
          title="Wrath 1s"
          value={ones}
          onChange={(e) => setOnes(e.target.value)}
        />
        <button className="btn" type="button" disabled={!typed || manifested} onClick={handleManifest}>
          MANIFEST
        </button>
        <button className={sustainNext ? "btn primary" : "btn"} type="submit" disabled={!typed}>
          SUSTAIN
        </button>
        {powers.length > 0 && (
          <button className="btn danger" type="button" onClick={handleEndAll}>
            END ALL
          </button>
        )}
      </form>
      {powers.length > 0 && (
        <div className="keys" style={{ paddingTop: 0 }}>
          {powers.map((p) => (
            <span key={p} className="chip warn">
              {p.toUpperCase()}{" "}
              <button
                className="btn sm"
                type="button"
                aria-label={`Drop ${p} from ${name}`}
                onClick={() => handleDrop(p)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
