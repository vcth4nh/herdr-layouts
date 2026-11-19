# herdr-app / gpui-kit: limits and gotchas

Learned while building looks on herdr-app 0.1.15 (2026-11-11 to 2026-11-15). Recheck after an app update.

## Layout and drawing

- In gpui-kit, a bare number in `line_height()` is a multiple of the font size, so write `"16px"`. `flex_shrink()` needs a number.
- Herdr's UI font is Geist, and the app ships only its Regular face, so every weight draws the same and `font_bold()` does nothing. For letters that must be bold, use `font_family("Avenir Next")` (`DISPLAY` in glyph's ui.js).
- A mod can't measure text. glyph's `textWidth` (ui.js) sums Geist's letter widths, which were read from the font inside the app binary (`dev/glyph/fonts/geist.json`). It comes out 1–5px wide on a 120px label, never narrow.
- To share a row's width fairly, give the row a definite width (`flex_1`) and give each item `flex_grow(1).flex_basis(0).max_w(<its own width>)`.
- Slides: `.relative().left(n).transition("left", {duration, easing})` animates between renders. The animation is tied to the element's id.
- There is no z-order: whatever must be on top has to be drawn last.
- A `flex_1` child after the rows of an `overflow_y_scrollbar` column takes the height the rows leave: 3px under 14 rows of glyph's transfer window, 0 under a list that scrolled (measured with `on_size_change`, 2026-11-15).
- A popup opened without a fixed size is as tall as what it holds. A scrolling area (`overflow_y_scrollbar`) adds no height of its own: with only `max_h` it collapsed to nothing (seen 2026-11-14). Give it a height, the sum of its rows up to a cap, as the shipped `picker` does.

## Input

- There is no pointer capture and no drag API. An element gets moves only while hovered (`on_mouse_move`) and a release only over itself (`on_mouse_up`). It gets `on_hover(false)` when the pointer leaves, even with a button held. Herdr's own `tabs` and `spaces` mods use the same hooks. "Watch out" in glyph/RECIPE.md says how the glyph bar and the transfer window cope.
- A move does not say whether a button is down: `MouseMoveEvent` in `gpui-kit.d.ts` has `position`, `local_position`, `bounds` and `modifiers`. A mod that follows a held button has to remember the press and end the hold itself.
- A press, a release and a move carry the keys held (`event.modifiers`: `shift`, `control`, `alt`, `platform`), by `gpui-kit.d.ts`. A mod that does not hold the keyboard can still tell a Shift-click. ⇧ and ⌘ clicks worked by hand in glyph's transfer window (2026-11-15).
- When one mod fills several roles, `<mod>.<command>` keys go to whichever copy awaits `nextCommand()`, as the shipped `win98` does.
- A `layout:<name>` section in `keys.json` binds keys only while that layout shows, and wins over `global`. Settings has no key editor; `keys.json` is where keys are set.
- `keys.json` has no section for one system: every key in it is bound on all of them. By herdr-app's source (the public `herdrdev/herdr-app`, tag `v0.1.15`):
  - `cmd`, also spelled `super` or `win`, is the Super key on Linux and the Windows key on Windows. `secondary` is `cmd` on macOS and `ctrl` elsewhere (`Keystroke::parse` in `vendor/gpui-pre/src/platform/keystroke.rs`).
  - Herdr's own keys are `defaults/keys.macos.json` on macOS and `defaults/keys.json` on Linux and Windows, which uses Ctrl+Shift where macOS uses ⌘. 0.1.16 adds ⌘M (minimize) and, in a terminal, ⌘A (select all) on macOS, and keeps the Linux and Windows file as it was.
  - `keys()` lists the bindings by section, then by key, in byte order: `cmd-t` comes before `ctrl-shift-t` (`listing()` in `src/keys.rs`).
- `herdr-app do <mod>.<command>` sends a mod the same command its key would. That tests what a key does without pressing it.
- `openOverlay` takes `at: "top"` with `offset: n` for a popup under the window's top edge, as the shipped `terminals-bar` opens `picker`. `herdr.d.ts` lists only `"pointer"` and `{x, y}`.
- Popups stack: a second `openOverlay` leaves the first one open under it. `overlay.close` with no id closed the top popup, and `herdr-app commands` says it closes "the top dialog or popup". It leaves a window overlay open ("Looking at the real window" below).
- Herdr's peek (`terminal.peek`) dims the window as a dialog does, and holds a layout: `herdr-app status` lists it as `layout`. While it is open, `focused()` gives the peeked terminal with `pane` null, no pane in `panes()` is `focused`, and a `<mod>.<command>` still reaches a mod under it. `overlay.close` with no id closes it: its terminal keeps running, and the pane under it has the keyboard again (herdr-app 0.1.16, 2026-11-19, a peek opened by command on a terminal without a pane).
- An error thrown inside the loop around `nextCommand()` ends the loop, and every key bound to the mod stops working until it reloads. Catch errors inside the loop.

