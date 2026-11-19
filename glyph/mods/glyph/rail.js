// The rail: the whole flock, top to bottom. A machine is a line with its name. Under it
// each project is a square tile in its hue beside its name, and each of the project's
// tabs is a row: a round logo (its ring says how it is doing) and the few words that
// tell it from the others. Click a row to go there, right-click for its menu; click a
// project's name for the project. The sub-agents a tab's agents started are smaller rows
// under it: click one to peek at it.
// The line on top is every tab that has a state, as a bead in that state's color: those
// that need you first, then the finished, the working and the idle, which fade as they
// rest. Within a color the beads stand as their rows do below, top to bottom. Hover a bead
// and its row lights up below, click it to go to that tab. A mark under a bead says it is
// the tab on show, and when a tab changes state its bead slides to its new place. See line().
// A machine's line folds its projects away and back (click its name): folded, the line
// shows its tabs as such beads, so nothing that needs you is hidden.
// A project folds its tabs the same way, by its tile or the chevron beside it.
// Machines with nothing running share one row of dashed pills at the end: click one to
// start a project there.
// After another machine's name, four bars say how quick it is to answer, as a phone shows
// its signal, and the wide rail writes the time beside them.
// Narrower than 200px the words go and the logos line up beside their tile: the button
// at the foot switches between the two.

import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, run, layout, settings, window as win, openOverlay, agents, setAgentOrder, updates, checking } from "herdr";
import { model, fleet, ping, reach, PING, here as hereName, goTab, goSub, lineUp, tabTip, subTip, since, find, tabMenu, says } from "./data.js";
import { ICON, DISPLAY, alpha, orb, bead, tile, iconButton, bars, textWidth } from "./ui.js";

const COMPACT = 160, WIDE = 256;
const SLIDE = { duration: 420, easing: "ease-in-out" }; // a bead on its way to a new place
const WANT = 8; // px a bead that wants you keeps, while the others can spare them
const MARK = 14; // px the mark under the shown tab's bead is wide at most

// How a line `span` px wide is shared among its beads, given their states in order: the gap
// between two, where each bead starts and how wide it is, and `slim`, the width of one
// that is working or idle before it is rounded to whole pixels. The beads are one width,
// 2px apart. A crowd closes the gaps before its beads get too thin to see. One that needs
// you or has finished keeps WANT px for as long as that leaves the others 2px each.
export function share(states, span) {
  const n = states.length;
  const each = (gap) => (Math.max(span, n) - gap * (n - 1)) / n;
  const gap = n < 2 ? 0 : each(2) >= 4 ? 2 : each(1) >= 2 ? 1 : 0;
  const even = each(gap);
  const wants = (s) => s === "blocked" || s === "done";
  const urgent = states.filter(wants).length;
  const rest = urgent && urgent < n ? (even * n - WANT * urgent) / (n - urgent) : 0;
  const [wide, slim] = even < WANT && rest >= 2 ? [WANT, rest] : [even, even];
  let at = 0;
  const cells = states.map((s) => {
    const x = Math.round(at);
    at += wants(s) ? wide : slim;
    const w = Math.max(1, Math.round(at) - x);
    at += gap;
    return { x, w };
  });
  return { gap, cells, slim };
}

export class Rail {
  constructor(cx) {
    this.machineInfo = [];
    this.pings = {};  // another machine's name -> its last answers, newest last (reach in data.js)
    this.asking = {}; // the machines being asked now
    // Each tab's state and since when, kept across restarts: the app's own tab times
    // start empty after one. Done and idle count as one (looking isn't the agent's doing).
    this.seen = JSON.parse(localStorage.getItem("seen") ?? "{}");
    // Machines whose projects are folded away ("" is this computer), kept across restarts.
    this.folded = JSON.parse(localStorage.getItem("folded") ?? "{}");
    // Projects whose tabs are folded away, by id, kept across restarts.
    this.tucked = JSON.parse(localStorage.getItem("tucked") ?? "{}");
    this.live = null; // the ids of the projects there are, once every machine's are known
    this.point = null; // the tab the pointer is on, by its bead or by its row: see aim()
    this.spans = {};   // line -> how wide it was laid out, and how wide the rail was then
    this.drawn = {};   // line -> how wide it was last drawn
    this.width = WIDE; // how wide the rail is, at the last look
    this.refreshMachines(cx);
    cx.timer.every(20000, (cx) => this.refreshMachines(cx));
    cx.timer.every(PING.every, (cx) => this.probe(cx));
    cx.timer.every(60000, (cx) => cx.notify()); // resting logos fade by the minute
  }

