#!/usr/bin/env python3
"""Fail the Zepp build when icon, value, or caption escapes any round gauge."""
import json,math
from pathlib import Path
root=Path(__file__).resolve().parents[1]
layout_file=root/'faces/sextant/watchface/layout.generated.js'
layout=json.loads(layout_file.read_text().split('export const LAYOUT = ',1)[1].rsplit(';',1)[0])
design=json.loads((root/'studio/target-watchface.json').read_text())
parts={e['id']:e for e in design['elements']}
order=('steps','calories','battery','weather','distance','heart')
errors=[]
def inside(rect,cx,cy,r):
 x,y,w,h=rect
 return all(math.hypot(px-cx,py-cy)<=r+0.1 for px in (x,x+w) for py in (y,y+h))
for idx,name in enumerate(order):
 p=parts[name];slot=layout['slots'][idx]
 cx=p['x']+p['w']/2;cy=p['y']+p['h']/2
 radius=min(p['w'],p['h'])/2-6
 if abs(slot['cx']-cx)>1:errors.append(name+': wrong horizontal center')
 icon=slot['icon'];val=slot['value']
 boxes={
  'icon':(icon['x'],icon['y'],icon['size'],icon['size']),
  'value':(val['x'],val['y'],val['w'],val['h']),
  'caption':(cx-24,p['y']+67,48,13)
 }
 for kind,rect in boxes.items():
  if not inside(rect,cx,cy,radius):
   errors.append(name+': '+kind+' escapes circular safe interior: '+str(rect))
 if boxes['icon'][1]+boxes['icon'][3]>boxes['value'][1]+2:
  errors.append(name+': icon collides with value')
 if boxes['value'][1]+boxes['value'][3]>boxes['caption'][1]+2:
  errors.append(name+': value collides with caption')
 if abs(icon['y']+icon['size']/2-(p['y']+23))>1:
  errors.append(name+': icon is not correctly centered in internal layout')
 if abs(val['x']+val['w']/2-cx)>1:
  errors.append(name+': value not horizontally centered')
clock=layout['time']
if clock['hour_x']<45 or clock['minute_x']>420:
 errors.append('clock is outside central panel')
if not (160<=clock['y'] and clock['y']+clock['cell_h']<=323):
 errors.append('clock clips vertical panel')
if len(layout['slots'])!=6:errors.append('wrong slot count')
if errors:raise SystemExit('ROUND GAUGE VALIDATION FAILED:\n'+'\n'.join(errors))
print('PASS: six native circular gauges — icons, values, captions inside their safe interiors')
