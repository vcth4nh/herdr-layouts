# Contributing to glyph

Tune glyph; don't rebuild it.

- The root [CONTRIBUTING.md](../../CONTRIBUTING.md) covers what holds for every look: how to check a change, what goes in which folder, and the shared tools.
- [docs/herdr-platform.md](../../docs/herdr-platform.md), the platform doc, covers what herdr-app and gpui-kit can and can't do.
- [VERIFIED.md](VERIFIED.md) lists what in glyph was checked, with what, and what was never tried.
- [AGENTS.md](AGENTS.md) has the rules for AI agents about the tools below.

## Design rules

- Show programs as logos, states as color and motion, and actions as icons.
- Keep words for names (projects, tabs, branches, machines) and for whatever tells two like things apart, such as what each agent is working on. Make them big enough to read at a glance, and put the rest in tooltips.
- Keep a tooltip to what the thing is and what a press on it does. A control that shows both by itself gets none: the transfer window's arrow has words only for a press that would not copy, or would replace. How it works goes in the recipe.
- Show the same kind of thing the same way everywhere. A rule that hides text on some items and not others reads as a bug.
- Something being moved should show where it will land.
- Rows that can be picked follow a file manager's rules: a click picks one, ⇧ a range, ⌘ one more, and a held row can be swept over others or carried.
- Words on show, in glyph or in a Herdr dialog it opens, must match what glyph does. A row that holds nothing should not take a row's room.
- Keep the labelled rail as the default. The first version had a logos-only 160px rail with small machine names, and it wasn't clear at a glance which agent was which.
- Closing a tab never moves you to another project. Neither does a tab that ends by itself, such as a shell left with Ctrl+D.
- Closing a project never moves you to another machine while its machine has another project. What shows next is the row after the closed one in the rail, else the row before it, as after a closed tab.
- Ending anything that isn't a plain shell takes a second press.
- With a peek over a tab, a close key closes the peek. It never ends what the peek shows or the tab under it.
- Copying a file over another takes a second press, and glyph never removes a file.
- A password is typed for one copy and kept in memory only until that copy has it: never in a shared value, `localStorage` or a file. glyph gives no machine a lasting way into another.
- glyph has to be usable on every system Herdr runs on: macOS, Linux and Windows. What only one system has, such as the Dock badge, may add to glyph there and must do no harm elsewhere.
- Keys are bound in `keys.json`, not in mod code.
- Each command has a key on macOS, with ⌘, and one on Linux and Windows, with Ctrl+Shift like Herdr's own keys there. On each system glyph takes Herdr's key for the same job (a new tab, closing, the picker), and otherwise a key Herdr leaves free. A hover shows the key for the system it runs on.

## Tools

Paths below are relative to `dev/glyph/`. Every script finds that folder and the look's folder (`glyph/`) from its own location, and writes under `dev/glyph/.local/`.

- `tools/sync.sh [NAME] [layout]` installs `glyph/` into `~/.config/herdr-app`:
  - It copies the mod (leaves first), its icons and fonts, the theme and the thumbnail, and only the files that changed. `layouts/glyph.json` is copied only if the second argument is `layout`. It never touches `keys.json`.
  - An installed `mods/glyph/` also has the app-provided `gpui-kit.d.ts` and `jsconfig.json`, which aren't kept here.
  - Then it runs `herdr-app check`, prints the app's errors, and saves `.local/shots/NAME.png`. It says "STALE" if the window wasn't drawing.
- `harness/check.sh ROLE [PANE] [WIDTH] [TAG] [ACTIVE]` copies `glyph/mods/glyph/` and swaps `from "herdr"` for `harness/herdr-fake.js`, a fixed sample fleet. Then it runs `herdr-app check --print-spec` and writes `.local/harness/out/TAG.txt`.
  - ROLE is `rail`, `bar`, `pane`, `menu`, `blank`, `transfer` or `goto`. For `menu`, PANE is the tab's id. ACTIVE `sp9` adds a project showing its empty page. ACTIVE `bravo/sp7` shows a project with one tab, and gives it the empty page that stands by behind that tab.
  - Env hooks pretend states the check can't reach by itself. `ROOM=n`: the tab strip measured n px. `DRAG=from:to`: a tab held and moved. `ARMED=tab`: a first close press on that tab. `FOLD=a,b`: those machines folded. `TUCK=a,b`: those projects folded, by id (`sp1`, `alpha/sp4`). `PING=1`: the other machines have answered the rail, `alpha` in 38 ms, `bravo` in 270, `charlie` in 640 and `foxtrot` in 1400. `PING=name:ms,name:x`: those answers instead, with `x` for none in time. `HOVER=1`: the pane header under the pointer. `PLATFORM=linux` or `windows`: the mod as on that system, in a window whose buttons the system does not draw. `SURE=1`: a close clicked or chosen once (in the Go-to list, a first close press on the picked tab), or the transfer window's arrow pressed once. `FIND=word`: that word typed in the Go-to list. `COPIES=1`: two copies under way and one that failed. `LISTED=1`: the transfer window with its folders and the machines read. `PICK=side:name,name`: those rows picked on that side (0 is the left). `CARRY=x,y`: the picked rows held and carried to that point of the window, over the other side.
  - For the direct way between two machines, with `LISTED=1` and ACTIVE `alpha/sp4`: `COPIES=direct` puts the window's right side on `bravo` and lists one direct copy, `DIRECT=1` has the window know that `alpha` can log in to `bravo`, and `DIRECT=typed` also puts a word in the password field.
  - A hook rewrites a line of the copy and stops the run if that line is gone.
