"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { UserButton } from "@wg/auth/react";
import { TIERS, type Lobby, type LobbyGame } from "@wg/shared";

import { ThemeToggle } from "@/components/ui/theme-toggle/theme-toggle";

type LobbyViewProps = { lobby: Lobby };

// One game card. Members open the table; others only see that it's running (joining needs an invite).
function GameCard({ game }: { game: LobbyGame }) {
  const line = `T${game.tier} · GM ${game.gm.toUpperCase()} · ${game.players} AGENTS${game.session ? ` · SESSION ${game.session} LIVE` : ""}`;
  return (
    <div className="item">
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ flex: 1 }}>{game.name.toUpperCase()}</b>
        {game.role && <span className="chip">{game.role === "gm" ? "GM" : "PLAYER"}</span>}
        {game.role && (
          <a className="btn sm primary" href={`/c/${game.id}`}>
            OPEN
          </a>
        )}
      </div>
      <div className="dim">{line}</div>
    </div>
  );
}

export function LobbyView({ lobby }: LobbyViewProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [tier, setTier] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const others = lobby.running.filter((g) => !g.role);

  // NEW GAME: creates the campaign with you as GM, then opens it. Setup is REST, not a table action.
  const handleCreate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim()) return;
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim(), tier }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { campaignId?: string; message?: string } | null;
    if (!res?.ok || !body?.campaignId) return setError(body?.message ?? "No signal");
    router.push(`/c/${body.campaignId}`);
  };

  return (
    <main className="pad stack" style={{ maxWidth: 760, margin: "0 auto" }}>
      <header
        className="band torn"
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", marginBottom: 12 }}
      >
        <div className="display" style={{ fontSize: 30, flex: 1 }}>
          AUSPEX <span className="dim">· LOBBY</span>
        </div>
        <ThemeToggle />
        <UserButton />
      </header>

      <div className="rule">YOUR GAMES</div>
      <div className="list">
        {lobby.mine.length === 0 && (
          <div className="dim">
            No games yet. Ask a GM for an invite{lobby.canCreate ? ", or start one below" : ""}.
          </div>
        )}
        {lobby.mine.map((g) => (
          <GameCard key={g.id} game={g} />
        ))}
      </div>

      {others.length > 0 && (
        <>
          <div className="rule">RUNNING NOW</div>
          <div className="list">
            {others.map((g) => (
              <GameCard key={g.id} game={g} />
            ))}
          </div>
        </>
      )}

      {lobby.canCreate && (
        <form className="panel pad stack" onSubmit={handleCreate}>
          <div className="rule">NEW GAME</div>
          <div className="field">
            <label className="label" htmlFor="game-name">
              NAME
            </label>
            <input
              id="game-name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VOLKUS DIG SITE"
            />
          </div>
          <div className="field">
            <span className="label" id="tier-label">
              TIER
            </span>
            <div className="keys" role="group" aria-labelledby="tier-label" style={{ paddingTop: 0 }}>
              {TIERS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`btn ${tier === t ? "primary" : ""}`}
                  aria-pressed={tier === t}
                  onClick={() => setTier(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          {error && (
            <div className="red" role="alert">
              ! {error}
            </div>
          )}
          <div>
            <button className="btn primary">CREATE AS GM</button>
          </div>
        </form>
      )}
    </main>
  );
}
