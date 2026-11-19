// The drawn vocabulary every part shares.
//   square tile  = a project (space), in its own hue; filled when it is the shown one
//   round orb    = a tab, wearing its program's logo; the ring says how it is doing:
//                  turning arc = working, breathing ring + ! = needs you,
//                  solid ring + tick = finished, no ring = idle (fainter the longer it rests)

import { div, svg, image } from "gpui-kit";
import { window as win } from "herdr";

export const ICON = (name) => `mods/glyph/icons/${name}.svg`;
// Ink on a filled hue (tiles, badges): dark in every theme, the hues are light.
export const INK = "#11111b";
// Letters that act as pictures (a project's two letters, a count) are set in a face
// with a real bold: Herdr's own font draws every weight the same.
// On a Mac that is Avenir Next, which every Mac has. Linux and Windows have no such face in
// common, so glyph brings one: Nunito Sans, semibold and bold, in fonts/ beside this file,
// where Herdr loads a mod's fonts from.
// Herdr can't say which system this is while the mod loads, so the name starts as the Mac's
// and face() sets it before every draw (main.js). Whoever imports DISPLAY reads what it is
// at that moment. Where the Mac's face is missing Herdr's own font draws, which is what
// Linux and Windows had before.
export let DISPLAY = "Avenir Next";
export function face() {
  const system = win()?.platform;
  if (system) DISPLAY = system === "macos" ? "Avenir Next" : "Nunito Sans";
}

// How wide Herdr's own font (Geist) draws a line of text, for the few places that must
// know before it is drawn (tab titles sharing the strip). Each letter's advance from
// space to "~", in thousandths of the text size; the sum runs a few pixels over what
// is drawn (the font tucks some pairs together), never under.
const ADVANCE = [
  250, 213, 346, 478, 629, 802, 620, 178, 274, 274, 430, 558, 201, 419, 201, 480, 663, 384, 619,
  613, 615, 626, 593, 524, 604, 593, 297, 297, 544, 540, 544, 559, 906, 668, 680, 703, 694, 603,
  590, 700, 713, 270, 597, 640, 580, 877, 743, 739, 650, 733, 672, 640, 552, 689, 667, 945, 606,
  576, 544, 347, 455, 347, 426, 557, 248, 551, 595, 546, 595, 561, 395, 594, 581, 244, 260, 590,
  267, 877, 581, 573, 595, 595, 379, 520, 392, 575, 536, 819, 585, 537, 537, 389, 264, 389, 523,
];
export function textWidth(text, size) {
  let sum = 0;
  for (const ch of text ?? "") {
    const code = ch.codePointAt(0);
    // Past "~": accented letters are about a letter wide, CJK and emoji a full square.
    sum += code >= 32 && code < 127 ? ADVANCE[code - 32] : code >= 0x2e80 ? 1000 : 620;
  }
  return (sum * size) / 1000;
}

// A color with an alpha of its own. Theme colors may already carry one (#ffffff18).
export const alpha = (color, aa) => (color ?? "#000000").slice(0, 7) + aa;

// Two colors mixed into a solid one: `k` of `b` over `a`.
export function mix(a, b, k) {
  const part = (hex, i) => parseInt((hex ?? "#000000").slice(i, i + 2), 16);
  return "#" + [1, 3, 5].map((i) => Math.round(part(a, i) * (1 - k) + part(b, i) * k).toString(16).padStart(2, "0")).join("");
}

