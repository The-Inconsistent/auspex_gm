"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition, type FormEvent } from "react";

import { UserButton } from "@wg/auth/react";
import { IMPORT_MAX_BYTES, LIBRARY_CAP, type LibraryCharacter, type Lobby, type LobbyGame } from "@wg/shared";

import { ThemeToggle } from "@/components/ui/theme-toggle/theme-toggle";
import { nextSessionLine } from "@/lib/next-session/next-session";

type LobbyViewProps = { lobby: Lobby };

const noSubscribe = () => () => {};

// A member's card's next session (issue #197 decision 4: the server sends null to anyone else). In the viewer's own time
// zone, so only once in the browser: the lobby is rendered on the server first, whose zone isn't theirs.
function NextSessionLine({ at }: { at: string }) {
  const browser = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  return browser ? <div className="dim">NEXT SESSION {nextSessionLine(at).toUpperCase()}</div> : null;
}

// One game card. Members open the table; others only see that it's running (joining needs an invite).
function GameCard({ game, archived = false }: { game: LobbyGame; archived?: boolean }) {
  const line = `T${game.tier} · GM ${game.gm.toUpperCase()} · ${game.players} AGENTS${game.session ? ` · SESSION ${game.session} LIVE` : ""}`;
  return (
    <div className="item">
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ flex: 1 }}>{game.name.toUpperCase()}</b>
        {game.role && <span className="chip">{game.role === "gm" ? "GM" : "PLAYER"}</span>}
        {archived && <span className="chip warn">ARCHIVED</span>}
        {game.role && (
          <Link className="btn sm primary" href={`/c/${game.id}`}>
            OPEN
          </Link>
        )}
      </div>
      <div className="dim">{line}</div>
      {game.nextSessionAt && <NextSessionLine at={game.nextSessionAt} />}
    </div>
  );
}

