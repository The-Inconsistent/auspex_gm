import { LibraryCharacter } from "@wg/shared";

import { apiSend } from "@/app/server-api";

// Relative Location, so the redirect stays on whatever host the phone used.
const to = (path: string) => new Response(null, { status: 303, headers: { location: path } });

// NEW CHARACTER (issue #14): starts an empty row, so the builder has somewhere to autosave its draft, then opens it.
// A GET that writes, because it's a plain link from the lobby; the row is empty, so a repeat is harmless.
export async function GET() {
  let res: Response;
  try {
    res = await apiSend("/api/library", { method: "POST" });
  } catch {
    return to("/?library=nosignal");
  }
  if (res.status === 401) return to("/sign-in");
  // Refused: the caller is at the cap (LIBRARY_CAP). The lobby says so.
  if (res.status === 400) return to("/?library=full");
  if (!res.ok) return to("/?library=nosignal");
  const parsed = LibraryCharacter.safeParse(await res.json().catch(() => null));
  return to(parsed.success ? `/library/${parsed.data.id}` : "/?library=nosignal");
}
