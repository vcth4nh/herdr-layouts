# Glyph

An icon-first window for watching coding agents. A dark rail on the left lists every machine, project and tab. A strip on top holds the shown project's tabs. A program is its logo, a state is a color and a motion, and a button is an icon. Words are kept for names and for what tells two agents apart. The colors are Catppuccin Mocha.

![Glyph](preview.png)

## What you see

Three regions: the rail down the left, the bar across the top of the rest, and the shown tab's panes below the bar. Text is Herdr's UI font (Geist). Letters that act as pictures are Avenir Next bold.

**Shared pieces**

- A project is a square tile with two letters ("notes-app" is NA, "kettle" is Ke). Each project gets one of six hues: `#94e2d5`, `#f9e2af`, `#b4befe`, `#cba6f7`, `#89dceb`, `#f5c2e7`. The tile is tinted at 15% with letters in the hue, and filled with `#11111b` letters when its project is on show. A project at home ("~") shows a house and is written "Home".
- A tab is a round orb with its program's logo at 60% of the orb.
- A dashed outline in `#45475a` is an empty place to start something.
- Red (`#f38ba8`) is something one more press will close.

**Rail**

- It is 256px wide on chrome `#11111b`, and resizes from 120px to 420px.
- A strip on top, 5px tall, shows every tab by state in four colored runs.
- Each machine with projects has a 26px line: a 10px chevron, a laptop or server icon, its name at 12.5px, a hairline, and a 18px "+". One machine alone gets no line.
- Under it, each project is a 36px tile beside its name at 13px. The shown project also has a 3px bar at the rail's edge.
- Each tab is a 28px row: a 20px orb and a label at 12.5px. The shown tab's row is raised (`#313244`).
- Each sub-agent is a 24px row under its tab's: a hook in `#45475a` hanging from the logo of whatever started it, a 16px orb and a name at 12px. A sub-agent is a terminal that one of the tab's agents started with Herdr's `hc run`, a helper agent or a plain program, and that has no pane.
- Machines with nothing running share one row of dashed pills at the end.
- A 42px foot has four icon buttons: settings, add a machine, new project, and one that switches the rail between 256px and 160px.
- Narrower than 200px, the rows go, sub-agents' too, and each project's orbs wrap beside its tile.

**Bar**

- It is 42px tall, and is also the window's drag strip.
- The shown project's 22px tile and name at 13.5px, and its machine if it is another one.
- Its tabs as 32px pills: a 24px orb and a title at 12.5px. The shown tab is raised and has an ×.
- A dashed pill of launchers: a plus, up to four installed agents' logos, the terminal logo, and three dots.
- On the right: a peach bell with a count and a green tick with a count when any tab wants you, then Files, Changes, the transfer button (two opposed arrows) and search.
- While files are being copied a blue arc turns around the transfer button. A peach dot on it says a copy failed.
- Where the system draws no window buttons (Linux, Windows), minimize, maximize and close come last.

**Panes**

- Each pane is a card: 12px corners, a 1px border, `#b4befe66` when focused, 8px apart.
- Its 28px header shows the program's logo, the folder when it isn't the project's own, the branch, and the agent's state at the right.

**Empty page**

- A project whose last tab was closed shows a 56px tile, its name at 16px, and a larger dashed pill of the same launchers, centered.

**Go-to list**

- A popup 560px wide under the window's top edge: a search field, then every tab as a 30px row, a 20px orb and its label at 13px, in the rail's order and words.
- Tabs sit under their project's line, a 20px tile and its name. Projects sit under their machine's line when there is more than one machine.
- The picked row is raised (`#313244`). The list is at most 520px tall, then it scrolls.

**Transfer window**

- A floating window, 880 by 560px, on chrome `#11111b`: a 40px head, and under it two sides with a round 38px arrow between them.
- Each side, from the top:
  - Every machine as a 24px chip: a laptop or server icon and its name at 12px. The machine the side shows is raised (`#313244`).
  - 22px tiles for places on that machine: home as a house, the top folder as "/", then each project there.
  - The way down to the folder on show, at 12px, starting from the house or from "/".
  - The folder as a card of 26px rows: a folder or file icon, the name at 12.5px, a file's size at 11px, a folder's chevron. Folders come first, and names that start with a dot come last and dim.
