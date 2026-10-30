import test from 'node:test';
import assert from 'node:assert/strict';
import {toBase64,fromBase64,grpcWebMessages} from '../app-side/grpc-web-text.js';
import {grpcFrame} from '../app-side/proto.js';

test('gRPC-Web base64 round-trip supports all byte values including zero and 255',()=>{
 const bytes=Uint8Array.from(Array.from({length:256},(_,i)=>i));
 assert.deepEqual(fromBase64(toBase64(bytes)),bytes);
 assert.deepEqual(fromBase64('AA=='),Uint8Array.of(0));
 assert.equal(toBase64(Uint8Array.of()),'');
});
test('gRPC-Web text frames decode binary messages and status trailers',()=>{
 const data=Uint8Array.from([0,1,2,253,254,255]);
 const trailers=Array.from('grpc-status: 0\r\n',ch=>ch.charCodeAt(0));
 const tail=Uint8Array.from([128,0,0,0,trailers.length,...trailers]);
 const body=Uint8Array.from([...grpcFrame(data),...tail]);
 const decoded=grpcWebMessages(toBase64(body));
 assert.deepEqual(decoded.messages,[data]);
 assert.equal(decoded.status,'0');
});
test('gRPC-Web text rejects unsupported frames and nonzero status',()=>{
 const tail=Array.from('grpc-status: 16\r\n',ch=>ch.charCodeAt(0));
 const body=Uint8Array.from([...grpcFrame(Uint8Array.of(5)),128,0,0,0,tail.length,...tail]);
 assert.throws(()=>grpcWebMessages(toBase64(body)),/status 16/);
 assert.throws(()=>grpcWebMessages(toBase64(Uint8Array.of(127,0,0,0,0))),/Unsupported/);
 assert.throws(()=>grpcWebMessages('404 page not found'),/not Base64/);
 assert.throws(()=>grpcWebMessages(''),/not Base64/);
 assert.throws(()=>grpcWebMessages(toBase64(Uint8Array.of(0,0,0,0,10,1))),/Invalid gRPC-Web frame/);
});
