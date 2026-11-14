// The top strip. Left: the shown project (its tile and name; click to find another),
// then its tabs: each is its logo and its title (the name you gave it, else what its
// agent says it is doing; a tab with nothing to say yet is its logo alone). The titles
// share the strip: short ones stay whole, long ones shorten together, and when there is
// no room for words the resting tabs are logos and only the shown one keeps its title.
// Double-click a tab to rename it (F2 does the same for the shown one), right-click it
// for its menu, scroll the strip to step through them, and drag a tab along the strip
// to move it: it lifts, the others step aside as it goes, and where it stands when you
// let go is where it lands. The dashed pill starts things: a logo is "a new tab running that",
// the prompt is a plain terminal, the dots are the full + menu. Right: what wants you
// (click to go to the next one), the Files and Changes panels, search.
//
// The bar is also where a tab is closed, whoever asks (its x, the close key, a menu, a
// pane's header): see ask() and shut(). Closing what isn't a plain shell takes two presses.
// Closing the shown tab shows the one after it; closing a project's last tab leaves the
// project on show as an empty page (blank.js), which goes once you look elsewhere. When
// the project on show closes, the next one shows its first tab.
// Keys bound to this layout in keys.json ("layout:glyph") arrive as commands:
//   rename, close, close-pane, new, new-<program key> (new-claude, new-codex, ...).

import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme, run, layout, settings, spaces, panes, focused, machines, shared, setShared, notify, window as win, openOverlay, knownAgents, nextCommand } from "herdr";
import { model, jump, tabTip, find, tabMenu, renameTab, newTab, shell, keyFor, withKey, BLANK, SHUT, ARM } from "./data.js";
import { ICON, INK, DISPLAY, alpha, mix, logo, inkOf, danger, orb, tile, iconButton, textWidth } from "./ui.js";

const stop = (_e, cx) => cx.stop_propagation();

const TITLE = 12.5;     // the size tab titles are set in
const TITLE_MAX = 240;  // the most room one title takes
const TITLE_MIN = 32;   // with less than this for each, resting tabs go back to logos
const GAP = 3;          // between two tabs
const AWAY = 400;       // ms a held tab waits for a pointer that left the strip
const LAND = 2000;      // ms a dropped tab's preview waits for the move to really happen
const PAGE = 4000;      // ms a project's last tab waits for the empty page to take its place
const GONE = 5000;      // ms a tab asked to close counts as closed before it really is
const LOOK = 120;       // ms between looks at what changed: see look()
const REST = 8;         // with nothing drawn, only every so many looks really look

// The room each title gets when `room` is shared out: those that need less keep their
// own width, the rest get this much each. Infinity: all of them fit as they are.
function fit(wants, room) {
  const sorted = [...wants].sort((a, b) => a - b);
  let left = room;
  for (let i = 0; i < sorted.length; i++) {
    const share = left / (sorted.length - i);
    if (sorted[i] >= share) return share;
    left -= sorted[i];
  }
  return Infinity;
}

export class Bar {
  constructor(cx) {
    this.drag = null; // the tab under a held button, and where it would land: see press()
    this.sizes = {};  // tab id -> how wide it was last laid out
    this.swipe = 0;
    this.swipeAt = 0;
    this.stepAt = 0;
    this.room = null; // how wide the tabs' part of the strip is, once it has been laid out
    this.known = {}; // machine ("" for this computer) -> what it can start
    this.asked = {};
    this.armed = null;      // what a first close press was for: see ask()
    this.leaving = null;    // a project's last tab, waiting for its empty page: see shut()
    this.going = new Map(); // tab id -> when it was asked to close
    this.swept = new Map(); // empty page -> when it was asked to close
    this.last = null;       // the project and tab on show at the last look: see follow()
    this.dirty = true;      // something was drawn since the last look: see look()
    this.rests = 0;         // looks since then that found nothing drawn
    this.learn(cx);
    cx.timer.every(3000, (cx) => this.learn(cx));
    cx.timer.every(LOOK, (cx) => this.look(cx));
    // Keys bound to this layout (keys.json, "layout:glyph") arrive here, and so does what
    // the other parts ask of the bar.
    cx.spawn(async (cx) => {
      for (;;) {
        const name = await nextCommand();
        // One command going wrong must not end the loop: every key above comes through it.
        try {
          this.command(name, cx);
        } catch (e) {
          notify({ title: `Glyph could not ${name}`, body: String(e?.message ?? e), level: "error" });
        }
        cx.notify();
      }
    });
  }

