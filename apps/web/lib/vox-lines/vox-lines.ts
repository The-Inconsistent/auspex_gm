// A vox transcript's lines (issue #204): a line that starts with a bracketed stamp, `[03:12] Hold the line`, sets the
// stamp in its own column; every other line is kept as written (a speaker's name, a gap, static).
export type VoxLine = { stamp?: string; text: string };

const STAMPED = /^\[([^\]\n]{1,24})\]\s?(.*)$/;

export function voxLines(body: string): VoxLine[] {
  return body.split("\n").map((line) => {
    const m = STAMPED.exec(line);
    return m ? { stamp: m[1], text: m[2] ?? "" } : { text: line };
  });
}
