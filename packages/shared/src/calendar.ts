// The next session as a calendar file (issue #197): one VEVENT, built by hand (RFC 5545), so any calendar app can add it.
// The app keeps no session length, so the event is a fixed 3 hours (issue #197 decision 2).

export const NEXT_SESSION_HOURS = 3;

export type IcsEvent = {
  uid: string;
  start: Date;
  summary: string;
  location: string;
  stamp?: Date; // when the file was made; now by default
};

// RFC 5545 §3.3.5: a UTC date-time, YYYYMMDDTHHMMSSZ.
export const icsDate = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

// RFC 5545 §3.3.11: backslash, comma and semicolon escaped, a line break as \n.
export const icsText = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/[,;]/g, (c) => `\\${c}`)
    .replace(/\r\n|\r|\n/g, "\\n");

// RFC 5545 §3.1: a content line is at most 75 octets; a longer one folds onto lines that start with a space. Splits by
// code point, so a long name in another script still folds on whole characters.
function fold(line: string) {
  const bytes = (s: string) => new TextEncoder().encode(s).length;
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (bytes(cur + ch) > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
    }
    cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

// The whole file, CRLF line ends throughout (RFC 5545 §3.1).
export function toIcs({ uid, start, summary, location, stamp = new Date() }: IcsEvent): string {
  const end = new Date(start.getTime() + NEXT_SESSION_HOURS * 3600_000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Auspex//Wrath & Glory table companion//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${icsText(uid)}`,
    `DTSTAMP:${icsDate(stamp)}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsText(summary)}`,
    ...(location ? [`LOCATION:${icsText(location)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
