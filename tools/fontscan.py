# fontscan.py BINARY OUTDIR: find TrueType/OpenType fonts embedded in a binary and save each.
import mmap, struct, sys, os
path, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
f = open(path, "rb"); mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
def tables(pos):
    if pos + 12 > len(mm): return None
    n = struct.unpack(">H", mm[pos+4:pos+6])[0]
    if not 6 <= n <= 60: return None
    recs, last = {}, b""
    for i in range(n):
        tag, _cs, off, ln = struct.unpack(">4sIII", mm[pos+12+16*i: pos+28+16*i])
        if not all(32 <= b < 127 for b in tag) or tag < last: return None
        if pos + off + ln > len(mm) or off < 12 + 16 * n: return None
        recs[tag.decode()] = (off, ln); last = tag
    return recs if {"cmap", "head", "hhea", "hmtx", "name"} <= set(recs) else None
def family(pos, recs):
    off, ln = recs["name"]; b = mm[pos+off: pos+off+ln]
    _fmt, count, so = struct.unpack(">HHH", b[:6]); names = {}
    for i in range(count):
        pid, eid, lid, nid, l, o = struct.unpack(">HHHHHH", b[6+12*i: 18+12*i])
        raw = b[so+o: so+o+l]
        try: s = raw.decode("utf-16-be") if pid in (0, 3) else raw.decode("latin-1")
        except Exception: continue
        if nid in (1, 2, 4, 16) and nid not in names: names[nid] = s
    return names
found, pos = [], 0
for magic in (b"\x00\x01\x00\x00", b"OTTO", b"true"):
    pos = 0
    while True:
        pos = mm.find(magic, pos)
        if pos < 0: break
        recs = tables(pos)
        if recs:
            size = max(o + ((l + 3) & ~3) for o, l in recs.values())
            names = family(pos, recs)
            found.append((pos, size, names, sorted(recs)))
        pos += 1
for i, (pos, size, names, tags) in enumerate(found):
    label = (names.get(4) or names.get(1) or f"font{i}").replace("/", "-").replace(" ", "")
    fn = os.path.join(out, f"{i:02d}-{label}.ttf")
    open(fn, "wb").write(mm[pos: pos + min(size, len(mm) - pos)])
    print(f"{pos:>10} {size:>8}  {names.get(1)!r:28} {names.get(2)!r:12} {names.get(4)!r:30} var={'fvar' in tags}")
