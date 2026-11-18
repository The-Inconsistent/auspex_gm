import { Text, View } from "@react-pdf/renderer";

import type { DerivedStats } from "@wg/shared";

import type { SheetInput } from "@/lib/sheet-input/sheet-input";
import { st } from "../../styles";
import { padTo, Row, SheetBox, Stat } from "../sheet-parts/sheet-parts";

type PageTwoProps = { sheet: SheetInput; d: DerivedStats; art: string };

const POWER_FLEX = [2.4, 0.6, 1.3, 1.3, 1, 1, 3];
const LEVELS = [1, 2, 3, 4, 5];

// The sheet's second page (Core p.41): Talents & Abilities with Faith, Injuries & Corruption, Psychic Powers, Notes,
// Stealth and XP. Faith, Memorable Injuries, Corruption, Stealth and Notes are left for pencil. A long Talent list runs
// on to another page.
export function PageTwo({ sheet, d, art }: PageTwoProps) {
  const s = sheet.stats;
  const rules = [...s.abilities, ...s.talents];
  return (
    <>
      <SheetBox title="TALENTS & ABILITIES" art={art} wrap>
        <View style={st.row}>
          <View style={{ flex: 1, paddingRight: 8, minHeight: 120 }}>
            {rules.map((r, i) => (
              <Text key={`${r.name}-${i}`} style={[st.text, { marginBottom: 3 }]}>
                <Text style={{ fontWeight: 700 }}>{r.name}</Text>
                {r.page ? <Text style={st.cap}> ({r.page})</Text> : null}
                {r.text ? `: ${r.text}` : ""}
              </Text>
            ))}
          </View>
          <View style={{ width: 78, borderWidth: 0.5, alignSelf: "flex-start" }} wrap={false}>
            <Text style={[st.title, { paddingVertical: 4, borderBottomWidth: 0.5 }]}>FAITH</Text>
            <View style={{ height: 34 }} />
            <Text style={[st.label, { padding: 2 }]}>Max</Text>
          </View>
        </View>
      </SheetBox>

      <SheetBox title="INJURIES & CORRUPTION" art={art} wrap>
        <View style={st.row}>
          <View style={{ flex: 1, paddingRight: 5 }}>
            <Text style={[st.labelBold, { textAlign: "center" }]}>TRAUMATIC INJURIES</Text>
            <View style={[st.row, { justifyContent: "space-between", marginVertical: 2 }]}>
              <Text style={st.label}>Maximum {d.maxTraumatic}</Text>
              <Text style={st.cap}>= Tier + 1</Text>
            </View>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <Text key={n} style={[st.text, st.rule, { height: 13 }]}>
                {n}.
              </Text>
            ))}
          </View>
          <View style={{ flex: 1, paddingHorizontal: 5, borderLeftWidth: 1.2 }}>
            <Text style={[st.labelBold, { textAlign: "center" }]}>MEMORABLE INJURIES</Text>
          </View>
          <View style={{ flex: 1, paddingHorizontal: 5, borderLeftWidth: 1.2 }}>
            <Text style={[st.labelBold, { textAlign: "center", marginBottom: 3 }]}>MUTATIONS</Text>
            {s.mutations.map((m) => (
              <Text key={m.id} style={[st.text, { marginBottom: 2 }]}>
                <Text style={{ fontWeight: 700 }}>{m.name}</Text>
                <Text style={st.cap}> (Core p.{m.page})</Text>: {m.effect}
              </Text>
            ))}
          </View>
          <View style={{ width: 92, paddingLeft: 5, borderLeftWidth: 1.2 }}>
            <View style={[st.row, { justifyContent: "space-between", marginBottom: 4 }]}>
              <Text style={st.labelBold}>CORRUPTION</Text>
              <Text style={st.label}>Level</Text>
            </View>
            {LEVELS.map((n) => (
              <View key={n} style={[st.row, { alignItems: "center", marginBottom: 3 }]}>
                {LEVELS.map((i) => (
                  <View key={i} style={st.pip} />
                ))}
                <Text style={[st.label, { marginLeft: 6 }]}>{n}</Text>
              </View>
            ))}
          </View>
        </View>
      </SheetBox>

      <SheetBox title="PSYCHIC POWERS" art={art} wrap>
        <Row head cells={["Power", "DN", "Activation", "Duration", "Range", "Target", "Effect"]} flex={POWER_FLEX} />
        {padTo(s.powers ?? [], 5).map((p, i) => (
          <Row
            key={i}
            height={17}
            flex={POWER_FLEX}
            cells={p ? [`${p.name} (${p.page})`, p.dn, p.activation, p.duration, p.range] : []}
          />
        ))}
      </SheetBox>

      <View style={[st.row, { borderTopWidth: 2.4 }]} wrap={false}>
        <View style={{ flex: 1, borderRightWidth: 2.4 }}>
          <SheetBox title="NOTES" art={art} style={{ borderTopWidth: 0 }}>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <View key={n} style={[st.rule, { height: 14 }]} />
            ))}
          </SheetBox>
        </View>
        <View style={{ width: 150 }}>
          <View style={[st.row, st.rule]}>
            <Stat label="STEALTH" style={{ minHeight: 50 }} />
            <Stat
              label="Passive Awareness"
              value={d.passiveAwareness}
              cap="= Awareness Total / 2"
              style={{ borderLeftWidth: 0.5, minHeight: 50 }}
            />
          </View>
          <View style={st.row}>
            <Stat label="XP EARNED" value={sheet.xp} style={{ minHeight: 50 }} />
            <Stat
              label="CURRENT XP"
              value={Math.max(0, sheet.xp - sheet.xpSpent)}
              style={{ borderLeftWidth: 0.5, minHeight: 50 }}
            />
          </View>
        </View>
      </View>
    </>
  );
}
