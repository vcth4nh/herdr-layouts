# herdr-layouts

Custom looks (layout + theme + mods) for the Herdr desktop app, built against herdr-app 0.1.15 and hc 0.1.20 on macOS. The app reads looks from `~/.config/herdr-app`. ⌘⇧L or Settings switches layouts; `main` is the stock one.

## What is where

- Each look has its own folder at the repo root, in the format Herdr shares layouts in: laid out like `~/.config/herdr-app`, with a recipe and a picture. `glyph/` is the one kept here.

  ```
  glyph/
  ├── RECIPE.md            what it shows and does, and what it is built from
  ├── preview.png
  ├── keys.json            the keys it expects, to merge into yours
  ├── layouts/glyph.json   and glyph.svg, the layout picker's thumbnail
  ├── mods/glyph/
  └── themes/glyph.json
  ```

- `dev/<look>/` holds what builds and tests that look. None of it is installed.
- `tools/` holds the helpers shared by all looks.
- [CONTRIBUTING.md](CONTRIBUTING.md) covers glyph's design rules, the tooling and how to check a change.
- [docs/herdr-platform.md](docs/herdr-platform.md) covers what herdr-app and gpui-kit (the JavaScript UI kit Herdr's mods are written with) can and can't do, and how looks are shared.
- [docs/glyph-verified.md](docs/glyph-verified.md) lists what in glyph was checked, with what, and what was never tried.
- [AGENTS.md](AGENTS.md) has the rules for AI agents.

## Installing glyph

Herdr's manual has the steps an agent follows to add a shared layout: "Layouts and mods other people made" in `~/.config/herdr-app/AGENTS.md`. By hand:

1. Put `glyph/mods/glyph/` in `~/.config/herdr-app/mods/`. A new mod folder has to arrive complete ("Installing and reloading" in the platform doc).
2. Copy `glyph/themes/glyph.json` to `themes/`, and `glyph/layouts/glyph.json` and `glyph.svg` to `layouts/`.
3. Merge the `layout:glyph` section of `glyph/keys.json` into `~/.config/herdr-app/keys.json`.
   - Herdr stops auto-updating that file once it has been edited.
   - A key left out keeps Herdr's own action.
   - Do this after step 1: a bar that doesn't know a command ignores it, so the key would do nothing.
4. Run `herdr-app check ~/.config/herdr-app/mods/glyph`, then switch to the layout.

`dev/glyph/tools/sync.sh` updates a copy that is already installed ([CONTRIBUTING.md](CONTRIBUTING.md)).