## Data

- The app decodes Claude's OSC 7501 title/msg, which Claude sends base64-encoded.
- The app's `terminals()` report has {state, kind, msg, title}, but `status_ms` is null. `tab.changed_at` and `working_since` are reliable.
- A terminal nobody titled reports its address (e.g. "alpha/t1t") as its title.
- Agent titles can start with status glyphs, and Codex's end with " | <project or folder>".
- A tab started with `argv` reports that program, not the shell it runs in: `program.shell` is false while `cat` runs.
- A terminal an agent started with `hc run` is in `terminals()` with `parent` set to its starter's address, and with `name` if it was started with `--name`. It has no pane, so `panes()` leaves it out. `herdr-app ls` lists it under its parent's `sub_agents`.
- `hc ls` and `herdr-app ls` list terminals only. A helper inside an agent's own process (Claude Code's Agent tool) was in neither while it ran (checked 2026-11-14).
- `hc ls --json` gives a short record for each terminal (`address`, `agent`, `cwd`, `state`, `exit_code`, `reason`), without its labels or `argv`. `hc get <t> --json` has those. `hc ls --label k=v` keeps the terminals with that label, and `--all` adds the finished ones, which stay until `hc rm`. `hc get` on a terminal that is gone exits 3.
- `hc machine ls` lists machines. With `--json` each has its `target` (what ssh is given: a Host, `user@host` or `user@host:port`) and `via` (false for a machine reached over ssh; one added with `--via` was not looked at). Nothing in it says how quick a machine is to answer.
- `hc exec --on <machine> true` came back in the time of one ICMP ping to that machine plus 35 to 45 ms, on five machines, from a few milliseconds to over 200 ms away (2026-11-16). No ssh was started on this computer for a run, and eight runs in a row changed no file under `~/.local/state/herdr-core` here. What the other machine keeps of a run was not looked at. A mod's `exec` with `on` took about as long in glyph's rail, which times it as a measure of the connection.

## Files between machines

Checked on 2026-11-14 with hc 0.1.20.

