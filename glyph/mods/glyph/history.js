// The projects you closed, the last one first: the list the rail's foot and the history key
// open. A row is a project as it was: its tile in its hue, its name, where it was (its
// machine if that is another one, and its folder), the agents its tabs ran, and how long
// ago it closed. Click a row, or pick it and press Enter, to open the project again: on its
// machine, in its folder, under its name and in its hue, with one tab running the agent
// most of its tabs ran, or a plain terminal when it ran none. The agent starts afresh:
// what it was doing does not come back with the project.
// Type to narrow the list: each word typed has to be in the project's name, its folder,
// its machine or its agents. Up and down move, Esc leaves. The x at a row's end forgets it.
// The bar keeps the list (keep() in bar.js), in shared PAST (data.js).
// Opened as a popup with props { role: "history" } (openHistory in data.js, which closes
// it instead when it is already there).

import { div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, ScrollHandle } from "gpui-base";
import { theme, props, shared, closeOverlay, knownAgents, checking } from "herdr";
import { model, here, past, reopen, forget, tilde, duration, shell, shadeOf, shownHistory, goneHistory } from "./data.js";
import { ICON, DISPLAY, logo, inkOf, tile, iconButton } from "./ui.js";

const MOST = 440; // the tallest the list gets before it scrolls
// How tall a row is, and the line that says there is none. The list is given its height
// from these: a scrolling area has none of its own.
const H = { row: 44, none: 36 };

export class History {
  constructor(cx) {
    this.filter = "";
    this.at = 0;       // the picked row among those listed
    this.done = false; // a project is being opened again, or the list has gone
    this.known = {};   // machine ("" for this computer) -> what it can start
    shownHistory(props()?.overlay);
    this.scroll = ScrollHandle.new();
    this.handle = cx.focus_handle();
    this.input = InputState.new({ placeholder: "Project, folder or machine" });
    this.input.on("change", (_e, cx) => {
      this.filter = this.input.value();
      this.at = 0;
      this.scroll.scroll_to_item(0);
      cx.notify();
    });
    this.input.on("submit", (_e, cx) => this.go(this.list().sel, cx));
    this.input.focus();
    // A popup takes the keyboard a moment after it opens.
    cx.timer.after(600, () => this.input.focus());
    this.learn(cx);
  }

  // Whether Herdr has a machine's projects, so that one can be started there.
  reached(m, name) {
    return m.groups.find((g) => g.name === name)?.state === "connected";
  }

  // Which agents each machine on the list can start now: one that a project ran may have
  // been taken off its machine since. Under `herdr-app check` no machine is asked.
  learn(cx) {
    if (checking()) return;
    const m = model();
    for (const where of new Set(past().map((e) => e.machine ?? ""))) {
      if (!this.reached(m, where || null)) continue;
      cx.spawn(async (cx) => {
        try {
          this.known[where] = await knownAgents({ on: where || null });
          cx.notify();
        } catch {}
      });
    }
  }

  // What a project's machine can start, as far as is known: asked here, else as Herdr's
  // own "new" menu last kept it. Null before either.
  can(e) {
    const where = e.machine ?? "";
    return this.known[where] ?? shared("new-menu.agents")?.[where] ?? null;
  }

  // What the first tab of a project opened again runs: the first of the agents it ran that
  // its machine can still start. Null for a plain terminal.
  starter(e) {
    const can = this.can(e) ?? [];
    for (const p of e.ran ?? []) {
      const a = can.find((x) => x.key === p.key && x.installed !== false && x.run);
      if (a) return a;
    }
    return null;
  }

  // The closed projects that match what was typed, and the picked one.
  list() {
    const words = this.filter.toLowerCase().split(/\s+/).filter(Boolean);
    const rows = past().filter((e) => {
      const said = [e.name, e.name === "~" ? "Home" : "", e.machine ?? here(), e.folder, ...(e.ran ?? []).flatMap((p) => [p.name, p.key])].filter(Boolean).join("\n").toLowerCase();
      return words.every((w) => said.includes(w));
    });
    this.at = Math.max(0, Math.min(this.at, rows.length - 1));
    return { rows, sel: rows[this.at] ?? null };
  }

  leave() {
    this.done = true;
    this.gone();
    closeOverlay(props()?.overlay);
  }

  // It is closed, by itself or from outside (a press beside it, Esc, its key again).
  gone() {
    goneHistory(props()?.overlay);
  }

