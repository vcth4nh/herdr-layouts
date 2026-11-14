# herdr-app / gpui-kit: limits and gotchas

Learned while building looks on herdr-app 0.1.15 (2026-11-11 to 2026-11-14). Recheck after an app update.

## Layout and drawing

- In gpui-kit, a bare number in `line_height()` is a multiple of the font size, so write `"16px"`. `flex_shrink()` needs a number.
- Herdr's UI font is Geist, and the app ships only its Regular face, so every weight draws the same and `font_bold()` does nothing. For letters that must be bold, use `font_family("Avenir Next")` (`DISPLAY` in glyph's ui.js).
- A mod can't measure text. glyph's `textWidth` (ui.js) sums Geist's letter widths, which were read from the font inside the app binary (`dev/glyph/fonts/geist.json`). It comes out 1–5px wide on a 120px label, never narrow.
- To share a row's width fairly, give the row a definite width (`flex_1`) and give each item `flex_grow(1).flex_basis(0).max_w(<its own width>)`.
- Slides: `.relative().left(n).transition("left", {duration, easing})` animates between renders. The animation is tied to the element's id.
- There is no z-order: whatever must be on top has to be drawn last.
- A popup opened without a fixed size is as tall as what it holds. A scrolling area (`overflow_y_scrollbar`) adds no height of its own: with only `max_h` it collapsed to nothing (seen 2026-11-14). Give it a height, the sum of its rows up to a cap, as the shipped `picker` does.

## Input

- There is no pointer capture and no drag API. An element gets moves only while hovered (`on_mouse_move`) and a release only over itself (`on_mouse_up`). It gets `on_hover(false)` when the pointer leaves, even with a button held. Herdr's own `tabs` and `spaces` mods use the same hooks. "Watch out" in glyph/RECIPE.md says how the glyph bar copes.
- When one mod fills several roles, `<mod>.<command>` keys go to whichever copy awaits `nextCommand()`, as the shipped `win98` does.
- A `layout:<name>` section in `keys.json` binds keys only while that layout shows, and wins over `global`. Settings has no key editor; `keys.json` is where keys are set.
- `herdr-app do <mod>.<command>` sends a mod the same command its key would. That tests what a key does without pressing it.
- `openOverlay` takes `at: "top"` with `offset: n` for a popup under the window's top edge, as the shipped `terminals-bar` opens `picker`. `herdr.d.ts` lists only `"pointer"` and `{x, y}`.
- Popups stack: a second `openOverlay` leaves the first one open under it. `overlay.close` with no id closed the top popup. `herdr-app commands` says it closes "the top dialog or popup"; what it does to a window was not tried.
- An error thrown inside the loop around `nextCommand()` ends the loop, and every key bound to the mod stops working until it reloads. Catch errors inside the loop.

## Data

- The app decodes Claude's OSC 7501 title/msg, which Claude sends base64-encoded.
- The app's `terminals()` report has {state, kind, msg, title}, but `status_ms` is null. `tab.changed_at` and `working_since` are reliable.
- A terminal nobody titled reports its address (e.g. "alpha/t1t") as its title.
- Agent titles can start with status glyphs, and Codex's end with " | <project or folder>".
- `hc machine ls` lists machines.
- A tab started with `argv` reports that program, not the shell it runs in: `program.shell` is false while `cat` runs.
- A terminal an agent started with `hc run` is in `terminals()` with `parent` set to its starter's address, and with `name` if it was started with `--name`. It has no pane, so `panes()` leaves it out. `herdr-app ls` lists it under its parent's `sub_agents`.
- `hc ls` and `herdr-app ls` list terminals only. A helper inside an agent's own process (Claude Code's Agent tool) was in neither while it ran (checked 2026-11-14).

## Tabs and projects

Checked on 2026-11-14 with throwaway tabs.

- `tab.new` opens the tab right after the shown one and shows it.
- `tab.select {id}` on a tab of another project shows that project too.
- Closing the shown tab shows the tab after it, or the one before it when it was the last. A tab whose program exits goes the same way.
- Closing a tab that isn't shown changes nothing on screen. That holds for the last tab of a project that isn't shown, which closes the project.
- Closing the last tab of the shown project closes the project, and Herdr shows the next project in the list, which can be on another machine, on the tab it was last left on. `tab.close` asks first there unless `confirmed` is set.
- A new project goes after this computer's other projects, before those of other machines.
- A project always has a tab, but the tab's only pane can be a mod: `tab.new {space, mod, props}`. `panes()` lists that pane with `terminal: null` and `mod`, and `herdr-app ls` lists the tab with no terminals.
- With no terminal left, an unnamed project is called after the folder it was made in (`~` for home), and a new tab starts in that folder (`spaces()[i].folder`). Before that, both followed its terminals, so the folder is often a different one.

