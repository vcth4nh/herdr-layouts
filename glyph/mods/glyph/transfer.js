// The transfer window: files from one machine to another, without typing scp.
// Two sides, each a machine and a folder on it. On top of a side: its machine among the
// others, then places to jump to (home, the root, each project there as its tile), then
// the way down to the folder on show: click a part of it to go back up, the last part to
// read the folder again. A folder opens by its chevron or a double-click.
// Picking is as in a file manager. Click a row to pick it alone; Shift-click for every row
// from the last one clicked to this one; Cmd-click (Ctrl elsewhere) for one more, or one
// fewer. Hold a row and move down or up the list to sweep the rows on the way. Click the
// one picked row, or the empty part of a list, to let go.
// With something picked, the arrow in the middle points at the other side, where dashed
// rows show what would land. A press on the arrow starts the copy, and so does carrying
// the picked rows over: hold one of them, move to the other side, let go there.
// When a picked name is already there, the first press (or the carry) only turns the arrow
// red, and a press on it, in time, replaces. Files dropped on a side from outside the app
// are copied into its folder.
// Copies under way sit in the window's head: a turning ring, what, and where to. Click one
// to peek at scp's own meter. One that failed stays there in peach: hover for why, click to
// dismiss. copy.js does the copying, and the bar says how each copy ended.
// With two other machines on show, a copy passes through this computer, unless you give it
// a password. The window asks whether one of the two can log in to the other (hops in
// copy.js): one way is enough, since that machine can send the files or fetch them. If so,
// a field in the head asks for the password of the machine that is logged in to. With one
// typed, the copy is started on one of the two and goes directly to the other: the window
// types the password into scp's prompt there, and keeps it only until that is done.
// Which way a copy between two other machines goes is on show: a bolt for a direct copy, this
// computer's laptop for through here, on the arrow before the copy and in its pill after.
// Opened as a window with props { role: "transfer" }. The left side opens where you are,
// the right where it was left.

