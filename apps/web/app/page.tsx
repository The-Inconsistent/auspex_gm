import { cookies } from "next/headers";

import { Me, Threat } from "@wg/shared";

import { API_ORIGIN, JOIN_ERRORS, TOKEN_COOKIE, type JoinError } from "@/app/constants";
import { GmApp } from "@/components/gm/gm-app/gm-app";
import { PlayerApp } from "@/components/player/player-app/player-app";
import { StatusScreen } from "@/components/ui/status-screen/status-screen";

type HomeProps = { searchParams: Promise<{ join?: string | string[] }> };

const NO_ACCESS = "NO ACCESS. SCAN THE QR CODE ON THE GM'S TABLET.";

const isJoinError = (v: unknown): v is JoinError => typeof v === "string" && Object.hasOwn(JOIN_ERRORS, v);

// GET an api route as the caller: the login cookie is httpOnly, so only the server can forward it.
async function apiGet({ path, token }: { path: string; token: string }) {
  const res = await fetch(`${API_ORIGIN}${path}`, {
    headers: { cookie: `${TOKEN_COOKIE}=${encodeURIComponent(token)}` },
    cache: "no-store",
  });
  return res;
}

// GM bestiary for the add-threat pickers, sorted by name. Empty on failure; the pickers just show nothing.
async function loadBestiary(token: string): Promise<Threat[]> {
  try {
    const res = await apiGet({ path: "/api/threats", token });
    if (!res.ok) return [];
    const parsed = Threat.array().safeParse(await res.json());
    if (!parsed.success) return [];
    return parsed.data.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

// Routes the caller to the GM or player app by who their login cookie says they are.
export default async function Home({ searchParams }: HomeProps) {
  const { join } = await searchParams;
  if (isJoinError(join)) return <StatusScreen text={JOIN_ERRORS[join]} />;

  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!token) return <StatusScreen text={NO_ACCESS} />;

  let me: Me;
  try {
    const res = await apiGet({ path: "/api/me", token });
    if (res.status === 401) return <StatusScreen text={NO_ACCESS} />;
    if (!res.ok) return <StatusScreen text={JOIN_ERRORS.nosignal} />;
    const parsed = Me.safeParse(await res.json());
    if (!parsed.success) return <StatusScreen text={NO_ACCESS} />;
    me = parsed.data;
  } catch {
    return <StatusScreen text={JOIN_ERRORS.nosignal} />;
  }

  if (me.role === "gm") return <GmApp bestiary={await loadBestiary(token)} />;
  if (!me.characterId) return <StatusScreen text={NO_ACCESS} />;
  return <PlayerApp characterId={me.characterId} />;
}
