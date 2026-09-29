"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { UserButton } from "@wg/auth/react";
import { LIBRARY_CAP, TIERS, type LibraryCharacter, type Lobby, type LobbyGame } from "@wg/shared";

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

// One character in the signed-in user's own library (issue #14): theirs to build, and to bring into a game they sit in.
function CharacterCard({
  character,
  confirming,
  onDelete,
}: {
  character: LibraryCharacter;
  confirming: boolean;
  onDelete: (id: string) => void;
}) {
  const line = [
    character.tier ? `T${character.tier}` : "NO TIER YET",
    character.archetype?.toUpperCase(),
    character.done ? "READY" : "IN PROGRESS",
    character.homebrew ? "HOMEBREW" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="item">
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ flex: 1 }}>{(character.name.trim() || "UNNAMED").toUpperCase()}</b>
        <a className="btn sm primary" href={`/library/${character.id}`}>
          OPEN
        </a>
        <button
          className="btn sm danger"
          aria-label={`Delete ${character.name || "this character"}`}
          onClick={() => onDelete(character.id)}
        >
          {confirming ? "CONFIRM" : "DELETE"}
        </button>
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
  // Its own line: NEW GAME's error sits in a form only creators see, and anyone may keep a library.
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const others = lobby.running.filter((g) => !g.role);
  const full = lobby.characters.length >= LIBRARY_CAP;

  // DELETE: a library character is the user's own, so it goes without a GM; the lobby asks once first.
  const handleDelete = async (id: string) => {
    if (confirming !== id) return setConfirming(id);
    setConfirming(null);
    const res = await fetch(`/api/library/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) return setLibraryError("Couldn't delete that character.");
    router.refresh();
  };

  // NEW CHARACTER: starts an empty library row, then opens its builder. A POST from here rather than a link, so a
  // cross-site navigation can't create characters in someone's library on their behalf (the session cookie is Lax).
  const handleNewCharacter = async () => {
    setLibraryError(null);
    const res = await fetch("/api/library", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { id?: unknown; message?: unknown } | null;
    if (!res?.ok || typeof body?.id !== "string")
      return setLibraryError(typeof body?.message === "string" ? body.message : "Couldn't start a character.");
    router.push(`/library/${body.id}`);
  };

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

      <div className="rule">YOUR CHARACTERS</div>
      <div className="list">
        {lobby.characters.length === 0 && (
          <div className="dim">None yet. Build one here and bring it into a game from that game&apos;s builder.</div>
        )}
        {lobby.characters.map((c) => (
          <CharacterCard key={c.id} character={c} confirming={confirming === c.id} onDelete={handleDelete} />
        ))}
      </div>
      <div className="keys" style={{ alignItems: "center" }}>
        <button className="btn primary" disabled={full} onClick={handleNewCharacter}>
          NEW CHARACTER
        </button>
        <span className="dim">
          {lobby.characters.length} of {LIBRARY_CAP}
          {full ? " · delete one to make room" : ""}
        </span>
      </div>
      {libraryError && (
        <div className="red" role="alert">
          ! {libraryError}
        </div>
      )}

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
