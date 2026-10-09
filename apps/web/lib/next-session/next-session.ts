// The next session's date (issue #197): stored as UTC, typed and shown in each viewer's own time zone (decision 1).

const pad = (n: number) => String(n).padStart(2, "0");

// A stored date as a `datetime-local` input's value, in this browser's zone ("" for none).
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// A `datetime-local` value, read in this browser's zone, as the UTC date campaign.update takes (null for none).
export function fromLocalInput(value: string): string | null {
  const d = new Date(value); // a date-time with no offset is local time (ECMAScript Date.parse)
  return value && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}

// The line INTEL and the lobby show: "Sat 12 Oct, 18:00 · Mike's flat".
export function nextSessionLine(iso: string, place = ""): string {
  const when = new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return place ? `${when} · ${place}` : when;
}
