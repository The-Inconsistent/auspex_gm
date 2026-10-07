import { StyleSheet } from "@react-pdf/renderer";

import { TOKENS } from "@/lib/tokens/tokens";

// Ink on white paper: the vellum fill would cost a cartridge a sheet. Crimson marks rubrics only, as on screen.
export const DISPLAY = "Cinzel";
export const SERIF = "Crimson Pro";

export const s = StyleSheet.create({
  card: { position: "absolute", borderWidth: 0.4, borderColor: TOKENS.line, overflow: "hidden" },
  pad: { padding: "3mm" },
  head: { fontFamily: DISPLAY, fontWeight: 700, color: TOKENS.ink },
  rubric: { fontFamily: DISPLAY, fontWeight: 700, color: TOKENS.red },
  body: { fontFamily: SERIF, color: TOKENS.ink },
  dim: { color: TOKENS.ink3 },
  rule: { borderBottomWidth: 0.6, borderBottomColor: TOKENS.red, marginBottom: "1mm", paddingBottom: "0.6mm" },
});
