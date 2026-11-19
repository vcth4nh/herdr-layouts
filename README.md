# herdr-layouts

Custom looks (layout + theme + mods) for the Herdr desktop app, built against herdr-app 0.1.16 and hc 0.1.21 on macOS. The app reads looks from `~/.config/herdr-app`. ⌘⇧L or Settings switches layouts; `main` is the stock one.

## The looks

- [glyph](glyph/RECIPE.md): an icon-first window for watching coding agents.

## What is where

- Each look has its own folder at the repo root, in the format Herdr shares layouts in: laid out like `~/.config/herdr-app`, with a recipe and a picture. glyph's:

  ```
  glyph/
  ├── RECIPE.md            what it shows and does, and what it is built from
  ├── preview.png
  ├── keys.json            the keys it expects, to merge into yours
  ├── layouts/glyph.json   and glyph.svg, the layout picker's thumbnail
  ├── mods/glyph/
  └── themes/glyph.json
  ```

- `dev/<look>/` holds what builds and tests that look, and the docs for working on it: its own `CONTRIBUTING.md`, `VERIFIED.md` and `AGENTS.md`. None of it is installed.
- `tools/` holds the helpers shared by all looks.
- [CONTRIBUTING.md](CONTRIBUTING.md) covers what holds for every look: how to check a change, what goes in which folder, how to add a look, and the shared tools.
- [docs/herdr-platform.md](docs/herdr-platform.md) covers what herdr-app and gpui-kit (the JavaScript UI kit Herdr's mods are written with) can and can't do, and how looks are shared.
- [AGENTS.md](AGENTS.md) has the rules for AI agents that hold for every look.

## Installing a look

Herdr's manual has the steps an agent follows to add a shared layout: "Layouts and mods other people made" in `~/.config/herdr-app/AGENTS.md`. By hand, for glyph:

1. Put `glyph/mods/glyph/` in `~/.config/herdr-app/mods/`. A new mod folder has to arrive complete ("Installing and reloading" in the platform doc).
2. Copy `glyph/themes/glyph.json` to `themes/`, and `glyph/layouts/glyph.json` and `glyph.svg` to `layouts/`.
3. Merge the `layout:glyph` section of `glyph/keys.json` into `~/.config/herdr-app/keys.json`.
   - Herdr stops auto-updating that file once it has been edited.
   - A key left out keeps Herdr's own action.
   - Do this after step 1: a bar that doesn't know a command ignores it, so the key would do nothing.
4. Run `herdr-app check ~/.config/herdr-app/mods/glyph`, then switch to the layout.

Another look goes in the same way from its own folder. Its recipe lists the files it is built from.

`dev/glyph/tools/sync.sh` updates a copy of glyph that is already installed ([dev/glyph/CONTRIBUTING.md](dev/glyph/CONTRIBUTING.md)).