  command(name, cx) {
    const m = model();
    const s = m.active;
    const c = s?.tabs.find((x) => x.active);
    if (name === "rename") {
      if (c) renameTab(c);
    } else if (name === "close") this.close(m, cx);
    else if (name === "close-pane") this.closePane(m, cx);
    else if (name === "shut") {
      const asked = shared(SHUT);
      if (asked?.id && Date.now() - asked.at < GONE) this.shut(m, asked.id, cx);
    } else if (name === "new") newTab(s);
    else if (name.startsWith("new-")) this.start(s, name.slice(4), cx);
  }

  // Closing something that isn't a plain shell takes two presses: the first only arms it
  // (the tab turns red for a moment), the second, on the same thing and in time, does it.
  // `tab` is the tab that shows it armed; `go` does the closing.
  ask(id, careful, tab, go, cx) {
    const now = Date.now();
    if (!careful || (this.armed?.id === id && now - this.armed.at < ARM)) {
      this.armed = null;
      go();
      return;
    }
    const mine = { id, tab, at: now };
    this.armed = mine;
    cx.timer.after(ARM, (cx) => {
      if (this.armed !== mine) return;
      this.armed = null;
      cx.notify();
    });
  }

  // The close key: the shown tab. A project showing its empty page has only that to close,
  // which closes the project. Herdr then shows the next project on the tab it was last left
  // on; its first tab is shown here instead, before the page goes, so the window moves once.
  close(m, cx) {
    const s = m.active;
    if (!s) return;
    if (s.empty) {
      const at = m.spaces.indexOf(s);
      const first = (m.spaces[at + 1] ?? m.spaces[at - 1])?.tabs[0];
      if (first) run("tab.select", { id: first.id });
      for (const b of s.blanks) this.sweep(b);
      return;
    }
    const c = s.tabs.find((x) => x.active);
    if (c) this.ask(c.id, c.careful, c.id, () => this.shut(model(), c.id, cx), cx);
  }

  // The close-pane key: the focused pane. A tab's only pane is the tab.
  closePane(m, cx) {
    const at = focused();
    const p = at?.pane ? panes().find((x) => x.pane === at.pane) : null;
    const c = p ? m.flat.find((x) => x.id === p.tab) : null;
    if (!c && m.active?.empty) this.close(m, cx);
    else if (!c) run("pane.close");
    else if (c.panes < 2) this.ask(c.id, c.careful, c.id, () => this.shut(model(), c.id, cx), cx);
    else this.ask(p.pane, Boolean(p.terminal) && !p.program?.shell, c.id, () => run("pane.close", { pane: p.pane }), cx);
  }

  // Closes a tab, no more questions. One that isn't on show just goes. The shown one first
  // hands over to the tab after it (the last one, to the tab before it), which is also the
  // order Herdr keeps when a tab ends by itself. A project's last tab first gets the
  // project's empty page beside it, and goes once that is there (tend() sees to it): Herdr
  // closes a project with its last tab and shows another one, which is the jump this avoids.
  shut(m, id, cx) {
    const c = m.flat.find((x) => x.id === id);
    if (!c) return;
    const s = c.space;
    const at = s.tabs.indexOf(c);
    const next = s.tabs[at + 1] ?? s.tabs[at - 1];
    const end = () => {
      this.going.set(id, Date.now());
      run("tab.close", { id, confirmed: true });
    };
    if (!c.shown) end();
    else if (next) {
      run("tab.select", { id: next.id });
      end();
    } else {
      // What the page can't know once no terminal is left: see BLANK in data.js.
      const settled = machines().every((k) => k.layout === "ready");
      const kept = Object.fromEntries(Object.entries(shared(BLANK) ?? {}).filter(([k]) => !settled || m.spaces.some((x) => x.id === k)));
      kept[s.id] = { name: s.name, folder: c.cwd ?? "" };
      setShared(BLANK, kept);
      const mine = { tab: id, space: s.id };
      this.leaving = mine;
      run("tab.new", { space: s.id, mod: "glyph", props: { role: "blank" } });
      // If the page never comes, the tab closes all the same.
      cx.timer.after(PAGE, (cx) => {
        if (this.leaving !== mine) return;
        this.leaving = null;
        end();
        cx.notify();
      });
    }
  }

