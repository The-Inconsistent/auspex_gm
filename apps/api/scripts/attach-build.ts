// Gives a hand-made sheet its build (issue #18), for seed.ts and attach-builds.ts. `character.build` lets the server
// derive the sheet. The printed weapon, armour and gear lines are then put back with the Wealth play changed, since they
// work Talents and upgrades into the profiles (Bolter Discipline's Rapid Fire) where the catalogue's don't.
import type { Socket } from "socket.io-client";
import { keepPlay, type ActionInput, type CharacterBuild, type CharacterStats, type LiveState } from "@wg/shared";

type Send = (a: ActionInput, what: string) => Promise<string | undefined>;

export async function attachBuild(
  { socket, send }: { socket: Socket; send: Send },
  { id, name, build, printed }: { id: string; name: string; build: CharacterBuild; printed: CharacterStats },
) {
  // The broadcast that carries the build; an earlier action's may still be on its way.
  const built = new Promise<CharacterStats>((ok) => {
    const on = (s: LiveState) => {
      const c = s.characters.find((x) => x.id === id);
      if (!c?.build) return;
      socket.off("state", on);
      ok(c.stats);
    };
    socket.on("state", on);
  });
  await send({ type: "character.build", id, build }, `build ${name}`);
  const derived = await built;
  await send(
    { type: "character.update", id, stats: keepPlay({ previous: printed, next: derived, before: derived }) },
    `sheet ${name}`,
  );
}
