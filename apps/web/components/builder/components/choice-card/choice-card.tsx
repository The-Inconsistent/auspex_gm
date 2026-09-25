"use client";
import { wargearMatches, type BuildChoicePrompt } from "@wg/shared";

import { useBuilder } from "../../builder-context";
import { citeLabel } from "../../utils";
import { RecordList, type RecordItem } from "../record-list/record-list";

type ChoiceCardProps = { prompt: BuildChoicePrompt };

// One choice a grant asks for ("Choose 1: Plasma Pistol / Grav-pistol", "Pick 1 Uncommon wargear"), answered in
// build.choices by its path. Picking past the count replaces the oldest pick.
export function ChoiceCard({ prompt: p }: ChoiceCardProps) {
  const { setChoice, catalogue, lookups, resolved, tier } = useBuilder();

  // Picks one more answer; a single choice swaps, a full multiple choice drops the oldest.
  const pickValue = (v: string | number) => {
    const has = p.answer.includes(v);
    if (has)
      return setChoice(
        p.path,
        p.answer.filter((x) => x !== v),
      );
    setChoice(p.path, p.choose === 1 ? [v] : [...p.answer, v].slice(-p.choose));
  };

  let items: RecordItem[];
  switch (p.pick.kind) {
    case "option":
      items = p.options.map((label, i) => ({ id: String(i), label }));
      break;
    case "wargear": {
      const f = p.pick.filter;
      items = [...catalogue.wargear.values()]
        .filter((w) => wargearMatches(w, f, { tier, newTier: tier }))
        .map((w) => ({ id: w.id, label: w.name, meta: `${w.rarity ?? "–"} · Value ${w.value ?? "–"} · ${w.category}` }))
        .sort((a, b) => a.label.localeCompare(b.label));
      break;
    }
    case "skill":
    case "attribute":
      items = p.pick.from.map((x) => ({ id: x, label: x }));
      break;
    case "discipline": {
      const from = p.pick.from;
      items = [...lookups.disciplines.values()]
        .filter((d) => !from || from.includes(d.id))
        .map((d) => ({ id: d.id, label: d.name }));
      break;
    }
    case "power": {
      const ds = p.pick.disciplines;
      items = [...lookups.powers.values()]
        .filter((pw) => [pw.disciplineId, ...pw.alsoIn].some((d) => ds.includes(d)))
        .map((pw) => ({ id: pw.id, label: pw.name, meta: lookups.disciplines.get(pw.disciplineId)?.name }));
      break;
    }
    case "keyword":
      items = (resolved?.sheet.keywords ?? []).map((k) => ({ id: k, label: k }));
      break;
  }
  const byIndex = p.pick.kind === "option";
  const selected = p.answer.map(String);
  const done = p.answer.length >= p.choose;

  return (
    <fieldset className={`panel pad stack bld-choice ${done ? "" : "open"}`}>
      <legend className="label">
        {p.what}
        {p.cite && ` · ${citeLabel(p.cite)}`}
        {done ? " · CHOSEN" : ` · ${p.choose - p.answer.length} TO PICK`}
      </legend>
      {p.of && !byIndex && <div className="dim">{p.of}</div>}
      <RecordList
        items={items}
        selected={selected}
        label={p.what}
        onPick={(id) => pickValue(byIndex ? Number(id) : id)}
      />
      {p.what.startsWith("Choose up to") && p.answer.length === 0 && (
        <button className="btn sm" onClick={() => setChoice(p.path, [])}>
          TAKE NONE
        </button>
      )}
    </fieldset>
  );
}
