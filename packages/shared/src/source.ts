import { z } from "zod";

// Books the data draws on (creation, wargear, rules, threats), in precedence order: when one thing is printed in several
// books only the first listed is transcribed, and the others are cited in its `note` (docs/data.md). Official beats
// homebrew, then newest printing wins.
export const SOURCES = {
  "vow-of-absolution": { cite: "VoA", official: true, pages: "printed" }, // Apr 2024 printing
  "inheritance-of-embers": { cite: "IoE", official: true, pages: "printed" }, // Jan 2024
  "forsaken-system": { cite: "FSPG", official: true, pages: "printed" }, // 2021
  core: { cite: "Core", official: true, pages: "printed" }, // 2020
  apocrypha: { cite: "Apocrypha", official: false, pages: "printed" }, // homebrew, v9 2023
  "legacy-of-the-necrontyr": { cite: "Necrontyr", official: false, pages: "pdf" }, // homebrew, no printed pages
} as const;
export type Source = keyof typeof SOURCES;
export const Source = z.enum(Object.keys(SOURCES) as [Source, ...Source[]]);
export const sourceCite = ({ source, page }: { source: Source; page: number }) => `${SOURCES[source].cite} p.${page}`;