function lum(hex) {
  const n = (i) => {
    const c = parseInt((hex ?? "#000000").slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * n(1) + 0.7152 * n(3) + 0.0722 * n(5);
}

// How a program sits in an orb. The app's table gives a tile color and a glyph color
// meant for each other; near-black tiles become the theme's own disc.
function look(t, p) {
  const dark = !p?.tile || lum(p.tile) < 0.03;
  const ink = p?.color && (!dark || lum(p.color) > 0.25) ? p.color : t.foreground;
  return { bg: dark ? null : p.tile, ink };
}

// A plain terminal's program as Herdr's table has it, for where no terminal is open to ask:
// the same picture and color a shell tab wears, so "a terminal" looks one way everywhere.
export const SHELL = { key: "shell", name: "Terminal", icon: "icons/shell.svg", tint: true, tile: "#16241a", color: "#4ec95f", shell: true, agent: false };

// The color a program's one-color logo is drawn in.
export const inkOf = (t, p) => look(t, p).ink;

// What is about to be closed for good.
export const danger = (t) => t.ansi1 ?? "#f38ba8";

// A program's logo: a picture (Claude, Codex) or a one-color glyph.
export function logo(p, size, color) {
  if (!p?.icon) return svg(SHELL.icon).size(size).flex_none().text_color(color);
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

// Makes an element a control: its own id, press, click, right-click and hover label.
function control(el, o) {
  return el.id(o.id).cursor_pointer()
    .when(Boolean(o.tip), (x) => x.tooltip(o.tip))
    // In a window_drag bar a press on a control is its own, not the window's.
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click(o.onClick)
    .when(Boolean(o.onMenu), (x) => x.on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); o.onMenu(); }));
}

// A tab on one of the rail's lines: a bead in its state's color, as wide as it is given.
// Its motion is the orb's ring laid flat: a glint runs along one at work, one that needs
// you breathes, a finished one is still, and an idle one is as faint as its logo.
// `lit` (under the pointer, or its row is) makes it taller and as bright as it gets.
// o: { id, status, width, glint, tall, fade, lit }. `glint`: the line's beads are wide
// enough for one. In a line of narrower ones a working bead breathes instead, faster than
// one that needs you and not as deep.
export function bead(t, o) {
  const el = div().id(o.id).relative().flex_1().min_w(0).h(o.lit ? o.tall + 4 : o.tall).rounded_full().overflow_hidden()
    .bg(t[o.status] ?? t.idle)
    .transition("height", { duration: 120, easing: "ease-out" });
  if (o.status === "blocked") return el.loop("opacity", { from: 0.5, to: 1, period: 900 });
  if (o.status === "idle") return el.opacity(o.lit ? 1 : o.fade ?? 1);
  if (o.status !== "working") return el;
  if (!o.glint) return el.loop("opacity", { from: 0.6, to: 1, period: 1300 });
  // The glint goes to the far end and back once every 2.6 s, the time the orb's arc takes
  // for two turns. It is 1px short of the bead above and below: what holds it is cut to the
  // bead's box, not to its round ends, which a glint of the bead's own height would square off.
  const glint = Math.max(2, Math.min(16, Math.round(o.width * 0.4)));
  return el.child(div().absolute().top(1).bottom(1).left(0).w(glint).rounded_full().bg(mix(t.working, t.foreground, 0.6))
    .loop("left", { from: 0, to: Math.max(glint, o.width) - glint, period: 2600 }));
}

