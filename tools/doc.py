# doc.py NAME...: print the doc comment + signature of element methods / decls in gpui-kit.d.ts
import re, sys
src = open(__import__('os').path.expanduser('~/.config/herdr-app/gpui-kit.d.ts')).read().split('\n')
for name in sys.argv[1:]:
    pat = re.compile(r'^\s+(export (function|const|interface|class|type) )?' + re.escape(name) + r'\b[<(:= {]')
    hits = [i for i, l in enumerate(src) if pat.match(l)]
    print(f'=========== {name}: {len(hits)} hit(s)')
    for i in hits[:3]:
        j = i - 1
        while j >= 0 and not src[j].strip().startswith('/**') and (src[j].strip().startswith('*') or src[j].strip() == ''):
            j -= 1
        start = j if src[j].strip().startswith('/**') else i
        k = i
        # print up to the end of the signature (first line ending with ; or {)
        while k < len(src) - 1 and not src[k].rstrip().endswith((';', '{')):
            k += 1
        print('\n'.join(l[:300] for l in src[start:k + 1]))
        print('  ---')