- A picked row is tinted with the accent (`#cba6f7` at 20%).
- The arrow is dashed, with two opposed arrows, while nothing is picked. With rows picked it is filled with the accent and points at the other side.
- The side that would take the files gets an accent border. Dashed rows on top of its list are what would land there, at most four and then a count. A row that would be replaced gets a dashed outline.
- A copy under way is a pill in the head: a 16px orb with an arrow and the turning blue arc, its first name and how many more, the machine it goes to, and scp's percent for a single file. One that failed wears the peach ring and "!".

## How it behaves

**Agent states**

- Working: a blue (`#89b4fa`) arc turns around the orb, once every 1.3 s.
- Blocked: a peach (`#fab387`) ring pulses and carries a "!" badge. The tab's label turns peach in the rail.
- Done: a green (`#a6e3a1`) ring with a tick badge.
- Idle: no ring. The logo fades to 75% after 15 minutes of rest and to 50% after two hours.
- A tab takes the most urgent state of its agents and their sub-agents. Sub-agents add one small dot in their most urgent color.
- A sub-agent's row shows working and blocked as a tab does, and its error counts as blocked. Finished or idle, the row is dim.

**Going places**

- Click a rail row or a bar pill to show that tab. Click a tile or a project's name to show the project.
- Click a sub-agent's row for Herdr's peek at its terminal, over the shown tab.
- Click a color in the strip at the top of the rail, or the bell or the tick in the bar, to go to the next tab in that state.
- Click the project's name in the bar, or search, or press ⌘P, for the Go-to list. It opens on the shown tab.
- Type in it to narrow the list: every word typed must be in a tab's label, its agent's title, its project, its machine or its program. ↑ and ↓ move, and Enter or a click shows the picked tab. A click on a project's line shows that project. Esc or ⌘P again closes the list.
- Scroll over the bar to step through its tabs.
- Hover anything for its words: a tab's title, project, machine, state, how long, and how many sub-agents; a sub-agent's name, title and state.

**Tabs**

- A tab's title is the name it was given, else its agent's own title, else nothing. The rail falls back to its folder or program.
- A sub-agent goes by the name it was started with (`hc run --name`), else its agent's own title, else its program.
- Titles in the bar share the room: short ones stay whole, long ones are cut to a common width, at most 240px. With under 32px each, every tab but the shown one shows its logo only.
- Double-click a tab, press F2, or right-click and choose Rename to name it. The dialog is Herdr's own, with the agent's title as its hint.
- Right-click a tab for Rename, New tab and Close.
- Drag a pill along the bar to move it. It lifts, the others slide aside in 140 ms, and it lands where it stands.

**Starting**

- A logo in the dashed pill starts a tab running that agent. The terminal logo starts a plain shell. The dots open Herdr's full "new" menu.
- ⌘T starts a shell, ⇧⌘C Claude Code, ⇧⌘O Codex.

**Closing**

- A plain shell closes at one press. Anything else takes two within 3 s: the first turns the tab red. This goes for ⌘W, a tab's ×, a pane header's ×, ⇧⌘W, Close in the tab menu, whose row turns red in place, and Ctrl+D on the picked row of the Go-to list, which turns red too.
- A pane alone in its tab closes the tab.
- After a close, the tab after it is shown, or the one before it for the last. Closing a tab that isn't shown moves nothing.
- Closing a project's last tab leaves the project on show as its empty page. A tab started there starts in the folder the last tab was in.
- The empty project closes once another project is shown, or at ⌘W on the page.
- When the project on show closes, the next project shows its first tab.

**Machines**

- Click a machine's name to fold its projects away, and again to bring them back. The chevron points down when they show and right when they are folded. Folded, the line shows the machine's tabs by state as a 4px strip. The fold is kept across restarts.
- "+" on a machine's line starts a project there. A dashed pill does the same for a machine with nothing running.
- A machine that needs a login is drawn in peach and says what to run on hover.

**Panes**

- Hover a pane's header for split right, split down and close. Zoom shows only when the tab has other panes.
- Files and Changes in the bar open Herdr's panels beside the panes.

**Moving files**