  refreshMachines(cx) {
    cx.spawn(async (cx) => {
      const all = await fleet();
      if (!all) return;
      const next = all.filter((k) => !k.temporary).map((k) => ({ name: k.name, state: k.state }));
      if (JSON.stringify(next) === JSON.stringify(this.machineInfo)) return;
      this.machineInfo = next;
      cx.notify();
      // A machine that has just come into reach is asked at once.
      this.probe(cx);
    });
  }

  // Asks every other machine in reach how long it takes to answer. One that has not
  // answered yet is not asked again, so a machine that hangs is asked once at a time.
  probe(cx) {
    if (checking()) return;
    const names = model(this.machineInfo).groups.filter((g) => g.name !== null && g.state === "connected").map((g) => g.name);
    // What a machine answered before it went out of reach says nothing once it is back.
    for (const name of Object.keys(this.pings)) if (!names.includes(name)) delete this.pings[name];
    for (const name of names) {
      if (this.asking[name]) continue;
      this.asking[name] = true;
      cx.spawn(async (cx) => {
        const ms = await ping(name);
        delete this.asking[name];
        const was = JSON.stringify(reach(this.pings[name]));
        this.pings[name] = [...(this.pings[name] ?? []), ms].slice(-3);
        if (JSON.stringify(reach(this.pings[name])) !== was) cx.notify();
      });
    }
  }

  // What is known of the way to another machine. Out of reach, it has no bar lit.
  heard(g) {
    return reach(g.state === "connected" ? this.pings[g.name] : []);
  }

