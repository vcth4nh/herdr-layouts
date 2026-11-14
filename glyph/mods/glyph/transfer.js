// The transfer window: files from one machine to another, without typing scp.
// Two sides, each a machine and a folder on it. On top of a side: its machine among the
// others, then places to jump to (home, the root, each project there as its tile), then
// the way down to the folder on show: click a part of it to go back up, the last part to
// read the folder again. Click a row to pick it, more rows for more; a folder opens by its
// chevron or a double-click. With something picked, the arrow in the middle points at the
// other side, where dashed rows show what would land. A press on the arrow starts the copy.
// When a picked name is already there, the first press only turns the arrow red, and a
// second one, in time, replaces. Files dropped on a side from outside the app are copied
// into its folder.
// Copies under way sit in the window's head: a turning ring, what, and where to. Click one
// to peek at scp's own meter. One that failed stays there in peach: hover for why, click to
// dismiss. copy.js does the copying, and the bar says how each copy ended.
// With two other machines on show, a copy passes through this computer, unless you give it
// a password. The window asks whether one of the two gets to the other (hops in copy.js).
// If so, once rows are picked, a field in the head asks for that machine's password. With
// one typed, the copy is started on one of the two and goes straight to the other: the
// window types the password into scp's prompt there, and keeps it only until that is done.
// Opened as a window with props { role: "transfer" }. The left side opens where you are,
// the right where it was left.

