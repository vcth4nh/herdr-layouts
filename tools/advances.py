# advances.py FONT.ttf: print unitsPerEm and the advance width of each printable ASCII glyph.
import struct, sys, json
b = open(sys.argv[1], "rb").read()
n = struct.unpack(">H", b[4:6])[0]
T = {}
for i in range(n):
    tag, _c, off, ln = struct.unpack(">4sIII", b[12+16*i: 28+16*i]); T[tag.decode()] = (off, ln)
def tab(t): o, l = T[t]; return b[o:o+l]
upm = struct.unpack(">H", tab("head")[18:20])[0]
nh = struct.unpack(">H", tab("hhea")[34:36])[0]
hm = tab("hmtx")
adv = lambda g: struct.unpack(">H", hm[4*min(g, nh-1): 4*min(g, nh-1)+2])[0]
cm = tab("cmap"); nt = struct.unpack(">H", cm[2:4])[0]; best = None
for i in range(nt):
    pid, eid, off = struct.unpack(">HHI", cm[4+8*i: 12+8*i]); fmt = struct.unpack(">H", cm[off:off+2])[0]
    if (pid, eid) in ((3, 10), (0, 4), (0, 6)) and fmt == 12: best = (12, off); break
    if (pid, eid) in ((3, 1), (0, 3)) and fmt == 4 and not best: best = (4, off)
def glyph(cp):
    fmt, off = best
    if fmt == 12:
        ng = struct.unpack(">I", cm[off+12:off+16])[0]
        for i in range(ng):
            s, e, g = struct.unpack(">III", cm[off+16+12*i: off+28+12*i])
            if s <= cp <= e: return g + cp - s
        return 0
    segx2 = struct.unpack(">H", cm[off+6:off+8])[0]; sc = segx2 // 2
    ends = struct.unpack(f">{sc}H", cm[off+14: off+14+segx2])
    starts = struct.unpack(f">{sc}H", cm[off+16+segx2: off+16+2*segx2])
    deltas = struct.unpack(f">{sc}h", cm[off+16+2*segx2: off+16+3*segx2])
    ro_at = off + 16 + 3*segx2
    ros = struct.unpack(f">{sc}H", cm[ro_at: ro_at+segx2])
    for i in range(sc):
        if starts[i] <= cp <= ends[i]:
            if ros[i] == 0: return (cp + deltas[i]) & 0xFFFF
            p = ro_at + 2*i + ros[i] + 2*(cp - starts[i])
            g = struct.unpack(">H", cm[p:p+2])[0]
            return (g + deltas[i]) & 0xFFFF if g else 0
    return 0
out = {chr(c): adv(glyph(c)) for c in range(32, 127)}
extra = {ch: adv(glyph(ord(ch))) for ch in "…·–—’“”éà" if glyph(ord(ch))}
print(json.dumps({"upm": upm, "cmap": best[0], "ascii": out, "extra": extra, "tables": sorted(T)}, ensure_ascii=False))