  // What the bar does by itself when the flock changes (tend, follow). A render may not
  // run commands, so it only notes that something was drawn (Herdr redraws a mod whenever
  // its lists change), and this, on a timer, does the looking. With nothing drawn it still
  // looks about once a second, in case the window is not being drawn at all.
  look(cx) {
    this.rests = this.dirty ? 0 : this.rests + 1;
    if (!this.dirty && this.rests % REST) return;
    this.dirty = false;
    const m = model();
    this.tend(m, Date.now());
    if (this.follow(m)) cx.notify();
  }

  // Asks an empty page to close, once: again only if it is still there much later.
  sweep(b) {
    const now = Date.now();
    if (now - (this.swept.get(b.id) ?? 0) < GONE) return;
    this.swept.set(b.id, now);
    run("tab.close", { id: b.id, confirmed: true });
  }

  // Empty pages come and go by themselves. A last tab that was waiting for its page goes
  // once the page is there. A page makes way for a tab that started beside it. And a
  // project left with only its page closes once another project is on show, the way it
  // would have closed with its last tab.
  tend(m, now) {
    for (const [id, at] of this.going) if (now - at > GONE || !m.flat.some((c) => c.id === id)) this.going.delete(id);
    const d = this.leaving;
    const home = d ? m.spaces.find((s) => s.id === d.space) : null;
    const page = home?.blanks[0];
    if (page) {
      this.leaving = null;
      // Only while its project is still on show: showing a tab shows its project too.
      if (!page.active && home.active) run("tab.select", { id: page.id });
      this.going.set(d.tab, now);
      run("tab.close", { id: d.tab, confirmed: true });
    }
    for (const s of m.spaces) {
      const real = s.tabs.filter((c) => !this.going.has(c.id));
      s.blanks.forEach((b, i) => {
        const spare = i > 0 || real.length > 0;
        const left = !s.active && this.leaving?.space !== s.id;
        if (!spare && !left) return;
        // A page on show hands over to a tab first, so closing it changes nothing you see.
        if (s.active && b.active && real.length && !this.swept.has(b.id)) run("tab.select", { id: real[real.length - 1].id });
        this.sweep(b);
      });
    }
    for (const id of this.swept.keys()) if (!m.spaces.some((s) => s.blanks.some((b) => b.id === id))) this.swept.delete(id);
  }

  // What changed on show since the last look. When the project that was on show has closed
  // (with its last tab, from Herdr's own menu, or by the close key on its empty page), Herdr
  // shows the next project on the tab it was last left on: the bar shows its first tab.
  // True when a close press was taken back, which shows.
  follow(m) {
    const s = m.active;
    const tabs = s?.tabs ?? [];
    const now = s ? { space: s.id, machine: s.machine, tab: tabs.find((c) => c.active)?.id ?? null } : null;
    const was = this.last;
    this.last = now;
    // A close press is for the tab that was on show when it was made.
    const back = Boolean(this.armed && was && was.tab !== now?.tab);
    if (back) this.armed = null;
    if (!was || !now || was.space === now.space || m.spaces.some((x) => x.id === was.space)) return back;
    // A project whose machine went out of reach is only missing, not closed.
    if (machines().some((k) => (k.name ?? null) === was.machine && k.layout !== "ready")) return back;
    if (tabs[0] && now.tab !== tabs[0].id) run("tab.select", { id: tabs[0].id });
    return back;
  }

