"use client";
import type { Codex } from "@wg/shared";

import { useRules } from "@/components/ui/rules-provider/rules-provider";
import { StatBlock } from "@/components/ui/stat-block/stat-block";

type FollowersProps = {
  npcs: Codex["npcs"]; // the NPCs given to this Agent (myFollowers)
  tier: number;
};

// SHEET › FOLLOWERS (issue #350, §11.208): each NPC the GM gave this Agent, with its full stat block when it has one.
// Shown only when there is one. In a fight the Agent runs it unless the GM takes it for the story.
// ponytail: no FROM YOUR TALENTS list (Devotees, The Green Tide): a build's follower grants resolve only against the
// creation catalogue, which a phone doesn't hold; list them once the server sends them with the character.
export function Followers({ npcs, tier }: FollowersProps) {
  const rules = useRules();
  const legend = rules.all.filter((r) => r.kind === "stat");
  return (
    <section className="ps-followers" aria-label="Followers">
      <div className="pf-h">
        <h2>GIVEN BY THE GM</h2>
        <i />
      </div>
      {npcs.map((n) => (
        <div key={n.id} className="ps-follower">
          <b>{n.name}</b>
          <span className="mono ps-follower-tag">FOLLOWS YOU</span>
          <span className="pf-cap">In a fight you run it, unless the GM takes it for the story.</span>
          {n.followerStats ? (
            <StatBlock t={n.followerStats} tier={tier} legend={legend} />
          ) : (
            <span className="pf-cap">No stat block yet. It can&rsquo;t join a fight until the GM gives it one.</span>
          )}
        </div>
      ))}
    </section>
  );
}
