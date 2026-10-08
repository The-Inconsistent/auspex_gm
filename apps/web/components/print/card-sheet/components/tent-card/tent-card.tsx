// Renamed: a PDF image has no alt text, and the lint rule for an HTML <Image> would ask for one.
import { Image as PdfImage, Text, View } from "@react-pdf/renderer";

import type { Card } from "@/lib/print-cards/print-cards";
import { TOKENS } from "@/lib/tokens/tokens";

import { s } from "../../styles";

type Tent = Extract<Card, { kind: "tent" }>;
type TentCardProps = { tent: Tent; picture: string | undefined };

const STATS: [keyof Tent["stats"], string][] = [
  ["defence", "DEFENCE"],
  ["resilience", "RESILIENCE"],
  ["speed", "SPEED"],
  ["wounds", "WOUNDS"],
  ["shock", "SHOCK"],
  ["conviction", "CONVICTION"],
];

// A long name steps down so it stays on the face the players read across the table.
const nameSize = (name: string) => (name.length <= 14 ? 17 : name.length <= 24 ? 13 : 10);

// Folded across the middle, it stands up behind the miniature (issue #203). The top half is printed upside down so it
// reads the right way up once folded: the players' side, with the name and portrait. The GM's side faces back across
// the table with the six numbers a Test needs (Decision 2: no abilities; the Threat card holds those).
export function TentCard({ tent, picture }: TentCardProps) {
  const half = { height: "44mm", padding: "3mm", alignItems: "center", justifyContent: "center" } as const;
  return (
    <>
      <View style={{ ...half, transform: "rotate(180deg)" }}>
        {tent.marker && (
          <View
            style={{
              position: "absolute",
              top: "2mm",
              left: "2mm",
              width: "6mm",
              height: "6mm",
              borderRadius: "3mm",
              borderWidth: 0.8,
              borderColor: TOKENS.ink,
              backgroundColor: TOKENS.marker[tent.marker],
            }}
          />
        )}
        {picture && <PdfImage src={picture} style={{ height: "22mm", marginBottom: "1.5mm", objectFit: "contain" }} />}
        <Text style={{ ...s.head, fontSize: nameSize(tent.name), textAlign: "center" }}>{tent.name.toUpperCase()}</Text>
      </View>
      <View style={{ height: 0, borderTopWidth: 0.6, borderTopColor: TOKENS.line, borderStyle: "dashed" }} />
      <View style={{ ...half, justifyContent: "flex-start" }}>
        <Text style={{ ...s.head, fontSize: 8, marginBottom: "2mm", textAlign: "center" }}>
          {tent.name.toUpperCase()}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", width: "100%" }}>
          {STATS.map(([k, label]) => (
            <View key={k} style={{ width: "33.33%", alignItems: "center", marginBottom: "2mm" }}>
              <Text style={{ ...s.rubric, fontSize: 5.5 }}>{label}</Text>
              <Text style={{ ...s.body, fontSize: 16, fontWeight: 700 }}>{tent.stats[k] ?? "–"}</Text>
            </View>
          ))}
        </View>
      </View>
    </>
  );
}