  // A key that starts an agent: `key` is its key in Herdr's program table (claude, codex, ...).
  start(s, key, cx) {
    const machine = s?.machine ?? null, where = machine ?? "";
    const pick = (list) => (list ?? []).find((a) => a.key === key);
    const known = pick(this.known[where]) ?? pick(shared("new-menu.agents")?.[where]);
    if (known) {
      newTab(s, known);
      return;
    }
    cx.spawn(async () => {
      try {
        const a = pick(await knownAgents({ on: machine }));
        if (a) newTab(s, a);
        else notify({ title: `No agent called "${key}"`, body: "keys.json binds a key to it", level: "warning" });
      } catch {}
    });
  }

  // A press on a tab may turn into a drag. This keeps which tab, where the pointer was,
  // and how wide every tab is, so the others can be shown stepping aside.
  press(tabs, i, e) {
    const live = new Set(tabs.map((c) => c.id));
    for (const id of Object.keys(this.sizes)) if (!live.has(id) && !spaces().some((s) => s.tabs.some((c) => c.id === id))) delete this.sizes[id];
    const widths = tabs.map((c) => this.sizes[c.id] ?? 0);
    this.drag = {
      id: tabs[i].id, from: i, to: i, x0: e.position.x, moved: false, dropped: false, away: 0, at: Date.now(),
      serial: (this.presses = (this.presses ?? 0) + 1),
      order: tabs.map((c) => c.id).join(" "),
      widths: widths.every((w) => w > 0) ? widths : null,
    };
  }

  // The pointer moved with a tab held. Where would the tab land? It takes a neighbour's
  // place once the pointer is past that neighbour's middle, measured on the strip as it
  // was laid out (`e` is then the strip's own event). When the widths aren't known the
  // answer is simply the tab under the pointer, `over`. True when the answer changed.
  track(e, over) {
    const d = this.drag;
    if (!d || d.dropped) return false;
    d.at = Date.now();
    d.away = 0;
    if (!d.moved && Math.abs(e.position.x - d.x0) < 5) return false;
    let to = d.to;
    if (d.widths && over === null && e.bounds) {
      const gap = GAP * (settings()?.zoom || 1);
      const x = e.position.x - e.bounds.x;
      to = d.from;
      for (let k = 0, left = 0; k < d.widths.length; left += d.widths[k] + gap, k++) {
        const middle = left + d.widths[k] / 2;
        if (k < d.from && x < middle) {
          to = k;
          break;
        }
        if (k > d.from && x > middle) to = k;
      }
    } else if (!d.widths && over !== null) to = over;
    else return false;
    const changed = !d.moved || to !== d.to;
    d.moved = true;
    d.to = to;
    return changed;
  }

  // The button came up. A tab that was only pressed is shown; one that was moved lands.
  release(cx) {
    const d = this.drag;
    if (!d || d.dropped) return;
    if (!d.moved) {
      this.drag = null;
      run("tab.select", { id: d.id });
    } else this.land(d, cx);
    cx.notify();
  }

  // A moved tab goes to the place it was shown in, and the tabs stay as previewed until
  // they really are in that order (a tab on another machine takes a moment).
  land(d, cx) {
    if (d.to === d.from) {
      this.drag = null;
      return;
    }
    d.dropped = true;
    run("tab.move", { id: d.id, index: d.to + 1 });
    cx.timer.after(LAND, (cx) => {
      if (this.drag !== d) return;
      this.drag = null;
      cx.notify();
    });
  }

  // The pointer left the strip with a tab held. Out there the strip can't hear the
  // button come up, so unless the pointer is back in a moment the tab is let go where
  // it stands: dropping it a little below the strip works like dropping it on it.
  leave(cx) {
    const d = this.drag;
    if (!d || d.dropped) return;
    const mine = (this.leaves = (this.leaves ?? 0) + 1);
    d.away = mine;
    cx.timer.after(AWAY, (cx) => {
      if (this.drag !== d || d.away !== mine || d.dropped) return;
      if (d.moved) this.land(d, cx);
      else this.drag = null;
      cx.notify();
    });
  }

