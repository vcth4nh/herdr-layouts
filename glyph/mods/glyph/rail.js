// The rail: the whole flock, top to bottom. A machine is a line with its name. Under it
// each project is a square tile in its hue beside its name, and each of the project's
// tabs is a row: a round logo (its ring says how it is doing) and the few words that
// tell it from the others. Click a row to go there, right-click for its menu; click a
// tile or a name for the project. The strip on top is every tab by state (needs you,
// finished, working, idle): click a color to visit the next one in it.
// A machine's line folds its projects away and back (click its name): folded, the line
// shows how its tabs are doing as one small strip, so nothing that needs you is hidden.
// Machines with nothing running share one row of dashed pills at the end: click one to
// start a project there.
// Narrower than 200px the words go and the logos line up beside their tile: the button
// at the foot switches between the two.

import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, run, hc, layout, window as win, openOverlay, agents, setAgentOrder, updates } from "herdr";
import { model, goTab, jump, tabTip, since, find, tabMenu } from "./data.js";
import { ICON, DISPLAY, alpha, orb, tile, iconButton } from "./ui.js";

const COMPACT = 160, WIDE = 256;
const SAID = {
  blocked: (n) => `${n} need${n === 1 ? "s" : ""} you`,
  done: (n) => `${n} finished`,
  working: (n) => `${n} working`,
  idle: (n) => `${n} idle`,
};

export class Rail {
  constructor(cx) {
    this.machineInfo = [];
    // Each tab's state and since when, kept across restarts: the app's own tab times
    // start empty after one. Done and idle count as one (looking isn't the agent's doing).
    this.seen = JSON.parse(localStorage.getItem("seen") ?? "{}");
    // Machines whose projects are folded away ("" is this computer), kept across restarts.
    this.folded = JSON.parse(localStorage.getItem("folded") ?? "{}");
    this.refreshMachines(cx);
    cx.timer.every(20000, (cx) => this.refreshMachines(cx));
    cx.timer.every(60000, (cx) => cx.notify()); // resting logos fade by the minute
  }

  refreshMachines(cx) {
    cx.spawn(async (cx) => {
      try {
        const r = await hc(["machine", "ls", "--json"]);
        if (r.code !== 0) return;
        const next = (JSON.parse(r.stdout).machines ?? []).filter((k) => !k.temporary).map((k) => ({ name: k.name, state: k.state }));
        if (JSON.stringify(next) === JSON.stringify(this.machineInfo)) return;
        this.machineInfo = next;
        cx.notify();
      } catch {}
    });
  }

  track(m, now) {
    let dirty = false;
    for (const c of m.flat) {
      if (!c.status) continue;
      const s = c.status === "done" ? "idle" : c.status;
      if (this.seen[c.id]?.s === s) continue;
      this.seen[c.id] = { s, at: now };
      dirty = true;
    }
    if (!dirty) return;
    const live = new Set(m.flat.map((c) => c.id));
    for (const [id, v] of Object.entries(this.seen)) if (!live.has(id) && now - v.at > 7 * 86400000) delete this.seen[id];
    localStorage.setItem("seen", JSON.stringify(this.seen));
  }

  // How bright a resting tab is: just stopped, a while ago, long ago.
  fade(c, now) {
    const at = since(c, this.seen);
    if (!at) return 0.6;
    const min = (now - at) / 60000;
    return min < 15 ? 1 : min < 120 ? 0.75 : 0.5;
  }

  // Every tab by state, as one strip.
  fleet(t, m, width) {
    const n = m.counts;
    if (!n.total) return div().h(10).flex_none();
    const kinds = ["blocked", "done", "working", "idle"].filter((k) => n[k] > 0);
    const gap = 3, inner = width - 26 - gap * (kinds.length - 1);
    // Each state gets its share, and never less than a sliver you can hit.
    const widths = kinds.map((k) => Math.max(8, (inner * n[k]) / n.total));
    const over = widths.reduce((a, b) => a + b, 0) - inner;
    if (over > 0) widths[widths.indexOf(Math.max(...widths))] -= over;
    return h_flex().id("fleet").h(22).flex_none().px(13).gap(gap).items_center()
      .tooltip(kinds.map((k) => SAID[k](n[k])).join("  ·  "))
      .children(kinds.map((k, i) => h_flex().id(`fleet-${k}`).h(22).w(Math.round(widths[i])).flex_none().items_center().cursor_pointer()
        .on_click(() => jump(m, k))
        .child(div().h(5).w_full().rounded_full().bg(t[k])
          .when(k === "blocked", (el) => el.loop("opacity", { from: 0.5, to: 1, period: 900 })))));
  }

