# Contributing

Tune glyph; don't rebuild it. Read [docs/herdr-platform.md](docs/herdr-platform.md) before building anything.

## glyph's design rules

- Show programs as logos, states as color and motion, and actions as icons.
- Keep words for names (projects, tabs, branches, machines) and for whatever tells two like things apart, such as what each agent is working on. Make them big enough to read at a glance, and put the rest in tooltips.
- Show the same kind of thing the same way everywhere. A rule that hides text on some items and not others reads as a bug.
- Something being moved should show where it will land.
- Words the app shows must match what the UI does. A row that holds nothing should not take a row's room.
- Keep the labelled rail as the default. The first version had a logos-only 160px rail with small machine names, and it wasn't clear at a glance which agent was which.
- Closing a tab never moves you to another project.
- Ending anything that isn't a plain shell takes a second press.
- Keys are bound in `keys.json`, not in mod code.

## Checking a change

Check a change in frames from the real app (`herdr-app shot`), not just a parse. "Looking at the real window" in the platform doc says when a frame is stale and how to film motion.

## The shared folder

- A look's folder holds only what is shared: `layouts/`, `mods/`, `themes/`, `keys.json`, `RECIPE.md` and `preview.png`. Tools, tests and their output go under `dev/`.
- [glyph/RECIPE.md](glyph/RECIPE.md) is the one description of what glyph shows and does, in the order Herdr's manual asks of a recipe. When a change alters what it says, change the recipe with it.
- Renew `glyph/preview.png` when the picture is no longer true (`tools/preview.sh publish` below).

## Tooling

Everything the tools write goes under a `.local/` folder. Any `.local/` folder in this repo is gitignored and meant for local files.

### Shared tools

`tools/` at the repo root holds the helpers that work for any look. The two that save frames write to the root `.local/shots/`.

- `await-frame.sh` and `await-project.sh NAME` wait until the window is drawing (or showing project NAME) before taking a frame.
- `crop.py` and `filmstrip.py` cut regions out of frames.
- `inkrows.py` finds text bands in a frame.
- `contrast.py` checks theme contrast.
- `advances.py` reads font advance widths.
- `fontscan.py` saves the fonts embedded in a binary.
- `doc.py NAME…` prints gpui-kit.d.ts docs for a method.

### glyph's tools

Paths below are relative to `dev/glyph/`. Every script finds that folder and the look's folder (`glyph/`) from its own location, and writes under `dev/glyph/.local/`.

- `tools/sync.sh [NAME] [layout]` installs `glyph/` into `~/.config/herdr-app`:
  - It copies the mod (leaves first), the theme and the thumbnail, and only the files that changed. `layouts/glyph.json` is copied only if the second argument is `layout`. It never touches `keys.json`.
  - An installed `mods/glyph/` also has the app-provided `gpui-kit.d.ts` and `jsconfig.json`, which aren't kept here.
  - Then it runs `herdr-app check`, prints the app's errors, and saves `.local/shots/NAME.png`. It says "STALE" if the window wasn't drawing.
- `harness/check.sh ROLE [PANE] [WIDTH] [TAG] [ACTIVE]` copies `glyph/mods/glyph/` and swaps `from "herdr"` for `harness/herdr-fake.js`, a fixed sample fleet. Then it runs `herdr-app check --print-spec` and writes `.local/harness/out/TAG.txt`.
  - ROLE is `rail`, `bar`, `pane`, `menu`, `blank` or `goto`. For `menu`, PANE is the tab's id. ACTIVE `sp9` adds a project showing its empty page.
  - Env hooks pretend states the check can't reach by itself. `ROOM=n`: the tab strip measured n px. `DRAG=from:to`: a tab held and moved. `ARMED=tab`: a first close press on that tab. `FOLD=a,b`: those machines folded. `HOVER=1`: the pane header under the pointer. `SURE=1`: a close clicked or chosen once (in the Go-to list, a first close press on the picked tab). `FIND=word`: that word typed in the Go-to list.
  - A hook rewrites a line of the copy and stops the run if that line is gone.
- `harness/all.sh` runs check.sh on every part in every one of those states and prints one line each: 22 runs, all passing on 2026-11-14.
- `tools/preview.sh [publish]` runs check.sh for every part, turns the trees into HTML with `tools/spec2html.py`, and screenshots them with Playwright's headless Chromium into `.local/preview/`.
  - With `publish`, the whole-window picture also becomes `glyph/preview.png`. It shows the sample fleet, so no real name gets into the shared picture.
  - spec2html maps flex 1:1, draws svg as a CSS mask and a text field empty (what is typed is not in the tree), uses line height 1.618, and loads the app's Geist from `.local/fonts/06-GeistRegular.ttf`.
  - The ttf is extracted from the herdr-app binary and is not ours to publish. Regenerate it with `python3 ../../tools/fontscan.py <herdr-app binary> .local/fonts/`.
  - It uses the last `chromium_headless_shell-*` build in Playwright's cache (`~/Library/Caches/ms-playwright`), or the binary named by `CHROME_HEADLESS_SHELL`.
  - These previews matched the real window closely.