- `harness/all.sh` runs check.sh on every part in every one of those states and prints one line each.
- `tools/preview.sh [publish]` runs check.sh for every part, turns the trees into HTML with `tools/spec2html.py`, and screenshots them with Playwright's headless Chromium into `.local/preview/`.
  - It also draws the shared picture, `share.png`: the whole window while copies are under way, with the transfer window in the room the terminal's text leaves. With `publish` that becomes `glyph/preview.png`. It shows the sample fleet, so no real name gets into the shared picture.
  - spec2html maps flex 1:1, draws svg as a CSS mask and a text field empty (what is typed is not in the tree), uses line height 1.618, and loads the app's Geist from `.local/fonts/06-GeistRegular.ttf`.
  - `spec2html.py --over F --over-box X,Y,W,H` draws a window overlay's tree over the whole window, in the frame Herdr gives one in a real frame: a 1px border, 6px corners, no shadow.
  - The ttf is extracted from the herdr-app binary and is not ours to publish. Regenerate it with `python3 ../../tools/fontscan.py <herdr-app binary> .local/fonts/`.
  - It uses the last `chromium_headless_shell-*` build in Playwright's cache (`~/Library/Caches/ms-playwright`), or the binary named by `CHROME_HEADLESS_SHELL`.
- `tools/preview-states.sh` does the same for the states of `harness/all.sh`: a folded machine, folded projects, the window as on Linux, a machine that does not answer, a tab and a pane header waiting for their second close press, the tab menu asking again, the Go-to list (as it opens, with a word typed, after a first close press), a project's empty page, and the transfer window (read, with rows picked, with its arrow pressed once, with picked rows carried over the other side, and between two machines of which one can log in to the other: as it opens, with rows picked and with a password typed) beside the bar while copies are under way. `spec2html.py --body F` draws a mod pane's tree where the terminal would be, and with `--only body` a part that is a window of its own.
- `logic/run.sh TEST.mjs` puts the mod next to `logic/kit-stub.mjs`, a gpui-kit/gpui-base stub whose builders record ids, props and handlers. A test calls the handlers with made-up events and reads what the fake `run`/`openOverlay` were asked to do. [VERIFIED.md](VERIFIED.md) has what each test covers and how its last run ended.
  - `bar-test.mjs`: the bar's tabs.
  - `rail-test.mjs`: the rail, the tab menu and the pane header. Its menu section needs the menu role and a tab: `ROLE=menu PANE=alpha/tb8 sh logic/run.sh rail-test.mjs`. The fake app leaves the rail's `whoami` on a machine unanswered, unless the test answers for it with `globalThis.__ping`. Its machine `echo` is out of reach unless the test sets `globalThis.__ready`.
  - `close-test.mjs`: closing, the page that stands by for a last tab, the start keys and the Dock badge, with `ACTIVE=sp2 sh logic/run.sh close-test.mjs`. The fake app keeps what the bar told the Dock icon in `BADGES`. The fake app does nothing by itself, so the test changes the fleet after each command the way Herdr was seen to ("Tabs and projects" in the platform doc).
  - `goto-test.mjs`: the Go-to list. The stub's text field is typed in with `state.type(text, cx)`.
  - `keys-test.mjs`: `glyph/keys.json` against Herdr's own default keys on each system, which it lists, and the keys the hover words show. The fake app pretends another system with `globalThis.__platform`, and other bindings with `globalThis.__keys`.
  - `transfer-test.mjs`: the transfer window, `copy.js` and the bar's part in a copy, with `ACTIVE=sp2 sh logic/run.sh transfer-test.mjs`.
    - Its `press`, `glide` and `lift` call the handlers with made-up pointer events: where the pointer is and which keys are held.
    - The fake fleet has three machines with ssh facts: `alpha` reaches `bravo` by address only, `bravo` reaches `foxtrot`, nothing reaches `alpha`, and `foxtrot`'s OpenSSH is too old to run the copy.
