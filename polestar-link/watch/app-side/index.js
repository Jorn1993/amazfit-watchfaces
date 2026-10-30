import { BaseSideService } from '@zeppos/zml/base-side';
import { requestFor, grpcFrame, grpcMessages, decodeBattery, decodeExterior, decodeInvocation } from './proto.js';
const store=()=>settings.settingsStorage;
const CLIENT='lp8dyrd_10';
const GQL='https://pc-api.polestar.com/eu-north-1/app-backend/api/graphql';
const enc=encodeURIComponent;
function trace(stage,detail){
 const message=stage+': '+String(detail||'').slice(0,160);
 store().setItem('polestar.log',message);
 if(stage==='AUTH'||stage==='READY'||stage==='ERROR')store().setItem('polestar.login.status',message);
}
function json(r){try{return typeof r.body==='string'?JSON.parse(r.body):r.body;}catch(e){return null;}}
function header(r,key){const h=r.headers||{};return h[key]||h[key.toLowerCase()]||h[key.toUpperCase()]||'';}
function form(obj){return Object.keys(obj).map(k=>enc(k)+'='+enc(obj[k])).join('&');}
async function http(url,method='GET',headers={},body){
 const r=await fetch({url,method,headers,...(body===undefined?{}:{body})});
 if(typeof r.status!=='number'&&typeof r.statusCode==='number')r.status=r.statusCode;
 return r;
}
async function accessToken(){
 const token=store().getItem('polestar.access');
 if(!token)throw Error('Sign in using Zepp first');
 const expires=Number(store().getItem('polestar.expires.at')||0);
 if(!expires||Date.now()<expires)return token;
 const refresh=store().getItem('polestar.refresh');
 const url=store().getItem('polestar.token.endpoint');
 if(!refresh||!url)throw Error('Session expired. Sign in again in Zepp.');
 const r=await http(url,'POST',{'Content-Type':'application/x-www-form-urlencoded'},form({grant_type:'refresh_token',refresh_token:refresh,client_id:CLIENT}));
 const t=json(r);
 if(r.status!==200||!t||!t.access_token)throw Error('Session expired. Sign in again in Zepp.');
 store().setItem('polestar.access',t.access_token);
 store().setItem('polestar.expires.at',String(Date.now()+(Number(t.expires_in)||3600)*1000-60000));
 if(t.refresh_token)store().setItem('polestar.refresh',t.refresh_token);
 return t.access_token;
}
async function vehicles(token){
 const query='query GetVDMSCars { vdms { getVehiclesInformation { vin internalVehicleIdentifier registrationNo modelYear content { model { name } } } } }';
 const r=await http(GQL,'POST',{'Content-Type':'application/json','Accept':'application/json','X-PolestarId-Authorization':'Bearer '+token,'X-APOLLO-OPERATION-NAME':'GetVDMSCars','X-Polestar-Locale':'SE','X-Polestar-Force-Update-Version':'5.11.0','User-Agent':'PolestarApp/5.11.0b1111 Android/14'},JSON.stringify({operationName:'GetVDMSCars',variables:{},query,extensions:{clientLibrary:{name:'apollo-kotlin',version:'4.4.1'}}}));
 const data=json(r);
 if(r.status!==200||!data||data.errors)throw Error('Vehicle discovery HTTP '+r.status);
 const cars=(((data.data||{}).vdms||{}).getVehiclesInformation)||[];
 if(!cars.length)throw Error('No Polestar vehicles found');
 store().setItem('vehicle.vin',cars[0].vin);
 store().setItem('vehicle.name',((cars[0].content||{}).model||{}).name||'Polestar');
 return cars[0];
}
async function endpoint(token){
 const r=await http('https://cnepmob.volvocars.com/','GET',{'Authorization':'Bearer '+token,'Accept':'application/volvo.cloud.cnepmob.v1+json'});
 const data=json(r);if(r.status!==200||!data||!data.c3||!data.c3.grpcHost)throw Error('C3 discovery HTTP '+r.status);
 const host=data.c3.grpcHost;if(!/^[a-z0-9.-]+$/i.test(host))throw Error('Invalid C3 host');
 store().setItem('polestar.c3',host);return host;
}
function grpcStatus(r){
 const h=header(r,'grpc-status');
 if(h!=='' && String(h)!=='0')throw Error('Polestar gRPC status '+h);
}
async function grpc(method,vin){
 const host=store().getItem('polestar.c3'),token=await accessToken();
 if(!host||!vin)throw Error('Connect to your Polestar in Zepp first');
 const isCommand=method==='Lock'||method==='Unlock';
 const request=grpcFrame(requestFor(vin,isCommand));
 const path=method==='GetLatestBattery'?'/services.vehiclestates.battery.BatteryService/GetLatestBattery':
  method==='GetLatestExterior'?'/services.vehiclestates.exterior.ExteriorService/GetLatestExterior':
  '/invocation.InvocationService/'+method;
 // Native Zepp Fetch must preserve the binary body and support HTTP/2 for this call.
 const r=await http('https://'+host+path,'POST',{
  'Content-Type':'application/grpc','TE':'trailers','Authorization':'Bearer '+token,
  'vin':vin,'grpc-accept-encoding':'identity','User-Agent':'grpc-java-okhttp/1.68.2'
 },Array.from(request,b=>String.fromCharCode(b)).join(''));
 if(r.status!==200)throw Error(method+' HTTP '+r.status);
 grpcStatus(r);
 const messages=grpcMessages(r.body);
 return {payload:messages[messages.length-1],messages,complete:header(r,'grpc-status')==='0'};
}
let oauthInFlight=false;
async function processOauthResult(){
 const raw=store().getItem('polestar.oauth.result');
 if(!raw||oauthInFlight)return;
 oauthInFlight=true;
 store().removeItem('polestar.oauth.result');
 try{
  const value=JSON.parse(raw);
  if(!value||!value.access_token||typeof value.access_token!=='string')
   throw Error('Polestar did not return an access token');
  store().setItem('polestar.access',value.access_token);
  store().setItem('polestar.refresh',value.refresh_token||'');
  store().setItem('polestar.expires.at',
    String(Date.now()+(Number(value.expires_in)||3600)*1000-60000));
  store().setItem('polestar.token.endpoint','https://polestarid.eu.polestar.com/as/token.oauth2');
  trace('AUTH','Finding your Polestar');
  const car=await vehicles(value.access_token);
  trace('AUTH','Finding car connection');
  await endpoint(value.access_token);
  trace('READY','Connected: '+(car.content&&car.content.model&&car.content.model.name||'Polestar'));
 }catch(e){
  trace('ERROR',String(e&&e.message||e).slice(0,130));
 }finally{oauthInFlight=false;}
}
function receiveStorageChange({key}={}){
 if(key==='polestar.session.clear'){
  for(const k of ['polestar.access','polestar.refresh','polestar.expires.at',
   'polestar.c3','vehicle.vin','vehicle.name','polestar.oauth.result',
   'polestar.login.request','polestar.login.request.at'])
   store().removeItem(k);
  store().setItem('polestar.login.status','Signed out');
 }else if(key==='polestar.oauth.result'){
  void processOauthResult();
 }
}
AppSideService(BaseSideService({
 onSettingsChange(change){receiveStorageChange(change||{});},
 onInit(){
  // Clear legacy queued passwords from older insecure builds.
  store().removeItem('polestar.login.request');
  store().removeItem('polestar.login.request.at');
  store().setItem('polestar.side.ready',String(Date.now()));
  void processOauthResult();
 },
 onRun(){
  store().setItem('polestar.side.ready',String(Date.now()));
  void processOauthResult();
 },
 async onRequest(req,res){
  try{
   if(req.method==='zepp.ping'){
    res(null,{ok:true,version:'1.3.5-oauth-experimental',auth:!!store().getItem('polestar.access'),pending:!!store().getItem('polestar.login.request'),status:store().getItem('polestar.login.status')||'Not connected'});return;
   }
   const vin=store().getItem('vehicle.vin');
   if(!vin)throw Error('Sign in to your Polestar in Zepp first');
   if(req.method==='vehicle.status'){
    const result=await grpc('GetLatestBattery',vin);
    const data=decodeBattery(result.payload);
    try{
     const ext=await grpc('GetLatestExterior',vin);
     data.lock_state=decodeExterior(ext.payload).lock_state;
    }catch(e){data.lock_state='unknown';}
    res(null,{ok:true,...data});return;
   }
   if(req.method==='vehicle.command'){
    const p=req.params||{};
    if(p.confirmed!==true||!['lock','unlock'].includes(p.action))throw Error('Confirmation required');
    const method=p.action==='lock'?'Lock':'Unlock';
    const result=await grpc(method,vin);
    const invocation=decodeInvocation(result.payload);
    if(!invocation.ok){
     res(null,{ok:false,error:'Polestar '+method+': '+invocation.status_label});return;
    }
    // Polestar's explicit terminal SUCCESS=6 confirms the command, even on
    // Zepp transports that do not expose HTTP/2 gRPC trailing metadata.
    res(null,{ok:true,command:method,status:invocation.status_label});return;
   }
   throw Error('Unknown request');
  }catch(e){res(null,{ok:false,error:String(e.message||e).slice(0,160)});}
 }
}));
