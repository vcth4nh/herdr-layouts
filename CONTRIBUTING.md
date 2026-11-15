# Contributing

This file covers what holds for every look. Each look has a guide of its own, `dev/<look>/CONTRIBUTING.md`, with its design rules and its tools: [glyph's](dev/glyph/CONTRIBUTING.md).

Read [docs/herdr-platform.md](docs/herdr-platform.md), the platform doc, before building anything.

## Checking a change

Check a change in frames from the real app (`herdr-app shot`), not just with `herdr-app check`, which only loads the mod and renders it once. "Looking at the real window" in the platform doc says when a frame is stale and how to film motion.

## A look's two folders

Everything about a look is in two folders: `<look>/` is what is shared, and `dev/<look>/` is the rest.

- `<look>/` holds only what is shared: `layouts/`, `mods/`, `themes/`, `keys.json`, `RECIPE.md` and `preview.png`.
  - It is laid out like `~/.config/herdr-app`, where `AGENTS.md` is Herdr's manual. A look's folder never holds an `AGENTS.md`, or any other doc than its recipe.
  - `RECIPE.md` is the one description of what the look shows and does, in the order Herdr's manual asks of a recipe. When a change alters what it says, change the recipe with it.
  - Renew `preview.png` when the picture is no longer true.
- `dev/<look>/` holds the look's tools, its tests, their output and its other docs:
  - `CONTRIBUTING.md`: its design rules and its tools.
  - `VERIFIED.md`: what was checked, with what, and what was never tried.
  - `AGENTS.md`: the rules for AI agents about its tools, when a tool needs one.

## Adding a look

- Give it the two folders above. Write its recipe in the six parts Herdr's manual asks for ("Sharing a look" in the platform doc).
- List it under "The looks" in [README.md](README.md).
- A tool gets a rule in `dev/<look>/AGENTS.md` when it changes what the Herdr window shows, uses another machine, or leaves a trace outside the repo. List that file in the root [AGENTS.md](AGENTS.md), which is what makes an agent read it.
- glyph's tools name glyph's own files. Copy the ones a new look needs into its `dev/` folder, and move a helper that works for any look to the root `tools/`.
- A fact that holds for every look goes in a root doc. A fact about one look goes in that look's docs, even when another look could use it later.

## Shared tools

Everything a tool writes goes under a `.local/` folder. Any `.local/` folder in this repo is gitignored and meant for local files.

`tools/` at the repo root holds the helpers that work for any look. The two that save frames write to the root `.local/shots/`.

- `await-frame.sh` and `await-project.sh NAME` wait until the window is drawing (or showing project NAME) before taking a frame.
- `crop.py` and `filmstrip.py` cut regions out of frames.
- `inkrows.py` finds text bands in a frame.
- `contrast.py` checks theme contrast.
- `advances.py` reads font advance widths.
- `fontscan.py` saves the fonts embedded in a binary.
- `doc.py NAME…` prints gpui-kit.d.ts docs for a method.