// One character in the signed-in user's own library (issue #14): theirs to build, and to bring into a game they sit in.
function CharacterCard({
  character,
  confirming,
  deleting,
  onDelete,
}: {
  character: LibraryCharacter;
  confirming: boolean;
  deleting: boolean;
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
        <Link className="btn sm primary" href={`/library/${character.id}`}>
          OPEN
        </Link>
        <button
          className="btn sm danger"
          aria-label={`Delete ${character.name || "this character"}`}
          aria-busy={deleting}
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
  // Its own line: IMPORT GAME's error sits in a form only creators see, and anyone may keep a library.
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [fresh, setFresh] = useState(false);
  const [showArchived, setShowArchived] = useState(false); // the ARCHIVED fold, closed until asked
  const [importError, setImportError] = useState<string | null>(null);
  const [imported, setImported] = useState<{ campaignId: string; dropped: number } | null>(null); // pictures left out
  const others = lobby.running.filter((g) => !g.role);
  const full = lobby.characters.length >= LIBRARY_CAP;
  // The tapped button pulses (aria-busy, globals.css) from the tap until the next page is up, and a second tap is
  // ignored meanwhile: the request and the page load take a moment, and without it the lobby looks frozen.
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const run = (key: string, work: () => Promise<void>) => {
    if (pending) return;
    setBusy(key);
    startTransition(work);
  };
  const isBusy = (key: string) => pending && busy === key;
  // After an await the router call is outside the transition, so it's wrapped again to keep the pulse until it lands.
  const go = (href: string) => startTransition(() => router.push(href));

  // DELETE: a library character is the user's own, so it goes without a GM; the lobby asks once first.
  const handleDelete = (id: string) => {
    if (confirming !== id) return setConfirming(id);
    setConfirming(null);
    run(`delete:${id}`, async () => {
      const res = await fetch(`/api/library/${id}`, { method: "DELETE" }).catch(() => null);
      if (!res?.ok) return setLibraryError("Couldn't delete that character.");
      startTransition(() => router.refresh());
    });
  };

  // NEW CHARACTER: starts an empty library row, then opens its builder. A POST from here rather than a link, so a
  // cross-site navigation can't create characters in someone's library on their behalf (the session cookie is Lax).
  const handleNewCharacter = () => {
    setLibraryError(null);
    run("character", async () => {
      const res = await fetch("/api/library", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }).catch(() => null);
      const body = (await res?.json().catch(() => null)) as { id?: unknown; message?: unknown } | null;
      if (!res?.ok || typeof body?.id !== "string")
        return setLibraryError(typeof body?.message === "string" ? body.message : "Couldn't start a character.");
      go(`/library/${body.id}`);
    });
  };

  // IMPORT GAME: a file from a GM's EXPORT becomes a new campaign with you as GM. FRESH START resets play for a new group.
  const handleImport = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setImportError(null);
    setImported(null);
    const picked = new FormData(e.currentTarget).get("file");
    if (!(picked instanceof File) || !picked.size) return setImportError("Pick an exported .json file.");
    // Past this, the upload would only be cut off on the way (issue #199); the game's text still fits without its pictures.
    if (picked.size > IMPORT_MAX_BYTES)
      return setImportError("That file is over 100 MB, more than IMPORT GAME takes. Export it again WITHOUT PICTURES.");
    run("import", async () => {
      let file: unknown;
      try {
        file = JSON.parse(await picked.text());
      } catch {
        return setImportError("That file isn't a campaign export.");
      }
      const res = await fetch("/api/campaigns/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file, fresh }),
      }).catch(() => null);
      const body = (await res?.json().catch(() => null)) as {
        campaignId?: string;
        droppedPictures?: number;
        message?: string;
      } | null;
      if (!res?.ok || !body?.campaignId) return setImportError(body?.message ?? "No signal");
      // A picture left out doesn't stop the game: say so here, since opening it would hide the note.
      if (body.droppedPictures) return setImported({ campaignId: body.campaignId, dropped: body.droppedPictures });
      go(`/c/${body.campaignId}`);
    });
  };

  return (
    <main className="pad stack" style={{ maxWidth: 760, margin: "0 auto" }}>
      <header className="band torn bld-head" style={{ marginBottom: 12 }}>
        <div className="display page-title" style={{ flex: 1 }}>
          AUSPEX <span className="dim">· LOBBY</span>
        </div>
        {lobby.admin && (
          <Link className="btn sm" href="/admin">
            ADMIN
          </Link>
        )}
        <ThemeToggle />
        <UserButton />
      </header>

      {/* Back in one tap after a closed tab: the seat is kept, only the page was lost. */}
      {lobby.mine
        .filter((g) => g.session !== null)
        .map((g) => (
          <Link key={g.id} className="btn primary" href={`/c/${g.id}`} style={{ width: "100%" }}>
            RETURN TO {g.name.toUpperCase()} · SESSION {g.session}
          </Link>
        ))}

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

      {/* The steps are on their own page (/c/new): Tier, premise, the table's limits and a name. */}
      {lobby.canCreate && (
        <div>
          <Link className="btn primary" href="/c/new">
            CREATE NEW CAMPAIGN
          </Link>
        </div>
      )}

      {lobby.canCreate && (
        <form className="panel pad stack" onSubmit={handleImport}>
          <div className="rule">IMPORT GAME</div>
          <div className="field">
            <label className="label" htmlFor="import-file">
              EXPORTED FILE
            </label>
            {/* Marked like a refused field (useFieldErrors), since every IMPORT refusal is about the file. */}
            <input
              id="import-file"
              name="file"
              className="input"
              type="file"
              accept=".json,application/json"
              aria-invalid={!!importError}
              aria-describedby={importError ? "import-file-error" : undefined}
              onChange={() => setImportError(null)}
            />
          </div>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={fresh} onChange={(e) => setFresh(e.target.checked)} /> FRESH START: reset
            sessions, reveals, wounds and the table&apos;s limits for a new group
          </label>
          {importError && (
            <div id="import-file-error" className="red" role="alert">
              ! {importError}
            </div>
          )}
          {/* Pictures are a nice-to-have (issue #199): the game came in, only these didn't. */}
          {imported && (
            <div className="stack" role="status" style={{ gap: 8 }}>
              <span>
                Imported. {imported.dropped} {imported.dropped === 1 ? "picture" : "pictures"} in that file
                couldn&apos;t be read and were left out.
              </span>
              <Link className="btn primary" href={`/c/${imported.campaignId}`}>
                OPEN GAME
              </Link>
            </div>
          )}
          <div>
            <button className="btn primary" aria-busy={isBusy("import")}>
              IMPORT AS GM
            </button>
          </div>
        </form>
      )}

      <div className="rule">YOUR CHARACTERS</div>
      <div className="list">
        {lobby.characters.length === 0 && (
          <div className="dim">None yet. Build one here and bring it into a game from that game&apos;s builder.</div>
        )}
        {lobby.characters.map((c) => (
          <CharacterCard
            key={c.id}
            character={c}
            confirming={confirming === c.id}
            deleting={isBusy(`delete:${c.id}`)}
            onDelete={handleDelete}
          />
        ))}
      </div>
      <div className="keys" style={{ alignItems: "center" }}>
        <button className="btn primary" disabled={full} aria-busy={isBusy("character")} onClick={handleNewCharacter}>
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

      {/* Archived games are read-only; they stay out of YOUR GAMES until unarchived (in SETUP, or by an admin). */}
      {lobby.archived.length > 0 && (
        <>
          <div className="rule">ARCHIVED · {lobby.archived.length}</div>
          <div>
            <button
              className="btn sm"
              aria-expanded={showArchived}
              aria-controls="archived-games"
              onClick={() => setShowArchived(!showArchived)}
            >
              {showArchived ? "HIDE ARCHIVED GAMES" : "SHOW ARCHIVED GAMES"}
            </button>
          </div>
          {showArchived && (
            <div id="archived-games" className="list">
              {lobby.archived.map((g) => (
                <GameCard key={g.id} game={g} archived />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
