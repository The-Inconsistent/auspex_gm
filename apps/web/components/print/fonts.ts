import { Font } from "@react-pdf/renderer";

// The faces every printed sheet uses (cards, issue #203; handouts, issue #204). Plex Mono is the data-slate, form and
// vox face, as on the phone.
export const DISPLAY = "Cinzel";
export const SERIF = "Crimson Pro";
export const MONO = "IBM Plex Mono";

// The app's own faces, embedded, so a sheet prints the same from any device. Static instances: react-pdf can't use
// the variable fonts next/font serves (react-pdf.org/fonts). Plex Mono is IBM's own WOFF (@ibm/plex-mono): fontkit
// can't read Fontsource's subset of it ("Out of bounds access"). `base` is the origin in the browser, a file path in a test.
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
  Font.register({
    family: MONO,
    fonts: [
      { src: `${base}/fonts/ibm-plex-mono-regular.woff` },
      { src: `${base}/fonts/ibm-plex-mono-bold.woff`, fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]); // names and rules terms stay whole
}