- The transfer button in the bar, or ⇧⌘T, opens the transfer window. Its left side opens at the shown tab's folder. Its right side opens where it was left. The first time that is this computer's home, or from this computer the first other machine's.
- Click a machine's chip for its home, a tile for that place, a part of the way down to go back up, and its last part to read the folder again.
- Click a row to pick it, and more rows for more. A folder opens by its chevron or a double-click. A pick on one side lets go of what was picked on the other.
- Click the arrow to copy what is picked into the other side's folder. It is a copy: nothing is removed from where it was.
- When a picked name is already there, the first press turns the arrow and those rows red, and a second press within 3 s replaces them.
- Drop files from outside Herdr (Finder) on a side to copy them into its folder. A drop replaces nothing: if a name is already there it copies nothing and says so.
- A copy goes on when the window closes and when Herdr quits. When it ends a notice says how, and the folders on show are read again.
- A copy that failed stays in the head. Hover it for scp's last line, click it to dismiss it.
- Click a copy under way for Herdr's peek at its terminal: scp's own meter, and the way to end it.
- Drag the window by its head or by any spot that is not a control. Its × closes it.

## Built from

**Layout**

- `layouts/glyph.json`, with `layouts/glyph.svg` as the layout picker's thumbnail.
- Root: a row with `"titlebar": "none"`, `"traffic_lights": [14, 14]`, `"theme": "glyph"`, `"background": "canvas"`, `"terminal_padding": [12, 10]`.
- `sidebar`: a block, 256px, min 120, max 420, the mod with `{ "role": "rail" }`.
- `work`: a column that doesn't resize.
  - `bar`: a block, 42px, `window_drag`, the mod with `{ "role": "bar" }`.
  - `body`: a row, padding 8, gap 8.
    - `main`: a block with `{ "tab": "active" }`. Pane frames: gap 8, radius 12, `lone: true`, header 28px on top, always shown, the mod with `{ "role": "pane" }`.
    - `panel`: a hidden column, 368px (280 to 900), holding the stack `panel-body` of Herdr's `files` and `changes`.

**Theme**

`themes/glyph.json` is Catppuccin Mocha. The layout's root names it, so copy it to `themes/` with the layout. The mod asks `theme()` for its colors by name. Fixed in code are the six project hues, the `#11111b` ink on filled tiles and badges, and the terminal logo's `#4ec95f` when no shell is open to ask.

**Mod**

- `mods/glyph/`, whose `mod.json` is `{ "place": "none", "title": "Glyph" }`.
- `main.js` picks a part from `props().role`: `rail.js`, `bar.js`, `pane.js`, `menu.js` (a popup the mod opens for a tab), `goto.js` (the Go-to list, a popup the bar opens) or `blank.js` (a project's empty page, as a tab's only pane).
- `data.js` shapes Herdr's lists into machines, projects and tabs. `ui.js` draws the tile, the orb and the icon button.
- `transfer.js` is the transfer window, opened as a Herdr window overlay with props `{ "role": "transfer" }`. `copy.js` reads folders and starts, lists and ends copies.
- `icons/`: 31 SVGs on a 24px grid with round strokes, drawn in `currentColor`. Program logos are Herdr's own, from `icons/` in Herdr's home (`~/.config/herdr-app`).

**From Herdr**

