# Auspex docs

Start with [architecture.md](architecture.md), then read the doc for the part you're changing.

## How the app works

| Doc | Read it when you're… |
| --- | --- |
| [architecture.md](architecture.md) | getting the big picture: one mutation path, snapshots, access, deliberate limits |
| [development.md](development.md) | setting up, running, testing, migrating, or stuck on a known gotcha |
| [deploy.md](deploy.md) | deploying to the VPS, or checking a deploy |
| [backend.md](backend.md) | changing the api: gateway, dispatch, every action, DB schema, scripts |
| [frontend.md](frontend.md) | changing the web app: routes, the socket hook, GM and player screens, command line, styling |
| [game-logic.md](game-logic.md) | changing a rule: where each one is implemented, its edge cases and page cites |
| [data.md](data.md) | adding threats, building a content pack, transcribing from the books |

## What the app implements

| Doc | Contents |
| --- | --- |
| [rules-flow.md](rules-flow.md) | The game flow as the core rulebook defines it. It's the spec, with house decisions (§11) and gap status (§12) |
| [campaign-model.md](campaign-model.md) | The campaign and codex model: adventures, beats, NPCs, locations, handouts, factions |

## The current campaign

| Doc | Contents |
| --- | --- |
| [kill-team.md](kill-team.md) | Deathwatch Kill Team at Tier 4: how the books map onto it, and GM decisions |
| [pregens.md](pregens.md) | The five Tier 4 Primaris pregens, with XP ledgers |

## Rules for these docs

- Game rules cite the **printed** page, and never paste book text: it's copyrighted.
- Refer to files and symbols by name, not by line number.
- A rule change updates [rules-flow.md](rules-flow.md) (what the book says) **and** [game-logic.md](game-logic.md)
  (how the code does it).
