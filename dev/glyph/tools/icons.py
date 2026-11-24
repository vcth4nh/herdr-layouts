# icons.py OUTDIR: writes the glyph mod's icon set. One style: 24px grid, round 1.8 strokes,
# drawn in currentColor so the mod can tint them with a theme color.
import os, sys
out = sys.argv[1]
os.makedirs(out, exist_ok=True)

def stroke(body, width=1.8, box=24):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {box} {box}" fill="none" stroke="currentColor" '
            f'stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round">{body}</svg>\n')

ICONS = {
    "plus": stroke('<path d="M12 5.5v13M5.5 12h13"/>', 2),
    "minus": stroke('<path d="M5.5 12h13"/>', 2),
    "x": stroke('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>', 2),
    "check": stroke('<path d="M5 12.6l4.6 4.6L19 7.4"/>', 2.6),
    # Read: two ticks, the second a step behind the first.
    "check-double": stroke('<path d="M2.5 12.8l4.4 4.4L16.4 7.6"/><path d="M12.4 16.4l.8.8 9.3-9.6"/>', 2.2),
    "bang": stroke('<path d="M12 5v8.5"/><path d="M12 18.6h.01"/>', 3.2),
    "bell": stroke('<path d="M10.3 20.5a2 2 0 0 0 3.4 0"/><path d="M3.3 15.3A1 1 0 0 0 4 17h16a1 1 0 0 0 .7-1.7C19.4 14 18 12.5 18 8A6 6 0 0 0 6 8c0 4.5-1.4 6-2.7 7.3"/>'),
    "search": stroke('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'),
    "gear": stroke('<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/>', 1.7),
    "laptop": stroke('<rect x="4" y="5" width="16" height="11" rx="2"/><path d="M2.5 19.5h19"/>', 2),
    "server": stroke('<rect x="3.5" y="4" width="17" height="7" rx="2"/><rect x="3.5" y="13" width="17" height="7" rx="2"/><path d="M7.5 7.5h.01M7.5 16.5h.01"/>', 2),
    "server-plus": stroke('<rect x="3.5" y="4" width="17" height="7" rx="2"/><path d="M11.5 13h-6a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h6"/><path d="M18 13.5v6M15 16.5h6"/><path d="M7.5 7.5h.01"/>'),
    "home": stroke('<path d="M3.5 10.6 12 3.5l8.5 7.1V19a1.8 1.8 0 0 1-1.8 1.8H5.3A1.8 1.8 0 0 1 3.5 19z"/><path d="M9.6 20.8v-6.6h4.8v6.6"/>', 2),
    "folder": stroke('<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>'),
    "branch": stroke('<path d="M15 6a9 9 0 0 0-9 9V3"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>'),
    "files": stroke('<path d="M15 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7Z"/><path d="M14.5 2.5V6a1.5 1.5 0 0 0 1.5 1.5h3.5"/><path d="M8.5 13h7M8.5 17h4.5"/>'),
    "file": stroke('<path d="M15 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7Z"/><path d="M14.5 2.5V6a1.5 1.5 0 0 0 1.5 1.5h3.5"/>'),
    "transfer": stroke('<path d="M4 8.5h15.5M15.5 4.5l4 4-4 4"/><path d="M20 15.5H4.5M8.5 11.5l-4 4 4 4"/>', 2),
    "arrow-right": stroke('<path d="M4.5 12h15M13.5 6l6 6-6 6"/>', 2.4),
    "arrow-left": stroke('<path d="M19.5 12h-15M10.5 6l-6 6 6 6"/>', 2.4),
    "bolt": stroke('<path d="M13.5 2.8 5 13.6h6.4l-.9 7.6L19 10.4h-6.4z"/>', 2),
    "diff": stroke('<path d="M12 4v9M7.5 8.5h9M7.5 19.5h9"/>', 2),
    "split-right": stroke('<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M12 4.5v15"/>'),
    "split-down": stroke('<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M3 12h18"/>'),
    "zoom": stroke('<path d="M14.5 4.5h5v5M9.5 19.5h-5v-5M19.5 4.5l-6 6M4.5 19.5l6-6"/>'),
    "unzoom": stroke('<path d="M19.5 9.5h-5v-5M4.5 14.5h5v5M14.5 9.5l6-6M9.5 14.5l-6 6"/>'),
    "expand": stroke('<path d="m6 17 5-5-5-5M13 17l5-5-5-5"/>', 2),
    "collapse": stroke('<path d="m11 17-5-5 5-5M18 17l-5-5 5-5"/>', 2),
    "pen": stroke('<path d="M4 20l1.2-4.4L16.6 4.2a1.7 1.7 0 0 1 2.4 0l.8.8a1.7 1.7 0 0 1 0 2.4L8.4 18.8 4 20z"/><path d="M14.5 6.3l3.2 3.2"/>', 2),
    # What was closed: a clock whose rim turns back.
    "history": stroke('<path d="M3.6 12a8.4 8.4 0 1 0 2.5-6L3.6 8.4"/><path d="M3.6 4v4.4H8"/><path d="M12 7.6V12l3.2 1.9"/>', 2),
    "more": stroke('<path d="M5.5 12h.01M12 12h.01M18.5 12h.01"/>', 2.8),
    "chevron-down": stroke('<path d="m6.5 9.5 5.5 5.5 5.5-5.5"/>', 2.4),
    "chevron-right": stroke('<path d="m9.5 6.5 5.5 5.5-5.5 5.5"/>', 2.4),
    # The working ring: a faint track and a bright third of it, turned by .spin().
    "ring": ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.3" '
             'stroke-linecap="round"><circle cx="16" cy="16" r="14" stroke-opacity="0.2"/><path d="M16 2A14 14 0 0 1 28.12 23"/></svg>\n'),
}
for name, body in ICONS.items():
    open(os.path.join(out, name + ".svg"), "w").write(body)
print(len(ICONS), "icons ->", out)
