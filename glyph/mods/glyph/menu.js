// The menu a tab opens on a right-click: rename it, a new tab beside it, close it.
// Herdr's own tab menu offers the same, but asks for the name in its own words
// ("empty: its number"). Here an unnamed tab goes by what its agent says it is doing,
// so Rename opens the dialog saying that. Close on a tab that isn't a plain shell asks
// once more, in place: the row turns red and a second choice closes. Opened as a popup
// with props { role: "menu", tab }. Up and down move, Enter runs, Esc closes.

import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, props, closeOverlay } from "herdr";
import { model, renameTab, newTab, closeTab, keyFor } from "./data.js";
import { ICON, alpha, danger } from "./ui.js";

export class Menu {
  constructor(cx) {
    this.at = 0;
    this.sure = false; // Close was chosen once, on a tab that takes two
    this.handle = cx.focus_handle();
    this.handle.focus();
  }

  render() {
    const t = theme();
    const p = props() ?? {};
    const c = model().flat.find((x) => x.id === p.tab);
    const close = () => closeOverlay(p.overlay);
    if (!c) return div();
    const red = danger(t);
    const list = [
      { icon: "pen", label: "Rename", key: keyFor("glyph.rename", "tab.rename"), act: () => renameTab(c) },
      { icon: "plus", label: "New tab", key: keyFor("glyph.new", "tab.new"), act: () => newTab(c.space) },
      { icon: "x", label: this.sure ? "Again to close" : "Close", key: keyFor("glyph.close", "tab.close"), rule: true, twice: c.careful, act: () => closeTab(c.id) },
    ];
    // True when the menu stays open: the first of the two choices Close takes.
    const choose = (i) => {
      const it = list[i];
      if (it?.twice && !this.sure) {
        this.sure = true;
        this.at = i;
        return true;
      }
      close();
      it?.act();
      return false;
    };
    const row = (it, i) => {
      const hot = Boolean(it.twice) && this.sure;
      return h_flex().id(`mi-${i}`).h(31).px(8).gap(9).rounded(7).items_center().justify_between().text_color(hot ? red : t.foreground)
        .when(i === this.at && !hot, (el) => el.bg(t.selected))
        .when(hot, (el) => el.bg(alpha(red, "33")))
        .when(!hot, (el) => el.hover((s) => s.bg(t.hover)))
        .on_click((_e, cx) => { if (choose(i)) cx.notify(); })
        .child(svg(ICON(it.icon)).size(14).flex_none().text_color(hot ? red : t.muted))
        .child(div().flex_1().child(it.label))
        .child(div().text_size(11).text_color(t.dim).child(it.key));
    };
    return v_flex().id("menu").track_focus(this.handle).w_full().min_h(0).p(5).bg(t.popover).text_size(12.8)
      .on_key_down((e, cx) => {
        if (e.key === "down") this.at = (this.at + 1) % list.length;
        else if (e.key === "up") this.at = (this.at + list.length - 1) % list.length;
        else if (e.key === "enter") { if (!choose(this.at)) return; }
        else if (e.key === "escape") { close(); return; }
        else return;
        // Moving off Close takes its first choice back.
        if (!list[this.at]?.twice) this.sure = false;
        cx.notify();
      })
      .children(list.map((it, i) => v_flex()
        .when(Boolean(it.rule), (el) => el.child(div().mx(7).my(4).h(1).bg(t.border)))
        .child(row(it, i))));
  }
}
