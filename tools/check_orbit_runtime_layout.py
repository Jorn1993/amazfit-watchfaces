#!/usr/bin/env python3
"""Compare generated Zepp widget geometry to WatchWit Studio reference JSON."""
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
file=root/'faces/sextant/watchface/layout.generated.js'
src=file.read_text().split('export const LAYOUT = ',1)[1].rsplit(';',1)[0]
layout=json.loads(src)
blueprint=json.loads((root/'studio/target-watchface.json').read_text())
parts={e['id']:e for e in blueprint['elements']}
order=['steps','calories','battery','weather','distance','heart']
errors=[]
for idx,name in enumerate(order):
 p=parts[name];slot=layout['slots'][idx]
 cx=p['x']+p['w']/2
 if abs(slot['cx']-cx)>1: errors.append(name+' wrong horizontal center')
 icon=slot['icon'];v=slot['value']
 if not (p['x']-3<=icon['x']<=p['x']+p['w'] and p['x']-3<=v['x']<=p['x']+p['w']):
  errors.append(name+' x placement outside gauge')
 if icon['y']+icon['size']>v['y']+3:
  errors.append(name+' icon collides with value')
 if v['y']+v['h']>(143 if idx in (0,1,5) else 405):
  errors.append(name+' value overlaps caption')
 if abs((icon['y']+icon['size']/2)-(p['y']+20))>2:
  errors.append(name+' icon not aligned to reference')
clock=layout['time']
if clock['hour_x']<55 or clock['minute_x']>410:
 errors.append('hero clock does not fit horizontal panel')
if not (166<=clock['y'] and clock['y']+clock['cell_h']<=323):
 errors.append('hero clock clips its central panel')
if len(layout['slots'])!=6: errors.append('wrong slot count')
if errors: raise SystemExit('REFERENCE RUNTIME LAYOUT FAILURE:\n'+'\n'.join(errors))
print('PASS: Studio data and generated Zepp glyph/icon positions agree')
