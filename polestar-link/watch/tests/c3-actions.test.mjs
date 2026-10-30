import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeC3Action,c3ControlActions } from '../app-side/c3-actions.js';
import { fields } from '../app-side/proto.js';
const vin='YSMABCDE0R0000001';
const utf8=b=>new TextDecoder().decode(b);
test('C3 action catalogue mirrors the source invocation methods',()=>{
 assert.deepEqual(c3ControlActions(),[
  'lock','unlock','trunk_unlock','flash','honk','honk_flash',
  'windows_open','windows_close','climate_start','climate_stop'
 ]);
});
test('Lock/unlock/trunk unlock match Python InvocationRequest+enum wire schema',()=>{
 for(const [action,method,kind] of [
  ['lock','Lock',0],['unlock','Unlock',0],['trunk_unlock','Unlock',1]]){
  const req=encodeC3Action(vin,action);
  assert.equal(req.path,'/invocation.InvocationService/'+method);
  assert.equal(req.mode,'server-stream');
  const outer=fields(req.payload),nested=fields(outer[1]);
  assert.equal(utf8(nested[1]),vin);
  assert.equal(outer[2]||0,kind);
 }
});
test('Honk/flash and windows use C3 enum field two',()=>{
 const types={honk_flash:['HonkFlash',0],honk:['HonkFlash',1],
  flash:['HonkFlash',2],windows_open:['WindowControl',1],windows_close:['WindowControl',2]};
 for(const [action,[method,kind]] of Object.entries(types)){
  const decoded=fields(encodeC3Action(vin,action).payload);
  assert.equal(decoded[2]||0,kind);
  assert.equal(encodeC3Action(vin,action).method,method);
 }
});
test('Climate start/stop match source field numbers and validate cabin temperature',()=>{
 const start=fields(encodeC3Action(vin,'climate_start',{temperature:21.5}).payload);
 assert.equal(start[2],1);
 assert.equal(start[3],21.5);
 assert.equal(encodeC3Action(vin,'climate_stop').method,'ClimatizationStop');
 const stop=fields(encodeC3Action(vin,'climate_stop').payload);
 assert.equal(stop[2],undefined);
 assert.throws(()=>encodeC3Action(vin,'climate_start',{temperature:100}),/temperature/);
});
test('Unknown commands and VINs fail without creating requests',()=>{
 assert.throws(()=>encodeC3Action(vin,'engine_start'),/Unsupported C3/);
 assert.throws(()=>encodeC3Action('123','unlock'),/Invalid C3 VIN/);
});