import { div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { theme, props, run, shared, setShared, notify, closeOverlay } from "herdr";
import { model, fleet, tilde, placeOf, ARM } from "./data.js";
import { copies, listing, startCopy, dropCopy, meter, bytes, what, base, join, nameOf, hops, hopFor, feed, endCopy } from "./copy.js";
import { ICON, INK, DISPLAY, alpha, danger, orb, tile, iconButton } from "./ui.js";

// Where the right side was left: { on, path }.
const SIDE = "glyph.side";
// What a copy wears in its orb, where a tab wears its program's logo.
const ARROW = { icon: ICON("arrow-right"), tint: true };
// A copy that goes straight from one machine to the other wears a bolt.
const BOLT = { icon: ICON("bolt"), tint: true };
// The most dashed rows a side shows for what would land; the rest are a count.
const GHOSTS = 4;
// ms an answer to "do these two reach each other" is kept.
const FRESH = 300000;
// ms a prompt that was just typed into may still be the last thing on its screen.
const TYPED = 5000;
// How often, and how many times, a straight copy that just started is looked at for its prompt.
const SOON = 500, LOOKS = 60;

const mine = (_e, cx) => cx.stop_propagation();

export class Transfer {
  constructor(cx) {
    this.machines = []; // fleet(): every machine's state and how ssh reaches it
    this.armed = 0;     // when the arrow was pressed once, over names that are already there
    this.meters = {};   // copy id -> how far scp says it is
    this.seen = null;   // the copies there were at the last tick
    this.routes = new Map(); // "a\nb" (two other machines, by name) -> { asking, hops, at }: see scout()
    // The password of a straight copy under way, for scp's prompts: copy id -> { secret,
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
      // A folder that is gone by now (the one remembered) gives way to home, once.
      lenient: true,
    }));
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

  // Asks, once in a while, whether the two machines on show get to each other.
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
      this.guard();
      cx.notify();
    });
  }

  // The straight way for what is picked now, if there is one: see hopFor in copy.js.
  hop(plan = this.plan()) {
    const p = this.pair();
    return plan && p ? hopFor(this.routes.get(p.join("\n"))?.hops, plan.src.on) : null;
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
    Object.assign(s, { on, path, entries: [], more: false });
    s.picked.clear();
    this.armed = 0;
    this.load(i, cx);
    this.guard();
    this.scout(cx);
    cx.notify();
  }

  // Picks a row, or lets it go. What is picked is on one side: the other side takes it.
  pick(i, name, cx) {
    const s = this.sides[i];
    this.sides[1 - i].picked.clear();
    if (!s.picked.delete(name)) s.picked.add(name);
    this.armed = 0;
    this.guard();
    cx.notify();
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
    // With a password typed, straight to the other machine. The field is emptied at once.
    const hop = this.hop(p), secret = hop ? this.secret.value() : "";
    if (this.secret.value()) this.secret.set_value("");
    p.src.picked.clear();
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

  // A straight copy that just started is looked at often, until its first prompt has the password.
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
    // Two other machines on show: what is known of the straight way between them, the one
    // the picked rows would take, and whether a password is typed for it.
    const two = this.pair();
    const route = two ? this.routes.get(two.join("\n")) : null;
    const hop = this.hop(plan);
    const typed = Boolean(hop) && this.secret.value().length > 0;

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
          return spot(sp.id, at, { name: sp.name, hue: sp.hue, tip: `${sp.label}  ·  ${tilde(at) || "~"}` });
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
      const landing = taking ? taking.names.filter((n) => !taking.clash.includes(n)) : [];
      const isDir = (n) => Boolean(taking.src.entries.find((e) => e.name === n)?.dir);
      const ghost = (icon, label) => h_flex().h(26).flex_none().pl(6).pr(7).gap(7).items_center().rounded(7)
        .border_1().border_dashed().border_color(t.input).text_color(t.dim)
        .child(svg(ICON(icon)).size(14).flex_none())
        .child(div().flex_1().min_w(0).truncate().text_size(12.5).child(label));
      const row = (e) => {
        const on = s.picked.has(e.name);
        // A picked name that is already here: this is what the copy would replace.
        const hit = Boolean(taking) && taking.clash.includes(e.name);
        const open = (_e, cx) => this.go(i, s.on, join(s.path, e.name), cx);
        return h_flex().id(`e${i}-${e.name}`).h(26).flex_none().pl(hit ? 6 : 7).pr(hit ? 2 : 3).gap(7).items_center().rounded(7).cursor_pointer()
          .when(on, (el) => el.bg(alpha(t.accent, "33")))
          .when(hit && !armed, (el) => el.border_1().border_dashed().border_color(t.muted))
          .when(hit && armed, (el) => el.border_1().border_color(alpha(red, "00")).bg(alpha(red, "33")))
          .when(!on && !hit, (el) => el.hover((x) => x.bg(t.hover)))
          .on_mouse_down("left", (ev, cx) => {
            cx.stop_propagation();
            if (ev.click_count === 2) {
              if (e.dir) open(ev, cx);
            } else this.pick(i, e.name, cx);
          })
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
      return v_flex().id(`list${i}`).flex_1().min_h(0).p(4).gap(1).rounded(10).bg(t.background).border_1()
        .border_color(taking ? alpha(armed ? red : t.accent, "99") : t.border)
        .overflow_y_scrollbar()
        .children(landing.slice(0, GHOSTS).map((n) => ghost(isDir(n) ? "folder" : "file", n)))
        .when(landing.length > GHOSTS, (el) => el.child(ghost("plus", String(landing.length - GHOSTS))))
        .children(s.entries.map(row))
        .when(s.loading && !s.entries.length, (el) => el.child(h_flex().flex_none().h(40).justify_center()
          .child(svg(ICON("ring")).size(16).flex_none().text_color(t.working).spin(1300))))
        .when(Boolean(s.error), (el) => el.child(note(t.blocked, s.error)))
        .when(s.more, (el) => el.child(note(t.dim, `The first ${s.entries.length} are shown`)))
        .when(!s.loading && !s.error && !s.entries.length && !landing.length, (el) => el.child(note(t.dim, "Empty")));
    };

    const side = (i) => v_flex().id(`side${i}`).flex_1().min_w(0).h_full().gap(6)
      .on_drop((e, cx) => this.drop(i, e.paths, cx))
      .child(h_flex().flex_none().flex_wrap().gap(3).children(m.groups.map((g) => chip(i, g))))
      .child(places(i))
      .child(crumbs(i))
      .child(list(i));

    // The arrow: dashed while nothing is picked, then pointing where the picked rows go.
    const where = (s) => `${nameOf(s.on)}  ·  ${tilde(s.path) || "/"}`;
    const many = (n) => `${n} item${n === 1 ? "" : "s"}`;
    const go = Boolean(plan?.ready);
    const tip = !plan ? "Pick files on one side to copy them to the other"
      : plan.same ? "Both sides show the same folder"
      : !go ? "The other side can't be read yet"
      : armed ? `Again to replace ${many(plan.clash.length)}`
      : [`Copy ${plan.names.length === 1 ? plan.names[0] : many(plan.names.length)} to ${where(plan.dst)}`,
        plan.clash.length ? `${many(plan.clash.length)} already there: two presses replace` : "",
        !two ? "" : typed ? `straight from ${plan.src.on}, with ${hop.far}'s password` : "through this computer"].filter(Boolean).join("  ·  ");
    const arrow = div().id("send").flex_none().size(38).rounded_full().flex().items_center().justify_center()
      .when(!plan, (el) => el.border_1().border_dashed().border_color(t.input).text_color(t.dim))
      .when(Boolean(plan) && !go, (el) => el.bg(t.raised).text_color(t.dim))
      .when(go && !armed, (el) => el.bg(t.accent).text_color(INK).cursor_pointer().hover((x) => x.opacity(0.88)))
      .when(go && armed, (el) => el.bg(red).text_color(INK).cursor_pointer().loop("opacity", { from: 0.6, to: 1, period: 700 }))
      .tooltip(tip)
      .on_mouse_down("left", mine)
      .on_click((_e, cx) => this.send(cx))
      .child(svg(ICON(!plan ? "transfer" : plan.from === 0 ? "arrow-right" : "arrow-left")).size(plan ? 18 : 16));

    // Straight between the two machines on show. A turning ring while it is being asked
    // about; then a bolt, faint when neither gets to the other. With rows picked and a way
    // for them: the machine whose password it takes, and the field for it.
    const direct = () => {
      const [a, b] = two;
      const able = Boolean(route?.hops?.some((h) => h.ok));
      const tip = !route?.hops ? `Asking whether ${a} and ${b} get to each other`
        : !able ? [`Copies between ${a} and ${b} pass through this computer`, ...route.hops.map((h) => `${h.on} to ${h.far}: ${h.why}`)].join("  ·  ")
        : !hop ? `${a} and ${b} get to each other: pick files, then type a password here to copy them straight across`
        : [`With ${hop.user}'s password on ${hop.far}, the copy goes straight from ${plan.src.on} to ${plan.dst.on}`,
          `scp is started on ${hop.on} and is given it at its prompt`, "it is kept nowhere", "left empty, the copy passes through this computer"].join("  ·  ");
      return h_flex().id("direct").flex_none().h(26).gap(6).items_center()
        .child(h_flex().id("direct-way").flex_none().h(24).px(4).gap(5).items_center().rounded(7).tooltip(tip)
          .text_color(typed ? t.accent : t.muted)
          .when(Boolean(route?.hops) && !able, (el) => el.opacity(0.45))
          .child(route?.hops ? svg(ICON("bolt")).size(14).flex_none() : svg(ICON("ring")).size(13).flex_none().text_color(t.working).spin(1300))
          .when(Boolean(hop), (el) => el
            .child(svg(ICON("server")).size(12).flex_none().text_color(t.dim))
            .child(div().max_w(110).truncate().text_size(12).font_family(DISPLAY).font_semibold().text_color(t.foreground).child(hop.far))))
        .when(Boolean(hop), (el) => el.child(h_flex().id("direct-key").flex_none().w(150).h(24).px(7).items_center().rounded(7).bg(t.background)
          .border_1().border_color(typed ? t.accent : t.border)
          .on_mouse_down("left", mine)
          .child(Input.new(this.secret).flex_1().h_full().text_size(12).text_color(t.foreground))));
    };

    // A copy under way, or one that failed.
    const pill = (c) => {
      const far = this.meters[c.id];
      // At a password prompt, with nothing in this window to answer it.
      const asking = !c.failed && Boolean(far?.asking);
      const route = `${nameOf(c.from)} → ${nameOf(c.to)}${c.direct ? ", direct" : ""}  ·  ${tilde(c.dir)}`;
      return h_flex().id(`copy-${c.id}`).h(26).flex_none().pl(1).pr(9).gap(5).items_center().rounded(13).cursor_pointer()
        .hover((x) => x.bg(t.hover))
        .tooltip(c.failed ? [what(c), route, c.failed, "click to dismiss"].join("  ·  ")
          : asking ? [what(c), route, `it is asking for ${c.direct ?? "a"}${c.direct ? "'s" : ""} password: click to type it`].join("  ·  ")
          : [what(c), route, far?.line].filter(Boolean).join("  ·  "))
        .on_mouse_down("left", mine)
        .on_click((_e, cx) => {
          if (c.failed) {
            dropCopy(c.id);
            cx.notify();
          } else run("terminal.peek", { terminal: c.id });
        })
        .child(orb(t, { size: 16, program: c.direct ? BOLT : ARROW, status: c.failed || asking ? "blocked" : "working" }))
        .child(div().max_w(150).truncate().text_size(12).text_color(c.failed || asking ? t.blocked : t.foreground).child(what(c)))
        .child(svg(ICON(c.to === null ? "laptop" : "server")).size(12).flex_none().text_color(t.dim))
        .child(div().max_w(90).truncate().text_size(11.5).text_color(t.dim).child(nameOf(c.to)))
        .when(Boolean(c.one) && !c.failed && far?.pct != null, (el) => el.child(div().flex_none().text_size(11.5).font_family(DISPLAY).font_semibold().text_color(t.working).child(`${far?.pct}%`)));
    };

    return v_flex().id("transfer").size_full().min_h(0).bg(t.chrome).text_color(t.foreground)
      // The head: the window is dragged by it, or by any other spot that is not a control.
      .child(h_flex().flex_none().h(40).pl(14).pr(7).gap(8).items_center()
        .child(svg(ICON("transfer")).size(15).flex_none().text_color(t.dim))
        .child(h_flex().id("copies").flex_1().min_w(0).h_full().gap(2).items_center().overflow_x_hidden().children(copies().map(pill)))
        .when(Boolean(two), (el) => el.child(direct()))
        .child(iconButton(t, { id: "transfer-close", icon: "x", tip: "Close", glyph: 13, onClick: () => closeOverlay(p.overlay) })))
      .child(h_flex().flex_1().min_h(0).px(12).pb(12).gap(8)
        .child(side(0))
        .child(arrow)
        .child(side(1)));
  }
}
