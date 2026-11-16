import type { Character, Codex, LiveState } from "@wg/shared";

import { FoldRow } from "@/components/ui/book-sheet/components/fold-row/fold-row";
import { Mentions } from "@/components/ui/mentions/mentions";
import { isFresh } from "@/lib/seen/seen";
import { nextSessionLine } from "@/lib/next-session/next-session";

import { MISSION_GROUPS } from "../../constants";
import { asEntries, entryName, type IntelEntry } from "../../utils";

type StateProps = { state: LiveState };
type CodexProps = { codex: Codex };
type MissionViewProps = {
  codex: Codex;
  state: LiveState;
  me: Character;
  fresh: ReadonlySet<string>;
  onOpen: (e: IntelEntry) => void;
};

// INTEL's MISSION: what this Agent alone was told and handed, then what the whole table is on.
export function MissionView({ codex, state, me, fresh, onOpen }: MissionViewProps) {
  return (
    <>
      <Orders me={me} />
      <Carried codex={codex} fresh={fresh} onOpen={onOpen} />
      <Mission state={state} />
      <MissionLog codex={codex} />
    </>
  );
}

// The GM's orders to this Agent (toPlayerView blanks everyone else's). Folded, so a phone left on the table doesn't show
// them to the player beside it. The rolled Objective stays in the DOSSIER's OBJECTIVE box, as the book's sheet has it.
function Orders({ me }: { me: Character }) {
  const orders = me.objectives.filter((o) => !o.rolled);
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="rule">YOUR ORDERS</div>
      {orders.length === 0 && <span className="dim">No orders from the GM yet.</span>}
      {orders.map((o, i) => (
        <FoldRow
          key={i}
          tag={o.done ? "DONE" : "SECRET"}
          title={
            <span className={o.done ? "ps-struck" : undefined}>
              {o.done ? "Done. Tap to read." : "Hidden from the table. Tap to read."}
            </span>
          }
        >
          <span className={o.done ? "ps-struck" : undefined}>{o.text}</span>
          {o.done && <span className="sr-only"> (done)</span>}
        </FoldRow>
      ))}
    </div>
  );
}

// What the GM gave this Agent (rules-flow.md §11.166); a tap reads what the GM said of it. A weapon's profile is on the
// sheet.
function Carried({ codex, fresh, onOpen }: Omit<MissionViewProps, "state" | "me">) {
  const items = asEntries.items(codex);
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="rule">YOU CARRY</div>
      {items.length === 0 ? (
        <span className="dim">Nothing given to you yet.</span>
      ) : (
        <div className="pl-ents">
          {items.map((e) => (
            <button key={e.entry.id} type="button" className="pl-ent" onClick={() => onOpen(e)}>
              <span className="pl-ent-text">
                <span className="pl-ent-name">
                  {entryName(e)}
                  {isFresh({ fresh, kind: e.kind, entry: e.entry }) && <span className="chip warn">NEW</span>}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// THE MISSION: the framework and what the whole table agreed (Core p.316, rules-flow §11.79), so nobody has to remember it.
export function Mission({ state }: StateProps) {
  const { framework, frameworkBonus, patron, kind, limits } = state.campaign;
  if (!framework && kind.length === 0 && limits.length === 0) return null;
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="rule">THE MISSION</div>
      {framework && <pre className="text">{framework}</pre>}
      {frameworkBonus && <div className="dim">BONUS: {frameworkBonus}</div>}
      {patron && <div className="dim">PATRON: {patron}</div>}
      {kind.length > 0 && <div className="dim">KIND OF GAME: {kind.join(" · ")}</div>}
      {limits.length > 0 && <div className="dim">LEAVE OUT: {limits.join(" · ")}</div>}
    </div>
  );
}

// When the table meets next (issue #197), in this phone's own time zone; the .ics carries it to a calendar.
export function NextSession({ state }: StateProps) {
  const { nextSessionAt, nextSessionPlace, id } = state.campaign;
  if (!nextSessionAt) return null;
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="rule">NEXT SESSION</div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ flex: 1 }}>{nextSessionLine(nextSessionAt, nextSessionPlace)}</b>
        <a className="btn sm" href={`/api/campaigns/${id}/next.ics`} download>
          ADD TO CALENDAR
        </a>
      </div>
    </div>
  );
}

// The adventures the GM has shown the party (toPlayerCodex sends only those; issue #196, §11.148–150).
export function MissionLog({ codex, heading = true }: CodexProps & { heading?: boolean }) {
  if (codex.adventures.length === 0) return null;
  return (
    <div className="stack" style={{ gap: 4 }}>
      {heading && <div className="rule">MISSION LOG</div>}
      {MISSION_GROUPS.map(([status, label]) =>
        codex.adventures
          .filter((a) => a.status === status)
          .map((a) => (
            <div key={a.id}>
              <span className={`chip ${status === "running" ? "warn" : ""}`}>{label}</span>{" "}
              <b>{a.title.toUpperCase()}</b>
              {a.brief && <div className="dim">{a.brief}</div>}
            </div>
          )),
      )}
    </div>
  );
}

// Every recap, newest first (issue #195, §11.151): the latest open, the rest folded for a player catching up.
export function Recaps({ codex }: CodexProps) {
  const recaps = codex.sessions.filter((s) => s.recap).reverse();
  if (recaps.length === 0) return <div className="dim">No recaps yet.</div>;
  return (
    <div className="stack" style={{ gap: 8 }}>
      {recaps.map((s, i) => (
        <details key={s.id} open={i === 0}>
          <summary className="label">
            PREVIOUSLY · SESSION {s.number}
            {s.title && ` · ${s.title.toUpperCase()}`} · {new Date(s.startedAt).toLocaleDateString()}
          </summary>
          <pre className="text">
            <Mentions text={s.recap} />
          </pre>
        </details>
      ))}
    </div>
  );
}
