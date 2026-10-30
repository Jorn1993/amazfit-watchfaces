import test from 'node:test';
import assert from 'node:assert/strict';
import {PDP_BASE,makeDataPortalClient,batterySummary,checkPortalCredentials} from '../app-side/data-portal.js';
const VIN='YSMABCDE0R0000001';
const credentials={clientId:'only-test-id',clientSecret:'only-test-secret',accountId:'only-test-account'};
const battery={data:{vin:VIN,batteryChargeLevelPercentage:77,estimatedDistanceToEmptyKm:342.2,
 chargingStatusV2:'CHARGING_STATUS_V2_IDLE',metaReceivedAt:'2026-10-30T12:30:00Z'},
 meta:{vin:VIN,domain:'battery'}};
test('read-only JSON token, list, and battery API use correct credentials and never call vehicle commands',async()=>{
 const calls=[];let ticks=Date.now();
 const mock=async({url,method,headers,body})=>{
  calls.push({url,method,headers,body});
  if(url===PDP_BASE+'/token'){
   assert.equal(method,'POST');
   assert.deepEqual(JSON.parse(body),{clientId:credentials.clientId,clientSecret:credentials.clientSecret,scope:'pdp-telemetry/battery'});
   return {status:200,body:{accessToken:'mock-access',expiresIn:3600}};
  }
  assert.equal(method,'GET');
  assert.equal(headers['x-client-id'],credentials.accountId);
  assert.equal(headers.Authorization,'Bearer mock-access');
  if(url.endsWith('/v1/vehicles'))return {status:200,body:{data:[VIN]}};
  if(url.endsWith('/telemetry/battery'))return {status:200,body:battery};
  throw Error('Unexpected request');
 };
 const client=makeDataPortalClient(mock,()=>ticks);
 assert.deepEqual(await client.vehicles(credentials),[VIN]);
 const status=await client.battery(credentials,VIN);
 assert.deepEqual(status,{battery_percent:77,range_km:342,charging:false,
  charging_status:'CHARGING_STATUS_V2_IDLE',connected:null,observed_at:'2026-10-30T12:30:00Z'});
 assert.equal(calls.length,3);
 assert.equal(calls.filter(c=>c.url.endsWith('/token')).length,1);
 assert.equal(calls.some(c=>/Lock|Unlock|invocation|grpc/.test(c.url)),false);
});
test('does not present another vehicle as yours, or guess missing battery data',()=>{
 assert.throws(()=>batterySummary({...battery,meta:{vin:'YSMOTHER0R0000001',domain:'battery'}},VIN),
  /identity mismatch/);
 const reading=batterySummary({meta:{vin:VIN,domain:'battery'},data:{vin:VIN,chargingStatusV2:'CHARGING_STATUS_V2_IDLE'}},VIN);
 assert.equal(reading.battery_percent,null);
 assert.equal(reading.range_km,null);
 assert.equal(reading.charging,false);
});
test('rejects missing credentials and only accepts real VIN shape',async()=>{
 assert.throws(()=>checkPortalCredentials({...credentials,clientSecret:''}),/three/);
 const client=makeDataPortalClient(async()=>{throw Error('No calls expected')});
 await assert.rejects(client.battery(credentials,'BADVIN'),/VIN invalid/);
});
test('token error strips secret, invalidates on 401, caches within token TTL',async()=>{
 let tokenCalls=0;
 const mock=async({url})=>{
  if(url.endsWith('/token')){tokenCalls++;return{status:200,body:{accessToken:'mock-'+tokenCalls,expiresIn:3600}}}
  if(url.endsWith('/v1/vehicles'))return tokenCalls<2?
    {status:401,body:{error:{code:'UNAUTHORIZED',message:'sensitive'}}}:
    {status:200,body:{data:[VIN]}};
  throw Error('Unexpected request');
 };
 const client=makeDataPortalClient(mock);
 assert.deepEqual(await client.vehicles(credentials),[VIN]);
 assert.equal(tokenCalls,2);
 assert.deepEqual(await client.vehicles(credentials),[VIN]);
 assert.equal(tokenCalls,2);
});
test('failed token exchange never leaks the secret into errors',async()=>{
 const client=makeDataPortalClient(async()=>({status:403,body:{error:{code:'INVALID_CLIENT',message:credentials.clientSecret}}}));
 await assert.rejects(client.vehicles(credentials),e=>{
  assert.match(e.message,/Data Portal token HTTP 403 INVALID_CLIENT/);
  assert.doesNotMatch(e.message,/only-test-secret/);
  return true;
 });
});
