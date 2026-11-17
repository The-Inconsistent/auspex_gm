// Images renamed: a PDF image has no alt text, and the lint rule for an HTML <Image> would ask for one.
import { Document, Image as PdfImage, Page, pdf, Text } from "@react-pdf/renderer";

import { deriveStats } from "@wg/shared";

import type { Paper } from "@/lib/print-cards/constants";

import { PageOne } from "./components/page-one/page-one";
import { PageTwo } from "./components/page-two/page-two";
import type { SheetInput } from "./sheet-input";
import { st, type SheetStyle } from "./styles";

// `art`: the origin /sheet/*.png is served from (location.origin in the browser).
type CharacterSheetProps = { sheet: SheetInput; style: SheetStyle; paper: Paper; art: string };

// Each paper in points, for the full-bleed art.
const PAGE_PT: Record<Paper, { width: number; height: number }> = {
  A4: { width: 595.28, height: 841.89 },
  LETTER: { width: 612, height: 792 },
};

// The permission printed on Cubicle 7's own sheet, kept on ours since it is that sheet redrawn.
const PERMISSION =
  "Cubicle 7 Entertainment Ltd © Games Workshop Limited 2021. Permission is granted to photocopy for personal use.";

// Each page's backdrop: for the full-art look, the parchment and the iron frame, repeated on any page a long sheet
// runs on to; the permission line at the foot of every page.
function Backdrop({ style, art, paper }: { style: SheetStyle; art: string; paper: Paper }) {
  const bleed = [st.bleed, PAGE_PT[paper]]; // in points: a percentage height keeps the image's own ratio
  return (
    <>
      {style === "art" && (
        <>
          <PdfImage fixed src={`${art}/sheet/art-page.jpg`} style={bleed} />
          <PdfImage fixed src={`${art}/sheet/art-border.png`} style={bleed} />
        </>
      )}
      <Text fixed style={style === "art" ? [st.foot, st.footArt] : st.foot}>
        {PERMISSION}
      </Text>
    </>
  );
}

// The Agent on Cubicle 7's official two-page character sheet (the Core pp.40–41 one; its PDFs sit in the gitignored
// character_sheet/), redrawn so a long Talent list runs on instead of clipping. Built in the viewer's own browser;
// nothing is uploaded.
export function CharacterSheet({ sheet, style, paper, art }: CharacterSheetProps) {
  const d = deriveStats({ stats: sheet.stats, overrides: sheet.overrides, tier: sheet.tier });
  const page = style === "art" ? [st.page, st.pageArt] : st.page;
  return (
    <Document title={`${sheet.name}: character sheet`} creator="Auspex">
      <Page size={paper} style={page}>
        <Backdrop style={style} art={art} paper={paper} />
        <PageOne sheet={sheet} d={d} style={style} art={art} />
      </Page>
      <Page size={paper} style={page}>
        <Backdrop style={style} art={art} paper={paper} />
        <PageTwo sheet={sheet} d={d} art={art} />
      </Page>
    </Document>
  );
}

export const sheetPdf = (props: CharacterSheetProps) => pdf(<CharacterSheet {...props} />).toBlob();