import { div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { theme, props, run, shared, setShared, notify, closeOverlay, settings } from "herdr";
import { model, fleet, tilde, placeOf, says, ARM } from "./data.js";
import { copies, listing, startCopy, dropCopy, meter, bytes, what, base, join, nameOf, wayOf, through, hops, hopFor, feed, endCopy, shownTransfer, goneTransfer } from "./copy.js";
import { ICON, INK, DISPLAY, alpha, mix, danger, orb, tile, iconButton } from "./ui.js";

// Where the right side was left: { on, path }.
const SIDE = "glyph.side";
// What was last learned of the direct way between two machines: { "a\nb": { hops, at } },
// for the newest KEPT pairs. A window that opens shows it at once, and asks again behind
// it when it is older than FRESH. It holds how ssh reaches a machine and its host key as
// this computer has it on record, and no password.
const ROUTES = "glyph.routes", KEPT = 20;
// What a copy wears in its orb, where a tab wears its program's logo.
const ARROW = { icon: ICON("arrow-right"), tint: true };
// A copy that goes directly from one machine to the other wears a bolt, and one that
// passes through this computer on its way between two others wears its laptop.
const BOLT = { icon: ICON("bolt"), tint: true };
const HERE = { icon: ICON("laptop"), tint: true };
// The most dashed rows a side shows for what would land; the rest are a count.
const GHOSTS = 4;
// ms an answer to "can one of these two log in to the other" is kept.
const FRESH = 300000;
// ms a prompt that was just typed into may still be the last thing on its screen.
const TYPED = 5000;
// How often, and how many times, a direct copy that just started is looked at for its prompt.
const SOON = 500, LOOKS = 60;
// How far, in pixels, a held row has to move before the press is more than a click.
const SLACK = 5;
// ms a held row waits for a pointer that left the window, and ms it is kept at most with
// nothing heard of the pointer.
const AWAY = 400, HELD = 15000;

export class Transfer {
  constructor(cx) {
    this.machines = []; // fleet(): every machine's state and how ssh reaches it
    this.armed = 0;     // when the arrow was pressed once, over names that are already there
    this.meters = {};   // copy id -> how far scp says it is
    this.seen = null;   // the copies there were at the last tick
    this.hold = null;   // a row under a held button, and what the press has become: see press()
    this.overlay = props()?.overlay ?? null;
    shownTransfer(this.overlay);
    // A window does not take the keyboard when it opens, so keys would still go to the
    // terminal behind it. The window takes it as it starts, and once more a moment later,
    // for an overlay that was not ready to hold it at once.
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.timer.after(300, () => this.handle.focus());
    this.routes = new Map(); // "a\nb" (two other machines, by name) -> { asking, hops, at }: see scout()
    // The password of a direct copy under way, for scp's prompts: copy id -> { secret,
    // armed, left }. It is here and nowhere else, and goes once the last prompt has it.
    this.keys = new Map();
    this.fed = new Map(); // copy id -> when its prompt was last typed into
    this.keyOf = null;    // the machine the password field is for
    this.secret = InputState.new({ placeholder: "password" });
    this.secret.set_masked(true);
    this.secret.on("change", (_e, cx) => cx.notify());
    this.secret.on("submit", (_e, cx) => this.send(cx));
    const m = model();
    const s = m.active;
    const left = { on: s?.machine ?? null, path: s ? placeOf(s) : "" };
    const was = shared(SIDE);
    // The first time: this computer, or from this computer, the first other machine.
    const other = left.on === null ? m.groups.find((g) => g.name !== null && g.state === "connected")?.name ?? null : null;
    const right = typeof was?.path === "string" ? { on: was.on ?? null, path: was.path } : { on: other, path: "" };
    this.sides = [left, right].map((at) => ({
      on: at.on, path: at.path, home: "", entries: [], more: false, picked: new Set(), loading: false, error: null, seq: 0,
      anchor: null, // the row a Shift-click counts from: the last one clicked
      // A folder that is gone by now (the one remembered) gives way to home, once.
      lenient: true,
    }));
    for (const [key, r] of Object.entries(shared(ROUTES) ?? {})) if (Array.isArray(r?.hops)) this.routes.set(key, { asking: false, hops: r.hops, at: Number(r.at) || 0 });
    this.guard();
    this.load(0, cx);
    this.load(1, cx);
    this.learn(cx);
    cx.timer.every(20000, (cx) => this.learn(cx));
    cx.timer.every(1500, (cx) => this.tick(cx));
  }

  learn(cx) {
    cx.spawn(async (cx) => {
      const all = await fleet();
      if (!all || JSON.stringify(all) === JSON.stringify(this.machines)) return;
      this.machines = all;
      this.scout(cx);
      cx.notify();
    });
  }

  // The two other machines on show, by name, when they are two.
  pair() {
    const [a, b] = this.sides.map((s) => s.on);
    return a !== null && b !== null && a !== b ? [a, b].sort() : null;
  }

  // Asks, once in a while, whether one of the two machines on show can log in to the other.
  scout(cx) {
    const p = this.pair();
    if (!p || !this.machines.length) return;
    const key = p.join("\n"), was = this.routes.get(key);
    if (was && (was.asking || Date.now() - was.at < FRESH)) return;
    this.routes.set(key, { asking: true, hops: was?.hops ?? null, at: Date.now() });
    cx.spawn(async (cx) => {
      let list;
      try {
        list = await hops(p[0], p[1], this.machines);
      } catch (e) {
        list = [{ on: p[0], far: p[1], why: String(e?.message ?? e) }];
      }
      this.routes.set(key, { asking: false, hops: list, at: Date.now() });
      const known = [...this.routes].filter(([, r]) => r.hops && !r.asking).sort((x, y) => y[1].at - x[1].at).slice(0, KEPT);
      setShared(ROUTES, Object.fromEntries(known.map(([k, r]) => [k, { hops: r.hops, at: r.at }])));
      this.guard();
      cx.notify();
    });
  }

  // The direct way for what is picked now, if there is one: see hopFor in copy.js. With
  // nothing picked it is the way a copy from the left side would take, so that the field
  // is there, and says whose password it wants, before any row is picked.
  hop(plan = this.plan()) {
    const p = this.pair();
    return p ? hopFor(this.routes.get(p.join("\n"))?.hops, (plan?.src ?? this.sides[0]).on) : null;
  }

  // A password typed for one machine is never left in the field for another.
  guard() {
    const far = this.hop()?.far ?? null;
    if (far === this.keyOf) return;
    this.keyOf = far;
    if (this.secret.value()) this.secret.set_value("");
  }

  // The window is closing: what it held of passwords goes with it. A copy still waiting at
  // a prompt can be typed into from its peek, in the window opened again.
  gone() {
    goneTransfer(this.overlay);
    this.hold = null;
    this.keys.clear();
    if (this.secret.value()) this.secret.set_value("");
  }

  // Reads a side's folder. `quiet`: once more, in place (something may have landed there).
  load(i, cx, quiet = false) {
    const s = this.sides[i];
    const seq = (s.seq += 1);
    if (!quiet) {
      s.loading = true;
      s.error = null;
    }
    cx.spawn(async (cx) => {
      let got = null, error = "";
      try {
        got = await listing(s.on, s.path);
      } catch (e) {
        error = String(e?.message ?? e);
      }
      if (s.seq !== seq) return;
      if (!got && s.lenient && s.path) {
        s.lenient = false;
        s.path = "";
        this.load(i, cx);
        return;
      }
      s.lenient = false;
      s.loading = false;
      if (got) {
        Object.assign(s, { path: got.path, home: got.home, entries: got.entries, more: got.more, error: null });
        for (const n of [...s.picked]) if (!got.entries.some((e) => e.name === n)) s.picked.delete(n);
        const was = shared(SIDE);
        if (i === 1 && (was?.on !== s.on || was?.path !== s.path)) setShared(SIDE, { on: s.on, path: s.path });
      } else if (!quiet) {
        s.entries = [];
        s.error = error;
      }
      cx.notify();
    });
  }

  go(i, on, path, cx) {
    const s = this.sides[i];
    Object.assign(s, { on, path, entries: [], more: false, anchor: null });
    s.picked.clear();
    this.hold = null;
    this.armed = 0;
    this.load(i, cx);
    this.guard();
    this.scout(cx);
    cx.notify();
  }

  // Picks one more row, or lets it go. What is picked is on one side: the other side takes it.
  pick(i, name, cx) {
    const s = this.sides[i], other = this.sides[1 - i];
    other.picked.clear();
    other.anchor = null;
    if (!s.picked.delete(name)) s.picked.add(name);
    s.anchor = name;
    this.armed = 0;
    this.guard();
    cx.notify();
  }

  // The rows of a side from one name to another, both included, in the order on show.
  span(s, a, b) {
    const i = s.entries.findIndex((e) => e.name === a), j = s.entries.findIndex((e) => e.name === b);
    if (j < 0) return [];
    if (i < 0) return [b];
    return s.entries.slice(Math.min(i, j), Math.max(i, j) + 1).map((e) => e.name);
  }

  // A press on a row. Plain: that row alone. With Shift: every row from the last one
  // clicked to this one, in place of what was picked (with Cmd too: added to it). With
  // Cmd, or Ctrl: this row too, or no longer.
  // A plain press may be the start of more, so the row is held until the button comes up:
  // see move() and up(). A row that was picked already is left as it is for now, so that
  // several picked rows can be carried by any one of them.
  press(i, name, ev, cx) {
    const s = this.sides[i], k = ev?.modifiers ?? {};
    const more = Boolean(k.platform || k.control);
    this.hold = null;
    if (k.shift && s.anchor !== null && s.anchor !== name && s.entries.some((e) => e.name === s.anchor)) {
      const other = this.sides[1 - i];
      other.picked.clear();
      other.anchor = null;
      if (!more) s.picked.clear();
      for (const n of this.span(s, s.anchor, name)) s.picked.add(n);
      this.armed = 0;
      this.guard();
      cx.notify();
    } else if (more) this.pick(i, name, cx);
    else {
      const was = s.picked.has(name);
      if (!was) {
        s.picked.clear();
        this.pick(i, name, cx);
      } else s.anchor = name;
      const at = ev?.position ?? { x: 0, y: 0 };
      this.hold = { side: i, name, was, x: at.x, y: at.y, kind: null, to: name, over: null, px: null, py: null, at: Date.now(), away: 0 };
    }
  }

  // A press on the empty part of a list lets go of what is picked there. Held and moved up
  // over the rows, it sweeps them from the last one.
  blank(i, ev, cx) {
    const s = this.sides[i], k = ev?.modifiers ?? {};
    this.hold = null;
    if (k.shift || k.platform || k.control) return;
    const at = ev?.position ?? { x: 0, y: 0 };
    this.hold = { side: i, name: null, was: false, x: at.x, y: at.y, kind: null, to: null, over: null, px: null, py: null, at: Date.now(), away: 0 };
    if (!s.picked.size) return;
    s.picked.clear();
    s.anchor = null;
    this.armed = 0;
    this.guard();
    cx.notify();
  }

  // The pointer moved: over a row (`name`, on side `i`), over a side, or anywhere in the
  // window (neither; `ev` is then the window's own event). A mod hears no more of a held
  // button than this, so every move is taken for one with the button down while a row is
  // held. Once the pointer is SLACK away from the press, the press becomes one of two
  // things. Up or down first: a sweep, which picks every row from the held one to the one
  // under the pointer. Sideways first, or from a row that was picked before the press: a
  // carry, which takes what is picked along, to be let go over the other side.
  // True when what is drawn has changed.
  move(i, name, ev) {
    const h = this.hold;
    if (!h) return false;
    const now = Date.now();
    if (now - h.at > HELD) {
      this.hold = null;
      return true;
    }
    h.at = now;
    h.away = 0;
    const p = ev?.position;
    let changed = false;
    if (!h.kind) {
      if (!p) return false;
      const dx = Math.abs(p.x - h.x), dy = Math.abs(p.y - h.y);
      if (Math.max(dx, dy) < SLACK) return false;
      h.kind = h.name === null || (!h.was && dy >= dx) ? "sweep" : "carry";
      changed = h.kind === "carry";
    }
    if (h.kind === "sweep") {
      if (i !== h.side || name === null || name === h.to) return changed;
      const s = this.sides[i];
      const from = h.name ?? s.entries[s.entries.length - 1]?.name ?? name;
      const rows = this.span(s, from, name);
      s.picked.clear();
      for (const n of rows) s.picked.add(n);
      s.anchor = from;
      h.to = name;
      this.armed = 0;
      this.guard();
      return true;
    }
    // Carried: which side the pointer is over, and where it is in the window.
    if (i !== null && h.over !== i) {
      h.over = i;
      changed = true;
    }
    if (i === null && name === null) {
      const at = ev?.local_position ?? (p && ev?.bounds ? { x: p.x - ev.bounds.x, y: p.y - ev.bounds.y } : null);
      if (at && (h.px === null || Math.abs(at.x - h.px) + Math.abs(at.y - h.py) >= 2)) {
        h.px = at.x;
        h.py = at.y;
        changed = true;
      }
    }
    return changed;
  }

  // The pointer left a side: what is carried is no longer over it.
  off(i) {
    if (this.hold?.over !== i) return false;
    this.hold.over = null;
    return true;
  }

  // The button came up, over a side (`i`) or elsewhere in the window (null). A carry let
  // go over the other side is the arrow pressed: the copy starts, or, with a picked name
  // already there, the arrow turns red and waits for a press of its own. A row that was
  // picked, pressed and let go in place, is then the only one picked, or, if it was the
  // only one, no longer picked.
  up(i, cx) {
    const h = this.hold;
    if (!h) return;
    this.hold = null;
    const s = this.sides[h.side];
    if (h.kind === "carry") {
      if (i === 1 - h.side) this.send(cx);
    } else if (!h.kind && h.was && i === h.side) {
      if (s.picked.size > 1) {
        s.picked.clear();
        s.picked.add(h.name);
      } else {
        s.picked.delete(h.name);
        s.anchor = null;
      }
      this.armed = 0;
      this.guard();
    }
    cx.notify();
  }

  // The pointer left the window with a row held. Out there the button can't be heard
  // coming up, so unless the pointer is back in a moment the hold is over, and nothing is
  // copied.
  out(cx) {
    const h = this.hold;
    if (!h) return;
    const mine = (this.leaves = (this.leaves ?? 0) + 1);
    h.away = mine;
    cx.timer.after(AWAY, (cx) => {
      if (this.hold !== h || h.away !== mine) return;
      this.hold = null;
      cx.notify();
    });
  }

  // What the arrow would do now: which side gives and which takes, whether it can, and
  // which of the picked names are already there.
  plan() {
    const from = this.sides.findIndex((s) => s.picked.size > 0);
    if (from < 0) return null;
    const src = this.sides[from], dst = this.sides[1 - from];
    const names = [...src.picked];
    const there = new Set(dst.entries.map((e) => e.name));
    const same = src.on === dst.on && src.path === dst.path;
    const ready = !same && !dst.loading && !dst.error;
    return { from, to: 1 - from, src, dst, names, same, ready, clash: ready ? names.filter((n) => there.has(n)) : [] };
  }

  send(cx) {
    const p = this.plan();
    if (!p?.ready) return;
    const now = Date.now();
    if (p.clash.length && now - this.armed >= ARM) {
      const press = (this.armed = now);
      cx.timer.after(ARM, (cx) => {
        if (this.armed !== press) return;
        this.armed = 0;
        cx.notify();
      });
      cx.notify();
      return;
    }
    this.armed = 0;
    const one = p.names.length === 1 && !p.src.entries.find((e) => e.name === p.names[0])?.dir;
    const job = { from: p.src.on, paths: p.names.map((n) => join(p.src.path, n)), to: p.dst.on, dir: p.dst.path };
    // With a password typed, directly to the other machine. The field is emptied at once.
    const hop = this.hop(p), secret = hop ? this.secret.value() : "";
    if (this.secret.value()) this.secret.set_value("");
    p.src.picked.clear();
    p.src.anchor = null;
    this.guard();
    this.start(job, one, cx, secret ? hop : null, secret);
    cx.notify();
  }

  start(job, one, cx, hop = null, secret = "") {
    cx.spawn(async (cx) => {
      try {
        const id = await startCopy(job, this.machines, one, hop);
        if (hop) {
          // Files that come from the far machine are a login each.
          this.keys.set(id, { secret, armed: true, left: hop.on === job.from ? 1 : job.paths.length });
          this.hurry(id, 0, cx);
        }
      } catch (e) {
        notify({ title: "The copy did not start", body: String(e?.message ?? e), level: "error" });
      }
      cx.notify();
    });
  }

  // A direct copy that just started is looked at often, until its first prompt has the password.
  hurry(id, n, cx) {
    const k = this.keys.get(id);
    if (!k || this.fed.has(id) || n >= LOOKS) return;
    this.watch(id, cx);
    cx.timer.after(SOON, (cx) => this.hurry(id, n + 1, cx));
  }

  // Looks at a copy's screen: how far it is, and whether it stands at a password prompt.
  // A prompt gets the password this window holds for that copy, once: it is not typed
  // again until the screen has moved on, and never after a login was refused, which ends
  // the copy instead.
  watch(id, cx) {
    cx.spawn(async (cx) => {
      let far;
      try {
        far = await meter(id);
      } catch {
        return;
      }
      const k = this.keys.get(id);
      if (k && far.denied) {
        this.keys.delete(id);
        endCopy(id).catch(() => {});
      } else if (k && !far.ask) k.armed = true;
      else if (k?.armed) {
        k.armed = false;
        k.left -= 1;
        if (k.left <= 0) this.keys.delete(id);
        this.fed.set(id, Date.now());
        feed(id, k.secret).catch(() => {});
      }
      // Asking, with nothing here to answer: the pill says so, and its peek takes the typing.
      const asking = far.ask && !this.keys.has(id) && Date.now() - (this.fed.get(id) ?? 0) > TYPED;
      const was = this.meters[id];
      if (far.line === was?.line && asking === Boolean(was?.asking)) return;
      this.meters[id] = { ...far, asking };
      cx.notify();
    });
  }

  // Files dropped on a side from outside the app (this computer's) go into its folder. A
  // drop is one gesture, with no second press to ask for, so it never replaces anything.
  drop(i, paths, cx) {
    const s = this.sides[i];
    if (!paths?.length || s.loading || s.error) return;
    const there = new Set(s.entries.map((e) => e.name));
    const clash = paths.map(base).filter((n) => there.has(n));
    if (clash.length) {
      notify({ title: `${clash[0]} is already there`, body: "Nothing was copied. Pick it on the other side to replace it.", level: "warning" });
      return;
    }
    this.start({ from: null, paths, to: s.on, dir: s.path }, false, cx);
  }

  // Every so often: a copy that started or ended may have changed a folder on show, and
  // the ones under way say how far they are.
  tick(cx) {
    const list = copies();
    const now = list.map((c) => c.id + (c.failed ? "!" : "")).join(" ");
    if (this.seen !== null && now !== this.seen) this.sides.forEach((s, i) => { if (!s.loading) this.load(i, cx, true); });
    this.seen = now;
    const live = (id) => list.some((c) => c.id === id && !c.failed);
    for (const id of Object.keys(this.meters)) if (!live(id)) delete this.meters[id];
    // A copy that ended takes its password with it.
    for (const id of [...this.keys.keys()]) if (!live(id)) this.keys.delete(id);
    for (const id of [...this.fed.keys()]) if (!live(id)) this.fed.delete(id);
    for (const c of list) if (!c.failed) this.watch(c.id, cx);
    this.scout(cx);
  }

  render() {
    const t = theme();
    const p = props() ?? {};
    const m = model(this.machines.filter((k) => !k.temporary));
    const red = danger(t);
    const plan = this.plan();
    const armed = Boolean(plan?.clash.length) && Date.now() - this.armed < ARM;
    // Two other machines on show: what is known of the direct way between them, the one
    // the picked rows would take, and whether a password is typed for it.
    const two = this.pair();
    const route = two ? this.routes.get(two.join("\n")) : null;
    const hop = this.hop(plan);
    const typed = Boolean(hop) && this.secret.value().length > 0;
    // Rows being carried to the other side, and where the pointer has them.
    const held = this.hold;
    const carry = held?.kind === "carry" && plan?.from === held.side ? held : null;
    // A press on a control is its own: it does not move the window, and ends any hold.
    const mine = (_e, cx) => {
      this.hold = null;
      cx.stop_propagation();
    };

    // A machine among the others: the one a side shows is raised.
    const chip = (i, g) => {
      const on = this.sides[i].on === g.name;
      const there = g.state === "connected", login = g.state === "needs_login";
      return h_flex().id(`m${i}-${g.name ?? "local"}`).h(24).flex_none().pl(7).pr(9).gap(5).items_center().rounded(12)
        .text_color(on ? t.foreground : login ? t.blocked : t.muted)
        .when(on, (el) => el.bg(t.raised))
        .when(!on && there, (el) => el.cursor_pointer().hover((x) => x.bg(t.hover).text_color(t.foreground)))
        .when(!there, (el) => el.opacity(0.5).tooltip(login ? `${g.name} needs a login: run hc machine login ${g.name}` : `${g.name}: ${(g.why ?? g.state).replace(/_/g, " ")}`))
        .on_mouse_down("left", mine)
        .on_click((_e, cx) => { if (there && !on) this.go(i, g.name, "", cx); })
        .child(svg(ICON(g.name === null ? "laptop" : "server")).size(13).flex_none())
        .child(div().max_w(130).truncate().text_size(12).font_family(DISPLAY).font_semibold().child(nameOf(g.name)));
    };

    // Places to jump to on a side's machine: home, the root, and each project there.
    const places = (i) => {
      const s = this.sides[i];
      const spot = (id, path, o) => tile(t, {
        id: `p${i}-${id}`, size: 22, ...o, active: Boolean(s.home) && s.path === (path || s.home),
        onClick: (_e, cx) => this.go(i, s.on, path, cx),
      });
      // A project at home is drawn as a house, which the first tile already is.
      const mineOf = (m.groups.find((g) => g.name === s.on)?.spaces ?? []).filter((sp) => sp.name !== "~");
      return h_flex().flex_none().h(24).min_w(0).gap(5).items_center().overflow_x_hidden()
        .child(spot("home", "", { name: "~", tip: "Home" }))
        .child(spot("root", "/", { name: "/", sign: "/", tip: "The top folder, /" }))
        .children(mineOf.map((sp) => {
          const at = placeOf(sp);
          return spot(sp.id, at, { name: sp.name, hue: sp.hue, tip: `${sp.label}, ${tilde(at) || "~"}` });
        }));
    };

    // The way down to the folder on show: from home when it is under home, else from the top.
    const crumbs = (i) => {
      const s = this.sides[i];
      const home = s.home.length > 1 ? s.home.replace(/\/+$/, "") : "";
      const under = Boolean(home) && (s.path === home || s.path.startsWith(home + "/"));
      const from = under ? home : "";
      const rest = (s.path || "").slice(from.length).split("/").filter(Boolean);
      const top = under || !s.path ? { home: true, label: "~", path: "" } : { label: "/", path: "/" };
      const all = [top, ...rest.map((seg, k) => ({ label: seg, path: `${from}/${rest.slice(0, k + 1).join("/")}` }))];
      // A long way shows its end: the dots stand for the rest, and lead back to it.
      const shown = all.length > 4 ? [{ ...all[all.length - 4], label: "…" }, ...all.slice(-3)] : all;
      return h_flex().flex_none().h(22).min_w(0).gap(1).items_center().text_size(12)
        .children(shown.flatMap((c, k) => {
          const last = k === shown.length - 1;
          const part = h_flex().id(`c${i}-${k}`).flex_shrink(last ? 1 : 0).min_w(0).h(20).px(4).items_center().rounded(5).cursor_pointer()
            .text_color(last ? t.foreground : t.muted)
            .hover((x) => x.bg(t.hover).text_color(t.foreground))
            .tooltip(last ? "Read this folder again" : c.home ? "Home" : tilde(c.path))
            .on_mouse_down("left", mine)
            .on_click((_e, cx) => (last ? this.load(i, cx) : this.go(i, s.on, c.path, cx)))
            // Home is a house here too, as on its tile.
            .child(c.home ? svg(ICON("home")).size(12).flex_none() : div().min_w(0).truncate().line_height("20px").child(c.label));
          return k ? [svg(ICON("chevron-right")).size(9).flex_none().text_color(t.dim), part] : [part];
        }));
    };

    const list = (i) => {
      const s = this.sides[i];
      // With something picked on the other side, this is where it would land.
      const taking = plan?.to === i && plan.ready ? plan : null;
      const hits = new Set(taking?.clash);
      const landing = taking ? taking.names.filter((n) => !hits.has(n)) : [];
      // Carried rows are over this side: let go here, they land.
      const aimed = Boolean(taking) && carry?.over === i;
      const isDir = (n) => Boolean(taking.src.entries.find((e) => e.name === n)?.dir);
      const ghost = (icon, label) => h_flex().h(26).flex_none().pl(6).pr(7).gap(7).items_center().rounded(7)
        .border_1().border_dashed().border_color(t.input).text_color(t.dim)
        .child(svg(ICON(icon)).size(14).flex_none())
        .child(div().flex_1().min_w(0).truncate().text_size(12.5).child(label));
      const row = (e) => {
        const on = s.picked.has(e.name);
        // A picked name that is already here: this is what the copy would replace.
        const hit = hits.has(e.name);
        const open = (_e, cx) => this.go(i, s.on, join(s.path, e.name), cx);
        return h_flex().id(`e${i}-${e.name}`).h(26).flex_none().pl(hit ? 6 : 7).pr(hit ? 2 : 3).gap(7).items_center().rounded(7).cursor_pointer()
          .when(on, (el) => el.bg(alpha(t.accent, "33")))
          .when(hit && !armed, (el) => el.border_1().border_dashed().border_color(t.muted))
          .when(hit && armed, (el) => el.border_1().border_color(alpha(red, "00")).bg(alpha(red, "33")))
          .when(!on && !hit && !held, (el) => el.hover((x) => x.bg(t.hover)))
          // The rows being carried stay in their place, faint.
          .when(on && Boolean(carry), (el) => el.opacity(0.5).cursor_grabbing())
          .on_mouse_down("left", (ev, cx) => {
            cx.stop_propagation();
            if (ev.click_count === 2) {
              this.hold = null;
              if (e.dir) open(ev, cx);
            } else this.press(i, e.name, ev, cx);
          })
          .on_mouse_move((ev, cx) => { if (this.move(i, e.name, ev)) cx.notify(); })
          .child(svg(ICON(e.dir ? "folder" : "file")).size(14).flex_none().text_color(hit && armed ? red : e.dir ? t.muted : t.dim))
          .child(div().flex_1().min_w(0).truncate().text_size(12.5)
            .text_color(hit && armed ? red : on || !e.name.startsWith(".") ? t.foreground : t.dim).child(e.name))
          .when(e.size !== null, (el) => el.child(div().flex_none().pr(5).text_size(11).text_color(t.dim).child(bytes(e.size))))
          .when(e.dir, (el) => el.child(div().id(`in${i}-${e.name}`).flex_none().size(20).rounded(6).flex().items_center().justify_center()
            .text_color(t.dim).hover((x) => x.bg(t.input).text_color(t.foreground))
            .tooltip("Open").on_mouse_down("left", mine).on_click(open)
            .child(svg(ICON("chevron-right")).size(10))));
      };
      const note = (ink, words) => div().flex_none().p(8).text_size(12).text_color(ink).child(words);
      return v_flex().id(`list${i}`).flex_1().min_h(0).p(4).gap(1).rounded(10).border_1()
        .bg(aimed ? mix(t.background, armed ? red : t.accent, 0.1) : t.background)
        .border_color(taking ? alpha(armed ? red : t.accent, aimed ? "ff" : "99") : t.border)
        .overflow_y_scrollbar()
        // The button coming up over the rows is heard here too, as Herdr's own lists hear it.
        .on_mouse_up("left", (_e, cx) => this.up(i, cx))
        .children(landing.slice(0, GHOSTS).map((n) => ghost(isDir(n) ? "folder" : "file", n)))
        .when(landing.length > GHOSTS, (el) => el.child(ghost("plus", String(landing.length - GHOSTS))))
        .children(s.entries.map(row))
        .when(s.loading && !s.entries.length, (el) => el.child(h_flex().flex_none().h(40).justify_center()
          .child(svg(ICON("ring")).size(16).flex_none().text_color(t.working).spin(1300))))
        .when(Boolean(s.error), (el) => el.child(note(t.blocked, s.error)))
        .when(s.more, (el) => el.child(note(t.dim, `The first ${s.entries.length} are shown`)))
        .when(!s.loading && !s.error && !s.entries.length && !landing.length, (el) => el.child(note(t.dim, "Empty")))
        // The empty part under the rows: a press there lets go of what is picked.
        .child(div().id(`blank${i}`).flex_1().min_h(0).on_mouse_down("left", (ev, cx) => {
          cx.stop_propagation();
          this.blank(i, ev, cx);
        }));
    };

    const side = (i) => v_flex().id(`side${i}`).flex_1().min_w(0).h_full().gap(6)
      .on_drop((e, cx) => this.drop(i, e.paths, cx))
      // A held row: where the pointer is with it, and where the button comes up.
      .on_mouse_move((ev, cx) => { if (this.move(i, null, ev)) cx.notify(); })
      .on_hover((hovered, cx) => { if (!hovered && this.off(i)) cx.notify(); })
      .on_mouse_up("left", (_e, cx) => this.up(i, cx))
      .child(h_flex().flex_none().flex_wrap().gap(3).children(m.groups.map((g) => chip(i, g))))
      .child(places(i))
      .child(crumbs(i))
      .child(list(i));

    // The arrow: dashed while nothing is picked, then pointing where the picked rows go.
    const many = (n) => `${n} item${n === 1 ? "" : "s"}`;
    const go = Boolean(plan?.ready);
    // The arrow has words only for a press that would not copy, or would replace. What it
    // would copy, and where to, is in the picked rows and the rows that would land.
    const tip = !plan ? null
      : plan.same ? "Both sides show the same folder"
      : !go ? "The other side can't be read yet"
      : armed ? `Again to replace ${many(plan.clash.length)}`
      : null;
    const arrow = div().id("send").flex_none().size(38).rounded_full().flex().items_center().justify_center()
      .when(!plan, (el) => el.border_1().border_dashed().border_color(t.input).text_color(t.dim))
      .when(Boolean(plan) && !go, (el) => el.bg(t.raised).text_color(t.dim))
      .when(go && !armed, (el) => el.bg(t.accent).text_color(INK).cursor_pointer().hover((x) => x.opacity(0.88)))
      .when(go && armed, (el) => el.bg(red).text_color(INK).cursor_pointer().loop("opacity", { from: 0.6, to: 1, period: 700 }))
      .when(Boolean(tip), (el) => el.tooltip(tip))
      .on_mouse_down("left", mine)
      .on_click((_e, cx) => this.send(cx))
      .child(svg(ICON(!plan ? "transfer" : plan.from === 0 ? "arrow-right" : "arrow-left")).size(plan ? 18 : 16));
    // How many rows are picked, when more than one: some may be out of sight.
    const count = plan && plan.names.length > 1 ? plan.names.length : 0;
    // Between two other machines, which way the copy would go: a bolt for a direct copy
    // (a password is typed), this computer's laptop for through here.
    const via = two && go ? (typed ? "bolt" : "laptop") : null;
    const middle = div().relative().flex_none()
      .child(arrow)
      .when(Boolean(via), (el) => el.child(h_flex().id("send-way").absolute().bottom(-7).right(-7).size(16).justify_center().items_center().rounded_full()
        .bg(t.chrome).border_1().border_color(armed ? red : typed ? t.accent : t.input).text_color(armed ? red : typed ? t.accent : t.muted)
        .tooltip(typed ? `Direct copy from ${plan.src.on} to ${plan.dst.on}` : "Through this computer")
        .child(svg(ICON(via)).size(10).flex_none())))
      .when(count > 0, (el) => el.child(h_flex().id("send-count").absolute().top(-7).right(-7).h(16).min_w(16).px(4).justify_center().items_center().rounded_full()
        .bg(t.chrome).border_1().border_color(armed ? red : t.accent).text_color(armed ? red : t.accent)
        .text_size(10).font_family(DISPLAY).font_bold().child(String(count))));

    // What is carried, drawn last so that it is on top: the first picked name and how many
    // more, a little off the pointer.
    const lifted = () => {
      const zoom = settings()?.zoom || 1;
      const first = plan.names[0];
      const dir = Boolean(plan.src.entries.find((e) => e.name === first)?.dir);
      const ink = aimedAt && armed ? red : t.accent;
      return h_flex().id("carried").absolute().left(carry.px / zoom + 12).top(carry.py / zoom + 14).h(26).pl(7).pr(9).gap(6).items_center().rounded(8)
        .bg(mix(t.chrome, ink, 0.3)).border_1().border_color(alpha(ink, "b3")).shadow_md()
        .child(svg(ICON(dir ? "folder" : "file")).size(14).flex_none())
        .child(div().max_w(180).truncate().text_size(12.5).child(first))
        .when(plan.names.length > 1, (el) => el.child(div().flex_none().text_size(11.5).font_family(DISPLAY).font_bold().text_color(ink).child(`+${plan.names.length - 1}`)));
    };

    // A direct copy between the two machines on show. A turning ring while it is being asked
    // about; then a bolt, faint when neither can log in to the other. When one can: the
    // machine whose password a copy takes, and the field for it.
    const direct = () => {
      const able = Boolean(route?.hops?.some((h) => h.ok));
      // Which of the two logs in to the other for this copy, and what the field is for.
      const tip = !route?.hops ? "Checking if direct copy is available"
        : !able ? says("No direct copy", ...route.hops.map((h) => `${h.on} → ${h.far}: ${h.why}`))
        : says(`${hop.on} logs in to ${hop.far}`, `Enter ${hop.user}@${hop.far}'s password to enable direct copy`);
      return h_flex().id("direct").flex_none().h(26).gap(6).items_center()
        .child(h_flex().id("direct-way").flex_none().h(24).px(4).gap(5).items_center().rounded(7).tooltip(tip)
          .text_color(typed ? t.accent : t.muted)
          .when(Boolean(route?.hops) && !able, (el) => el.opacity(0.45))
          .child(route?.hops ? svg(ICON("bolt")).size(14).flex_none() : svg(ICON("ring")).size(13).flex_none().text_color(t.working).spin(1300))
          .when(Boolean(hop), (el) => el
            .child(svg(ICON("server")).size(12).flex_none().text_color(t.dim))
            // Whose password: the user scp logs in as, and the machine it logs in to.
            .child(h_flex().id("direct-who").flex_none().items_center().text_size(12).font_family(DISPLAY).font_semibold()
              .child(div().max_w(100).truncate().text_color(t.muted).child(hop.user))
              .child(div().flex_none().text_color(t.dim).child("@"))
              .child(div().max_w(110).truncate().text_color(t.foreground).child(hop.far)))))
        .when(Boolean(hop), (el) => el.child(h_flex().id("direct-key").flex_none().w(150).h(24).px(7).items_center().rounded(7).bg(t.background)
          .border_1().border_color(typed ? t.accent : t.border)
          // A press anywhere in the box gives the field the keyboard: the window has none
          // until it is asked for.
          .on_mouse_down("left", (ev, cx) => {
            mine(ev, cx);
            this.secret.focus();
          })
          .child(Input.new(this.secret).flex_1().h_full().text_size(12).text_color(t.foreground))));
    };

    // A copy under way, or one that failed.
    const pill = (c) => {
      const far = this.meters[c.id];
      // At a password prompt, with nothing in this window to answer it.
      const asking = !c.failed && Boolean(far?.asking);
      const about = `${what(c)}: ${wayOf(c)}, into ${tilde(c.dir)}`;
      return h_flex().id(`copy-${c.id}`).h(26).flex_none().pl(1).pr(9).gap(5).items_center().rounded(13).cursor_pointer()
        .hover((x) => x.bg(t.hover))
        .tooltip(c.failed ? says(about, c.failed, "Click to dismiss")
          : asking ? says(about, `Click to type ${c.direct ? `${c.direct}'s` : "its"} password`)
          : says(about, far?.line))
        .on_mouse_down("left", mine)
        .on_click((_e, cx) => {
          if (c.failed) {
            dropCopy(c.id);
            cx.notify();
          } else run("terminal.peek", { terminal: c.id });
        })
        .child(orb(t, { size: 16, program: c.direct ? BOLT : through(c) ? HERE : ARROW, status: c.failed || asking ? "blocked" : "working" }))
        .child(div().max_w(150).truncate().text_size(12).text_color(c.failed || asking ? t.blocked : t.foreground).child(what(c)))
        .child(svg(ICON(c.to === null ? "laptop" : "server")).size(12).flex_none().text_color(t.dim))
        .child(div().max_w(90).truncate().text_size(11.5).text_color(t.dim).child(nameOf(c.to)))
        .when(Boolean(c.one) && !c.failed && far?.pct != null, (el) => el.child(div().flex_none().text_size(11.5).font_family(DISPLAY).font_semibold().text_color(t.working).child(`${far?.pct}%`)))
        // scp's own speed, for any copy. Its time left is the file's it is on, so it is
        // shown for a single file only, like the percent.
        .when(!c.failed && Boolean(far?.speed), (el) => el.child(div().id(`speed-${c.id}`).flex_none().text_size(11.5).text_color(t.muted).child(far.speed)))
        .when(!c.failed && Boolean(far?.stalled), (el) => el.child(div().flex_none().text_size(11.5).text_color(t.blocked).child("stalled")))
        .when(Boolean(c.one) && !c.failed && !far?.stalled && Boolean(far?.eta), (el) => el.child(div().flex_none().text_size(11.5).text_color(t.muted).child(`${far?.eta} left`)));
    };

    const aimedAt = Boolean(carry) && plan.ready && carry.over === plan.to;
    return v_flex().id("transfer").track_focus(this.handle).relative().size_full().min_h(0).bg(t.chrome).text_color(t.foreground)
      // The window holds the keyboard: Esc closes it, and no key reaches the terminal behind.
      .on_key_down((e, cx) => {
        if (e.key === "escape") closeOverlay(p.overlay);
      })
      // A held row: where the pointer has it, and a button that comes up beside the sides.
      // See out() for a pointer that leaves the window.
      .on_mouse_move((ev, cx) => { if (this.move(null, null, ev)) cx.notify(); })
      .on_mouse_up("left", (_e, cx) => this.up(null, cx))
      .on_hover((hovered, cx) => {
        if (!hovered) this.out(cx);
        else if (this.hold) this.hold.away = 0;
      })
      .when(Boolean(carry), (el) => el.cursor_grabbing())
      // The head: the window is dragged by it, or by any other spot that is not a control.
      .child(h_flex().flex_none().h(40).pl(14).pr(7).gap(8).items_center()
        .child(svg(ICON("transfer")).size(15).flex_none().text_color(t.dim))
        .child(h_flex().id("copies").flex_1().min_w(0).h_full().gap(2).items_center().overflow_x_hidden().children(copies().map(pill)))
        .when(Boolean(two), (el) => el.child(direct()))
        .child(iconButton(t, { id: "transfer-close", icon: "x", tip: "Close", glyph: 13, onClick: () => closeOverlay(p.overlay) })))
      .child(h_flex().flex_1().min_h(0).px(12).pb(12).gap(8)
        .child(side(0))
        .child(middle)
        .child(side(1)))
      .when(Boolean(carry) && carry.px !== null, (el) => el.child(lifted()));
  }
}
