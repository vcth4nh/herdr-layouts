// Go to a tab by typing. Every tab there is, under its project and its machine, in the
// rail's order and by the rail's words: Herdr's own picker lists a tab by its name, which
// for a tab nobody named is its number, and here such a tab goes by what its agent says it
// is doing. Type to narrow the list: each word typed has to be in the tab's words, its
// project, its machine or its program. Up and down move, Enter goes, Esc leaves. Ctrl+D
// closes the picked tab the way every close goes here: a plain shell at once, anything else
// at a second press in time, its row red until then. Click a project's line for the project.
// Opened as a popup under the window's top edge, with props { role: "goto" } (openGoto in
// data.js, which closes it instead when it is already there).

import { div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, ScrollHandle } from "gpui-base";
import { theme, props, run, closeOverlay } from "herdr";
import { model, here, goTab, closeTab, tabTip, shownGoto, goneGoto, ARM } from "./data.js";
import { ICON, DISPLAY, alpha, mix, danger, orb, tile } from "./ui.js";

const MOST = 520; // the tallest the list gets before it scrolls
const GAP = 1;    // between two rows
// How tall each kind of row is. The list is given its height from these: a scrolling
// area has none of its own, and the popup is only as tall as what it holds.
const H = { machine: 26, space: 30, tab: 30, none: 36 };

export class Goto {
  constructor(cx) {
    this.filter = "";
    this.at = null;      // the picked tab among those listed; null until the first look
    this.sure = null;    // a first close press on a tab that takes two: { id, at }
    this.done = false;   // it went somewhere, or closed a tab: nothing more to do
    this.touched = false;
    shownGoto(props()?.overlay);
    this.scroll = ScrollHandle.new();
    this.handle = cx.focus_handle();
    this.input = InputState.new({ placeholder: "Tab, project or machine" });
    this.input.on("change", (_e, cx) => {
      this.filter = this.input.value();
      this.at = 0;
      this.sure = null;
      this.touched = true;
      this.reveal(-1);
      cx.notify();
    });
    this.input.on("submit", (_e, cx) => this.go(this.list().sel, cx));
    this.input.focus();
    this.reveal(1);
    // A popup takes the keyboard a moment after it opens, and is laid out by then.
    cx.timer.after(600, () => {
      this.input.focus();
      if (!this.touched) this.reveal(1);
    });
  }

  // What is listed: a line for each machine (when there are several) and each project,
  // over those of its tabs that match what was typed.
  rows(m) {
    const words = this.filter.toLowerCase().split(/\s+/).filter(Boolean);
    const hit = (g, s, c) => {
      const said = [g.name ?? here(), s.label, s.name, c.label, c.given, c.own, c.program?.name, c.program?.key].filter(Boolean).join("\n").toLowerCase();
      return words.every((w) => said.includes(w));
    };
    const out = [];
    for (const g of m.groups) {
      const first = out.length;
      for (const s of g.spaces) {
        const tabs = s.tabs.filter((c) => hit(g, s, c));
        if (tabs.length) out.push({ kind: "space", s }, ...tabs.map((c) => ({ kind: "tab", c })));
      }
      if (m.remote && out.length > first) out.splice(first, 0, { kind: "machine", g });
    }
    return out;
  }

  // The rows, the tabs among them, and the picked one. It opens on where you are.
  list() {
    const rows = this.rows(model());
    const tabs = rows.filter((r) => r.kind === "tab").map((r) => r.c);
    if (this.at === null) this.at = tabs.findIndex((c) => c.shown);
    this.at = Math.max(0, Math.min(this.at, tabs.length - 1));
    return { rows, tabs, sel: tabs[this.at] ?? null };
  }

  // Keeps the picked row in sight, with the least scrolling that shows it. Coming from
  // below (dir -1), the lines over a project's first tab (its own, and its machine's) are
  // what is asked for, so they come into sight with it.
  reveal(dir) {
    const { rows, sel } = this.list();
    let i = rows.findIndex((r) => r.c === sel);
    if (i < 0) return;
    if (dir < 0) while (i > 0 && rows[i - 1].kind !== "tab") i -= 1;
    this.scroll.scroll_to_item(i);
  }

  leave() {
    this.done = true;
    this.gone();
    closeOverlay(props()?.overlay);
  }

  // It is closed, by itself or from outside (a press beside it, Esc, its key again).
  gone() {
    goneGoto(props()?.overlay);
  }

  go(c) {
    if (!c || this.done) return;
    this.leave();
    goTab(c);
  }

