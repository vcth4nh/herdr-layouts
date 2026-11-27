// The tabs in one state: the list the bar's bell (they need you) and tick (they finished)
// open under themselves. A row is a tab as the Go-to list has it, its logo with its state's
// ring and its words, and under them its project and machine. At its end is how long the
// tab has been in that state. The rows stand in the rail's order, top to bottom, which is
// also the order of their beads in the status line.
// Click a row, or pick it with up and down and press Enter, to go to that tab. Esc leaves.
// It opens on the first tab after the one on show, from the top again after the last.
// It follows the tabs as they change state, and closes once none is left in it.
// The tick's list has a head with one button, a double tick, that marks every tab in it as
// read (markRead in data.js): they come to rest as if each had been looked at.
// Opened as a popup with props { role: "wants", status } (openWants in data.js; the bar
// closes it instead when it is already there).

import { div, svg } from "gpui-kit";
import { v_flex, h_flex, ScrollHandle } from "gpui-base";
import { theme, props, closeOverlay, notify } from "herdr";
import { model, goTab, tabTip, since, duration, shownWants, goneWants, markRead } from "./data.js";
import { ICON, orb, tile, iconButton } from "./ui.js";

const MOST = 440; // the tallest the list gets before it scrolls
// How tall a row is, and the tick's list's head. The list is given its height from them: a
// scrolling area has none of its own.
const H = 44;
const HEAD = 30;
const LOOK = 250; // ms between looks at whether any tab is left in the list

export class Wants {
  constructor(cx) {
    const p = props() ?? {};
    this.status = p.status === "done" ? "done" : "blocked";
    this.pick = null; // the picked tab's id; null until the first look
    this.at = 0;      // and where it stood in the list
    this.done = false; // it went somewhere, or is gone: nothing more to do
    this.reading = false; // the tabs are being marked as read
    shownWants(p.overlay, this.status);
    this.scroll = ScrollHandle.new();
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.scroll.scroll_to_item(this.list().sel ? this.at : 0);
    // A popup takes the keyboard a moment after it opens, and is laid out by then.
    cx.timer.after(600, () => {
      this.handle.focus();
      this.scroll.scroll_to_item(this.at);
    });
    cx.timer.every(LOOK, () => {
      if (!this.done && !this.list().rows.length) this.leave();
    });
  }

  // The tabs in the list's state, and the picked one. A picked tab that leaves the list
  // hands over to the row that takes its place.
  list() {
    const m = model();
    const rows = m.flat.filter((c) => c.status === this.status);
    let at = rows.findIndex((c) => c.id === this.pick);
    if (at < 0 && this.pick === null) {
      const shown = m.flat.findIndex((c) => c.shown);
      at = rows.findIndex((c) => m.flat.indexOf(c) > shown);
    } else if (at < 0) at = Math.min(this.at, rows.length - 1);
    this.at = Math.max(0, at);
    this.pick = rows[this.at]?.id ?? null;
    return { rows, sel: rows[this.at] ?? null };
  }

  leave() {
    this.done = true;
    goneWants(props()?.overlay, true);
    closeOverlay(props()?.overlay);
  }

  // It is closed, by itself or from outside (a press beside it, Esc, its pill again).
  gone() {
    goneWants(props()?.overlay);
  }

  go(c) {
    if (!c || this.done) return;
    this.leave();
    goTab(c);
  }

  // Marks every tab in the list as read. Their rows leave as Herdr hears of it, and the list
  // closes once none is left. A tab that could not be marked (its machine out of reach) stays,
  // and a notice names it.
  read(cx) {
    if (this.done || this.reading) return;
    const { rows } = this.list();
    if (!rows.length) return;
    this.reading = true;
    cx.spawn(async (cx) => {
      const failed = await markRead(rows);
      this.reading = false;
      if (failed.length) notify({ title: `Glyph could not mark ${failed.length === 1 ? "a tab" : `${failed.length} tabs`} as read`, body: failed.map((c) => c.label).join(", "), level: "error" });
      cx.notify();
    });
  }

  render() {
    const t = theme();
    const now = Date.now();
    const { rows, sel } = this.list();

    const row = (c) => {
      const on = c === sel;
      const s = c.space;
      const at = since(c);
      return h_flex().id(`want-${c.id}`).h(H).flex_none().pl(6).pr(10).gap(9).items_center().rounded(10).cursor_pointer()
        .when(on, (el) => el.bg(t.selected))
        .when(!on, (el) => el.hover((x) => x.bg(t.hover)))
        .tooltip(tabTip(c, now))
        .on_click(() => this.go(c))
        .child(orb(t, { program: c.program, status: c.status, current: c.shown, subs: c.subs, backdrop: on ? t.selected : t.popover }))
        .child(v_flex().flex_1().min_w(0)
          .child(div().h(18).line_height("18px").truncate().text_size(13).text_color(c.status === "blocked" ? t.blocked : t.foreground).child(c.label))
          // Whose it is: its project, and its machine when that is another one.
          .child(h_flex().h(16).gap(5).items_center().text_size(11.5).text_color(t.muted)
            .child(tile(t, { name: s.name, hue: s.hue, active: s.active, size: 14 }))
            .child(div().flex_shrink(1).min_w(0).truncate().child(s.label))
            .when(Boolean(s.machine), (el) => el
              .child(svg(ICON("server")).size(11).flex_none().ml(3))
              .child(div().flex_none().max_w(110).truncate().child(s.machine)))))
        .child(div().flex_none().text_size(11).text_color(t.dim).child(at ? duration(now - at) : ""));
    };

    // The tick's list: a head whose one button marks them all as read.
    const head = h_flex().h(HEAD).flex_none().pr(2).items_center().justify_end()
      .child(iconButton(t, { id: "read-all", icon: "check-double", size: 26, glyph: 16, tip: "Mark all as read", color: this.reading ? t.dim : t.done, onClick: (_e, cx) => this.read(cx) }));

    return v_flex().id("wants").track_focus(this.handle).w_full().min_h(0).p(6).bg(t.popover)
      .on_key_down((e, cx) => {
        const k = e.key;
        if (k === "escape") this.leave();
        else if ((k === "down" || k === "up") && rows.length) {
          this.at = (this.at + (k === "up" ? rows.length - 1 : 1)) % rows.length;
          this.pick = rows[this.at].id;
          this.scroll.scroll_to_item(this.at);
        } else if (k === "enter") this.go(sel);
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .when(this.status === "done", (el) => el.child(head))
      .child(v_flex().id("want-list").h(Math.min(MOST, rows.length * H)).flex_shrink(1).min_h(0).overflow_y_scrollbar().track_scroll(this.scroll)
        .children(rows.map(row)));
  }
}
