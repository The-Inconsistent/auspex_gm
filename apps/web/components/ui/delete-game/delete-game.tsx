"use client";
import { useId, useState, type FormEvent } from "react";

type DeleteGameProps = {
  name: string;
  exportHref: string;
  busy?: boolean;
  onDelete: (name: string) => void | Promise<void>;
};

// DELETE GAME: the game and everything in it goes for good, so it asks for the game's name, and offers the EXPORT
// file first (the lobby's IMPORT GAME brings it back as a new game). The server checks the name again.
export function DeleteGame({ name, exportHref, busy, onDelete }: DeleteGameProps) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const inputId = useId();
  const matches = typed === name;

  // CANCEL: closes the form and forgets what was typed.
  const handleCancel = () => {
    setOpen(false);
    setTyped("");
  };

  // DELETE FOREVER: only once the typed name matches.
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (matches) void onDelete(typed);
  };

  if (!open)
    return (
      <button className="btn sm danger" aria-expanded={false} onClick={() => setOpen(true)}>
        DELETE GAME
      </button>
    );
  return (
    <form className="panel pad stack delete-game" onSubmit={handleSubmit}>
      <div className="red">Deletes {name.toUpperCase()} and everything in it. This can&apos;t be undone.</div>
      <div>
        <a className="btn sm" href={exportHref} download>
          EXPORT FIRST
        </a>
      </div>
      <div className="field">
        <label className="label" htmlFor={inputId}>
          TYPE THE GAME&apos;S NAME TO CONFIRM
        </label>
        <input
          id={inputId}
          className="input"
          value={typed}
          placeholder={name}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => setTyped(e.target.value)}
        />
      </div>
      <div className="keys">
        <button className="btn sm danger" disabled={!matches} aria-busy={busy}>
          DELETE FOREVER
        </button>
        <button type="button" className="btn sm" onClick={handleCancel}>
          CANCEL
        </button>
      </div>
    </form>
  );
}