  // A new press anywhere means the last one is over, even if its release was never
  // heard: whatever was held is dropped back where it was.
  forget(cx) {
    if (!this.drag || this.drag.dropped) return;
    this.drag = null;
    cx.notify();
  }

  // Which agents the shown project's machine has: asked when you get there, and again
  // every few minutes (someone may install one). The app caches each answer a minute.
  learn(cx) {
    const machine = spaces().find((s) => s.active)?.machine ?? null;
    const where = machine ?? "";
    if (this.asked[where] && Date.now() - this.asked[where] < 300000) return;
    this.asked[where] = Date.now();
    cx.spawn(async (cx) => {
      try {
        this.known[where] = await knownAgents({ on: machine });
        cx.notify();
      } catch {}
    });
  }

  // Scrolling over the strip steps through its tabs. A wheel's notch is one tab; a
  // trackpad sends a stream of small moves, which must add up to a real swipe first.
  wheel(e) {
    const now = Date.now();
    let step = 0;
    if (e.delta_lines) step = Math.sign(e.delta_lines.y);
    else {
      if (e.touch_phase === "started" || now - this.swipeAt > 300) this.swipe = 0;
      this.swipe += e.delta.y;
      this.swipeAt = now;
      if (Math.abs(this.swipe) >= 48) {
        step = Math.sign(this.swipe);
        this.swipe = 0;
      }
    }
    if (!step || now - this.stepAt < 160) return;
    this.stepAt = now;
    run(step > 0 ? "tab.prev" : "tab.next");
  }

