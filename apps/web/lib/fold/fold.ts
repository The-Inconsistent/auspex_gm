// Case-insensitive, and punctuation is ignored on both sides, so a typed "tau" finds "T'au" and "Kommandos" finds
// "Kommandoz"-style apostrophes. Curly quotes fold with the rest (as rules-ref does). Letters keep their identity: an
// accent is decomposed and dropped, but the letter it sat on survives, so a typed "é" narrows instead of folding away
// to an empty query that would match the whole bestiary.
export const fold = (s: string) =>
  s
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\p{M}+/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
