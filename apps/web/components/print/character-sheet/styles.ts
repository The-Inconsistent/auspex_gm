import { StyleSheet } from "@react-pdf/renderer";

import { TOKENS } from "@/lib/tokens/tokens";

import { DISPLAY, SERIF } from "../fonts";

export type { SheetStyle } from "./constants";

export const INK = TOKENS.ink;
const FAINT = "#8f8c86"; // the sheet's grey formula captions ("= Wil − 1")

export const st = StyleSheet.create({
  page: { fontFamily: SERIF, fontSize: 9, color: INK, paddingTop: 26, paddingBottom: 30, paddingHorizontal: 26 },
  // Inside the iron frame, whose frieze runs deeper at the top.
  pageArt: { paddingTop: 40, paddingBottom: 46, paddingHorizontal: 34 },
  bleed: { position: "absolute", top: 0, left: 0 },
  foot: { position: "absolute", left: 0, right: 0, bottom: 12, textAlign: "center", fontSize: 5.5, color: FAINT },
  footArt: { bottom: 30 },
  row: { flexDirection: "row" },
  // A section: the sheet's heavy rule over it, its title, then the flourish.
  box: { borderTopWidth: 2.4, borderTopColor: INK, paddingTop: 3, paddingHorizontal: 5, paddingBottom: 5 },
  title: { fontFamily: DISPLAY, fontWeight: 700, fontSize: 9, textAlign: "center" },
  flourish: { width: "86%", alignSelf: "center", marginTop: 1, marginBottom: 4 }, // height from the image's own ratio
  label: { fontFamily: DISPLAY, fontSize: 6.5 },
  labelBold: { fontFamily: DISPLAY, fontWeight: 700, fontSize: 7 },
  value: { fontWeight: 700, fontSize: 12 },
  cap: { fontSize: 6, color: FAINT },
  text: { fontSize: 8, lineHeight: 1.25 },
  rule: { borderBottomWidth: 0.5, borderBottomColor: INK },
  cell: {
    borderLeftWidth: 0.5,
    borderLeftColor: INK,
    paddingHorizontal: 3,
    paddingVertical: 2,
    justifyContent: "center",
  },
  pip: { width: 7, height: 7, borderRadius: 3.5, borderWidth: 0.6, borderColor: INK, marginRight: 2.5 },
});
