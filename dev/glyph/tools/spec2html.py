#!/usr/bin/env python3
"""spec2html.py OUT.html [--rail F] [--bar F] [--pane F] [--body F] [--over F] [--over-box X,Y,W,H]
                [--only rail|bar|pane|body] [--w N] [--h N] [--rail-width N]

Turns `herdr-app check --print-spec` trees into an approximate HTML page: gpui's flexbox
is close enough to CSS flexbox to judge spacing, sizes and color before the real window.
Animations are drawn still (a loop at its `to` value, a spin at rest).
"""
import base64, html, os, re, sys

S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Where a tree's "mods/glyph/..." paths are read from: the look's own folder.
STAGE = os.path.join(os.path.dirname(os.path.dirname(S)), "glyph")
HOME = os.path.expanduser("~/.config/herdr-app")


def unescape(s):
    out, i = [], 0
    while i < len(s):
        c = s[i]
        if c != "\\":
            out.append(c); i += 1; continue
        n = s[i + 1]
        if n == "u":
            j = s.index("}", i); out.append(chr(int(s[i + 3:j], 16))); i = j + 1
        else:
            out.append({"n": "\n", "t": "\t", "r": "\r"}.get(n, n)); i += 2
    return "".join(out)


def read_string(s, i):
    j = i + 1
    while s[j] != '"':
        j += 2 if s[j] == "\\" else 1
    return unescape(s[i + 1:j]), j + 1


def read_balanced(s, i, a, b):
    depth, j = 0, i
    while True:
        c = s[j]
        if c == '"':
            _, j = read_string(s, j); continue
        if c == a: depth += 1
        elif c == b:
            depth -= 1
            if depth == 0: return s[i + 1:j], j + 1
        j += 1


ARG = re.compile(r"\s*,?\s*(Number|Str|Bool)\(")
OP = re.compile(r"[.:]([A-Za-z_0-9]+)")


def parse_args(body):
    args, i = [], 0
    while i < len(body):
        m = ARG.match(body, i)
        if not m: break
        i = m.end()
        if m.group(1) == "Str":
            v, i = read_string(body, i); i += 1
        else:
            j = body.index(")", i); raw = body[i:j]; i = j + 1
            v = float(raw) if m.group(1) == "Number" else raw == "true"
        args.append(v)
    return args


def parse_ops(s):
    ops, i = [], 0
    while i < len(s):
        if s[i] == " ": i += 1; continue
        m = OP.match(s, i)
        if not m: raise ValueError("bad op at %d: %r" % (i, s[i:i + 80]))
        name, i, args = m.group(1), m.end(), []
        if i < len(s) and s[i] == "[":
            body, i = read_balanced(s, i, "[", "]"); args = parse_args(body)
        elif i < len(s) and s[i] == "(":
            body, i = read_balanced(s, i, "(", ")")
        ops.append((name, args))
    return ops


def parse(path):
    root, stack = None, []
    for line in open(path).read().split("\n"):
        if not line.strip():
            if root: break
            continue
        depth = (len(line) - len(line.lstrip(" "))) // 2
        text = line.strip()
        # A kit control is printed with the number of the state it holds: "Input #2".
        m = re.match(r"(\w+)\s*(?:#\d+\s*)?", text)
        kind, i, arg = m.group(1), m.end(), None
        if i < len(text) and text[i] == '"':
            arg, i = read_string(text, i)
        node = {"kind": kind, "arg": arg, "ops": parse_ops(text[i:]), "children": []}
        if depth == 0: root, stack = node, [node]
        else:
            stack = stack[:depth]; stack[-1]["children"].append(node); stack.append(node)
    if root is None: raise SystemExit("no tree in " + path)
    return root


def px(v): return "%gpx" % v


SIMPLE = {
    "flex": "display:flex", "flex_none": "flex:none", "flex_1": "flex:1 1 0%", "flex_wrap": "flex-wrap:wrap",
    "flex_col": "flex-direction:column", "flex_row": "flex-direction:row",
    "items_center": "align-items:center", "items_start": "align-items:flex-start", "items_end": "align-items:flex-end", "self_start": "align-self:flex-start",
    "justify_center": "justify-content:center", "justify_between": "justify-content:space-between", "justify_end": "justify-content:flex-end",
    "size_full": "width:100%;height:100%", "w_full": "width:100%", "h_full": "height:100%",
    "rounded_full": "border-radius:9999px", "absolute": "position:absolute", "relative": "position:relative",
    "font_medium": "font-weight:500", "font_semibold": "font-weight:600", "font_bold": "font-weight:700",
    "truncate": "overflow:hidden;text-overflow:ellipsis;white-space:nowrap",
    "border_1": "border-width:1px", "border_dashed": "border-style:dashed",
    "overflow_x_hidden": "overflow-x:hidden", "overflow_hidden": "overflow:hidden", "overflow_y_scrollbar": "overflow-y:hidden",
    "cursor_pointer": "", "cursor_grabbing": "", "whitespace_nowrap": "white-space:nowrap", "max_w_full": "max-width:100%",
}
VALUE = {
    "w": "width", "h": "height", "min_w": "min-width", "min_h": "min-height", "max_w": "max-width", "max_h": "max-height",
    "gap": "gap", "rounded": "border-radius", "top": "top", "left": "left", "right": "right", "bottom": "bottom",
    "pl": "padding-left", "pr": "padding-right", "pt": "padding-top", "pb": "padding-bottom",
    "ml": "margin-left", "mr": "margin-right", "mt": "margin-top", "mb": "margin-bottom",
    "text_size": "font-size", "border": "border-width", "border_b": "border-bottom-width", "border_t": "border-top-width",
    "border_l": "border-left-width", "border_r": "border-right-width", "rounded_bl": "border-bottom-left-radius",
}
unknown = set()


