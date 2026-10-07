import { Document, Font, Page, pdf, View } from "@react-pdf/renderer";

import { CARD_COLS, CARD_H_MM, CARD_ROWS, CARD_W_MM, PAPER_MM, type Paper } from "@/lib/print-cards/constants";
import type { Card, Placed } from "@/lib/print-cards/print-cards";

import { ItemCard } from "./components/item-card/item-card";
import { TentCard } from "./components/tent-card/tent-card";
import { ThreatCard } from "./components/threat-card/threat-card";
import { DISPLAY, s, SERIF } from "./styles";

type CardSheetProps = { pages: Placed[][]; paper: Paper; pictures: Map<Card, string> };

// The app's own faces, embedded, so the sheet prints the same from any device. Static instances: react-pdf can't use
// the variable fonts next/font serves (react-pdf.org/fonts). `base` is the origin in the browser, a file path in a test.
export function registerFonts(base: string) {
  Font.register({
    family: DISPLAY,
    fonts: [
      { src: `${base}/fonts/cinzel-latin-400-normal.woff` },
      { src: `${base}/fonts/cinzel-latin-700-normal.woff`, fontWeight: 700 },
    ],
  });
  Font.register({
    family: SERIF,
    fonts: [
      { src: `${base}/fonts/crimson-pro-latin-400-normal.woff` },
      { src: `${base}/fonts/crimson-pro-latin-700-normal.woff`, fontWeight: 700 },
      { src: `${base}/fonts/crimson-pro-latin-400-italic.woff`, fontStyle: "italic" },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]); // names and rules terms stay whole
}

// Poker cards at true size on a centred 3 × 3 grid (issue #203). Each card sits at absolute mm, so the printer's own
// scaling is the only thing that can move it: the dialog says to print at 100 %.
export function CardSheet({ pages, paper, pictures }: CardSheetProps) {
  const sheet = PAPER_MM[paper];
  const left = (sheet.w - CARD_COLS * CARD_W_MM) / 2;
  const top = (sheet.h - CARD_ROWS * CARD_H_MM) / 2;
  return (
    <Document title="Auspex cards" creator="Auspex">
      {pages.map((page, i) => (
        <Page key={i} size={paper}>
          {page.map(({ card, col, row, span }, j) => (
            <View
              key={j}
              wrap={false}
              style={{
                ...s.card,
                left: `${left + col * CARD_W_MM}mm`,
                top: `${top + row * CARD_H_MM}mm`,
                width: `${span.cols * CARD_W_MM}mm`,
                height: `${span.rows * CARD_H_MM}mm`,
              }}
            >
              {card.kind === "tent" && <TentCard tent={card} picture={pictures.get(card)} />}
              {card.kind === "threat" && <ThreatCard card={card} />}
              {card.kind === "item" && <ItemCard card={card} />}
            </View>
          ))}
        </Page>
      ))}
    </Document>
  );
}

export const cardsPdf = (props: CardSheetProps) => pdf(<CardSheet {...props} />).toBlob();