// o: { id, program, status, size, current, fade, backdrop, subs, tip, lit, onClick, onMenu, onHover }
// Without onClick it is only a picture (a tab chip owns the click). `lit`: drawn as under
// the pointer. `onHover` hears the pointer come and go.
export function orb(t, o) {
  const size = o.size ?? 24, pad = 3, outer = size + pad * 2;
  const lk = look(t, o.program);
  const quiet = !o.status || o.status === "idle";
  const backdrop = o.backdrop ?? t.chrome;
  const ring = () => div().absolute().top(0).left(0).size(outer);
  const small = size < 24, mark = small ? 11 : 12;
  const badge = (color, icon) => div().absolute().top(-2).right(-2).size(mark).rounded_full().bg(color)
    .border(1.5).border_color(backdrop).flex().items_center().justify_center()
    .child(svg(ICON(icon)).size(mark - 4).text_color(INK));

  let el = div().relative().flex_none().size(outer).rounded_full();
  if (o.onClick) {
    el = control(el, o).hover((s) => s.bg(t.hover))
      .when(Boolean(o.lit), (x) => x.bg(t.hover))
      .when(Boolean(o.onHover), (x) => x.on_hover(o.onHover));
  }

  el = el.child(div().absolute().top(pad).left(pad).size(size).rounded_full().flex().items_center().justify_center()
    .bg(o.current ? alpha(t.accent, "47") : lk.bg ?? t.raised)
    .when(Boolean(o.current), (x) => x.border(1.5).border_color(t.accent))
    .child(div().flex().flex_none().opacity(quiet && !o.current ? o.fade ?? 1 : 1)
      .child(logo(o.program, Math.round(size * 0.6), lk.ink))));

  if (o.status === "working") {
    el = el.child(ring().child(svg(ICON("ring")).size(outer).text_color(t.working).spin(1300)));
  } else if (o.status === "blocked") {
    el = el.child(ring().rounded_full().border(2).border_color(t.blocked).loop("opacity", { from: 0.45, to: 1, period: 900 }))
      .child(badge(t.blocked, "bang"));
  } else if (o.status === "done") {
    el = el.child(ring().rounded_full().border(2).border_color(alpha(t.done, "d9"))).child(badge(t.done, "check"));
  }
  // Sub-agents it started: one small dot, in the most urgent one's color.
  if (o.subs?.count) {
    el = el.child(div().absolute().bottom(-1).right(-1).size(small ? 8 : 9).rounded_full().bg(t[o.subs.status] ?? t.idle).border(1.5).border_color(backdrop));
  }
  return el;
}

// How quick another machine is to answer, as a phone shows its signal: four bars, 11px wide,
// the first `lit` of them in `ink`.
export function bars(t, lit, ink) {
  return div().flex().flex_none().h(10).gap(1).items_end()
    .children([4, 6, 8, 10].map((h, i) => div().flex_none().w(2).h(h).rounded(1).bg(i < lit ? ink : t.input)));
}

// A project's two letters, the way an element has a symbol: "notes-app" is NA, "kettle" is Ke.
export function mono(name) {
  const words = (name ?? "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (!words.length) return "?";
  const first = [...words[0]];
  if (words.length === 1) return (first[0] ?? "?").toUpperCase() + (first[1] ?? "").toLowerCase();
  return (first[0] + [...words[1]][0]).toUpperCase();
}

// The color a project is drawn in: its hue. Home ("~") has none of its own.
export const hueOf = (t, o) => (o.name === "~" || !o.hue ? t.muted : o.hue);

// o: { id, name, hue, active, size, sign, tip, onClick, onMenu }. "~" (home) gets a house;
// `sign` is drawn in place of the two letters (a place that is no project).
export function tile(t, o) {
  const size = o.size ?? 36;
  const home = o.name === "~";
  const hue = hueOf(t, o);
  let el = div().flex_none().size(size).rounded(Math.round(size * 0.3)).flex().items_center().justify_center();
  if (o.onClick) el = control(el, o).hover((s) => s.bg(o.active ? hue : alpha(hue, "40")));
  return el.bg(o.active ? hue : alpha(hue, "26")).text_color(o.active ? INK : hue)
    .text_size(Math.max(9, Math.round(size * 0.36))).font_family(DISPLAY).font_bold()
    .child(home ? svg(ICON("home")).size(Math.round(size * 0.5)) : o.sign ?? mono(o.name));
}

// An icon-only control. o: { id, icon, tip, size, glyph, on, color, onClick }
export function iconButton(t, o) {
  const size = o.size ?? 28;
  return control(div().flex_none().size(size).rounded(8).flex().items_center().justify_center(), o)
    .text_color(o.on ? t.foreground : o.color ?? t.dim)
    .when(Boolean(o.on), (el) => el.bg(t.selected))
    .hover((s) => s.bg(t.hover).text_color(t.foreground))
    .child(svg(ICON(o.icon)).size(o.glyph ?? 15));
}
