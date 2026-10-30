import test from 'node:test';
import assert from 'node:assert/strict';
import { grpcFrame, grpcPayload, grpcMessages, encodeVin, requestFor, decodeBattery, decodeExterior, decodeInvocation, fields, bytes } from '../app-side/proto.js';

const vin='YSMABCDE0R0000001';
function varint(n) {const a=[]; do{const b=n&127;n=Math.floor(n/128);a.push(n?b|128:b);}while(n);return a;}
function block(id, data){return [id*8+2,...varint(data.length),...data];}
function field(id,n){return [id*8,...varint(n)];}
function double(id,n){const d=new DataView(new ArrayBuffer(8));d.setFloat64(0,n,true);return [id*8+1,...new Uint8Array(d.buffer)];}
function battery(level,range){return Uint8Array.from(block(3,[...double(2,level),...double(4,range),...field(7,1)]));}
function exterior(state){return Uint8Array.from(block(3,[...field(2,state)]));}
function invocation(status){return Uint8Array.from(block(1,[...field(3,status)]));}

test('VIN protobuf and lock envelope use correct fields',()=>{
  assert.equal(encodeVin(vin).length,19);
  const outer=fields(requestFor(vin,true));
  assert.equal(fields(outer[1])[1].length,17);
  const read=fields(requestFor(vin,false,'zepp-test-12345'));
  assert.equal(String.fromCharCode(...read[1]),'zepp-test-12345');
  assert.equal(String.fromCharCode(...read[2]),vin);
  assert.throws(()=>requestFor(vin,false),/request ID required/);
  assert.throws(()=>encodeVin('not-a-vin'),/VIN invalid/);
});
test('gRPC frame round-trip and corrupt frame rejection',()=>{
  const message=battery(68.5,315.7);
  assert.deepEqual(grpcPayload(grpcFrame(message)),message);
  assert.throws(()=>grpcPayload(Uint8Array.of(0,0,0,0,6,1)),/size/);
  assert.throws(()=>grpcPayload(Uint8Array.of(1,0,0,0,0)),/Compressed/);
  assert.throws(()=>bytes(String.fromCharCode(0xfffd)),/corrupted/);
});
test('Battery values decode from Polestar C3 double fields',()=>{
  assert.deepEqual(decodeBattery(battery(68.5,315.7)),{battery_percent:69,range_km:316,charging:true});
  assert.throws(()=>decodeBattery(battery(150,315)),/Invalid battery/);
  assert.throws(()=>decodeBattery(Uint8Array.of(8,1)),/battery data missing/);
});
test('Exterior locked/unlocked decode',()=>{
  assert.equal(decodeExterior(exterior(2)).lock_state,'locked');
  assert.equal(decodeExterior(exterior(1)).lock_state,'unlocked');
  assert.equal(decodeExterior(exterior(0)).lock_state,'unknown');
});
test('Invocation reports success only for Polestar SUCCESS=6',()=>{
  assert.deepEqual(decodeInvocation(invocation(6)).ok,true);
  for(const status of [0,1,2,4,5,7,8,9,10,11,12])assert.equal(decodeInvocation(invocation(status)).ok,false);
  assert.throws(()=>decodeInvocation(Uint8Array.of(8,1)),/No Polestar command response/);
});

test('streamed command responses preserve final success',()=>{
 const stream=Uint8Array.from([...grpcFrame(invocation(1)),...grpcFrame(invocation(4)),...grpcFrame(invocation(6))]);
 const messages=grpcMessages(stream);
 assert.deepEqual(messages.map(m=>decodeInvocation(m).status),[1,4,6]);
 assert.equal(decodeInvocation(messages[messages.length-1]).ok,true);
 assert.throws(()=>grpcMessages(stream.slice(0,-1)),/Truncated/);
});