def style(node):
    st, title = [], None
    if node["kind"] == "h_flex": st.append("display:flex;flex-direction:row;align-items:center")
    elif node["kind"] == "v_flex": st.append("display:flex;flex-direction:column")
    for name, a in node["ops"]:
        v = a[0] if a else None
        if name in SIMPLE: st.append(SIMPLE[name])
        elif name in VALUE: st.append("%s:%s" % (VALUE[name], px(v) if isinstance(v, float) else v))
        elif name == "size": st.append("width:%s;height:%s" % (px(v), px(v)))
        elif name == "px": st.append("padding-left:%s;padding-right:%s" % (px(v), px(v)))
        elif name == "py": st.append("padding-top:%s;padding-bottom:%s" % (px(v), px(v)))
        elif name == "p": st.append("padding:%s" % px(v))
        elif name == "mx": st.append("margin-left:%s;margin-right:%s" % (px(v), px(v)))
        elif name == "my": st.append("margin-top:%s;margin-bottom:%s" % (px(v), px(v)))
        elif name == "rounded_r": st.append("border-top-right-radius:%s;border-bottom-right-radius:%s" % (px(v), px(v)))
        elif name == "rounded_l": st.append("border-top-left-radius:%s;border-bottom-left-radius:%s" % (px(v), px(v)))
        elif name == "rounded_t": st.append("border-top-left-radius:%s;border-top-right-radius:%s" % (px(v), px(v)))
        elif name == "rounded_b": st.append("border-bottom-left-radius:%s;border-bottom-right-radius:%s" % (px(v), px(v)))
        elif name == "bg": st.append("background-color:%s" % v)
        elif name == "text_color": st.append("color:%s" % v)
        elif name == "border_color": st.append("border-color:%s" % v)
        elif name == "opacity": st.append("opacity:%g" % v)
        elif name == "flex_shrink": st.append("flex-shrink:%g" % v)
        elif name == "flex_grow": st.append("flex-grow:%g" % v)
        elif name == "flex_basis": st.append("flex-basis:%s" % (px(v) if isinstance(v, float) else v))
        elif name == "line_height": st.append("line-height:%s" % (v if isinstance(v, str) else "%g" % v))
        elif name == "font_family": st.append("font-family:'%s'" % v)
        elif name == "tooltip": title = v
        elif name == "loop":
            if a and a[0] == "opacity": st.append("opacity:%g" % a[2])
        elif name in ("id", "hover", "spin", "transition", "spring", "track_focus", "track_scroll") or name.startswith("on_"): pass
        else: unknown.add(name)
    return ";".join(x for x in st if x), title


def data_uri(path):
    for base in (STAGE, HOME):
        f = os.path.join(base, path)
        if os.path.exists(f):
            return "data:image/svg+xml;base64," + base64.b64encode(open(f, "rb").read()).decode()
    sys.stderr.write("missing icon: %s\n" % path)
    return ""


def render(node):
    k = node["kind"]
    if k == "text": return html.escape(node["arg"] or "")
    st, title = style(node)
    t = ' title="%s"' % html.escape(title, quote=True) if title else ""
    if k == "svg":
        u = data_uri(node["arg"])
        return '<div%s style="%s;background-color:currentColor;-webkit-mask:url(%s) center/100%% 100%% no-repeat;mask:url(%s) center/100%% 100%% no-repeat"></div>' % (t, st, u, u)
    if k == "Input":
        # What was typed is the state's, not the tree's: an empty field, its caret at the start.
        return '<div%s style="display:flex;align-items:center;%s"><div style="width:1.5px;height:1.25em;background-color:currentColor"></div></div>' % (t, st)
    if k == "image":
        return '<img%s src="%s" style="display:block;%s">' % (t, data_uri(node["arg"]), st)
    return '<div%s style="%s">%s</div>' % (t, st, "".join(render(c) for c in node["children"]))


