import { Text, View } from "@react-pdf/renderer";

import { applyMods, sheetWeapon, sourceCite, type WargearWeapon } from "@wg/shared";

import type { Card } from "@/lib/print-cards/print-cards";
import { weaponLine } from "@/lib/weapon-line/weapon-line";

import { s } from "../../styles";

type ItemCardProps = { card: Extract<Card, { kind: "item" }> };

// The card the GM hands over with GIVE (issue #51): what the Agents are told, then the catalogue entry with a relic's
// Powers applied, as CODEX › ITEMS shows it (rules-flow.md §11.116). Never the GM's notes.
export function ItemCard({ card: { item, entry } }: ItemCardProps) {
  const weapon = entry?.weapon
    ? applyMods(sheetWeapon(entry as { name: string; weapon: WargearWeapon }, 0), item.mods)
    : null;
  const text = { ...s.body, fontSize: 8, lineHeight: 1.2 };
  return (
    <View style={s.pad}>
      <Text style={{ ...s.head, ...s.rule, fontSize: 11 }}>{item.name.toUpperCase()}</Text>
      {item.description && (
        <Text style={{ ...text, fontStyle: "italic", marginBottom: "2mm" }}>{item.description}</Text>
      )}
      {entry && (
        <>
          <Text style={{ ...s.rubric, fontSize: 6.5 }}>
            {[
              entry.kind.toUpperCase(),
              entry.value !== null ? `VALUE ${entry.value}` : null,
              entry.rarity?.toUpperCase() ?? null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          {entry.name !== item.name && <Text style={{ ...text, fontWeight: 700 }}>{entry.name}</Text>}
          {weapon && (
            <>
              <Text style={text}>{weaponLine({ weapon: weapon.weapon })}</Text>
              {weapon.notes.map((n, i) => (
                <Text key={i} style={{ ...text, ...s.dim }}>
                  {n}
                </Text>
              ))}
            </>
          )}
          {entry.effect && <Text style={{ ...text, marginTop: "1mm" }}>{entry.effect}</Text>}
          <Text style={{ ...text, ...s.dim, fontStyle: "italic", marginTop: "1mm" }}>{sourceCite(entry)}</Text>
        </>
      )}
    </View>
  );
}
