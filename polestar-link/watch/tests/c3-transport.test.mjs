import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeC3Response,summarizeC3Error} from '../app-side/c3-transport.js';

test('C3 transport summary records only safe metadata, not binary response or tokens',()=>{
 const data=Uint8Array.of(0,0,0,0,1,255);
 const report=summarizeC3Response({status:200,headers:{'Content-Type':'application/grpc+proto'},
  body:data});
 assert.deepEqual(report,{http:200,shape:'typed-array',
  content_type:'application/grpc+proto',length:6,utf8_replacement:0,non_latin1:0});
 assert.equal(JSON.stringify(report).includes('255'),false);
});
test('Corrupted Unicode reply is reported without exposing response body',()=>{
 const s=summarizeC3Response({status:200,body:'\\ufffd'.replace('\\ufffd','\ufffd')});
 assert.equal(s.shape,'string');assert.equal(s.utf8_replacement,1);
 assert.equal('body' in s,false);
});
test('String errors are mapped to fixed diagnostic labels only',()=>{
 assert.equal(summarizeC3Error(new Error('token secret may be present in network error')),
  'transport_error');
 assert.equal(summarizeC3Error(new Error('Unsupported ArrayBuffer request body')),
  'binary_body_rejected');
 assert.doesNotMatch(summarizeC3Error(new Error('my-password')),/password/);
});
