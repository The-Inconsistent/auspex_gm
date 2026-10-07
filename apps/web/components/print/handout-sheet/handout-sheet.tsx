import { Circle, Document, Page, pdf, Svg, Text, View } from "@react-pdf/renderer";

import { headerOf } from "@/components/ui/handout-doc/constants";
import type { HandoutPaper } from "@/lib/print-cards/constants";
import type { HandoutPage } from "@/lib/print-cards/print-cards";
import { TOKENS } from "@/lib/tokens/tokens";
import { voxLines } from "@/lib/vox-lines/vox-lines";

import { DISPLAY, MONO, SERIF } from "../fonts";

import { NoiseStrip } from "./components/noise-strip/noise-strip";

type HandoutSheetProps = { pages: HandoutPage[]; paper: HandoutPaper };

const INSET = "7mm"; // the frame's distance from the paper edge, inside a home printer's margin
const mono = { fontFamily: MONO, fontSize: 9.5, lineHeight: 1.45, color: TOKENS.ink };

// The frame a style draws round every page of its handout, so a long one still looks like the same prop on page 2.
function Frame({ style }: { style: HandoutPage["style"] }) {
  const at = (inset: string) => ({
    position: "absolute" as const,
    top: inset,
    left: inset,
    right: inset,
    bottom: inset,
  });
  if (style === "plain") return null;
  if (style === "decree")
    return (
      <>
        <View fixed style={{ ...at(INSET), borderWidth: 1.6, borderColor: TOKENS.ink }} />
        <View fixed style={{ ...at("8.6mm"), borderWidth: 0.5, borderColor: TOKENS.ink }} />
      </>
    );
  const border = { slate: 4, form: 1.4, vox: 0.6 }[style];
  return <View fixed style={{ ...at(INSET), borderWidth: border, borderColor: TOKENS.ink }} />;
}

// One handout as the printed prop (issue #204): the frames HandoutDoc draws on the phone, in ink on white. The header
// and text start on page 1 and flow on if the text runs long; the frame repeats on every page.
function HandoutBody({ page }: { page: HandoutPage }) {
  const head = headerOf(page);
  if (page.style === "vox") {
    const lines = voxLines(page.body);
    const stampW = Math.max(0, ...lines.map((l) => l.stamp?.length ?? 0)); // the column is as wide as the longest
    return (
      <>
        <Text style={{ ...mono, color: TOKENS.red, letterSpacing: 1 }}>{head}</Text>
        <NoiseStrip />
        {lines.map((l, i) => (
          <View key={i} style={{ flexDirection: "row" }} wrap={false}>
            {stampW > 0 && (
              <Text style={{ ...mono, color: TOKENS.red, width: stampW * mono.fontSize * 0.62 + 6 }}>
                {l.stamp ?? ""}
              </Text>
            )}
            <Text style={{ ...mono, flex: 1 }}>{l.text || " "}</Text>
          </View>
        ))}
        <NoiseStrip />
      </>
    );
  }
  if (page.style === "decree")
    return (
      <>
        <Text style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 15, color: TOKENS.red, textAlign: "center" }}>
          {head}
        </Text>
        <Text style={{ fontFamily: SERIF, fontSize: 11.5, lineHeight: 1.4, color: TOKENS.ink, marginTop: "5mm" }}>
          {page.body}
        </Text>
        <View wrap={false} style={{ flexDirection: "row", alignItems: "center", marginTop: "8mm" }}>
          <Svg viewBox="0 0 52 52" style={{ width: "14mm", height: "14mm" }}>
            <Circle
              cx={26}
              cy={26}
              r={21}
              fill={TOKENS.red}
              stroke={TOKENS.red}
              strokeWidth={6}
              strokeDasharray="3 2.2"
            />
            <Circle cx={26} cy={26} r={13} fill="none" stroke={TOKENS.vellum} strokeWidth={1.5} />
          </Svg>
          <View style={{ flex: 1, marginLeft: "4mm", borderTopWidth: 0.6, borderTopColor: TOKENS.ink, paddingTop: 2 }}>
            <Text style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 10, textAlign: "right" }}>
              Signed and sealed
            </Text>
          </View>
        </View>
      </>
    );
  return (
    <>
      {page.style === "form" ? (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            borderBottomWidth: 1,
            borderBottomColor: TOKENS.ink,
            paddingBottom: "2mm",
            marginBottom: "4mm",
          }}
        >
          <Text style={{ ...mono, fontWeight: 700 }}>{head}</Text>
          <View
            style={{ width: "16mm", height: "16mm", borderWidth: 0.8, borderColor: TOKENS.red, borderStyle: "dashed" }}
          />
        </View>
      ) : head ? (
        <Text
          style={{
            ...mono,
            color: TOKENS.red,
            letterSpacing: 1,
            textAlign: page.style === "slate" ? "center" : "left",
            marginBottom: "4mm",
          }}
        >
          {head}
        </Text>
      ) : null}
      <Text style={mono}>{page.body}</Text>
    </>
  );
}

// Handouts, one to a page at A5, A4 or Letter (Decision 1 on #204). The printer's "2 pages per sheet" puts two A5 pages
// on one A4 sheet.
export function HandoutSheet({ pages, paper }: HandoutSheetProps) {
  return (
    <Document title="Auspex handouts" creator="Auspex">
      {pages.map((page) => (
        <Page key={page.id} size={paper} style={{ padding: "15mm 14mm" }}>
          <Frame style={page.style} />
          <HandoutBody page={page} />
        </Page>
      ))}
    </Document>
  );
}

export const handoutsPdf = (props: HandoutSheetProps) => pdf(<HandoutSheet {...props} />).toBlob();
