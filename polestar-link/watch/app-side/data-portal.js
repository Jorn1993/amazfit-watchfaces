// Polestar Data Portal: owner-authorized read-only HTTPS/JSON telemetry.
// These endpoints are distinct from the consumer Polestar-ID/gRPC service.
// No vehicle commands, no logging of credentials or raw account responses.
export const PDP_BASE='https://pc-api.polestar.com/eu-north-1/data-portal/m2m';
const VIN=/^[A-HJ-NPR-Z0-9]{17}$/;
function asJson(reply){
 const value=reply&&reply.body;
 if(value&&typeof value==='object')return value;
 if(typeof value==='string'){try{return JSON.parse(value)}catch(e){}}
 return null;
}
function status(reply){return typeof reply?.status==='number'?reply.status:reply?.statusCode||0;}
function fixedError(stage,reply){
 const body=asJson(reply),code=body?.error?.code;
 return stage+' HTTP '+status(reply)+(typeof code==='string'&&/^[A-Z0-9_]{1,80}$/.test(code)?' '+code:'');
}
export function checkPortalCredentials(x){
 if(!x||typeof x.clientId!=='string'||!x.clientId.trim()||
   typeof x.clientSecret!=='string'||!x.clientSecret.trim()||
   typeof x.accountId!=='string'||!x.accountId.trim())throw Error('Enter all three Data Portal credentials');
 return {clientId:x.clientId.trim(),clientSecret:x.clientSecret.trim(),accountId:x.accountId.trim()};
}
function numeric(v){
 const n=typeof v==='number'?v:typeof v==='string'&&v.trim()!==''?Number(v):NaN;
 return Number.isFinite(n)?n:null;
}
export function batterySummary(envelope,vin){
 const meta=envelope?.meta,data=envelope?.data;
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Battery response has no data');
 const actual=meta?.vin||data.vin;
 if(typeof actual==='string'&&actual.toUpperCase()!==vin)throw Error('Vehicle identity mismatch');
 if(typeof meta?.domain==='string'&&meta.domain!=='battery')throw Error('Vehicle domain mismatch');
 const soc=numeric(data.batteryChargeLevelPercentage);
 if(soc!==null&&(soc<0||soc>100))throw Error('Invalid battery percentage');
 const km=numeric(data.estimatedDistanceToEmptyKm);
 const rawStatus=data.chargingStatusV2||data.chargingStatus;
 const charging=typeof rawStatus==='string'?rawStatus.endsWith('_CHARGING'):null;
 return {
  battery_percent:soc,range_km:km===null?null:Math.round(km),
  charging,charging_status:typeof rawStatus==='string'?rawStatus.slice(0,80):null,
  connected:typeof data.chargerConnectionStatus==='string'?data.chargerConnectionStatus.slice(0,80):null,
  observed_at:typeof data.metaReceivedAt==='string'?data.metaReceivedAt.slice(0,40):null
 };
}
export function makeDataPortalClient(fetchRequest,now=()=>Date.now()){
 let cache=null,expires=0,inFlight=null;
 async function request(url,method='GET',headers={},body){
  return fetchRequest({url,method,headers,...(body===undefined?{}:{body})});
 }
 async function token(credentials){
  const key=credentials.clientId+'|'+credentials.accountId;
  if(cache&&cache.key===key&&now()+300000<expires)return cache.value;
  if(inFlight)return inFlight;
  inFlight=(async()=>{
   const reply=await request(PDP_BASE+'/token','POST',
    {'Content-Type':'application/json','Accept':'application/json'},
    JSON.stringify({clientId:credentials.clientId,clientSecret:credentials.clientSecret,
     scope:'pdp-telemetry/battery'}));
   if(status(reply)!==200)throw Error(fixedError('Data Portal token',reply));
   const data=asJson(reply);
   if(typeof data?.accessToken!=='string'||!data.accessToken)throw Error('Data Portal token response invalid');
   const ttl=numeric(data.expiresIn);
   cache={key,value:data.accessToken};
   expires=now()+Math.max(0,ttl||3600)*1000;
   return cache.value;
  })();
  try{return await inFlight}finally{inFlight=null}
 }
 async function get(credentials,path){
  for(let attempt=0;attempt<2;attempt++){
   const auth=await token(credentials);
   const reply=await request(PDP_BASE+path,'GET',{
    'Accept':'application/json','Authorization':'Bearer '+auth,
    'x-client-id':credentials.accountId
   });
   if(status(reply)===401&&attempt===0){cache=null;continue}
   if(status(reply)!==200)throw Error(fixedError('Data Portal vehicle data',reply));
   return asJson(reply);
  }
  throw Error('Data Portal token expired');
 }
 return {
  reset(){cache=null;expires=0;},
  async vehicles(input){
   const credentials=checkPortalCredentials(input);
   const response=await get(credentials,'/v1/vehicles');
   const list=response?.data;
   if(!Array.isArray(list))throw Error('Data Portal vehicle list unavailable');
   return list.filter(x=>typeof x==='string'&&VIN.test(x.toUpperCase())).map(x=>x.toUpperCase());
  },
  async battery(input,vin){
   const credentials=checkPortalCredentials(input);
   const requested=String(vin||'').trim().toUpperCase();
   if(!VIN.test(requested))throw Error('Vehicle VIN invalid');
   const response=await get(credentials,'/v1/vehicles/'+requested+'/telemetry/battery');
   return batterySummary(response,requested);
  }
 };
}