  // A folded machine's tabs by state, as the strip on top shows the whole flock.
  tally(t, g) {
    const n = { blocked: 0, done: 0, working: 0, idle: 0 };
    for (const s of g.spaces) for (const c of s.tabs) if (c.status in n) n[c.status] += 1;
    const kinds = Object.keys(n).filter((k) => n[k] > 0);
    if (!kinds.length) return div().flex_1().h(1).bg(t.border);
    return h_flex().id(`tally-${g.name ?? "local"}`).flex_1().min_w(0).h(18).gap(2).items_center()
      .tooltip(kinds.map((k) => SAID[k](n[k])).join("  ·  "))
      .children(kinds.map((k) => div().h(4).min_w(5).flex_grow(n[k]).flex_shrink(1).flex_basis(0).rounded_full().bg(t[k])
        .when(k === "blocked", (el) => el.loop("opacity", { from: 0.5, to: 1, period: 900 }))));
  }

  // A machine's line: a laptop for this one, a server for another, and its name. Click
  // those to fold its projects away or bring them back; the chevron says which it is.
  machine(t, g, first, wide, here) {
    const local = g.name === null;
    const key = g.name ?? "";
    const name = local ? here : g.name;
    const login = g.state === "needs_login";
    const there = g.state === "connected";
    const folded = Boolean(this.folded[key]);
    const why = there ? ""
      : login ? `${g.name} needs a login: run hc machine login ${g.name}`
      : `${g.name}: ${(g.why ?? g.state).replace(/_/g, " ")}`;
    const tabs = g.spaces.reduce((sum, s) => sum + s.tabs.length, 0);
    const holds = `${g.spaces.length} project${g.spaces.length === 1 ? "" : "s"}, ${tabs} tab${tabs === 1 ? "" : "s"}`;
    const tip = [why, folded ? `Show ${name}'s ${holds}` : `Hide ${name}'s ${holds}`].filter(Boolean).join("  ·  ");
    // Folded with the shown project inside, the name is as bright as that project's.
    const ink = login ? t.blocked : folded && g.spaces.some((s) => s.active) ? t.foreground : t.muted;
    const toggle = (_e, cx) => {
      if (folded) delete this.folded[key];
      else this.folded[key] = true;
      localStorage.setItem("folded", JSON.stringify(this.folded));
      cx.notify();
    };
    // The chevron sits in the margin, so the machine's icon stays in line with the tiles.
    return h_flex().id(`machine-${g.name ?? "local"}`).h(26).flex_none().mt(first ? 2 : 6).pl(1).pr(7).gap(7).items_center()
      .child(h_flex().id(`fold-${g.name ?? "local"}`).h(22).flex_none().min_w(0).pr(5).items_center().rounded(7).cursor_pointer()
        .hover((x) => x.bg(t.hover))
        .tooltip(tip)
        .on_click(toggle)
        .child(svg(ICON(folded ? "chevron-right" : "chevron-down")).size(10).flex_none().mr(2).text_color(t.dim))
        .child(svg(ICON(local ? "laptop" : "server")).size(14).flex_none().mr(7).text_color(ink).opacity(there || login ? 1 : 0.45))
        .child(div().flex_none().max_w(wide ? 150 : 76).truncate().text_size(12.5).font_family(DISPLAY).font_semibold()
          .text_color(ink).opacity(there || login ? 1 : 0.55).child(name)))
      .child(folded ? this.tally(t, g) : div().flex_1().h(1).bg(t.border))
      .when(there, (el) => el.child(iconButton(t, {
        id: `space-new-${g.name ?? "local"}`, icon: "plus", size: 18, glyph: 11,
        tip: local ? "New project" : `New project on ${g.name}`,
        onClick: () => run("space.new", { machine: g.name ?? "" }),
      })))
      // Out of reach, the way to its settings is here.
      .when(!there, (el) => el.child(iconButton(t, {
        id: `machine-fix-${g.name}`, icon: "gear", size: 18, glyph: 12, color: login ? t.blocked : t.dim,
        tip: "Machines",
        onClick: () => run("app.settings", { section: "machines" }),
      })));
  }

