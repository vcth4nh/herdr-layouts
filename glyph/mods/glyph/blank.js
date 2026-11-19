// A project with nothing running: the page its last tab leaves behind. Herdr closes a
// project with its last tab and shows the next one; the bar has this page in the tab's
// place instead, so you stay where you were (bar.js: stand() keeps one behind the one tab
// of the project on show, out of sight, and shut() shows it). It is a tab whose only pane
// is this mod, which the lists don't count as a tab.
// The page is the project's tile and name over the bar's dashed pill of starters, larger:
// a logo is "a tab running that", the prompt is a plain terminal, the dots are the full
// + menu. Starting something takes the page's place on show; looking at another project
// closes this one.

import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, shared, openOverlay, knownAgents } from "herdr";
import { model, newTab, shell, keyFor, withKey } from "./data.js";
import { ICON, DISPLAY, logo, inkOf, tile } from "./ui.js";

export class Blank {
  constructor(cx) {
    this.known = {}; // machine ("" for this computer) -> what it can start
    this.learn(cx);
  }

  // The page only draws while its project is the one on show, so that is the one it is for.
  project() {
    const s = model().active;
    return s?.empty ? s : null;
  }

  learn(cx) {
    const machine = this.project()?.machine ?? null;
    cx.spawn(async (cx) => {
      try {
        this.known[machine ?? ""] = await knownAgents({ on: machine });
        cx.notify();
      } catch {}
    });
  }

  render() {
    const t = theme();
    const s = this.project();
    if (!s) return div().size_full().bg(t.background);
    const where = s.machine ?? "";
    const can = (this.known[where] ?? shared("new-menu.agents")?.[where] ?? []).filter((a) => a.installed).slice(0, 4);
    const plain = shell();
    const round = (id, tip, onClick, child) => div().id(id).flex_none().size(46).rounded_full().flex().items_center().justify_center().cursor_pointer()
      .text_color(t.dim).hover((x) => x.bg(t.hover).text_color(t.foreground))
      .tooltip(tip).on_click(onClick).child(child);
    return v_flex().id("blank").size_full().min_h(0).pb(28).gap(14).items_center().justify_center().bg(t.background)
      .child(tile(t, { name: s.name, hue: s.hue, size: 56 }))
      .child(div().max_w(420).truncate().text_size(16).font_family(DISPLAY).font_semibold().text_color(t.muted).child(s.label))
      .child(h_flex().flex_none().h(58).mt(10).pl(14).pr(6).gap(2).items_center().rounded(29)
        .border_1().border_dashed().border_color(t.input)
        .child(svg(ICON("plus")).size(15).flex_none().mr(6).text_color(t.dim))
        .children(can.map((a) => round(`start-${a.key}`, withKey(`New ${a.name} tab`, keyFor(`glyph.new-${a.key}`)), () => newTab(s, a), logo(a, 24, inkOf(t, a)))))
        .child(round("start-shell", withKey("New terminal tab", keyFor("glyph.new", "tab.new")), () => newTab(s), logo(plain, 23, inkOf(t, plain))))
        .child(round("start-more", "More: other agents, a project, a worktree", () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 }), svg(ICON("more")).size(21))));
  }
}
