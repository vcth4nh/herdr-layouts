import json,sys
def lum(h):
    h=h.lstrip('#')[:6]; r,g,b=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    f=lambda c: c/12.92 if c<=0.03928 else ((c+0.055)/1.055)**2.4
    return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)
def cr(a,b):
    la,lb=lum(a),lum(b); hi,lo=max(la,lb),min(la,lb); return (hi+0.05)/(lo+0.05)
t=json.load(open(sys.argv[1])); c=t['colors']
bgs={'background':t['background'],'chrome':c['chrome'],'canvas':c['canvas'],'raised':c['raised'],'selected':c['selected']}
fgs=['foreground','muted','dim','accent','working','blocked','done','idle']
print('%-10s'%'', ' '.join('%9s'%b for b in bgs))
for f in fgs:
    print('%-10s'%f, ' '.join('%9.2f'%cr(c.get(f,t.get(f)),bg) for bg in bgs.values()))
print('ansi on terminal bg:', ' '.join('%d:%.1f'%(i,cr(a,t['background'])) for i,a in enumerate(t['ansi'])))
print('selection vs bg %.2f, fg on selection %.2f'%(cr(t['selection'],t['background']), cr(t['foreground'],t['selection'])))
