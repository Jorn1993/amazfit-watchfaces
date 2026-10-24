#!/usr/bin/env python3
"""Studio reference geometry gate, using actual round gauge regions."""
import json,math
from pathlib import Path
data=json.loads((Path(__file__).resolve().parents[1]/'studio/target-watchface.json').read_text())
assert data['schemaVersion']==1 and data['canvas']['width']==480
parts=data['elements']
assert len(parts)==9 and len({p['id'] for p in parts})==9
def center(e): return e['x']+e['w']/2,e['y']+e['h']/2
def radius(e): return max(e['w'],e['h'])/2
def bbox(e): return e['x'],e['y'],e['x']+e['w'],e['y']+e['h']
def collision(a,b):
 if a['type']=='gauge' and b['type']=='gauge':
  x,y=center(a);u,v=center(b)
  return math.hypot(x-u,y-v)<radius(a)+radius(b)+2
 if a['type']=='gauge' or b['type']=='gauge':
  disk,rect=(a,b) if a['type']=='gauge' else (b,a)
  x,y=center(disk);l,t,r,d=bbox(rect)
  return math.hypot(x-max(l,min(x,r)),y-max(t,min(y,d)))<radius(disk)+2
 l,t,r,d=bbox(a);u,v,w,z=bbox(b)
 return l<w+2 and u<r+2 and t<z+2 and v<d+2
errors=[]
for p in parts:
 x,y=center(p)
 if p['type']=='gauge':
  if math.hypot(x-240,y-240)+radius(p)>238: errors.append(p['id']+' outside round screen')
 else:
  l,t,r,d=bbox(p)
  if any(math.hypot(px-240,py-240)>238 for px in (l,r) for py in (t,d)):
   errors.append(p['id']+' outside round screen')
for n,a in enumerate(parts):
 for c in parts[n+1:]:
  if collision(a,c): errors.append(a['id']+' overlaps '+c['id'])
if errors: raise SystemExit('\n'.join(errors))
print('PASS Studio reference blueprint: nine components, safe round-screen layout')
