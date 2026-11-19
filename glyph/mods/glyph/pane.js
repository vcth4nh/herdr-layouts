// A pane's slim header: its program's logo, where it is when that is not simply the
// project's own folder (the bar already names the project), its branch, and on the right
// how its agent is doing (turning ring, bell, tick). Hover for the pane's buttons: split
// right, split down, close, and zoom when the tab has other panes to hide. Close on what
// isn't a plain shell takes two clicks: the first turns it red.
// Props from the app: { pane, terminal }.

import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme, panes, spaces, props, run } from "herdr";
import { tilde, way, closeTab, ARM } from "./data.js";
import { ICON, INK, logo, iconButton, danger } from "./ui.js";

export class PaneHead {
  constructor() {
    this.hovered = false;
    this.sure = 0; // when close was clicked once, on a pane that takes two
  }

  render() {
    const t = theme();
    const id = props()?.pane;
    const p = panes().find((x) => x.pane === id);
    if (!p) return div();
    // A project's empty page (blank.js) says everything itself.
    if (!p.terminal && p.mod === "glyph") return div().size_full().bg(t.background);
    // The whole way there, home as ~, for the hover.
    const path = tilde(p.cwd).replace(/(.)\/+$/, "$1");
    const sp = spaces().find((x) => x.tabs.some((c) => c.id === p.tab));
    // Where it is, when that says more than the bar does: nothing at the project's own
    // folder, the way down inside it ("docs/api", on Windows "docs\\api"), else the folder's
    // name. The top folder is "/".
    const { parts, slash } = way(p.cwd), at = parts.lastIndexOf(sp?.name);
    const folder = at >= 0 ? parts.slice(at + 1).join(slash) : parts.length ? parts[parts.length - 1] : p.cwd ? "/" : "";
    const tone = p.focused ? t.muted : t.dim;
    // Alone in its tab there is nothing to zoom past, and closing it closes the tab.
    const alone = panes().filter((x) => x.tab === p.tab).length < 2;
    const careful = Boolean(p.terminal) && !p.program?.shell;
    const armed = this.sure > 0 && Date.now() - this.sure < ARM;
    const red = danger(t);
    const act = (key, icon, tip, command, args) => iconButton(t, { id: `${key}-${id}`, icon, tip, size: 22, glyph: 13, onClick: (_e, cx) => { cx.stop_propagation(); run(command, args); } });
    const shut = (_e, cx) => {
      cx.stop_propagation();
      if (careful && !armed) {
        const mine = (this.sure = Date.now());
        cx.timer.after(ARM, (cx) => {
          if (this.sure !== mine) return;
          this.sure = 0;
          cx.notify();
        });
        cx.notify();
        return;
      }
      this.sure = 0;
      if (alone) closeTab(p.tab);
      else run("pane.close", { pane: id });
    };
    // Armed, it stays red under the pointer that just clicked it.
    const close = div().id(`close-${id}`).flex_none().size(22).rounded(8).flex().items_center().justify_center().cursor_pointer()
      .tooltip(armed ? "Again to close" : alone ? "Close tab" : "Close pane")
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(shut)
      .when(!armed, (el) => el.text_color(t.dim).hover((x) => x.bg(t.hover).text_color(t.foreground)))
      .when(armed, (el) => el.bg(red).text_color(INK))
      .child(svg(ICON("x")).size(13));
    const how = p.status === "working" ? svg(ICON("ring")).size(13).flex_none().text_color(t.working).spin(1300)
      : p.status === "blocked" ? div().flex().flex_none().loop("opacity", { from: 0.5, to: 1, period: 900 }).child(svg(ICON("bell")).size(13).text_color(t.blocked))
      : p.status === "done" ? svg(ICON("check")).size(13).flex_none().text_color(t.done)
      : null;

    return h_flex().id(`head-${id}`).size_full().pl(11).pr(6).gap(9).items_center().bg(t.background)
      .border_b(1).border_color(t.border).text_size(12)
      .on_hover((on, cx) => { this.hovered = on; cx.notify(); })
      .on_click(() => run("pane.focus", { pane: id }))
      // A mod pane (a file viewer, a board) has no program: it says its name.
      .child(p.terminal ? logo(p.program, 14, tone) : div().flex_none().text_color(tone).child(p.title ?? p.mod ?? ""))
      .when(Boolean(p.terminal && folder), (el) => el.child(h_flex().id(`cwd-${id}`).flex_shrink(1).min_w(0).gap(5).items_center().text_color(tone).tooltip(path)
        .child(svg(ICON("folder")).size(12).flex_none())
        .child(div().max_w(420).truncate().child(folder))))
      .when(Boolean(p.branch), (el) => el.child(h_flex().flex_none().gap(4).items_center().text_color(t.dim)
        .child(svg(ICON("branch")).size(12).flex_none())
        .child(div().max_w(200).truncate().child(p.branch))))
      .child(div().flex_1())
      .when(Boolean(how), (el) => el.child(how))
      // Zoomed with others behind it: the way back stays in sight.
      .when(p.zoomed && !alone && !this.hovered, (el) => el.child(act("unzoom", "unzoom", "Show all panes", "pane.zoom", { pane: id })))
      .when(this.hovered, (el) => el
        .child(act("right", "split-right", "Split right", "pane.split", { direction: "right", pane: id }))
        .child(act("down", "split-down", "Split down", "pane.split", { direction: "down", pane: id }))
        .when(!alone, (x) => x.child(act("zoom", p.zoomed ? "unzoom" : "zoom", p.zoomed ? "Show all panes" : "Zoom", "pane.zoom", { pane: id }))))
      // A close that waits for its second click stays in sight when the pointer leaves.
      .when(this.hovered || armed, (el) => el.child(close));
  }
}