  // What the bars stand for, in words: the time with its unit apart ("270 ms").
  heardTip(name, s) {
    return s.text ? `${name} answers in ${s.text.replace(/(m?s)$/, " $1")}` : s.bad ? `${name} is not answering` : "";
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

  // The pointer came to a tab's bead or to its row, or left it. Both are drawn lit while it
  // stays, so a bead says which row it is and a row which bead.
  aim(id, on, cx) {
    const next = on ? id : this.point === id ? null : this.point;
    if (next === this.point) return;
    this.point = next;
    cx.notify();
  }

  // A line of beads: one for each of `tabs` that has a state, in lineUp()'s order. Hover a
  // bead for its tab's words, click it to go there, right-click it for the tab's menu. The
  // mark under a bead says its tab is the one on show.
  // The beads are placed by hand, because only what has a place of its own can slide to
  // another: `o.guess` is how wide the line should come out, until it has been laid out and
  // measured, and again after the rail has changed its width. A line that has just changed
  // its own width is drawn in place at once.
  // o: { guess, band, tall, now }: about how wide it is, how tall, how tall a bead is, and
  // the time. Null when no tab has a state.
  line(t, key, tabs, o) {
    const list = lineUp(tabs);
    if (!list.length) return null;
    // What was measured holds for the rail's width it was measured at.
    const known = this.spans[key]?.at === this.width ? this.spans[key].w : null;
    const span = Math.max(known ?? Math.round(o.guess), list.length);
    const steady = this.drawn[key] === span;
    this.drawn[key] = span;
    const { gap, cells, slim } = share(list.map((c) => c.status), span);
    const slide = (el) => (steady ? el.transition("left", SLIDE).transition("width", SLIDE) : el);
    // The mark of the tab on show: as wide as its bead, and no wider than MARK, in the middle.
    const spot = cells[list.findIndex((c) => c.shown)];
    const mark = spot ? Math.min(spot.w, MARK) : 0;
    // A bead's column is as tall as the line and reaches half a gap to each side, so a
    // press anywhere on the line lands on a bead.
    const beads = list.map((c, i) => slide(h_flex().id(`bead-${key}-${c.id}`).absolute().top(0).left(cells[i].x - gap / 2).w(cells[i].w + gap).h(o.band).px(gap / 2).items_center().cursor_pointer())
      .tooltip(tabTip(c, o.now, this.seen))
      .on_hover((on, cx) => this.aim(c.id, on, cx))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        goTab(c);
      })
      .on_mouse_down("right", (_e, cx) => {
        cx.stop_propagation();
        tabMenu(c);
      })
      // Every working bead of a line moves the same way, whatever its width rounds to.
      .child(bead(t, { id: `pill-${key}-${c.id}`, status: c.status, width: cells[i].w, glint: slim >= 4, tall: o.tall, fade: this.fade(c, o.now), lit: this.point === c.id })));
    return div().id(`line-${key}`).relative().h(o.band)
      // A size is told in the window's pixels, which Herdr's zoom makes larger than the mod's.
      .on_size_change((size, cx) => {
        const w = Math.round(size.width / (settings()?.zoom || 1));
        this.spans[key] = { at: this.width, w };
        if (w !== this.drawn[key]) cx.notify();
      })
      // The last one drawn is on top: a bead on its way to the ones that need you passes
      // over the others, and one that goes to rest passes under them.
      .children(beads.reverse())
      .when(Boolean(spot), (el) => el.child(slide(div().id(`here-${key}`).absolute().top((o.band + o.tall) / 2 + 3).left(spot.x + Math.round((spot.w - mark) / 2)).w(mark).h(2).rounded_full().bg(t.accent))));
  }

  // Every tab, as the line on top.
  fleet(t, m, width, now) {
    const line = this.line(t, "fleet", m.flat, { guess: width - 26, band: 22, tall: 5, now });
    return line ? h_flex().id("fleet").h(22).flex_none().px(13).child(line.flex_1().min_w(0)) : div().h(10).flex_none();
  }

  // What a folded machine or project shows in place of its tabs: their line, as on top. A
  // hairline when none of them has a state. o: as line() takes it.
  tally(t, key, tabs, o) {
    return this.line(t, key, tabs, o) ?? h_flex().h(o.band).items_center().child(div().flex_1().h(1).bg(t.border));
  }

  // A machine's line: a laptop for this one, a server for another, and its name. Click
  // those to fold its projects away or bring them back; the chevron says which it is.
  // Another machine's name is followed by its bars.
  machine(t, g, first, wide, here, width, now) {
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
    const tip = says(why, folded ? `Show ${name}'s ${holds}` : `Hide ${name}'s ${holds}`);
    // Folded with the shown project inside, the name is as bright as that project's.
    const ink = login ? t.blocked : folded && g.spaces.some((s) => s.active) ? t.foreground : t.muted;
    // Another machine's bars, and in the wide rail its time. In peach when it takes over a
    // second or does not answer.
    const sig = local ? null : this.heard(g);
    const said = sig && wide ? sig.text : "";
    const heardTip = sig ? this.heardTip(g.name, sig) : "";
    // The name gets the room the rest of the line leaves: the chevron and the icon, the
    // bars and the time, 8px of rule at least, and the button.
    const signs = sig ? 18 + (said ? 5 + Math.ceil(textWidth(said, 11)) : 0) : 0;
    const room = Math.max(30, Math.min(150, width - 86 - signs));
    // Folded, the line of its tabs gets what the name leaves: about this much.
    const rest = Math.max(8, width - 78 - signs - Math.min(room, Math.ceil(textWidth(name, 12.5))));
    const toggle = (_e, cx) => {
      if (folded) delete this.folded[key];
      else this.folded[key] = true;
      localStorage.setItem("folded", JSON.stringify(this.folded));
      cx.notify();
    };
    // The chevron sits in the margin, so the machine's icon stays in line with the tiles,
    // 2px in: a project's chevron is under it, clear of the bar that marks the shown one.
    return h_flex().id(`machine-${g.name ?? "local"}`).h(26).flex_none().mt(first ? 2 : 6).pl(1).pr(7).gap(7).items_center()
      .child(h_flex().id(`fold-${g.name ?? "local"}`).h(22).flex_none().min_w(0).pr(5).items_center().rounded(7).cursor_pointer()
        .hover((x) => x.bg(t.hover))
        .tooltip(tip)
        .on_click(toggle)
        .child(svg(ICON(folded ? "chevron-right" : "chevron-down")).size(10).flex_none().ml(1).mr(1).text_color(t.dim))
        .child(svg(ICON(local ? "laptop" : "server")).size(14).flex_none().mr(7).text_color(ink).opacity(there || login ? 1 : 0.45))
        .child(div().flex_none().max_w(room).truncate().text_size(12.5).font_family(DISPLAY).font_semibold()
          .text_color(ink).opacity(there || login ? 1 : 0.55).child(name)))
      .when(Boolean(sig), (el) => el.child(h_flex().id(`ping-${g.name}`).h(22).flex_none().gap(5).items_center()
        .when(Boolean(heardTip), (x) => x.tooltip(heardTip))
        .child(bars(t, sig.lit, sig.bad ? t.blocked : t.muted))
        .when(Boolean(said), (x) => x.child(div().flex_none().text_size(11).text_color(sig.bad ? t.blocked : t.dim).child(said)))))
      .child(folded ? this.tally(t, `on-${g.name ?? "local"}`, g.spaces.flatMap((s) => s.tabs), { guess: rest, band: 18, tall: 4, now }).flex_1().min_w(0) : div().flex_1().h(1).bg(t.border))
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
  // Another machine's pill has its bars too, and says its time on hover.
  shelf(t, groups, here) {
    return h_flex().id("shelf").flex_none().flex_wrap().mt(10).pl(13).pr(8).gap(6)
      .child(svg(ICON("server")).size(14).flex_none().mr(1).text_color(t.dim))
      .children(groups.map((g) => {
        const local = g.name === null;
        const name = local ? here : g.name;
        const login = g.state === "needs_login";
        const there = g.state === "connected";
        const sig = local ? null : this.heard(g);
        const tip = there ? says(`New project on ${name}`, sig ? this.heardTip("It", sig) : "")
          : login ? `${name} needs a login: run hc machine login ${name}`
          : `${name}: ${(g.why ?? g.state).replace(/_/g, " ")}`;
        return h_flex().id(`machine-${g.name ?? "local"}`).h(24).flex_none().max_w_full().px(8).gap(6).items_center().rounded(12).cursor_pointer()
          .border_1().border_dashed().border_color(login ? alpha(t.blocked, "99") : t.input)
          .text_color(login ? t.blocked : t.muted).opacity(there || login ? 1 : 0.5)
          .hover((x) => x.bg(t.hover).text_color(login ? t.blocked : t.foreground))
          .tooltip(tip)
          .on_click(() => (there ? run("space.new", { machine: g.name ?? "" }) : run("app.settings", { section: "machines" })))
          .child(div().min_w(0).truncate().text_size(12).font_family(DISPLAY).font_semibold().child(name))
          .when(Boolean(sig), (el) => el.child(bars(t, sig.lit, sig.bad ? t.blocked : t.muted)));
      }));
  }

  // A tab as a line: its logo, and the few words that tell it from the others. The
  // words are as bright as the tab is fresh; the one that needs you is in that color.
  row(t, c, s, now) {
    const fade = this.fade(c, now);
    const quiet = !c.status || c.status === "idle";
    const ink = c.shown ? t.foreground : c.status === "blocked" ? t.blocked : !quiet ? t.foreground : fade >= 0.75 ? t.muted : t.dim;
    const lit = !c.shown && this.point === c.id;
    return h_flex().id(`tab-${c.id}`).h(28).flex_none().ml(-4).pl(1).pr(9).gap(6).items_center().rounded(14).cursor_pointer()
      .when(c.shown, (el) => el.bg(t.raised))
      .when(!c.shown, (el) => el.hover((x) => x.bg(t.hover)))
      // With the pointer on its bead, the row is drawn as under the pointer too.
      .when(lit, (el) => el.bg(t.hover))
      .tooltip(tabTip(c, now, this.seen))
      .on_hover((on, cx) => this.aim(c.id, on, cx))
      .on_click(() => goTab(c))
      .on_mouse_down("right", (_e, cx) => {
        cx.stop_propagation();
        tabMenu(c);
      })
      .child(orb(t, { size: 20, program: c.program, status: c.status, current: c.shown, subs: c.subs, fade, backdrop: c.shown ? t.raised : lit ? t.hover : t.chrome }))
      .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(ink).child(c.label));
  }

  // A sub-agent as a smaller line under its tab's: a hook from the one that started it,
  // its logo and its name. One at work or in trouble is as bright as a tab; one at rest
  // is dim, since what it did is its parent's to tell. Click it to look at it.
  sub(t, k) {
    const quiet = !k.status || k.status === "idle";
    const ink = k.status === "blocked" ? t.blocked : quiet ? t.dim : t.foreground;
    // The hook hangs from the middle of its parent's logo: 13px in under a tab's, and 21px
    // further for each sub-agent between.
    return h_flex().h(24).flex_none().ml(-4).pl(13 + (k.depth - 1) * 21).items_center()
      .child(div().self_start().flex_none().w(8).h(13).mt(-1).mr(3).border_l(1.5).border_b(1.5).rounded_bl(6).border_color(t.input))
      .child(h_flex().id(`sub-${k.id}`).h(24).flex_1().min_w(0).pr(9).gap(4).items_center().rounded(12).cursor_pointer()
        .hover((x) => x.bg(t.hover))
        .tooltip(subTip(k))
        .on_click(() => goSub(k))
        .child(orb(t, { size: 16, program: k.program, status: k.status, fade: 0.6 }))
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(ink).child(k.label)));
  }

  // Folds a project's tabs away, or brings them back. The fold of a project that has closed
  // is forgotten here.
  tuck(id, away, cx) {
    if (away) this.tucked[id] = true;
    else delete this.tucked[id];
    if (this.live) for (const k of Object.keys(this.tucked)) if (!this.live.has(k)) delete this.tucked[k];
    localStorage.setItem("tucked", JSON.stringify(this.tucked));
    cx.notify();
  }

  space(t, s, wide, now, width) {
    const select = () => run("space.select", { id: s.id });
    const menu = () => openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: s.id } } });
    const about = s.label + (s.branch ? `, ${s.branch}` : "");
    // A name longer than the rail is cut short: hovering it says all of it.
    const cut = s.label.length * 7 > width - 66;
    // A project with tabs folds them away and back by its tile, or by the chevron in the
    // margin beside it, under its machine's: a press anywhere from the rail's edge to the
    // tile's far side counts. Folded, a line of the tabs' beads stands in for them. The
    // tile of a project without tabs shows the project instead.
    const folds = s.tabs.length > 0;
    const folded = folds && Boolean(this.tucked[s.id]);
    const does = `${folded ? "Show" : "Hide"} ${s.tabs.length} tab${s.tabs.length === 1 ? "" : "s"}`;
    const toggle = (_e, cx) => this.tuck(s.id, !folded, cx);
    const square = tile(t, {
      id: `space-${s.id}`, name: s.name, hue: s.hue, active: s.active,
      tip: folds ? says(about, does) : about, onClick: folds ? toggle : select, onMenu: menu,
    });
    // The shown project: its tile is filled, and a bar marks the row.
    const mark = () => div().absolute().left(0).top(9).w(3).h(26).rounded_r(3).bg(t.foreground);
    const fold = () => div().id(`tuck-${s.id}`).absolute().left(0).top(0).w(13).h(44).pl(2).flex().items_center().cursor_pointer()
      .text_color(t.dim).hover((x) => x.text_color(t.foreground))
      .tooltip(does)
      .on_click(toggle)
      .child(svg(ICON(folded ? "chevron-right" : "chevron-down")).size(10).flex_none());

    // What shows the project at a click and opens its menu at a right-click: its name. On a
    // folded project the block beside the tile hears both too, except where a bead of its
    // line takes the press for its own tab.
    const shows = (el) => el.cursor_pointer().on_click(select).on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); menu(); });

    if (!wide) {
      const orbs = () => s.tabs.map((c) => orb(t, {
        id: `tab-${c.id}`, program: c.program, status: c.status, current: c.shown, subs: c.subs,
        fade: this.fade(c, now), tip: tabTip(c, now, this.seen), lit: this.point === c.id,
        onClick: () => goTab(c),
        onMenu: () => tabMenu(c),
        onHover: (on, cx) => this.aim(c.id, on, cx),
      }));
      return h_flex().id(`row-${s.id}`).relative().flex_none().pl(13).pr(6).py(4).gap(7).items_start()
        .when(s.active, (el) => el.child(mark()))
        .when(folds, (el) => el.child(fold()))
        .child(square)
        .child(folded ? shows(h_flex().id(`body-${s.id}`).flex_1().min_w(0).h(36).items_center()).child(this.tally(t, `in-${s.id}`, s.tabs, { guess: width - 62, band: 36, tall: 4, now }).flex_1().min_w(0))
          : h_flex().flex_wrap().gap(1).flex_1().min_w(0).pt(3).children(orbs()));
    }

    const name = div().id(`name-${s.id}`).h(20).line_height("20px").truncate().text_size(13).font_family(DISPLAY).font_semibold()
      .text_color(s.active ? t.foreground : t.muted)
      .when(Boolean(s.branch) || cut, (el) => el.tooltip(about))
      .child(s.label);

    return h_flex().id(`row-${s.id}`).relative().flex_none().pl(13).pr(8).py(4).gap(9).items_start()
      .when(s.active, (el) => el.child(mark()))
      .when(folds, (el) => el.child(fold()))
      .child(square)
      .child(folded ? shows(v_flex().id(`body-${s.id}`).flex_1().min_w(0)).child(name).child(this.tally(t, `in-${s.id}`, s.tabs, { guess: width - 66, band: 16, tall: 4, now }).w_full())
        : v_flex().flex_1().min_w(0).child(shows(name))
          .children(s.tabs.flatMap((c) => [this.row(t, c, s, now), ...c.subs.list.map((k) => this.sub(t, k))])));
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
    this.live = m.settled ? new Set(m.spaces.map((s) => s.id)) : null;
    // A tab that went while the pointer was on it is never heard to be left.
    if (this.point && !m.flat.some((c) => c.id === this.point)) this.point = null;
    // agent.next / agent.prev walk the rail top to bottom.
    setAgentOrder(agents().map((a) => a.address));
    const w = win();
    const width = find(layout(), "sidebar")?.size?.px ?? WIDE;
    this.width = width;
    const wide = width >= 200;
    const here = hereName();

    const rows = [], idle = [];
    for (const g of m.groups) {
      // One machine needs no line. With several, one that has nothing running waits on
      // the shelf at the end instead of taking a line for itself.
      if (m.remote && !g.spaces.length) idle.push(g);
      else {
        if (m.remote) rows.push(this.machine(t, g, rows.length === 0, wide, here, width, now));
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
      .child(this.fleet(t, m, width, now))
      .child(v_flex().id("flock").flex_1().min_h(0).pb(8).overflow_y_scrollbar().children(rows))
      .child(this.foot(t, wide));
  }
}