## Mod code

- `cx.notify()` throws during `render`. The manual allows it from an event handler or a task, and says nothing about running commands in `render`. glyph's bar runs its own follow-up commands from a timer (`look()` in bar.js).
- Copies of a mod share its module code, but each has its own instance and `localStorage`. To pass something from one copy to another, use `setShared` (`closeTab` in glyph's data.js), which also redraws every copy. A module-level variable is shared by the copies too, and redraws nothing (`going` in glyph's data.js).
- A copy in an overlay gets `close()` on its exported View when the overlay goes, whoever closed it: glyph's Go-to list was closed with `herdr-app do overlay.close` and had cleared `going` by the next command (2026-11-14).

## Can't be done (checked)

- No cursor trail or any cursor animation (checked 2026-11-14). A theme file is colors only (`background`, `foreground`, `selection`, `cursor`, `ansi`, `colors`). The look keys are `theme`, `colors`, `font`, `font_size`, `ui_font`, `terminal_padding` and `terminal_opacity`, and no trail-like name is in the binary. A mod can't fake a trail either:
  - Mods can't change how a terminal draws.
  - Neither `herdr.d.ts` nor `hc schema` gives the cursor's position (only its color; `hc read` returns text alone), the cell size or a pane's pixel rectangle.
  - Every way to draw over a terminal (floating block, popup/window overlay, hover header) swallows the pointer.
- A layout can't set a Dock badge (lsappinfo only stores strings).

## Installing and reloading

- The app reloads on save.
- A new mod folder must appear complete, with `mod.json` `{ "place": "none" }` inside, or the app docks it somewhere. Build it elsewhere on the same volume and `mv` it in.
- When updating, copy leaf modules before the ones that import them (`dev/glyph/tools/sync.sh` does this).

## Sharing a look

Checked on 2026-11-14 against Herdr's manual ("Layouts and mods other people made") and public repos with the `herdr-layout` topic.

- A shared layout is a folder laid out like the app's home: `layouts/<name>.json`, the `mods/<name>/` it needs, `RECIPE.md`, `preview.png`, and maybe a `keys.json` to merge. The manual gives the recipe's six parts and their order.
- It goes in a public GitHub repo with the topic `herdr-layout`. A repo with one layout keeps those folders at its root. A repo with several keeps one folder per layout at its root, as `herdrdev/herdr-layout-examples` does. Whether herdr.dev lists a folder any deeper was not tried.
- The manual's install steps name the layout file and the mod folders, not `themes/`. Layouts that bring a theme keep it in `themes/` in their folder and say in the recipe to copy it.
- What Herdr shows when a layout names a theme file that isn't there was not tried. Another layout's recipe says it falls back to Herdr's default theme.

## Looking at the real window

- `herdr-app shot` takes about 40 ms and returns the last drawn frame. That frame is stale whenever the window is not on screen, which is often for a full-screen window. Two shots a moment apart that are byte-identical mean the app isn't drawing. Either wait for it in a background loop (`tools/await-frame.sh`) or ask the user to look at Herdr.
- To see motion, or states real work doesn't show:
  1. Wait for the window to draw.
  2. For a few seconds, swap in a stand-in file whose `run`/`openOverlay` are stubs and which plays the state on timers.
  3. Film it with repeated shots.
  4. Put the real file back in a `trap`.

  `dev/glyph/tools/drag-pass.sh` and `live-pass.sh` do this.
- Commands that end tabs can be tried on throwaway tabs in the real window, since `herdr-app do` returns the ids of what it made and `herdr-app status` and `ls` say what is shown. `dev/glyph/tools/close-pass.py` does this. It changes what the window shows while it runs.
- `herdr-app check <dir>` writes the app's `gpui-kit.d.ts` and `jsconfig.json` into `<dir>`. Both are gitignored here.
- `herdr-app status` lists the open overlays by their mod's name, toasts among them. `shot` shows them.
- `--print-spec` prints a text field as `Input #n`, without its text or placeholder.
- `herdr-app check <dir> --print-spec` never lays out, so `on_size_change` never fires there. State that depends on a measured size has to be set by hand (glyph's harness has `ROOM=n` for this).
- Test instances need short `HERDR_APP_HOME` and `XDG_STATE_HOME` paths, because socket names are limited to 103 bytes. They also need their own `HC_SESSION`.
