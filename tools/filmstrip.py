# filmstrip.py OUT X Y W H FRAME...: the same region of many frames, stacked top to bottom at
# half size, skipping frames whose region is the same as the one before. Prints which were kept.
import sys, zlib, struct
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
def write(path, w, h, pix):
    raw = b''.join(b'\x00' + bytes(r) for r in pix)
    ch = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + ch(b'IDAT', zlib.compress(raw)) + ch(b'IEND', b''))
dst, X, Y, W, H = sys.argv[1], *map(int, sys.argv[2:6]); frames = sys.argv[6:]
out, last, kept = [], None, []
for path in frames:
    try: w, h, bpp, raw = read(path)
    except Exception as e: print("skip", path, e); continue
    strip = []
    for y, line in rows(w, h, bpp, raw, Y + H - 1):
        if y < Y or (y - Y) % 2: continue
        strip.append(b''.join(bytes(line[(X+x)*bpp:(X+x)*bpp+3]) for x in range(0, W, 2)))
    if strip == last: continue
    last = strip; kept.append(path.split('/')[-1])
    out.extend(strip); out.append(b'\x40\x40\x60' * (W // 2))
write(dst, W // 2, len(out), out)
print(dst, W // 2, len(out), "kept", len(kept), "of", len(frames)); print(" ".join(kept))
