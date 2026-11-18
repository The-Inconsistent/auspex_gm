import { Image as PdfImage, Text, View, type Styles } from "@react-pdf/renderer";
import type { ReactNode } from "react";

import { st } from "../../styles";

type Style = Styles[string];

// One of the sheet's sections: the heavy rule, the Cinzel title and the flourish under it. `art` is the origin the
// flourish image is served from.
export function SheetBox({
  title,
  art,
  style,
  wrap = false,
  children,
}: {
  title?: string;
  art: string;
  style?: Style;
  wrap?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={style ? [st.box, style] : st.box} wrap={wrap}>
      {title && (
        <View wrap={false}>
          <Text style={st.title}>{title}</Text>
          <PdfImage src={`${art}/sheet/flourish.png`} style={st.flourish} />
        </View>
      )}
      {children}
    </View>
  );
}

// A labelled line of the sheet's head: "Tier: ____".
export function Field({ label, value, style }: { label: string; value?: string | number; style?: Style }) {
  return (
    <View
      style={
        style
          ? [st.row, { alignItems: "flex-end", marginBottom: 5 }, style]
          : [st.row, { alignItems: "flex-end", marginBottom: 5 }]
      }
    >
      <Text style={[st.label, { fontSize: 8, marginRight: 3 }]}>{label}</Text>
      <View style={[st.rule, { flex: 1, minHeight: 11 }]}>
        <Text style={{ fontSize: 9, fontWeight: 700 }}>{value ?? ""}</Text>
      </View>
    </View>
  );
}

const STAT = { flexGrow: 1, flexBasis: 0, padding: 3, minHeight: 32 };

// A worked-out number: its label, the value (blank for pencil when undefined) and the sheet's grey formula.
export function Stat({
  label,
  value,
  cap,
  style,
}: {
  label: string;
  value?: string | number;
  cap?: string;
  style?: Style;
}) {
  return (
    <View style={style ? [STAT, style] : STAT}>
      <Text style={st.labelBold}>{label}</Text>
      <Text style={[st.value, { flexGrow: 1 }]}>{value ?? ""}</Text>
      {cap && <Text style={st.cap}>{cap}</Text>}
    </View>
  );
}

// A table row of fixed-ratio cells; `head` sets the column titles in the sheet's small Cinzel.
export function Row({
  cells,
  flex,
  head = false,
  height = 15,
}: {
  cells: (string | number | undefined)[];
  flex: number[];
  head?: boolean;
  height?: number;
}) {
  return (
    <View style={[st.row, st.rule, { minHeight: head ? 11 : height }]} wrap={false}>
      {flex.map((f, i) => (
        <View key={i} style={[st.cell, { flex: f }, i === 0 ? { borderLeftWidth: 0 } : {}]}>
          <Text style={head ? st.label : { fontSize: i === 0 ? 8.5 : 8 }}>{cells[i] ?? ""}</Text>
        </View>
      ))}
    </View>
  );
}

// Blank rows to a minimum, so a short list still leaves pencil room, as the sheet's empty table does.
export const padTo = <T,>(rows: T[], min: number): (T | null)[] => [
  ...rows,
  ...Array.from({ length: Math.max(0, min - rows.length) }, () => null),
];
