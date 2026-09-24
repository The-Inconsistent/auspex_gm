import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { Lobby, Me } from "@wg/shared";

import { JOIN_ERRORS, type JoinError } from "@/app/constants";
import { apiGet } from "@/app/server-api";
import { LobbyView } from "@/components/lobby/lobby-view/lobby-view";
import { StatusScreen } from "@/components/ui/status-screen/status-screen";

type HomeProps = { searchParams: Promise<{ join?: string | string[] }> };

const isJoinError = (v: unknown): v is JoinError => typeof v === "string" && Object.hasOwn(JOIN_ERRORS, v);

// A returning guest's table (from their QR cookie), if they have one.
async function guestTable(): Promise<string | null> {
  try {
    const res = await apiGet("/api/guest");
    const parsed = Me.safeParse(res.ok ? await res.json() : null);
    return parsed.success ? parsed.data.campaignId : null;
  } catch {
    return null;
  }
}

// The lobby for signed-in users; guests go back to their table; everyone else is asked to sign in.
export default async function Home({ searchParams }: HomeProps) {
  const { join } = await searchParams;
  if (isJoinError(join)) return <StatusScreen text={JOIN_ERRORS[join]} />;

  const { userId } = await auth();
  if (!userId) {
    const table = await guestTable();
    if (table) redirect(`/c/${table}`);
    return (
      <main className="center">
        <div className="stack" style={{ alignItems: "center" }}>
          <p className="display" style={{ fontSize: 40, margin: 0 }}>AUSPEX</p>
          <p className="dim">Wrath &amp; Glory table companion</p>
          <a className="btn primary" href="/sign-in">SIGN IN</a>
          <p className="dim" style={{ fontSize: 12 }}>Joining as a guest? Scan the QR code on the GM&apos;s tablet.</p>
        </div>
      </main>
    );
  }

  let lobby: Lobby;
  try {
    const res = await apiGet("/api/lobby");
    const parsed = Lobby.safeParse(res.ok ? await res.json() : null);
    if (!parsed.success) return <StatusScreen text={JOIN_ERRORS.nosignal} />;
    lobby = parsed.data;
  } catch {
    return <StatusScreen text={JOIN_ERRORS.nosignal} />;
  }
  return <LobbyView lobby={lobby} />;
}