  // Machines with nothing running, as one row: a dashed pill each, the way an empty
  // place to start something is drawn elsewhere. Click one for a new project there.
  shelf(t, groups, here) {
    return h_flex().id("shelf").flex_none().flex_wrap().mt(10).pl(13).pr(8).gap(6)
      .child(svg(ICON("server")).size(14).flex_none().mr(1).text_color(t.dim))
      .children(groups.map((g) => {
        const local = g.name === null;
        const name = local ? here : g.name;
        const login = g.state === "needs_login";
        const there = g.state === "connected";
        const tip = there ? `New project on ${name}`
          : login ? `${name} needs a login: run hc machine login ${name}`
          : `${name}: ${(g.why ?? g.state).replace(/_/g, " ")}`;
        return h_flex().id(`machine-${g.name ?? "local"}`).h(24).flex_none().max_w_full().px(8).items_center().rounded(12).cursor_pointer()
          .border_1().border_dashed().border_color(login ? alpha(t.blocked, "99") : t.input)
          .text_color(login ? t.blocked : t.muted).opacity(there || login ? 1 : 0.5)
          .hover((x) => x.bg(t.hover).text_color(login ? t.blocked : t.foreground))
          .tooltip(tip)
          .on_click(() => (there ? run("space.new", { machine: g.name ?? "" }) : run("app.settings", { section: "machines" })))
          .child(div().min_w(0).truncate().text_size(12).font_family(DISPLAY).font_semibold().child(name));
      }));
  }

