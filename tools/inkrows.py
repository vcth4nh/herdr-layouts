# inkrows.py FRAME X0 X1 [Y0 Y1]: bands of rows that hold text between physical x X0..X1, with each
# band's ink extent. Background is each row's most common color, so pills don't count as ink.
import sys, zlib, struct
from collections import Counter
def read(path):
    d = open(path, 'rb').read(); i = 8; idat = b''
    while i < len(d):
        n = struct.unpack('>I', d[i:i+4])[0]; t = d[i+4:i+8]; body = d[i+8:i+8+n]; i += 12 + n
        if t == b'IHDR': w, h, bd, ct = struct.unpack('>IIBB', body[:10])
        elif t == b'IDAT': idat += body
    return w, h, (4 if ct == 6 else 3), zlib.decompress(idat)
def rows(w, h, bpp, raw, last):
    stride = w * bpp; prev = bytearray(stride); pos = 0
    for y in range(last + 1):
        f = raw[pos]; line = bytearray(raw[pos+1:pos+1+stride]); pos += 1 + stride
        if f == 1:
            for x in range(bpp, stride): line[x] = (line[x] + line[x-bpp]) & 255
        elif f == 2:
            for x in range(stride): line[x] = (line[x] + prev[x]) & 255
        elif f == 3:
            for x in range(stride): line[x] = (line[x] + ((line[x-bpp] if x >= bpp else 0) + prev[x]) // 2) & 255
        elif f == 4:
            for x in range(stride):
                a = line[x-bpp] if x >= bpp else 0; b = prev[x]; c = prev[x-bpp] if x >= bpp else 0
                p = a + b - c; pa, pb, pc = abs(p-a), abs(p-b), abs(p-c)
                line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        yield y, line; prev = line
src, X0, X1 = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
Y0 = int(sys.argv[4]) if len(sys.argv) > 4 else 0
w, h, bpp, raw = read(src); Y1 = int(sys.argv[5]) if len(sys.argv) > 5 else h - 1
bands, cur = [], None
for y, line in rows(w, h, bpp, raw, Y1):
    if y < Y0: continue
    px = [bytes(line[x*bpp:x*bpp+3]) for x in range(X0, X1)]
    bg = Counter(px).most_common(1)[0][0]
    ink = [i for i, p in enumerate(px) if sum(abs(p[k] - bg[k]) for k in range(3)) > 60]
    if ink:
        lo, hi = X0 + ink[0], X0 + ink[-1]
        if cur and y - cur[1] <= 2: cur[1] = y; cur[2] = min(cur[2], lo); cur[3] = max(cur[3], hi)
        else:
            cur = [y, y, lo, hi]; bands.append(cur)
for y0, y1, lo, hi in bands:
    if y1 - y0 >= 8: print(f"y {y0:5d}-{y1:5d}  x {lo:4d}-{hi:4d}  ink {(hi-lo+1)/2:6.1f}px logical")