  // Closes a tab. What is more than a plain shell takes a second press, in time.
  shut(c, cx) {
    if (!c || this.done) return;
    const now = Date.now();
    if (c.careful && !(this.sure?.id === c.id && now - this.sure.at < ARM)) {
      const mine = (this.sure = { id: c.id, at: now });
      cx.timer.after(ARM, (cx) => {
        if (this.sure !== mine) return;
        this.sure = null;
        cx.notify();
      });
      return;
    }
    this.leave();
    closeTab(c.id);
  }

  render() {
    const t = theme();
    const now = Date.now();
    const { rows, tabs, sel } = this.list();
    const red = danger(t);
    const sure = this.sure && now - this.sure.at < ARM ? this.sure.id : null;
    const tall = rows.length ? rows.reduce((sum, r) => sum + H[r.kind] + GAP, -GAP) : H.none;

    // A machine's line, as in the rail.
    const machine = (g) => h_flex().h(H.machine).flex_none().px(9).gap(7).items_center()
      .child(svg(ICON(g.name === null ? "laptop" : "server")).size(14).flex_none().text_color(t.muted))
      .child(div().flex_none().max_w(280).truncate().text_size(12.5).font_family(DISPLAY).font_semibold().text_color(t.muted).child(g.name ?? here()))
      .child(div().flex_1().h(1).bg(t.border));

    // A project's line: its tile and its name. Click it to show the project.
    const space = (s) => h_flex().id(`go-space-${s.id}`).h(H.space).flex_none().px(8).gap(8).items_center().rounded(8).cursor_pointer()
      .hover((x) => x.bg(t.hover))
      .on_click(() => {
        if (this.done) return;
        this.leave();
        run("space.select", { id: s.id });
      })
      .child(tile(t, { name: s.name, hue: s.hue, active: s.active, size: 20 }))
      .child(div().flex_1().min_w(0).truncate().text_size(13).font_family(DISPLAY).font_semibold().text_color(s.active ? t.foreground : t.muted).child(s.label));

    // A tab's row, as in the rail: its logo and its words, under its project's name.
    const tab = (c) => {
      const on = c === sel, hot = sure === c.id;
      const quiet = !c.status || c.status === "idle";
      const ink = hot ? red : c.status === "blocked" ? t.blocked : on || c.shown || !quiet ? t.foreground : t.muted;
      return h_flex().id(`go-${c.id}`).h(H.tab).flex_none().pl(5).pr(10).gap(5).items_center().rounded(15).cursor_pointer()
        .when(hot, (el) => el.bg(alpha(red, "33")))
        .when(on && !hot, (el) => el.bg(t.selected))
        .when(!on && !hot, (el) => el.hover((x) => x.bg(t.hover)))
        .tooltip(hot ? "Again to close" : tabTip(c, now))
        .on_click(() => this.go(c))
        .child(orb(t, { size: 20, program: c.program, status: c.status, current: c.shown, subs: c.subs, backdrop: hot ? mix(t.popover, red, 0.2) : on ? t.selected : t.popover }))
        .child(div().flex_1().min_w(0).truncate().text_size(13).text_color(ink).child(c.label));
    };

    return v_flex().id("goto").track_focus(this.handle).w_full().min_h(0).p(8).gap(6).bg(t.popover)
      .on_key_down((e, cx) => {
        const k = e.key;
        if (k === "escape") this.leave();
        else if ((k === "down" || k === "up") && tabs.length) {
          const up = k === "up";
          this.at = (this.at + (up ? tabs.length - 1 : 1)) % tabs.length;
          this.sure = null;
          this.touched = true;
          // Around the end of the list, the row is reached from the other side.
          const around = this.at === (up ? tabs.length - 1 : 0);
          this.reveal(up !== around ? -1 : 1);
        } else if (k === "enter") this.go(sel);
        else if (k === "d" && e.modifiers?.control) this.shut(sel, cx);
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(h_flex().h(36).flex_none().px(11).gap(9).items_center().rounded(10).bg(t.background).border_1().border_color(t.accent)
        .child(svg(ICON("search")).size(15).flex_none().text_color(t.dim))
        .child(Input.new(this.input).flex_1().h_full().text_size(13).text_color(t.foreground)))
      .child(v_flex().id("go-list").h(Math.min(MOST, tall)).flex_shrink(1).min_h(0).gap(GAP).overflow_y_scrollbar().track_scroll(this.scroll)
        .children(rows.map((r) => (r.kind === "tab" ? tab(r.c) : r.kind === "space" ? space(r.s) : machine(r.g))))
        .when(!rows.length, (el) => el.child(h_flex().h(H.none).flex_none().px(9).text_size(12.5).text_color(t.dim).child(this.filter.trim() ? "No tab by that name" : "No tabs"))));
  }
}