  // A tab as a line: its logo, and the few words that tell it from the others. The
  // words are as bright as the tab is fresh; the one that needs you is in that color.
  row(t, c, s, now) {
    const fade = this.fade(c, now);
    const quiet = !c.status || c.status === "idle";
    const ink = c.shown ? t.foreground : c.status === "blocked" ? t.blocked : !quiet ? t.foreground : fade >= 0.75 ? t.muted : t.dim;
    return h_flex().id(`tab-${c.id}`).h(28).flex_none().ml(-4).pl(1).pr(9).gap(6).items_center().rounded(14).cursor_pointer()
      .when(c.shown, (el) => el.bg(t.raised))
      .when(!c.shown, (el) => el.hover((x) => x.bg(t.hover)))
      .tooltip(tabTip(c, now, this.seen))
      .on_click(() => goTab(c))
      .on_mouse_down("right", (_e, cx) => {
        cx.stop_propagation();
        tabMenu(c);
      })
      .child(orb(t, { size: 20, program: c.program, status: c.status, current: c.shown, subs: c.subs, fade, backdrop: c.shown ? t.raised : t.chrome }))
      .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(ink).child(c.label));
  }

  space(t, s, wide, now, width) {
    const select = () => run("space.select", { id: s.id });
    const menu = () => openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: s.id } } });
    const about = s.label + (s.branch ? `  ·  ${s.branch}` : "");
    // A name longer than the rail is cut short: hovering it says all of it.
    const cut = s.label.length * 7 > width - 66;
    const square = tile(t, { id: `space-${s.id}`, name: s.name, hue: s.hue, active: s.active, tip: about, onClick: select, onMenu: menu });
    // The shown project: its tile is filled, and a bar marks the row.
    const mark = () => div().absolute().left(0).top(9).w(3).h(26).rounded_r(3).bg(t.foreground);

    if (!wide) {
      const orbs = s.tabs.map((c) => orb(t, {
        id: `tab-${c.id}`, program: c.program, status: c.status, current: c.shown, subs: c.subs,
        fade: this.fade(c, now), tip: tabTip(c, now, this.seen),
        onClick: () => goTab(c),
        onMenu: () => tabMenu(c),
      }));
      return h_flex().id(`row-${s.id}`).relative().flex_none().pl(13).pr(6).py(4).gap(7).items_start()
        .when(s.active, (el) => el.child(mark()))
        .child(square)
        .child(h_flex().flex_wrap().gap(1).flex_1().min_w(0).pt(3).children(orbs));
    }

    return h_flex().id(`row-${s.id}`).relative().flex_none().pl(13).pr(8).py(4).gap(9).items_start()
      .when(s.active, (el) => el.child(mark()))
      .child(square)
      .child(v_flex().flex_1().min_w(0)
        .child(div().id(`name-${s.id}`).h(20).line_height("20px").truncate().text_size(13).font_family(DISPLAY).font_semibold().cursor_pointer()
          .text_color(s.active ? t.foreground : t.muted)
          .when(Boolean(s.branch) || cut, (el) => el.tooltip(about))
          .on_click(select)
          .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); menu(); })
          .child(s.label))
        .children(s.tabs.map((c) => this.row(t, c, s, now))));
  }

  foot(t, wide) {
    const ready = Boolean(updates()?.app?.ready);
    return h_flex().h(42).flex_none().px(10).gap(2).items_center().justify_center()
      .child(div().relative().flex_none()
        .child(iconButton(t, { id: "settings", icon: "gear", tip: ready ? "Settings: an update is ready" : "Settings", onClick: () => run("app.settings") }))
        .when(ready, (el) => el.child(div().absolute().top(4).right(4).size(6).rounded_full().bg(t.accent))))
      .child(iconButton(t, { id: "add-machine", icon: "server-plus", tip: "Add a machine", onClick: () => run("mod.open", { name: "machine-add" }) }))
      .child(iconButton(t, { id: "space-new", icon: "plus", tip: "New project", onClick: () => run("space.new") }))
      .child(iconButton(t, {
        id: "names", icon: wide ? "collapse" : "expand", tip: wide ? "Logos only" : "Show names",
        onClick: () => run("layout.resize", { id: "sidebar", px: wide ? COMPACT : WIDE }),
      }));
  }

  render() {
    const t = theme();
    const now = Date.now();
    const m = model(this.machineInfo);
    this.track(m, now);
    // agent.next / agent.prev walk the rail top to bottom.
    setAgentOrder(agents().map((a) => a.address));
    const w = win();
    const width = find(layout(), "sidebar")?.size?.px ?? WIDE;
    const wide = width >= 200;
    const here = w?.platform === "macos" ? "This Mac" : "This computer";

    const rows = [], idle = [];
    for (const g of m.groups) {
      // One machine needs no line. With several, one that has nothing running waits on
      // the shelf at the end instead of taking a line for itself.
      if (m.remote && !g.spaces.length) idle.push(g);
      else {
        if (m.remote) rows.push(this.machine(t, g, rows.length === 0, wide, here));
        // Only a machine with a line can be folded: with one machine there is none.
        if (m.remote && this.folded[g.name ?? ""]) continue;
        for (const s of g.spaces) rows.push(this.space(t, s, wide, now, width));
      }
    }
    if (idle.length) rows.push(this.shelf(t, idle, here));
    if (!m.spaces.length && !m.remote) {
      rows.push(h_flex().h(60).flex_none().items_center().justify_center()
        .child(div().id("first-space").size(36).rounded(11).border_1().border_dashed().border_color(t.input).flex().items_center().justify_center()
          .text_color(t.dim).cursor_pointer().hover((s) => s.text_color(t.foreground).border_color(t.muted))
          .tooltip("New project").on_click(() => run("space.new"))
          .child(svg(ICON("plus")).size(15))));
    }

    return v_flex().size_full().min_h(0).bg(t.chrome)
      // macOS keeps its window buttons here unless the window is full screen.
      .child(div().h(w?.platform === "macos" && !w.fullscreen ? 38 : 10).flex_none())
      .child(this.fleet(t, m, width))
      .child(v_flex().id("flock").flex_1().min_h(0).pb(8).overflow_y_scrollbar().children(rows))
      .child(this.foot(t, wide));
  }
}
