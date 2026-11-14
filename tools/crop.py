# crop.py IN OUT X Y W H [SCALE]: crop a PNG (8-bit RGB/RGBA, non-interlaced) and zoom it.
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
src, dst, X, Y, W, H = sys.argv[1], sys.argv[2], *map(int, sys.argv[3:7]); k = int(sys.argv[7]) if len(sys.argv) > 7 else 1
w, h, bpp, raw = read(src); out = []
for y, line in rows(w, h, bpp, raw, min(h - 1, Y + H - 1)):
    if y < Y: continue
    px = b''.join(bytes(line[(X+x)*bpp:(X+x)*bpp+3]) * k for x in range(W))
    out.extend([px] * k)
write(dst, W * k, len(out), out)
print(dst, W * k, len(out))