- hc has no command that copies from one machine to another. `hc file write`, `hc put` and the input and output of `hc exec` carry at most 8 MB a call, and `hc file read` is for text.
- A mod's `exec` ends a program after 10 minutes at most (`herdr.d.ts`). A program started with `hc run --bg --no-parent` has no such limit and is herdr-core's, which keeps terminals alive when the window closes. It has no pane and no parent, so glyph's rail gives it no row. `terminal.peek` on one was not tried.
- `scp -3` given two paths on this computer copies between them (2026-11-15).
- `scp -3` run on this computer copies between any two ssh machines hc knows, through here. With OpenSSH 9 or later scp speaks SFTP: every path is taken as written, except a source on another machine, which is matched there as a pattern (escape `\ * ? [ ] { }`). glyph's `copy.js` builds on this.
- A mod's `exec` keeps NUL bytes in a program's output, on this computer and through `on` (glyph's folder listing splits on them).
- `hc run --on <machine>` starts a program in a terminal of that machine's herdr-core, addressed `machine/t7`. From this computer `hc read`, `send`, `kill`, `get` and `rm` take that address, and a mod's `hc()` does the same. Such a terminal, started with `--no-parent`, was not in the output of `herdr-app ls` while it ran.
- `hc send <t> <text>` types the text and Enter into the terminal's program. Sent to a prompt that had turned echo off, the text was not on the screen afterwards, and in no file under `~/.local/state/herdr-core` or `~/.config/herdr-core`, on this computer and on a Linux machine. `hc send --force -- <t> <text>` takes a text that starts with `-`.
- `hc kill <t>` ends the program. `hc get` then gives `state: "finished"` and `reason: "killed"`, with `exit_code` 1 for an scp that stood at a prompt, and `exit_code` null with `signal` 1 for a `sleep`.
- scp in SFTP mode (OpenSSH 10.2):
  - It does not expand braces in a source on another machine: `host:/dir/{a,b}` was looked for as one name.
  - Three sources fetched from another machine were three logins, one after the other. Three local sources sent to another machine were one.
- ssh can be told the one host key to accept, with nothing read or written on the machine that runs it: `-o StrictHostKeyChecking=yes -o UserKnownHostsFile=/dev/null -o GlobalKnownHostsFile=/dev/null -o "KnownHostsCommand=/bin/echo * <type> <key>"` (OpenSSH 9.6, 10.2 and 10.3). With another key it ends with "Host key verification failed." The `*` reached `echo` as written, so the command is not run through a shell. A command without its full path was not tried.
- An ssh that may not ask anything says how far it got. With `BatchMode=yes` and `PubkeyAuthentication=no` it ends with `Permission denied (publickey,password).`: the machine was reached, its host key accepted, and those are the logins it takes. glyph's `copy.js` reads this to learn whether one machine can log in to another by password.
- An ssh started without a terminal can wait forever on a key agent that wants an answer from a person (seen once, through `hc exec`). `-o PubkeyAuthentication=no -o IdentityAgent=none` keeps it from asking, and `-F none` keeps that machine's ssh settings out of it.

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
- `space.new` and `tab.new` take `focus: false` since herdr-app 0.1.16. Checked on 2026-11-19 with that version, by `herdr-app do` on a throwaway project that was never on show:
  - The project and the tab on show, and the pane with the keyboard, stayed as they were (`herdr-app status`). The new tab went last in its project, which kept showing the tab it showed.
  - `tab.settle {id}` put away a tab that its project was not showing: `herdr-app ls` then lists it with `settled: true`. Herdr's changelog does not say which version brought the command.
  - A shell that exited took its tab with it, and its project stayed, because it had another tab: one whose only pane is a mod. That tab became the one the project shows. Put away, it stayed put away.
  - When the shown tab's program exits, the tab after it takes over even when it is put away. By Herdr's manual `tab.next`, `tab.prev` and `tab.select {index}` skip such a tab, which was not tried.
  - The same held in the project on show: its only shell was told to `exit`, and the project stayed on show on its mod tab, which had been put away (glyph's `close-pass.py`, 2026-11-19).

## Mod code

- `cx.notify()` throws during `render`. Herdr's manual (`~/.config/herdr-app/AGENTS.md`) allows it from an event handler or a task, and says nothing about running commands in `render`. glyph's bar runs its own follow-up commands from a timer (`look()` in bar.js).
- Copies of a mod share its module code, but each has its own instance and `localStorage`. To pass something from one copy to another, use `setShared` (`closeTab` in glyph's data.js), which also redraws every copy. A module-level variable is shared by the copies too, and redraws nothing (`going` in glyph's data.js).
- A copy in an overlay gets `close()` on its exported View when the overlay goes, whoever closed it: glyph's Go-to list was closed with `herdr-app do overlay.close` and had cleared `going` by the next command (2026-11-14).
- `InputState.set_masked(true)` draws a field's text as dots. A field in a window overlay showed its placeholder, and dots for a value set from code (2026-11-14). glyph's field asks for the keyboard at a press, and what was typed after a click reached it (by hand, 2026-11-15).
- The app's JavaScript sorts text by letter codes, even through `localeCompare` with options: "README.md" came before "import.py" in `herdr-app check`, where Node puts it after (2026-11-14). Sort names with a comparison of your own (`byName` in glyph's copy.js).

## Can't be done (checked)

- No cursor trail or any cursor animation (checked 2026-11-14). A theme file is colors only (`background`, `foreground`, `selection`, `cursor`, `ansi`, `colors`). The keys on a layout's root that set its look are `theme`, `colors`, `font`, `font_size`, `ui_font`, `terminal_padding` and `terminal_opacity`, and no trail-like name is in the binary. A mod can't fake a trail either:
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
- `overlay.close` left a window overlay (`kind: "window"`) open, with no id and with the window's `key` as the id (2026-11-14). A window closes from inside, with `closeOverlay(props().overlay)`. Another copy of the same mod can close it with that id too: glyph's bar closes the transfer window with the id the window's copy noted in a module variable, so `herdr-app do glyph.transfer` sent again closed it (2026-11-15). To close a window whose mod has no such command from a tool, swap in for a moment a stand-in that closes itself as it starts (`dev/glyph/tools/transfer-pass.sh`).
- `herdr-app check <dir> --print-spec` prints the first render. What a part asked for in `init` through a task (an `exec`, an `hc`) has not answered by then, so such state has to be put in by hand too (glyph's harness has `LISTED=1`).
- `herdr-app status` lists the open overlays by their mod's name only, toasts among them. `shot` shows them.
- `--print-spec` prints a text field as `Input #n`, without its text or placeholder.
- `herdr-app check <dir> --print-spec` never lays out, so `on_size_change` never fires there. State that depends on a measured size has to be set by hand (glyph's harness has `ROOM=n` for this).
- Test instances need short `HERDR_APP_HOME` and `XDG_STATE_HOME` paths, because socket names are limited to 103 bytes. They also need their own `HC_SESSION`.
