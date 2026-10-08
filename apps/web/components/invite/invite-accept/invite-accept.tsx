"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { AcceptInvite, InvitePreview } from "@wg/shared";

import { RulesProvider } from "@/components/ui/rules-provider/rules-provider";
import { SheetDialog } from "@/components/ui/sheet-dialog/sheet-dialog";
import { portrait } from "@/lib/portraits/portraits";

type InviteAcceptProps = { code: string; preview: InvitePreview };

// Claim a seat from an invite: the invited character, an open one, or a new one (room invites). Signed-in users become
// members; guests (if the GM allowed them) get a QR-style guest cookie. SHEET shows each Agent read-only first, with no
// rules to link to (they need a seat), hence the empty RulesProvider.
export function InviteAccept({ code, preview: p }: InviteAcceptProps) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const here = `/invite/${encodeURIComponent(code)}`;
  const canClaim = p.signedIn || p.allowGuests;

  // Any claim button: POSTs the choice, then opens the table.
  const accept = async (choice: AcceptInvite) => {
    setBusy(true);
    const res = await fetch(`/api/invites/${encodeURIComponent(code)}/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...choice, asGuest: !p.signedIn }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { campaignId?: string; message?: string } | null;
    setBusy(false);
    if (!res?.ok || !body?.campaignId) return setError(body?.message ?? "No signal");
    router.push(`/c/${body.campaignId}`);
  };

  // NEW CHARACTER form (room invites).
  const handleNew = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (newName.trim()) void accept({ newCharacterName: newName.trim() });
  };

  return (
    <RulesProvider rules={[]}>
      <main className="center pad">
        <div className="panel pad stack" style={{ maxWidth: 480, width: "100%" }}>
          <div className="display page-title">JOIN {p.campaignName.toUpperCase()}</div>
          {p.member && (
            <a className="btn primary" href={`/c/${p.campaignId}`}>
              YOU&apos;RE SEATED · OPEN TABLE
            </a>
          )}

          {!p.member && !p.signedIn && (
            <div className="stack">
              <a className="btn primary" href={`/sign-in?redirect_url=${encodeURIComponent(here)}`}>
                SIGN IN TO JOIN
              </a>
              {p.allowGuests ? (
                <div className="dim">Or join as a guest below: no account, this device only.</div>
              ) : (
                <div className="dim">This table needs an account.</div>
              )}
            </div>
          )}

          {!p.member && canClaim && p.mode === "character" && p.character && (
            <div className="keys" style={{ paddingTop: 0 }}>
              <button className="btn primary" disabled={busy} onClick={() => accept({})}>
                PLAY {p.character.name.toUpperCase()}
                {p.signedIn ? "" : " AS GUEST"}
              </button>
              <SheetDialog me={p.character} tier={p.tier} />
            </div>
          )}

          {!p.member && canClaim && p.mode === "room" && (
            <>
              <div className="rule">PICK YOUR AGENT</div>
              {p.openCharacters.length === 0 && <span className="dim">Every agent is taken. Start a new one:</span>}
              {p.openCharacters.map((c) => {
                const pic = portrait(c.detail.portrait);
                return (
                  <div key={c.id} className="pick">
                    {pic ? (
                      <Image src={pic} alt="" width={144} className="portrait-thumb" />
                    ) : (
                      <span className="portrait-thumb" />
                    )}
                    <div className="stack" style={{ gap: 4, flex: 1, minWidth: 0 }}>
                      <b>{c.name.toUpperCase()}</b>
                      <i className="dim">
                        {[c.stats.archetype, c.stats.species].filter(Boolean).join(" · ") || "No sheet yet"}
                      </i>
                      <div className="keys" style={{ paddingTop: 2 }}>
                        <button
                          className="btn sm primary"
                          disabled={busy}
                          onClick={() => accept({ characterId: c.id })}
                        >
                          PLAY
                        </button>
                        <SheetDialog me={c} tier={p.tier} />
                      </div>
                    </div>
                  </div>
                );
              })}
              <form style={{ display: "flex", gap: 8 }} onSubmit={handleNew}>
                <input
                  className="input"
                  aria-label="New character name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="NEW AGENT NAME"
                />
                <button className="btn" disabled={busy}>
                  NEW
                </button>
              </form>
            </>
          )}

          {error && (
            <div className="red" role="alert">
              ! {error}
            </div>
          )}
        </div>
      </main>
    </RulesProvider>
  );
}