- `tools/await-then-drag.sh` waits until the window is drawing, then runs drag-pass.sh once.
- `tools/drag-pass.sh` and `tools/live-pass.sh` are the filmed live stand-ins. drag-pass plays a pretended drag. live-pass plays every state, then the wider rail. Both restore the real files from `glyph/` in a `trap`.
- `tools/close-pass.py` checks closing, the empty page, a last tab that ends by itself, the project that shows after one closes and the start keys in the real app, after `tools/sync.sh`.
  - It opens throwaway projects of plain shells, sends the commands the keys send (`herdr-app do glyph.close`), tells one lone shell to `exit`, and reads back what Herdr shows.
  - It takes over the Herdr window for about a minute and a half, then closes its projects and puts the window back.
  - It sends a glyph command only while one of its own projects is on show, and closes only ids it made. A project it closes while on show always has another of its projects beside it on this computer: after it, or before it for the last one. So does the project whose one shell it tells to exit. So the project the bar shows next is never a real one.
- `tools/copy-pass.sh A B` runs the mod's own `copy.js` against two real machines, named as `hc machine ls` names them. Nothing shows in the Herdr window.
  - It puts the mod beside a `herdr` module whose `hc` and `exec` are the real ones.
  - It reads folders through each machine's `sh`, copies files with awkward names from this computer to A, from A to B through here and from B back, and compares what came back byte for byte. It lets one copy fail and dismisses it.
  - It writes only in a folder of its own, `/tmp/glyph-copy-pass-N` on A and B and `.local/copy-pass/files` here, and removes them and the terminals it started. A far machine can take seconds for each file: allow a few minutes.
- `tools/direct-pass.sh` tries the direct way between real machines with the mod's own `copy.js`, staged as copy-pass.sh stages it. Nothing shows in the Herdr window.
  - `direct-pass.sh --survey` prints, for every two connected ssh machines, which one gets to the other's password prompt. It writes nothing. Each machine makes one login attempt to each other one, with nothing to log in with, which their ssh servers record.
  - `direct-pass.sh A B` starts a direct copy from A to B and stops at the password prompt, so nothing is copied. It then checks that another machine's host key is refused before any prompt, and that a word typed into a pretend prompt on the machine that ran scp arrives without showing on the screen.
  - `direct-pass.sh A B --ask` asks for a password on the terminal it runs in, without showing it: that of the machine scp logs in to, which it names. It then copies files with awkward names from A to B and back and compares them. If the copy back logs in to the other machine, it asks for that one's password too. It has to be run by someone who has the passwords, in a terminal of their own.
  - It writes only in `/tmp/glyph-direct-pass-N` on A and B, and removes that folder and the terminals it started.
- `tools/transfer-pass.sh MACHINE [MB]` films the transfer window making one real copy, after `tools/sync.sh`.
  - A stand-in `transfer.js` opens the window on two throwaway folders (one under `.local/`, one in `/tmp` on MACHINE), picks a file of MB megabytes (150) and presses the arrow by itself. The real `copy.js`, bar and machines do the rest.
  - The window is over the Herdr window for about twenty seconds. On exit it is closed, the real `transfer.js` put back and both folders removed.
  - Frames land in `.local/shots/transfer-*.png`: read, picked, copying, landed.
  - `transfer-pass.sh pick` films what picking shows, on two throwaway folders of this computer under `.local/`, for about twenty seconds. No other machine is used. The stand-in calls the window's own press, move and release with made-up pointer events: a sweep, one more row with ⌘, a carry let go on a name that is already there, and a carry that copies. The real pointer is never moved. Frames land in `.local/shots/pick-*.png`.
  - `transfer-pass.sh direct A B` films the window between two other machines instead, for about thirty seconds: the answer to whether one can log in to the other, with the password field, a picked row, a made-up word in the field, and a direct copy standing at its prompt, which the stand-in ends. Then the window types a made-up word into a pretend prompt on A. No password is typed and nothing is copied. Frames land in `.local/shots/direct-*.png`.
- `tools/icons.py OUTDIR` writes the mod's icon set: a 24px grid with round 1.8 strokes, drawn in currentColor so the mod can tint them. OUTDIR is `../../glyph/mods/glyph/icons`.