  // Opens a project again and leaves. A project that ran an agent waits for its machine to
  // say what it can start, when nothing is known of that yet.
  go(e, cx) {
    if (!e || this.done || !this.reached(model(), e.machine ?? null)) return;
    this.done = true;
    const open = () => {
      reopen(e, this.starter(e));
      this.leave();
    };
    if (this.can(e) || !(e.ran ?? []).length) {
      open();
      return;
    }
    cx.spawn(async () => {
      try {
        this.known[e.machine ?? ""] = await knownAgents({ on: e.machine ?? null });
      } catch {}
      open();
    });
  }

  render() {
    const t = theme();
    const now = Date.now();
    const m = model();
    const { rows, sel } = this.list();
    const plain = shell();
    const tall = rows.length ? rows.length * H.row : H.none;

    const row = (e, i) => {
      const on = e === sel;
      const there = this.reached(m, e.machine ?? null);
      const a = this.starter(e);
      const ran = e.ran?.length ? e.ran : [plain];
      // Out of reach, a row is faint and a press on it does nothing.
      const faint = (el) => el.opacity(there ? 1 : 0.45);
      return h_flex().id(`past-${i}`).h(H.row).flex_none().pl(8).pr(4).gap(10).items_center().rounded(10)
        .when(on, (el) => el.bg(t.selected))
        .when(there, (el) => el.cursor_pointer())
        .when(there && !on, (el) => el.hover((x) => x.bg(t.hover)))
        .tooltip(there ? `Open again with ${a ? a.name : "a terminal"}` : `${e.machine} is out of reach`)
        .on_click((_e, cx) => this.go(e, cx))
        .child(faint(div().flex().flex_none()).child(tile(t, { name: e.name, hue: shadeOf(e.hue), size: 28 })))
        .child(faint(v_flex().flex_1().min_w(0))
          .child(div().h(18).line_height("18px").truncate().text_size(13).font_family(DISPLAY).font_semibold()
            .text_color(on ? t.foreground : t.muted).child(e.name === "~" ? "Home" : e.name))
          // Where it was: its machine, when that is another one, and its folder there.
          .child(h_flex().h(16).gap(5).items_center().text_size(11.5).text_color(t.dim)
            .when(Boolean(e.machine), (el) => el
              .child(svg(ICON("server")).size(11).flex_none().text_color(t.muted))
              .child(div().flex_none().max_w(130).truncate().text_color(t.muted).child(e.machine)))
            .child(div().flex_1().min_w(0).truncate().child(tilde(e.folder) || "~"))))
        // What it ran: its agents' logos, the first one what a press starts.
        .child(faint(h_flex().flex_none().gap(5).items_center()).children(ran.map((p) => logo(p, 15, inkOf(t, p)))))
        .child(h_flex().flex_none().w(26).justify_end().text_size(11).text_color(t.dim).child(duration(now - e.at)))
        .child(iconButton(t, {
          id: `forget-${i}`, icon: "x", size: 22, glyph: 11, tip: "Forget",
          onClick: (_e, cx) => {
            cx.stop_propagation();
            forget(e);
            cx.notify();
          },
        }));
    };

    return v_flex().id("history").track_focus(this.handle).w_full().min_h(0).p(8).gap(6).bg(t.popover)
      .on_key_down((e, cx) => {
        const k = e.key;
        if (k === "escape") this.leave();
        else if ((k === "down" || k === "up") && rows.length) {
          this.at = (this.at + (k === "up" ? rows.length - 1 : 1)) % rows.length;
          this.scroll.scroll_to_item(this.at);
        } else if (k === "enter") this.go(sel, cx);
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(h_flex().h(36).flex_none().px(11).gap(9).items_center().rounded(10).bg(t.background).border_1().border_color(t.accent)
        .child(svg(ICON("history")).size(15).flex_none().text_color(t.dim))
        .child(Input.new(this.input).flex_1().h_full().text_size(13).text_color(t.foreground)))
      .child(v_flex().id("past-list").h(Math.min(MOST, tall)).flex_shrink(1).min_h(0).overflow_y_scrollbar().track_scroll(this.scroll)
        .children(rows.map(row))
        .when(!rows.length, (el) => el.child(h_flex().h(H.none).flex_none().px(9).text_size(12.5).text_color(t.dim)
          .child(this.filter.trim() ? "No closed project by that name" : "No closed projects yet"))));
  }
}