  render() {
    const t = theme();
    const now = Date.now();
    const m = model();
    const s = m.active;
    const w = win();
    const root = layout();
    const sidebar = find(root, "sidebar"), panel = find(root, "panel"), body = find(root, "panel-body");
    // With the rail hidden, macOS's window buttons sit over this strip's start.
    const lights = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(2, (root.traffic_lights[0] + 64) / (settings()?.zoom || 1) - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 2;
    const spaceMenu = (_e, cx) => {
      cx.stop_propagation();
      openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: s.id } } });
    };
    const tag = (icon, text) => h_flex().flex_none().gap(4).items_center().text_size(11.5).text_color(t.dim)
      .child(svg(ICON(icon)).size(12).flex_none())
      .child(div().max_w(170).truncate().child(text));

    const crumb = !s ? div() : h_flex().id("crumb").h(32).flex_none().pl(5).pr(10).gap(8).items_center().rounded(10).cursor_pointer()
      .hover((x) => x.bg(t.hover))
      .on_mouse_down("left", stop)
      .on_click(() => run("mod.open", { name: "picker" }))
      .on_mouse_down("right", spaceMenu)
      .child(tile(t, { name: s.name, hue: s.hue, active: true, size: 22 }))
      .child(div().max_w(280).truncate().text_size(13.5).font_family(DISPLAY).font_semibold().text_color(t.foreground).child(s.label))
      .when(Boolean(s.machine), (el) => el.child(tag("server", s.machine)));

    const where = s?.machine ?? "";
    const plain = shell();
    const can = (this.known[where] ?? shared("new-menu.agents")?.[where] ?? []).filter((a) => a.installed).slice(0, 4);
    const startersWidth = 28 + 27 * (can.length + 2);

    this.dirty = true;
    const tabs = s?.tabs ?? [];
    // What a first close press armed, while it waits for the second.
    const armed = this.armed && now - this.armed.at < ARM ? this.armed : null;
    const red = danger(t);
    // A drag is over once the tabs change under it (the move landed, one closed), or
    // when nothing has been heard of it for a while (the button came up elsewhere).
    if (this.drag && (this.drag.order !== tabs.map((c) => c.id).join(" ") || (!this.drag.dropped && now - this.drag.at > 15000))) this.drag = null;
    const d = this.drag;
    const dragging = Boolean(d?.moved) && !d.dropped;
    const zoom = settings()?.zoom || 1;
    // A press on a control inside the tabs' row is its own, and ends any held tab.
    const mine = (_e, cx) => {
      cx.stop_propagation();
      this.forget(cx);
    };
    // How far a tab stands from its own place while one is dragged: the dragged one is
    // where it would land, and the ones it passed have closed up behind it.
    const aside = (k) => {
      if (!d?.moved || !d.widths || d.to === d.from) return 0;
      const step = (j) => d.widths[j] / zoom + GAP;
      const between = (a, b) => {
        let sum = 0;
        for (let j = a; j <= b; j++) sum += step(j);
        return sum;
      };
      if (k === d.from) return d.to > d.from ? between(d.from + 1, d.to) : -between(d.to, d.from - 1);
      if (d.to > d.from && k > d.from && k <= d.to) return -step(d.from);
      if (d.to < d.from && k >= d.to && k < d.from) return step(d.from);
      return 0;
    };
    // What each title would take, and what a tab takes besides its title: its logo, and
    // the shown one's close button.
    const widths = tabs.map((c) => (c.title ? Math.min(Math.ceil(textWidth(c.title, TITLE)) + 1, TITLE_MAX) : 0));
    const rest = (c) => (c.active ? 66 : 46);
    const taken = tabs.reduce((sum, c) => sum + 3 + (c.title ? rest(c) : c.active ? 61 : 32), 0);
    const crowded = this.room !== null && fit(widths.filter(Boolean), this.room - startersWidth - taken) < TITLE_MIN;
    const words = (label, ink) => div().flex_1().min_w(0).truncate().text_size(TITLE).text_color(ink).child(label);
    const chip = (c, i) => {
      const label = c.title && (c.active || !crowded) ? c.title : "";
      const held = Boolean(d?.moved) && d.from === i;
      // The tab being moved is drawn by lifted(), over the row: here it only keeps its place.
      const unseen = held && Boolean(d.widths);
      const ink = c.active || held ? t.foreground : c.status === "blocked" ? t.blocked : t.muted;
      // A first close press landed here: the next one closes it.
      const hot = armed?.tab === c.id;
      // Without the widths nothing can step aside: a mark on the tab it would land by.
      const mark = Boolean(d?.moved) && !d.widths && d.to === i && d.from !== i;
      // A slide belongs to an element's id. For as long as a drag lasts every tab has an
      // id of that drag's own, so each drag starts from rest and leaves nothing behind.
      const sliding = Boolean(d?.moved);
      return h_flex().id(sliding ? `chip-${c.id}~${d.serial}` : `chip-${c.id}`).h(32).pl(1).pr(c.active ? 7 : label ? 10 : 1).gap(5).items_center().rounded(16).cursor_pointer()
        // Every title grows from nothing by the same amount, and stops at its own width:
        // that is the sharing out. The shown tab starts 20 ahead, for its close button,
        // and keeps a few words however little room there is.
        .when(Boolean(label), (el) => el.flex_grow(1).flex_shrink(1).flex_basis(c.active ? 20 : 0)
          .min_w(rest(c) + (c.active ? Math.min(widths[i], 56) : 0)).max_w(rest(c) + widths[i]))
        .when(!label, (el) => el.flex_none())
        .when(c.active && !held, (el) => el.bg(hot ? alpha(red, "38") : t.raised))
        .when(held, (el) => el.bg(alpha(t.accent, "40")))
        .when(unseen, (el) => el.opacity(0))
        .when(!c.active && !d?.moved, (el) => el.hover((x) => x.bg(t.hover)))
        .when(!d?.moved, (el) => el.tooltip(tabTip(c, now)))
        // While a tab is being moved, the others are drawn where they would be if the
        // button came up now, and slide there.
        .when(sliding, (el) => el.relative().left(unseen ? 0 : aside(i)).transition("left", { duration: 140, easing: "ease-out" }))
        .when(dragging, (el) => el.cursor_grabbing())
        .when(mark, (el) => el.child(div().absolute().top(5).bottom(5).w(3).rounded_full().bg(t.accent)
          .when(d.from < i, (x) => x.right(-2)).when(d.from > i, (x) => x.left(-2))))
        .on_size_change((size) => { this.sizes[c.id] = size.width; })
        .on_mouse_down("left", (e, cx) => {
          cx.stop_propagation();
          if (e.click_count === 2) {
            this.drag = null;
            renameTab(c);
          } else this.press(tabs, i, e);
          cx.notify();
        })
        .on_mouse_move((e, cx) => { if (this.track(e, i)) cx.notify(); })
        .on_mouse_down("right", (_e, cx) => {
          cx.stop_propagation();
          this.forget(cx);
          tabMenu(c);
        })
        .child(orb(t, { program: c.program, status: c.status, subs: c.subs, backdrop: c.active ? (hot ? mix(t.chrome, red, 0.22) : t.raised) : t.chrome }))
        .when(Boolean(label), (el) => el.child(words(label, ink)))
        .when(c.active, (el) => el.child(div().id(`close-${c.id}`).flex_none().size(18).rounded_full().flex().items_center().justify_center()
          .when(!hot, (x) => x.text_color(t.dim).hover((y) => y.bg(t.input).text_color(t.foreground)))
          .when(hot, (x) => x.bg(red).text_color(INK).loop("opacity", { from: 0.6, to: 1, period: 700 }))
          .tooltip(hot ? "Again to close" : withKey("Close tab", keyFor("glyph.close", "tab.close")))
          .on_mouse_down("left", mine)
          .on_click((_e, cx) => {
            cx.stop_propagation();
            this.ask(c.id, c.careful, c.id, () => this.shut(model(), c.id, cx), cx);
            cx.notify();
          })
          .child(svg(ICON("x")).size(11))));
    };

    // The tab being moved, drawn once more over the row, solid and where it would land:
    // the tabs it passes go under it, not through it.
    const lifted = () => {
      const c = tabs[d.from];
      const label = c.title && (c.active || !crowded) ? c.title : "";
      const fill = mix(t.chrome, t.accent, 0.3);
      let home = 0;
      for (let j = 0; j < d.from; j++) home += d.widths[j] / zoom + GAP;
      return h_flex().id(`held~${d.serial}`).absolute().top(((find(root, "bar")?.size?.px ?? 42) - 32) / 2).left(home + aside(d.from))
        .w(d.widths[d.from] / zoom).h(32).pr(c.active ? 6 : label ? 9 : 0).gap(5).items_center().rounded(16)
        .bg(fill).border_1().border_color(alpha(t.accent, "b3")).shadow_md()
        .transition("left", { duration: 140, easing: "ease-out" })
        .when(dragging, (el) => el.cursor_grabbing())
        .child(orb(t, { program: c.program, status: c.status, subs: c.subs, backdrop: fill }))
        .when(Boolean(label), (el) => el.child(words(label, t.foreground)))
        .when(c.active, (el) => el.child(div().flex_none().size(18).flex().items_center().justify_center().text_color(t.dim).child(svg(ICON("x")).size(11))));
    };

    const round = (id, tip, onClick, child) => div().id(id).flex_none().size(26).rounded_full().flex().items_center().justify_center().cursor_pointer()
      .text_color(t.dim).hover((x) => x.bg(t.hover).text_color(t.foreground))
      .tooltip(tip).on_mouse_down("left", mine).on_click(onClick).child(child);
    const starters = h_flex().flex_none().h(32).pl(9).pr(3).gap(1).items_center().rounded(16)
      .border_1().border_dashed().border_color(t.input)
      .child(svg(ICON("plus")).size(11).flex_none().mr(3).text_color(t.dim))
      .children(can.map((a) => round(`start-${a.key}`, withKey(`New ${a.name} tab`, keyFor(`glyph.new-${a.key}`)), () => newTab(s, a), logo(a, 15, inkOf(t, a)))))
      // A plain terminal: the logo its tab will wear.
      .child(round("start-shell", withKey("New terminal tab", keyFor("glyph.new", "tab.new")), () => newTab(s), logo(plain, 15, inkOf(t, plain))))
      .child(round("start-more", "More: other agents, a project, a worktree", () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 }), svg(ICON("more")).size(14)));

    // What wants you, anywhere: a count behind a bell (needs you) or a tick (finished).
    const wants = (k, icon, tip) => h_flex().id(`wants-${k}`).h(26).flex_none().pl(8).pr(10).gap(5).items_center().rounded_full().cursor_pointer()
      .bg(alpha(t[k], "24")).text_color(t[k]).text_size(12.5).font_family(DISPLAY).font_bold()
      .hover((x) => x.bg(alpha(t[k], "40")))
      .tooltip(tip).on_mouse_down("left", stop).on_click(() => jump(m, k))
      .child(div().flex().flex_none().when(k === "blocked", (el) => el.loop("opacity", { from: 0.5, to: 1, period: 900 }))
        .child(svg(ICON(icon)).size(13)))
      .child(String(m.counts[k]));

    const side = (id, icon, tip) => {
      const on = Boolean(panel) && !panel.hidden && body?.active === id;
      return iconButton(t, {
        id: `panel-${id}`, icon, tip, on,
        onClick: () => {
          if (on) run("layout.hide", { id: "panel" });
          else {
            run("layout.select", { stack: "panel-body", child: id });
            run("layout.show", { id: "panel" });
          }
        },
      });
    };

    const n = m.counts;
    return h_flex().id("strip").size_full().min_w(0).pl(lights).pr(10).gap(6).items_center().bg(t.chrome)
      // A held tab is let go wherever on the strip the button comes up; see leave()
      // for a pointer that wanders off the strip first.
      .on_mouse_up("left", (_e, cx) => this.release(cx))
      .on_hover((hovered, cx) => {
        if (!hovered) this.leave(cx);
        else if (this.drag) this.drag.away = 0;
      })
      .on_scroll_wheel((e) => this.wheel(e))
      .child(crumb)
      .when(Boolean(s), (el) => el.child(div().w(1).h(16).flex_none().bg(t.border)))
      // The tabs and the pill after them get all the room the rest leaves.
      .child(h_flex().id("chips").relative().flex_1().min_w(0).h_full().gap(3).items_center().overflow_x_hidden()
        .on_size_change((size, cx) => {
          const room = Math.round(size.width);
          if (room === this.room) return;
          this.room = room;
          cx.notify();
        })
        .on_mouse_move((e, cx) => { if (this.track(e, null)) cx.notify(); })
        .on_mouse_down("left", (_e, cx) => this.forget(cx))
        .on_mouse_down_out((_e, cx) => this.forget(cx))
        .children(tabs.map(chip))
        .child(starters)
        .when(Boolean(d?.moved) && Boolean(d.widths), (el) => el.child(lifted())))
      .when(n.blocked > 0, (el) => el.child(wants("blocked", "bell", `${n.blocked} need${n.blocked === 1 ? "s" : ""} you: go to the next`)))
      .when(n.done > 0, (el) => el.child(wants("done", "check", `${n.done} finished: go to the next`)))
      .child(side("files", "files", "Files"))
      .child(side("changes", "diff", "Changes"))
      .child(iconButton(t, { id: "search", icon: "search", tip: "Find a project or tab", onClick: () => run("mod.open", { name: "picker" }) }))
      // Where the system draws no window buttons (Linux, Windows), these are them.
      .when(Boolean(w?.buttons), (el) => el
        .child(iconButton(t, { id: "win-min", icon: "minus", tip: "Minimize", onClick: () => run("window.minimize") }))
        .child(iconButton(t, { id: "win-max", icon: w.maximized ? "unzoom" : "zoom", tip: "Maximize", onClick: () => run("window.maximize") }))
        .child(iconButton(t, { id: "win-close", icon: "x", tip: "Close", onClick: () => run("window.close") })));
  }
}
