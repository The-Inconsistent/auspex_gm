# Design references: Scene & Campaign Builder

Static mock-ups of the GM tablet for issues #38–#51 (roadmap #52), in the app's "Imperial Manuscript" style
(`docs/frontend.md` §7). They're a reference for building, not a pixel spec: match the structure and the states, and
build from the app's own classes in `apps/web/app/globals.css`.

This branch has no shared history with `main` and never merges. It only holds images and their sources.

| Path | What |
|---|---|
| `scene-campaign-builder/png/` | The screens, 2× (2388 px wide). `I<issue>-<Screen>.png` |
| `scene-campaign-builder/src/` | Each screen's markup (`*.body.html`). Line 1 holds its size and title |
| `scene-campaign-builder/kit/` | `style.html` (the shared CSS), `shell.html` (header band, rail, a drawn select, the ROLL ON A BOOK TABLE and ADD FROM BOOK patterns), `BRIEF.md` (the drawing rules), `build.py`, `render.sh` |

## Changing a screen

```bash
cd scene-campaign-builder/kit
python3 build.py ../out 'I41-*'   # wraps src/I41-*.body.html into ../out/project/*.dc.html and preview/*.html
./render.sh 'I41-*'               # preview/*.html → png/*.png at 2× (macOS Chrome, headless)
```

`build.py` and `render.sh` expect `src/` and `png/` next to them. Run them from a copy of `kit/` with
`../src` linked in as `src`, or move the files around to suit.

## Rules the screens follow

- **No real stat blocks or printed tables** (`docs/data.md`: "In docs, issues and PRs, show structure or placeholders").
  Values from `packages/data` show as `[W]`, `[n]`, `[row]`. Names, cites, classes and the deltas the issues print stay.
- **Each issue stands alone.** A screen shows only what its issue adds, plus the existing screen around it.
- **The UI says SCENE**, never BEAT. CODEX tabs are in the code's order (NPCS, LOCATIONS, HANDOUTS, FACTIONS).