- Reads: `spaces`, `panes`, `terminals`, `agents`, `machines`, `focused`, `layout`, `window`, `settings`, `keys`, `updates`, `theme`, `props`, `knownAgents`.
- Calls: `run`, `hc`, `exec`, `openOverlay`, `closeOverlay`, `nextCommand`, `notify`, `shared`, `setShared`, `setAgentOrder`.
- Shared values: `space.colors` (the hues, shared with Herdr's Spaces list), `new-menu.agents` (read), `glyph.blank` (an empty project's name and folder), `glyph.shut` (a close asked of the bar), `glyph.copies` (the copies under way and the ones that failed), `glyph.side` (where the transfer window's right side was left).
- Kept in the rail's `localStorage`: `seen` (since when each tab has rested) and `folded` (the folded machines). Each place the layout puts the mod is a copy with a `localStorage` of its own.
- Commands: `tab.select`, `tab.new`, `tab.close`, `tab.move`, `tab.next`, `tab.prev`, `space.select`, `space.new`, `pane.focus`, `pane.split`, `pane.zoom`, `pane.close`, `terminal.peek`, `mod.open`, `layout.resize`, `layout.select`, `layout.show`, `layout.hide`, `app.settings`, `window.minimize`, `window.maximize`, `window.close`.
- Herdr's own mods, opened as they are: `menu` (the project menu), `prompt` (rename), `new-menu`, `machine-add`, `files`, `changes`.
- `setAgentOrder` follows the rail, so `agent.next` and `agent.prev` walk it top to bottom.

**Programs**

- The rail runs `hc machine ls --json` every 20 s, to learn of machines without projects and of those that need a login. The transfer window does too while it is open, for how ssh reaches each machine.
- The transfer window lists a folder by running `sh` on the machine that side shows, through Herdr's `exec`: a loop over the folder's names and `ls -lnA` for the sizes.
- A copy is `scp -3 -r -o BatchMode=yes -o ConnectTimeout=20`, started on this computer with `hc run --bg --no-parent --no-notify --label glyph.copy=1`. The window reads its screen with `hc read`. When it ends the bar asks how with `hc get`, reads scp's last lines if it failed, and removes the terminal with `hc rm`.
- The mod opens no connection of its own. scp connects to your machines over ssh with your keys, and reads and writes the files you pick. Besides that the mod reads the names and sizes in the folders you browse, and no file outside Herdr's home.

**Keys**

`keys.json` holds a `layout:glyph` section. Each action is a command the bar waits for with `nextCommand()`: `rename`, `new`, `new-<key>` for any agent key in Herdr's program table, `close`, `close-pane`, `transfer`, `goto`.

## Watch out

**Drawing**

- Herdr's UI font has one weight, so bold does nothing. Letters that must be bold use Avenir Next, a macOS font.
- A mod can't measure text. The bar shares its room among titles with a table of Geist's letter widths (`ADVANCE` in `ui.js`), which runs a few pixels wide, never narrow.
- There is no z-order. The dragged tab is a copy drawn last, and the original keeps its place at zero opacity.
- A slide is tied to its element's id. While a drag lasts every tab gets an id unique to that drag, so each drag starts its slides from rest.
- An element hears a release only over itself. A dragged tab lands 400 ms after the pointer leaves the bar unless it comes back, and any later press drops a drag whose release was missed.

**Closing**

- Herdr closes a project with its last tab and shows another project. The empty page is a tab whose only pane is the mod, opened just before the last tab closes. The rail and bar must not count it as a tab.
- With no terminal left, Herdr calls a project after the folder it was made in and starts new tabs there. The page's name and folder come from `glyph.blank`.
- A last tab that ends by itself gets no page: Herdr closes the project and shows the next one.
- A tab whose panes aren't known yet counts as more than a shell.
- Showing a tab also shows its project, so the bar never selects a tab in a project that isn't on show, except to move there.
- When the shown project closes, Herdr shows the next one on the tab it was last left on. The bar selects that project's first tab: before the page goes for ⌘W on a page, and just after for a close from Herdr's own menu or a last tab that ended by itself. A project that is only missing because its machine went out of reach is left alone.
- Every close ends in the bar's `shut()`, because a last tab has to wait for its page. The menu and the pane header ask through `glyph.shut`, since copies of a mod share code but not state.
- The bar runs its follow-up commands from a 120 ms timer, not from `render`. With nothing drawn it still looks about once a second.
- An error inside the loop around `nextCommand()` would end every key. The loop catches it and posts a notice.

**Sub-agents**

- Only terminals get rows. A helper that runs inside its agent's own process, such as Claude Code's Agent tool, is not a terminal, and Herdr reports nothing about it.
- A row lasts as long as its terminal. A program an agent runs through `hc run` and waits for has a row until it exits, so rows come and go.
- A sub-agent that was given a pane (`terminal.keep`, or keep in the peek) is a pane like any other and has no row. What it started is listed under the tab that holds its pane.
- The rail keeps times for tabs only, so a resting sub-agent does not fade by age as a tab does. It is dim at once.

**Go-to list**

- Herdr's own picker lists an unnamed tab by its number, so the bar opens the mod's list instead. ⌘P reaches it only through the `layout:glyph` keys. Without them ⌘P still opens Herdr's picker.
- The popup is only as tall as what it holds, and a scrolling area holds nothing by itself. The list's height is the sum of its rows, up to 520px.
- Copies of a mod share its modules. The list notes its overlay in a variable of `data.js` when it starts and clears it when Herdr calls its `close()`. That is how the bar knows to close the list when asked for it again.
- It lists tabs only: no sub-agents, and none of the rows Herdr's picker has for a new tab or a new project.

**Keys**

- `keys.json` is written for macOS. Whoever installs the layout merges its section by hand into their own `~/.config/herdr-app/keys.json`, after the mod is in place: ⌘T and ⌘W go to the bar, and a bar that doesn't know a command ignores it.

**Titles**

- A terminal nobody titled reports its address as its title, which counts as none. So does a title that only repeats the program's name.
- Leading status glyphs and Codex's trailing " | project" are cut.
- An unnamed tab goes by its agent's title, not its number. That is why tabs have the mod's own right-click menu and rename hint. The project menu and ⇧F2, which renames the project, are Herdr's.

**Moving files**

- scp has to be OpenSSH 9 or later on this computer: from then on it speaks SFTP and takes a path as it is written. A source name on another machine is still matched there as a pattern, so `\ * ? [ ] { }` in it are escaped.
- A machine is reached by the ssh target `hc machine ls` gives for it. A machine added with `hc machine add --via`, which is reached by a command instead of ssh, has none, and can't be copied to or from. Two machines on different ssh ports can't be paired in one copy.
- A copy between two other machines passes through this computer (`-3`), so the two need not reach each other, and this computer has to stay on until it ends. It is as fast as the slower of the two links.
- scp runs with `BatchMode=yes`. A machine that would ask for a password or a passphrase fails at once, and the failed copy says so.
- scp replaces a file of the same name without asking. The two presses are the mod's own, from the names the other side showed when it was last read. A drop is one gesture, so it replaces nothing.
- A copy is not a tab and gets no row in the rail: its terminal has no pane and no parent. `hc ls --all --label glyph.copy=1` lists the copies hc still has.
- The bar says how a copy ended. With another layout on show the copy still runs, and its notice comes when glyph shows again.
- scp's percent is for the file it is on, so the pill shows it for a single file only.
- Folders are read by the machine's own `sh`, so only Unix machines can be browsed. A folder shows its first 1000 entries. A size comes from `ls -l`, and a name with a line break in it shows none.
- The app sorts text by letter codes, every capital before every small letter. The mod sorts names itself, whatever their case and with numbers by value.
- Herdr's manual says a window overlay does not take the keyboard when it opens, and the mod never asks for it, so the window has no keys of its own. A layout switch closes it.

**Limits**

- The launcher pill shows at most four agents.
- The rail's default must stay labelled. A rail of logos alone did not say which agent was which.
- Not built: git ahead and behind counts, dragging to reorder projects, a custom toast, a menu on a sub-agent's row (the peek has keep and close), and in the transfer window moving (a copy that removes the original), renaming, deleting and typing a path. Zoom still shows in Herdr's terminal right-click menu for a lone pane, since a layout can only replace that menu whole.
- Built and checked on macOS with herdr-app 0.1.15. The window buttons for Linux and Windows have never been drawn there.
- The mod runs under any theme, but the hues, the ink on filled tiles and the focus border were picked for a dark one.

## Done when

- `herdr-app check mods/glyph` passes, and `herdr-app status` shows no errors with the layout on show.
- With projects on two machines, each has a line with its name, and machines with nothing running share one dashed row.
- An agent at work shows the turning blue arc. One that needs you pulses peach and raises the bell's count. One that finished wears the green ring and raises the tick's count.
- Clicking a rail row shows that tab. F2 opens the rename dialog with the agent's own title as its hint.
- An agent that runs `hc run --bg --name helper claude "…"` gets a row named helper under its tab, with the turning arc while the helper works. Clicking the row opens Herdr's peek at it.
- Dragging a pill moves the tab to where it stood when released.
- ⌘W on a shell closes it. ⌘W on an agent turns its tab red, and a second ⌘W within 3 s closes it.
- After a close the tab after it is shown.
- Closing a project's last tab leaves its empty page. A tab started there opens in the folder the last tab was in, and the page goes.
- ⌘W on the page closes the project, and the next project shows its first tab.
- Folding a machine hides its projects and shows the strip of their states.
- ⌘P opens the Go-to list on the shown tab. An agent's tab nobody named is listed by its agent's title, never by its number. Typing narrows the list, and Enter shows the picked tab.
- The transfer button opens a window with a folder of one machine on each side. Picking a file and pressing the arrow copies it to the other side: a pill turns in the window's head and an arc around the bar's button, and a notice says "Copied" with its name once the file is in the other folder.
- Picking a name that is already on the other side turns the arrow red at the first press, and copies at the second.
