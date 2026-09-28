"use client";
import type { ChangeEvent } from "react";

import { BOOKS, type ThreatSource } from "@wg/shared";

import type { useBookServer } from "@/hooks/use-book-server/use-book-server";

type BooksProps = { server: ReturnType<typeof useBookServer> };

const SOURCES = Object.keys(BOOKS) as ThreatSource[];

// The GM's own book PDFs, picked from this tablet. While SERVING, a player who taps a cite in a loaded book ("Core
// p.113") sees that one page, rendered here; nothing is uploaded, and it stops when this tab closes.
export function Books({ server }: BooksProps) {
  const { files, pick, serving, setServing, served } = server;
  const loaded = SOURCES.filter((s) => files[s]).length;
  const onPick = (source: ThreatSource) => (e: ChangeEvent<HTMLInputElement>) => pick(source, e.target.files?.[0] ?? null);

  return (
    <div className="pad stack">
      <div className="panel pad stack">
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button
            className={`btn ${serving ? "primary" : ""}`}
            aria-pressed={serving}
            disabled={!loaded && !serving}
            onClick={() => setServing(!serving)}
          >
            {serving ? "SERVING · STOP" : "START SERVING"}
          </button>
          <span className="label" role="status">
            {serving && loaded
              ? `${loaded} BOOK${loaded === 1 ? "" : "S"} OPEN TO THE TABLE · ${served} PAGE${served === 1 ? "" : "S"} SENT`
              : "NOT SERVING · PAGE CITES ARE PLAIN TEXT"}
          </span>
        </div>
        <p className="dim" style={{ margin: 0 }}>
          Pick your own PDFs. They stay on this tablet: a player who taps a cite gets that one page, rendered here, and
          nothing is kept. Pick them again after a reload.
        </p>
      </div>
      <div className="list">
        {SOURCES.map((s) => (
          <div key={s} className="item" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <b style={{ flex: 1, minWidth: 0 }}>{BOOKS[s].name.toUpperCase()}</b>
            {files[s] ? (
              <>
                <span className="dim">✓ {files[s].name}</span>
                <button className="btn sm" aria-label={`Remove ${BOOKS[s].name}`} onClick={() => pick(s, null)}>
                  REMOVE
                </button>
              </>
            ) : (
              <input
                type="file"
                accept="application/pdf"
                aria-label={`PDF of ${BOOKS[s].name}`}
                onChange={onPick(s)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
