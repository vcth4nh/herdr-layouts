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
// Opened as a window with props { role: "transfer" }. The left side opens where you are,
// the right where it was left.

import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, props, run, shared, setShared, notify, closeOverlay } from "herdr";
import { model, fleet, tilde, placeOf, ARM } from "./data.js";
import { copies, listing, startCopy, dropCopy, meter, bytes, what, base, join, nameOf } from "./copy.js";
import { ICON, INK, DISPLAY, alpha, danger, orb, tile, iconButton } from "./ui.js";

// Where the right side was left: { on, path }.
const SIDE = "glyph.side";
// What a copy wears in its orb, where a tab wears its program's logo.
const ARROW = { icon: ICON("arrow-right"), tint: true };
// The most dashed rows a side shows for what would land; the rest are a count.
const GHOSTS = 4;

const mine = (_e, cx) => cx.stop_propagation();

export class Transfer {
  constructor(cx) {
    this.machines = []; // fleet(): every machine's state and how ssh reaches it
    this.armed = 0;     // when the arrow was pressed once, over names that are already there
    this.meters = {};   // copy id -> how far scp says it is
    this.seen = null;   // the copies there were at the last tick
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
      cx.notify();
    });
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
    cx.notify();
  }

  // Picks a row, or lets it go. What is picked is on one side: the other side takes it.
  pick(i, name, cx) {
    const s = this.sides[i];
    this.sides[1 - i].picked.clear();
    if (!s.picked.delete(name)) s.picked.add(name);
    this.armed = 0;
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
    p.src.picked.clear();
    this.start(job, one, cx);
    cx.notify();
  }

  start(job, one, cx) {
    cx.spawn(async (cx) => {
      try {
        await startCopy(job, this.machines, one);
      } catch (e) {
        notify({ title: "The copy did not start", body: String(e?.message ?? e), level: "error" });
      }
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
    for (const id of Object.keys(this.meters)) if (!list.some((c) => c.id === id && !c.failed)) delete this.meters[id];
    for (const c of list) {
      if (c.failed) continue;
      cx.spawn(async (cx) => {
        try {
          const far = await meter(c.id);
          if (far.line === this.meters[c.id]?.line) return;
          this.meters[c.id] = far;
          cx.notify();
        } catch {}
      });
    }
  }

  render() {
    const t = theme();
    const p = props() ?? {};
    const m = model(this.machines.filter((k) => !k.temporary));
    const red = danger(t);
    const plan = this.plan();
    const armed = Boolean(plan?.clash.length) && Date.now() - this.armed < ARM;

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
        plan.clash.length ? `${many(plan.clash.length)} already there: two presses replace` : ""].filter(Boolean).join("  ·  ");
    const arrow = div().id("send").flex_none().size(38).rounded_full().flex().items_center().justify_center()
      .when(!plan, (el) => el.border_1().border_dashed().border_color(t.input).text_color(t.dim))
      .when(Boolean(plan) && !go, (el) => el.bg(t.raised).text_color(t.dim))
      .when(go && !armed, (el) => el.bg(t.accent).text_color(INK).cursor_pointer().hover((x) => x.opacity(0.88)))
      .when(go && armed, (el) => el.bg(red).text_color(INK).cursor_pointer().loop("opacity", { from: 0.6, to: 1, period: 700 }))
      .tooltip(tip)
      .on_mouse_down("left", mine)
      .on_click((_e, cx) => this.send(cx))
      .child(svg(ICON(!plan ? "transfer" : plan.from === 0 ? "arrow-right" : "arrow-left")).size(plan ? 18 : 16));

    // A copy under way, or one that failed.
    const pill = (c) => {
      const far = this.meters[c.id];
      const route = `${nameOf(c.from)} → ${nameOf(c.to)}  ·  ${tilde(c.dir)}`;
      return h_flex().id(`copy-${c.id}`).h(26).flex_none().pl(1).pr(9).gap(5).items_center().rounded(13).cursor_pointer()
        .hover((x) => x.bg(t.hover))
        .tooltip(c.failed ? [what(c), route, c.failed, "click to dismiss"].join("  ·  ") : [what(c), route, far?.line].filter(Boolean).join("  ·  "))
        .on_mouse_down("left", mine)
        .on_click((_e, cx) => {
          if (c.failed) {
            dropCopy(c.id);
            cx.notify();
          } else run("terminal.peek", { terminal: c.id });
        })
        .child(orb(t, { size: 16, program: ARROW, status: c.failed ? "blocked" : "working" }))
        .child(div().max_w(150).truncate().text_size(12).text_color(c.failed ? t.blocked : t.foreground).child(what(c)))
        .child(svg(ICON(c.to === null ? "laptop" : "server")).size(12).flex_none().text_color(t.dim))
        .child(div().max_w(90).truncate().text_size(11.5).text_color(t.dim).child(nameOf(c.to)))
        .when(Boolean(c.one) && !c.failed && far?.pct != null, (el) => el.child(div().flex_none().text_size(11.5).font_family(DISPLAY).font_semibold().text_color(t.working).child(`${far?.pct}%`)));
    };

    return v_flex().id("transfer").size_full().min_h(0).bg(t.chrome).text_color(t.foreground)
      // The head: the window is dragged by it, or by any other spot that is not a control.
      .child(h_flex().flex_none().h(40).pl(14).pr(7).gap(8).items_center()
        .child(svg(ICON("transfer")).size(15).flex_none().text_color(t.dim))
        .child(h_flex().id("copies").flex_1().min_w(0).h_full().gap(2).items_center().overflow_x_hidden().children(copies().map(pill)))
        .child(iconButton(t, { id: "transfer-close", icon: "x", tip: "Close", glyph: 13, onClick: () => closeOverlay(p.overlay) })))
      .child(h_flex().flex_1().min_h(0).px(12).pb(12).gap(8)
        .child(side(0))
        .child(arrow)
        .child(side(1)));
  }
}