- `tools/preview-states.sh` does the same for the states of `harness/all.sh`: a folded machine, a tab and a pane header waiting for their second close press, the tab menu asking again, the Go-to list (as it opens, with a word typed, after a first close press), and a project's empty page. `spec2html.py --body F` draws a mod pane's tree where the terminal would be.
- `logic/run.sh TEST.mjs` puts the mod next to `logic/kit-stub.mjs`, a gpui-kit/gpui-base stub whose builders record ids, props and handlers. A test calls the handlers with made-up events and reads what the fake `run`/`openOverlay` were asked to do. This is the only testing clicks, drags and menus have had.
  - `bar-test.mjs`: 60 passed (2026-11-14).
  - `rail-test.mjs`: 38 passed (2026-11-14). It covers the rail, sub-agent rows, the fold, the tab menu and the pane header. Its menu section needs the menu role and a tab: `ROLE=menu PANE=alpha/tb8 sh logic/run.sh rail-test.mjs`.
  - `close-test.mjs`: 59 passed (2026-11-14). It covers the bar's closing, the empty page, the first tab of the next project and the start keys: `ACTIVE=sp2 sh logic/run.sh close-test.mjs`. The fake app does nothing by itself, so the test changes the fleet after each command the way Herdr was seen to ("Tabs and projects" in the platform doc).
  - `goto-test.mjs`: 42 passed (2026-11-14). It covers the Go-to list (what it lists and by which words, typing, the arrows, Enter, Ctrl+D, its height) and the bar opening and closing it. The stub's text field is typed in with `state.type(text, cx)`.
- `tools/await-then-drag.sh` waits until the window is drawing, then runs drag-pass.sh once.
- `tools/drag-pass.sh` and `tools/live-pass.sh` are the filmed live stand-ins. drag-pass plays a pretended drag. live-pass plays every state, then the wider rail. Both restore the real files from `glyph/` in a `trap`.
- `tools/close-pass.py` checks closing, the empty page and the start keys in the real app, after `tools/sync.sh`.
  - It opens throwaway projects of plain shells, sends the commands the keys send (`herdr-app do glyph.close`), and reads back what Herdr shows.
  - It takes over the Herdr window for about a minute and a half, then closes its projects and puts the window back.
  - It sends a glyph command only while one of its own projects is on show, and closes only ids it made. A project it closes while on show always has another of its projects after it, so the first-tab rule never touches a real one.
- `tools/icons.py OUTDIR` writes the mod's icon set: a 24px grid with round 1.8 strokes, drawn in currentColor so the mod can tint them. OUTDIR is `../../glyph/mods/glyph/icons`.

## What has been verified

- **Seen in real frames:**
  - The rail, labelled and with a real fleet, including the row of empty machines.
  - The bar and titled strip with 2 and 7 tabs.
  - The pane header and all four states.
  - A pretended drag filmed in the real strip (stand-in bar.js, 3 s): the lifted tab stayed on top, the others slid under it and aside, and it returned cleanly at the end.
  - The chevrons on the machines' lines, the shell logo on the plain-terminal launcher, a tab red after its first close press, and a project's empty page.
  - The Go-to list over a real fleet, opened by its command: on the shown tab and scrolled to it, with agents' titles where Herdr's picker had numbers.
  - Sub-agent rows under a real tab: two helpers started with `hc run`, each on its hook, one at work (the arc, a bright name) and one resting (dim).
- **Checked in the real app by commands** (`dev/glyph/tools/close-pass.py`: 21 passed, 2026-11-14):
  - One press closes a shell and two close a running program. A second press after 3 s counts as a first.
  - The tab after the closed one is shown, or the one before it for the last tab.
  - A last tab leaves its project on its empty page, with the name and folder kept. A new tab from the page starts in that folder. Leaving the page, or the close key on it, closes the project.
  - When the shown project closes, from Herdr's own close or the close key on its page, the next project shows its first tab.
- **Checked in the real app by commands sent by hand** (`herdr-app do glyph.goto`, then `herdr-app status`, 2026-11-14): the command opens the Go-to list, and sent again it closes it. After the list was closed from outside (`herdr-app do overlay.close`), the next one opened it.
- **Seen only offline:** a "needs you" row in the labelled rail, the logos-only rail with larger machine names, the strip's fall-back to logos, the tab menu and its red Close row, the rename dialog's new hint, a folded machine with its strip, the pane header's red ×, and the rows of a blocked sub-agent and of one started by another sub-agent.
- **Never tried with a real pointer or key press:** hover tooltips, clicks (a sub-agent row's peek among them), right-click menus, a real drag, scrolling the strip, F2 and the other bound keys (the live pass sends their commands, not the keys), folding a machine, the launchers on the empty page. Typing in the Go-to list, its arrows, Enter, Ctrl+D and ⌘P itself were not tried either. If something is reported broken, start there.