CSS = """
* { box-sizing: border-box; position: relative; border: 0 solid transparent; margin: 0; padding: 0; }
html, body { background: #11111b; overflow: hidden; }
body { font-family: -apple-system, "SF Pro Text", system-ui, sans-serif; font-size: 16px; line-height: 1.618;
  color: #cdd6f4; -webkit-font-smoothing: antialiased; }
.term { font-family: "JetBrains Mono", "JetBrainsMono Nerd Font", Menlo, monospace; font-size: 14px; line-height: 1.35;
  color: #cdd6f4; padding: 10px 12px; white-space: pre; overflow: hidden; }
.term .d { color: #7f849c; } .term .g { color: #a6e3a1; } .term .b { color: #89b4fa; } .term .m { color: #cba6f7; } .term .p { color: #fab387; }
"""

TERM = """<span class="p">✻</span> <b>Stock importer: supplier detection</b>

<span class="d">⏺</span> I've mapped the supplier feeds in the sample catalog. Three need a closer look:

  <span class="b">northwind</span>     312 items   prices in a nested table, units two columns over
  <span class="b">contoso</span>        87 items   prices on the first sheet
  <span class="b">fabrikam</span>       41 items   "unit cost" hidden behind a merged header

<span class="d">⏺</span> <span class="g">Bash</span>(python import.py --suppliers northwind --limit 20)
  <span class="d">⎿  20/20 imported, 17 prices found, 3 timeouts</span>

<span class="p">●</span> Do you want me to run the full import? It takes about 40 minutes.
<span class="d">  ❯ 1. Yes
    2. Yes, and don't ask again for import.py
    3. No, tell me what to change</span>
"""


def main():
    a = sys.argv[1:]
    out = a[0]
    opt = dict(zip(a[1::2], a[2::2]))
    W, H = int(opt.get("--w", 1710)), int(opt.get("--h", 1073))
    rw = int(opt.get("--rail-width", 160))
    part = lambda key: render(parse(opt[key])) if key in opt else ""
    only = opt.get("--only")
    # --over: a window overlay's tree (the transfer window) floating over the whole window, at
    # --over-box X,Y,W,H. The frame is Herdr's, read off a real frame: a 1px border, 6px corners, no shadow.
    over = ""
    if "--over" in opt:
        box = tuple(int(v) for v in opt.get("--over-box", "415,256,880,560").split(","))
        over = ('<div style="position:absolute;left:%dpx;top:%dpx;width:%dpx;height:%dpx;border-radius:6px;'
                'border:1px solid #313244;overflow:hidden;background:#11111b">%%s</div>' % box) % part("--over")
    if only:
        body = '<div style="width:%dpx;height:%dpx">%s</div>' % (W, H, part("--" + only))
    else:
        body = (
            '<div style="width:%dpx;height:%dpx;display:flex;background:#11111b">' % (W, H)
            + '<div style="width:%dpx;height:100%%;flex:none">%s</div>' % (rw, part("--rail"))
            + '<div style="flex:1;min-width:0;display:flex;flex-direction:column">'
            + '<div style="height:42px;flex:none">%s</div>' % part("--bar")
            + '<div style="flex:1;min-height:0;padding:8px;display:flex;gap:8px">'
            + '<div style="flex:1;min-width:0;border-radius:12px;overflow:hidden;background:#1e1e2e;border:1px solid #b4befe66;display:flex;flex-direction:column">'
            + '<div style="height:28px;flex:none">%s</div>' % part("--pane")
            # --body: a mod pane's own tree (a project's empty page) where the terminal would be.
            + ('<div style="flex:1;min-height:0">%s</div>' % part("--body") if "--body" in opt else '<div class="term" style="flex:1">%s</div>' % TERM)
            + "</div></div></div>" + over + "</div>"
        )
    # The app's own UI font (found inside the app, kept in .local/fonts/), so widths match the window.
    geist = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".local", "fonts", "06-GeistRegular.ttf")
    face = ""
    if os.path.exists(geist):
        face = '@font-face { font-family: "Geist"; src: url(data:font/ttf;base64,%s); }\nbody { font-family: "Geist", sans-serif !important; }\n' % base64.b64encode(open(geist, "rb").read()).decode()
    # The faces the mod brings in its fonts/ folder (Nunito Sans, for Linux and Windows).
    brought = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "glyph", "mods", "glyph", "fonts")
    for name, weight in (("NunitoSans-SemiBold.ttf", 600), ("NunitoSans-Bold.ttf", 700)):
        f = os.path.join(brought, name)
        if os.path.exists(f):
            face += '@font-face { font-family: "Nunito Sans"; font-weight: %d; src: url(data:font/ttf;base64,%s); }\n' % (weight, base64.b64encode(open(f, "rb").read()).decode())
    open(out, "w").write('<!doctype html><meta charset="utf-8"><style>%s%s</style><body>%s</body>' % (CSS, face, body))
    if unknown: sys.stderr.write("unmapped ops: %s\n" % " ".join(sorted(unknown)))
    print(out)


main()
