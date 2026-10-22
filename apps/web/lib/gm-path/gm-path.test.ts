import assert from "node:assert/strict";
import { test } from "node:test";

import { asBeatSection, asCodexKind, asDossierTab, gmPath } from "./gm-path.ts";

test("STORY paths: board, page, the whole editor, one section", () => {
  assert.equal(gmPath.story({ campaignId: "c1" }), "/c/c1/story");
  assert.equal(gmPath.story({ campaignId: "c1", adventureId: "a1" }), "/c/c1/story/a1");
  assert.equal(gmPath.story({ campaignId: "c1", adventureId: "a1", sceneId: "s1" }), "/c/c1/story/a1/s1");
  assert.equal(
    gmPath.story({ campaignId: "c1", adventureId: "a1", sceneId: "s1", edit: "all" }),
    "/c/c1/story/a1/s1/edit",
  );
  assert.equal(
    gmPath.story({ campaignId: "c1", adventureId: "a1", sceneId: "s1", edit: "fight" }),
    "/c/c1/story/a1/s1/edit/fight",
  );
  assert.equal(
    gmPath.newScene({ campaignId: "c1", adventureId: "a1", from: "from-table" }),
    "/c/c1/story/a1/from-table",
  );
});

test("CODEX paths use the plural, and read back to the kind", () => {
  assert.equal(gmPath.codex({ campaignId: "c1", kind: "npc" }), "/c/c1/codex/npcs");
  assert.equal(gmPath.codex({ campaignId: "c1", kind: "location", entryId: "l1" }), "/c/c1/codex/locations/l1");
  assert.equal(
    gmPath.codex({ campaignId: "c1", kind: "item", entryId: "i1", edit: true }),
    "/c/c1/codex/items/i1/edit",
  );
  assert.equal(gmPath.newEntry("c1", "handout"), "/c/c1/codex/handouts/new");
  assert.equal(gmPath.threats({ campaignId: "c1", slug: "ork-boss" }), "/c/c1/codex/threats/ork-boss/edit");
  assert.equal(asCodexKind("factions"), "faction");
  assert.equal(asCodexKind("faction"), undefined);
});

test("PARTY paths: STATUS is the dossier's default, so it has no segment", () => {
  assert.equal(gmPath.party({ campaignId: "c1", characterId: "p1" }), "/c/c1/party/p1");
  assert.equal(gmPath.party({ campaignId: "c1", characterId: "p1", tab: "status" }), "/c/c1/party/p1");
  assert.equal(gmPath.party({ campaignId: "c1", characterId: "p1", tab: "gear" }), "/c/c1/party/p1/gear");
  assert.equal(asDossierTab("seat"), "seat");
  assert.equal(asDossierTab("bogus"), undefined);
});

test("tabs and the fight layer; odd ids are encoded", () => {
  assert.equal(gmPath.tab("c1", "RULES"), "/c/c1/rules");
  assert.equal(gmPath.scene("c1", true), "/c/c1/scene/fight");
  assert.equal(gmPath.codex({ campaignId: "c 1", kind: "npc", entryId: "a/b" }), "/c/c%201/codex/npcs/a%2Fb");
  assert.equal(asBeatSection("tests"), "tests");
  assert.equal(asBeatSection("edit"), undefined);
});
