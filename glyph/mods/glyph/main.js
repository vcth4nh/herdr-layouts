// Glyph: Herdr with pictures where the words were. One mod in parts, chosen by the
// role its layout block gives it:
//   { "role": "rail" }  the left column: every machine, project and tab (rail.js)
//   { "role": "bar" }   the top strip: this project's tabs, starters, alerts (bar.js)
//   { "role": "pane" }  the header on each pane; the app adds { pane, terminal } (pane.js)
// five it opens over the window itself:
//   { "role": "menu", tab }      a tab's right-click menu (menu.js)
//   { "role": "goto" }           the list you type in to go to a tab (goto.js)
//   { "role": "wants", status }  the tabs that need you, or that finished (wants.js)
//   { "role": "history" }        the projects you closed, to open one again (history.js)
//   { "role": "transfer" }       the window that copies files between machines (transfer.js)
// and one it puts in a tab of its own, as that tab's only pane:
//   { "role": "blank" }  the page of a project with no tab left (blank.js)
// Words stay only where you named something (a project, a tab, a branch, a machine).
// A program is its logo, a state is a color and a motion, a button is an icon; hover
// any of them for the words. ui.js draws the shared pieces, data.js reads Herdr.

import { View } from "gpui-kit";
import { props } from "herdr";
import { Rail } from "./rail.js";
import { Bar } from "./bar.js";
import { PaneHead } from "./pane.js";
import { Menu } from "./menu.js";
import { Goto } from "./goto.js";
import { Wants } from "./wants.js";
import { History } from "./history.js";
import { Blank } from "./blank.js";
import { Transfer } from "./transfer.js";
import { face } from "./ui.js";

export default class Glyph extends View {
  init(_props, cx) {
    const p = props() ?? {};
    const role = p.role ?? (p.pane ? "pane" : "rail");
    this.part = role === "bar" ? new Bar(cx) : role === "pane" ? new PaneHead(cx) : role === "menu" ? new Menu(cx) : role === "goto" ? new Goto(cx) : role === "wants" ? new Wants(cx) : role === "history" ? new History(cx) : role === "blank" ? new Blank(cx) : role === "transfer" ? new Transfer(cx) : new Rail(cx);
  }

  render(cx) {
    // Which face bold letters are set in depends on the system: see DISPLAY in ui.js.
    face();
    return this.part.render(cx);
  }

  // The app's last call to a copy that goes: an overlay closed, however it was, or the
  // layout's own place for it gone (another layout shown, the mod loaded again).
  async close() {
    this.part.gone?.();
  }
}
