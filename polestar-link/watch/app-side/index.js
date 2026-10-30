import { BaseSideService } from '@zeppos/zml/base-side';
import { authenticatePolestar } from './oidc.js';
import { encodeC3Action } from './c3-actions.js';
import { toBase64, grpcWebMessages } from './grpc-web-text.js';
import { requestFor, grpcFrame, grpcMessages, decodeBattery, decodeExterior, decodeInvocation, decodeMyCars } from './proto.js';
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
function header(r,key){
 const h=r.headers||{};
 if(typeof h.get==='function')return h.get(key)||'';
 const target=String(key).toLowerCase();
 for(const k of Object.keys(h))if(k.toLowerCase()===target)return h[k]||'';
 return '';
}
function form(obj){return Object.keys(obj).map(k=>enc(k)+'='+enc(obj[k])).join('&');}
async function http(url,method='GET',headers={},body){
 const r=await fetch({url,method,headers,...(body===undefined?{}:{body})});
 if(typeof r.status!=='number'&&typeof r.statusCode==='number')r.status=r.statusCode;
 return r;
}
// Anonymous compatibility test: does Zepp Fetch preserve the OIDC login page
// and expose a usable session cookie? Never sends credentials or stores tokens.
async function authorizationPreflight(){
 const base='https://polestarid.eu.polestar.com';
 const configResponse=await http(base+'/.well-known/openid-configuration');
 const config=json(configResponse);
 if(configResponse.status!==200||!config||typeof config.authorization_endpoint!=='string')
  throw Error('OIDC discovery failed HTTP '+configResponse.status);
 const endpoint=config.authorization_endpoint;
 if(!endpoint.startsWith(base+'/'))throw Error('Unexpected OIDC authorization origin');
 // This challenge is for a diagnostic request only; it will not be exchanged.
 const params={
  response_type:'code',client_id:CLIENT,
  redirect_uri:'polestar-explore://explore.polestar.com',
  scope:'openid profile email customer:attributes customer:attributes:write',
  state:'zepp-compatibility-test-not-a-login',
  code_challenge:'8kAtgaHv_r1h9t3FZ71Nq4B74l-FWqG5GAZlJC8vlss',
  code_challenge_method:'S256',response_mode:'query'
 };
 const url=endpoint+'?'+form(params);
 const r=await http(url);
 const body=typeof r.body==='string'?r.body:'';
 // Report *only* booleans and status. Never return raw HTML, cookies or URLs.
 const rawCookie=header(r,'set-cookie');
 const hasCookie=!!rawCookie;
 const resume=/(?:url|action)\s*:\s*["'][^"']+["']/.test(body);
 return {
  discovery_http:configResponse.status,
  auth_http:r.status,
  login_page:resume,
  cookie_accessible:hasCookie,
  redirect_status:r.status>=300&&r.status<400,
  binary_transport:'not tested',
  pkce_secure_crypto:typeof crypto!=='undefined' && !!crypto &&
    typeof crypto.getRandomValues==='function' && !!crypto.subtle &&
    typeof crypto.subtle.digest==='function'
 };
}
// Credential-free gRPC network feasibility test. Sends an empty protobuf frame
// without a VIN, access token or vehicle action. UNAUTHENTICATED is expected;
// the result says only whether Zepp can reach the C3 service over its HTTP stack.
async function grpcTransportPreflight(){
 const discovery=await http('https://cnepmob.volvocars.com/','GET',{
   Accept:'application/volvo.cloud.cnepmob.v1+json'
 });
 const info=json(discovery);
 if(discovery.status!==200||!info||!info.c3||!info.c3.grpcHost)
  throw Error('C3 discovery HTTP '+discovery.status);
 const host=info.c3.grpcHost;
 if(!/^[a-z0-9.-]+$/i.test(host))throw Error('Invalid C3 host');
 try{
  const r=await http('https://'+host+'/services.vehiclestates.battery.BatteryService/GetLatestBattery','POST',{
   'Content-Type':'application/grpc',
   'TE':'trailers',
   'grpc-accept-encoding':'identity'
  },String.fromCharCode(0,0,0,0,0));
  return {
   discovery_http:discovery.status,
   grpc_http:r.status,
   grpc_status:String(header(r,'grpc-status')||'unavailable').slice(0,15),
   grpc_content_type:String(header(r,'content-type')||'not exposed').split(';')[0].slice(0,40),
   grpc_body_type:ArrayBuffer.isView(r.body)?'bytes':
     r.body instanceof ArrayBuffer?'arraybuffer':typeof r.body,
   grpc_binary_readable:r.body instanceof ArrayBuffer||ArrayBuffer.isView(r.body),
   // Anonymous HTTP replies never prove HTTP/2 gRPC trailers or streaming.
   grpc_verified:false,
   // HTTP 401/403 or gRPC status 16 is a legitimate unauthenticated result.
   grpc_reached:r.status===401||r.status===403||
      (r.status===200&&/grpc/i.test(String(header(r,'content-type'))))
  };
 }catch(e){
  return {discovery_http:discovery.status,grpc_reached:false,grpc_verified:false,
    error:String(e&&e.message||e).slice(0,100)};
 }
}
// Credential-free header test: send only a FIXED, harmless dummy cookie
// to a public echo service. Never send real Polestar credentials to it.
async function syntheticCookiePreflight(){
 const marker='zepp_probe_only',value='harmless';
 const r=await http('https://httpbin.org/cookies','GET',{
  'Cookie':marker+'='+value,
  'Accept':'application/json',
  'Cache-Control':'no-store'
 });
 const body=json(r);
 return {cookie_echo_http:r.status,
  cookie_header_forwarded:r.status===200 && !!body &&
   !!body.cookies && body.cookies[marker]===value};
}
let loginProbeInFlight=false;
async function processLoginTransportProbe(){
 const s=store(),request=s.getItem('polestar.login.probe.request');
 if(!request||loginProbeInFlight)return;
 loginProbeInFlight=true;
 s.removeItem('polestar.login.probe.request');
 s.setItem('polestar.login.probe.status','Checking dummy cookie forwarding…');
 const result={cookie_echo_http:null,cookie_header_forwarded:false,
  cookie_echo_error:false};
 try{
  const probe=await syntheticCookiePreflight();
  result.cookie_echo_http=probe.cookie_echo_http;
  result.cookie_header_forwarded=probe.cookie_header_forwarded;
 }catch(e){result.cookie_echo_error=true;}
 finally{
  s.setItem('polestar.login.probe.result',JSON.stringify(result));
  s.setItem('polestar.login.probe.status','Login transport check completed.');
  loginProbeInFlight=false;
 }
}
async function accessToken(){
 const token=store().getItem('polestar.access');
 if(!token)throw Error('Sign in using Zepp first');
 const expires=Number(store().getItem('polestar.expires.at')||0);
 if(!expires)throw Error('Session expiry missing. Sign in again in Zepp.');
 if(Date.now()<expires)return token;
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
// The current mobile GraphQL list can be empty even while MyStar lists cars.
// Query both authenticated APIs. Store *only* HTTP status and vehicle counts
// in diagnostics: never serialize VINs, OAuth tokens, or response bodies.
async function vehicles(token){
 const report={mobile_http:null,mobile_count:0,mobile_shape:'unknown',
  consumer_v2_http:null,consumer_v2_count:0,consumer_v2_shape:'unknown',
  consumer_v2_raw_http:null,c3_http:null,c3_count:0,c3_shape:'not_tested'};
 store().setItem('polestar.vehicle.lookup',JSON.stringify(report));
 let cars=[];
 try{
  const query='query GetVDMSCars { vdms { getVehiclesInformation { vin internalVehicleIdentifier registrationNo modelYear content { model { name } } } } }';
  const r=await http(GQL,'POST',{
   'Content-Type':'application/json',
   'Accept':'application/json',
   'X-PolestarId-Authorization':'Bearer '+token,
   'X-APOLLO-OPERATION-NAME':'GetVDMSCars',
   'X-Polestar-Locale':'SE',
   'X-Polestar-Force-Update-Version':'5.11.0',
   'User-Agent':'PolestarApp/5.11.0b1111 Android/14'
  },JSON.stringify({operationName:'GetVDMSCars',variables:{},query,
    extensions:{clientLibrary:{name:'apollo-kotlin',version:'4.4.1'}}}));
  report.mobile_http=r.status;
  const payload=json(r);
  const list=payload&&payload.data&&payload.data.vdms&&
    payload.data.vdms.getVehiclesInformation;
  report.mobile_shape=Array.isArray(list)?'array':payload&&payload.errors?'graphql_error':'missing_list';
  if(r.status===200&&Array.isArray(list)){
   cars=list.filter(car=>car&&typeof car.vin==='string'&&car.vin.length>=11);
   report.mobile_count=cars.length;
  }
 }catch(e){report.mobile_shape='network_error';}
 store().setItem('polestar.vehicle.lookup',JSON.stringify(report));
 if(!cars.length){
  // Polestar MyStar V2 account API, used by pypolestar/pypolestar.
  try{
   const query='query GetConsumerCarsV2 { getConsumerCarsV2 { vin internalVehicleIdentifier registrationNo modelYear modelName pno34 structureWeek } }';
   const r=await http('https://pc-api.polestar.com/eu-north-1/mystar-v2/','POST',{
    'Content-Type':'application/json','Accept':'application/json',
    'Authorization':'Bearer '+token
   },JSON.stringify({operationName:'GetConsumerCarsV2',variables:{},query}));
   report.consumer_v2_http=r.status;
   const data=json(r);
   const list=data&&data.data&&data.data.getConsumerCarsV2;
   report.consumer_v2_shape=Array.isArray(list)?'array':data&&data.errors?'graphql_error':'missing_list';
   if(r.status===200&&Array.isArray(list)){
    cars=list.filter(car=>car&&typeof car.vin==='string'&&car.vin.length>=11)
      .map(car=>({vin:car.vin,content:{model:{name:car.modelName||'Polestar'}}}));
    report.consumer_v2_count=cars.length;
   }
  }catch(e){report.consumer_v2_shape='network_error';}
 }
 // Some legacy MyStar clients send the access token without "Bearer ".
 // Try this form only when the authenticated V2 request explicitly returned
 // 401. Both requests remain on Polestar's own HTTPS endpoint.
 if(!cars.length&&report.consumer_v2_http===401){
  try{
   const query='query GetConsumerCarsV2 { getConsumerCarsV2 { vin modelYear modelName } }';
   const r=await http('https://pc-api.polestar.com/eu-north-1/mystar-v2/','POST',{
    'Content-Type':'application/json','Accept':'application/json',
    'Authorization':token
   },JSON.stringify({operationName:'GetConsumerCarsV2',variables:{},query}));
   report.consumer_v2_raw_http=r.status;
   const data=json(r),list=data&&data.data&&data.data.getConsumerCarsV2;
   if(r.status===200&&Array.isArray(list)){
    cars=list.filter(car=>car&&/^[A-HJ-NPR-Z0-9]{17}$/i.test(car.vin||''))
     .map(car=>({vin:car.vin.toUpperCase(),content:{model:{name:car.modelName||'Polestar'}}}));
    report.consumer_v2_count=cars.length;
    report.consumer_v2_shape='array';
   }
  }catch(e){}
 }
 // C3's read-only GetMyCars works for some linked/guest accounts whose
 // GraphQL listings are empty. Requires authentic gRPC binary response; if
 // Zepp Fetch strips binary, leave diagnostics and do not claim discovery.
 if(!cars.length){
  try{
   const auth={'Authorization':'Bearer '+token,
    'Accept':'application/volvo.cloud.cnepmob.v1+json'};
   const discovery=await http('https://cnepmob.volvocars.com/','GET',auth);
   const data=json(discovery),host=data&&data.c3&&data.c3.grpcHost;
   if(discovery.status!==200||typeof host!=='string'||!/^[a-z0-9.-]+$/i.test(host))
    throw Error('c3_unavailable');
   const res=await http('https://'+host+'/car_information.CarInformation/GetMyCars','POST',{
     'Content-Type':'application/grpc','TE':'trailers',
     'Authorization':'Bearer '+token,'grpc-accept-encoding':'identity'
   },String.fromCharCode(0,0,0,0,0));
   report.c3_http=res.status;
   if(res.status===200){
    const messages=grpcMessages(res.body);
    cars=decodeMyCars(messages[messages.length-1]);
    report.c3_count=cars.length;
    report.c3_shape='binary_decoded';
   }else report.c3_shape='http_error';
  }catch(e){
   report.c3_shape='transport_unavailable';
  }
 }
 store().setItem('polestar.vehicle.lookup',JSON.stringify(report));
 if(!cars.length)throw Error('No cars listed. Enter your vehicle VIN or retry lookup.');
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
async function grpc(method,vin,options={}){
 const host=store().getItem('polestar.c3'),token=await accessToken();
 if(!host||!vin)throw Error('Connect to your Polestar in Zepp first');
 const controlMethods={
  Lock:'lock',Unlock:'unlock',TrunkUnlock:'trunk_unlock',
  Flash:'flash',Honk:'honk',HonkFlash:'honk_flash',
  WindowsOpen:'windows_open',WindowsClose:'windows_close',
  ClimateStart:'climate_start',ClimateStop:'climate_stop'
 };
 const command=controlMethods[method]||null;
 const requestId='zepp-'+Date.now().toString(36)+'-'+Math.floor(Math.random()*0x100000000).toString(36);
 const invocation=command?encodeC3Action(vin,command,options):null;
 const request=grpcFrame(invocation?invocation.payload:requestFor(vin,false,requestId));
 const path=invocation?invocation.path:
  method==='GetLatestBattery'?'/services.vehiclestates.battery.BatteryService/GetLatestBattery':
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
// Read-only alternative to native gRPC. Never perform lock/unlock as part of
// this diagnostic. Works only if the Polestar C3 host supports gRPC-Web-text.
async function testWebTextTransport(vin){
 const s=store(),result={tested:true,http:null,content_type:'not exposed',
  response_type:'not received',result:'not_supported',battery_percent:null};
 const host=s.getItem('polestar.c3');
 try{
  if(!host||!/^[a-z0-9.-]+$/i.test(host))throw Error('C3 host unavailable');
  const token=await accessToken();
  const requestId='zepp-test-'+Date.now().toString(36);
  const request=grpcFrame(requestFor(vin,false,requestId));
  const url='https://'+host+'/services.vehiclestates.battery.BatteryService/GetLatestBattery';
  const response=await http(url,'POST',{
   'Content-Type':'application/grpc-web-text+proto',
   'Accept':'application/grpc-web-text',
   'X-Grpc-Web':'1',
   'X-User-Agent':'grpc-web-javascript/0.1',
   'Authorization':'Bearer '+token,
   'vin':vin
  },toBase64(request));
  result.http=response.status;
  result.content_type=String(header(response,'content-type')||'not exposed').slice(0,50);
  result.response_type=ArrayBuffer.isView(response.body)?'bytes':
    response.body instanceof ArrayBuffer?'arraybuffer':typeof response.body;
  if(response.status!==200){result.result='http_error';return result;}
  if(typeof response.body!=='string'){result.result='not_text';return result;}
  if(!/grpc-web-text/i.test(result.content_type)){
   result.result='not_grpc_web';return result;
  }
  const decoded=grpcWebMessages(response.body);
  const battery=decodeBattery(decoded.messages[decoded.messages.length-1]);
  result.result='battery_verified';
  result.battery_percent=battery.battery_percent;
 }catch(e){
  // Only fixed, non-secret diagnostics; never serialize response payloads.
  const msg=String(e&&e.message||'');
  result.result=/Base64/.test(msg)?'not_base64':
    /frame|compressed|data frames/.test(msg)?'invalid_frames':
    /battery/.test(msg)?'invalid_battery':'transport_error';
 }
 return result;
}
let probeInFlight=false;
async function processConnectionProbe(){
 const request=store().getItem('polestar.probe.request');
 if(!request||probeInFlight)return;
 probeInFlight=true;
 store().removeItem('polestar.probe.request');
 const result={auth_http:null,login_page:false,cookie_accessible:false,
  pkce_secure_crypto:false,grpc_http:null,grpc_reached:false,grpc_verified:false,
  grpc_body_type:'not tested',grpc_binary_readable:false,
  auth_error:'',grpc_error:''};
 try{
  store().setItem('polestar.probe.status','Checking Polestar login session…');
  try{
   const a=await authorizationPreflight();
   result.auth_http=a.auth_http;
   result.login_page=a.login_page;
   result.cookie_accessible=a.cookie_accessible;
   result.pkce_secure_crypto=a.pkce_secure_crypto;
  }catch(e){result.auth_error=String(e&&e.message||e).slice(0,100);}
  store().setItem('polestar.probe.status','Checking Polestar vehicle API…');
  try{
   const g=await grpcTransportPreflight();
   result.grpc_http=g.grpc_http||null;
   result.grpc_reached=!!g.grpc_reached;
   result.grpc_verified=!!g.grpc_verified;
   result.grpc_body_type=g.grpc_body_type||'not available';
   result.grpc_binary_readable=!!g.grpc_binary_readable;
   result.grpc_error=g.error||'';
  }catch(e){result.grpc_error=String(e&&e.message||e).slice(0,100);}
  store().setItem('polestar.probe.result',JSON.stringify(result));
  store().setItem('polestar.probe.status','Polestar compatibility test completed.');
 }finally{probeInFlight=false;}
}
let loginInFlight=false;
async function processDirectLogin(){
 const s=store(),raw=s.getItem('polestar.login.request');
 if(!raw || loginInFlight)return;
 loginInFlight=true;
 s.removeItem('polestar.login.request');
 const started=Number(s.getItem('polestar.login.request.at')||0);
 s.removeItem('polestar.login.request.at');
 try{
  if(!started || started>Date.now()+30000 || Date.now()-started>120000)
   throw Error('Login request expired');
  const {email,password}=JSON.parse(raw);
  trace('AUTH','Signing in to Polestar ID');
  const tokens=await authenticatePolestar(email,password,http,crypto);
  s.setItem('polestar.oauth.result.at',String(Date.now()));
  s.setItem('polestar.oauth.result',JSON.stringify(tokens));
  await processOauthResult();
 }catch(e){
  trace('ERROR',String(e&&e.message||'Login failed').slice(0,110));
 }finally{loginInFlight=false;}
}
let vehicleDiscoveryInFlight=false;
async function retryVehicleDiscovery(){
 if(vehicleDiscoveryInFlight||!store().getItem('polestar.access'))return;
 vehicleDiscoveryInFlight=true;
 try{
  trace('AUTH','Looking up linked cars using mobile and MyStar V2 APIs');
  const token=await accessToken();
  const car=await vehicles(token);
  await endpoint(token);
  store().removeItem('vehicle.verified');
  store().setItem('vehicle.source','account_lookup');
  trace('READY','Connected: '+(car.content&&car.content.model&&car.content.model.name||'Polestar'));
 }catch(e){
  store().removeItem('vehicle.vin');
  store().removeItem('vehicle.name');
  store().removeItem('polestar.c3');
  trace('AUTH','Account signed in. Vehicle lookup: '+String(e&&e.message||e).slice(0,100));
 }finally{vehicleDiscoveryInFlight=false;}
}
let manualVehicleInFlight=false;
async function connectManualVin(){
 const s=store(),vin=String(s.getItem('polestar.manual.vin.request')||'').trim().toUpperCase();
 if(!vin||manualVehicleInFlight)return;
 s.removeItem('polestar.manual.vin.request');
 manualVehicleInFlight=true;
 s.removeItem('polestar.webtext.probe');
 s.setItem('polestar.vehicle.verify.status','testing_native');
 try{
  if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin))throw Error('Enter a valid 17-character VIN');
  const token=await accessToken();
  const host=await endpoint(token);
  if(!host)throw Error('Vehicle cloud unavailable');
  s.setItem('vehicle.vin',vin);
  s.setItem('vehicle.name','Polestar 4');
  s.setItem('vehicle.source','manual');
  s.removeItem('vehicle.verified');
  // Prove VIN+token+binary C3 status before enabling commands.
  try{
   const result=await grpc('GetLatestBattery',vin);
   if(!result.complete)throw Error('Native gRPC completion could not be verified');
   decodeBattery(result.payload);
   s.setItem('vehicle.verified','true');
   s.setItem('polestar.vehicle.verify.status','native_verified');
   trace('READY','Polestar 4 verified via live battery status');
  }catch(e){
   s.setItem('polestar.vehicle.verify.status','testing_text');
   const result=await testWebTextTransport(vin);
   s.setItem('polestar.webtext.probe',JSON.stringify(result));
   s.setItem('polestar.vehicle.verify.status','text_'+result.result);
   trace('AUTH',result.result==='battery_verified'?
    'Car battery response verified with gRPC-Web text (commands still disabled)':
    'Car configured. Native binary unavailable; text transport '+
     (result.http===null?'not reached':'HTTP '+result.http+' ('+result.result+')'));
  }
 }catch(e){
  trace('ERROR',String(e&&e.message||e).slice(0,90));
  s.setItem('polestar.vehicle.verify.status','failed');
 }finally{manualVehicleInFlight=false;}
}
let statusVerificationInFlight=false;
async function verifyVehicleStatus(){
 const s=store(),vin=s.getItem('vehicle.vin');
 if(statusVerificationInFlight||!vin)return;
 statusVerificationInFlight=true;
 s.removeItem('polestar.vehicle.verify.request');
 s.removeItem('polestar.webtext.probe');
 s.setItem('polestar.vehicle.verify.status','testing_native');
 try{
  const result=await grpc('GetLatestBattery',vin);
  if(!result.complete)throw Error('Native gRPC completion could not be verified');
  decodeBattery(result.payload);
  s.setItem('vehicle.verified','true');
  s.setItem('polestar.vehicle.verify.status','native_verified');
  trace('READY','Polestar 4 connection verified');
 }catch(e){
  s.removeItem('vehicle.verified');
  s.setItem('polestar.vehicle.verify.status','testing_text');
  const test=await testWebTextTransport(vin);
  s.setItem('polestar.webtext.probe',JSON.stringify(test));
  s.setItem('polestar.vehicle.verify.status','text_'+test.result);
  if(test.result==='battery_verified'){
   // The text path proves only a read-only status response. The native
   // command transport and stream/trailers remain unverified.
   trace('AUTH','Battery '+test.battery_percent+'% via gRPC-Web text. Lock/unlock unverified.');
  }else{
   trace('AUTH','Live status blocked by Zepp binary transport. Text alternative: '+
    (test.http===null?'unavailable':'HTTP '+test.http+' ('+test.result+')'));
  }
 }finally{
  statusVerificationInFlight=false;
  // A manual retry may arrive during an earlier in-flight verification.
  // Finish the current call first, then process the queued request once.
  if(s.getItem('polestar.vehicle.verify.request'))
   void verifyVehicleStatus();
 }
}
let oauthInFlight=false;
async function processOauthResult(){
 const raw=store().getItem('polestar.oauth.result');
 if(!raw||oauthInFlight)return;
 oauthInFlight=true;
 store().removeItem('polestar.oauth.result');
 const started=Number(store().getItem('polestar.oauth.result.at')||0);
 store().removeItem('polestar.oauth.result.at');
 try{
  if(!started||started>Date.now()+30000||Date.now()-started>120000)
   throw Error('OAuth handoff expired. Please sign in again securely.');
  const value=JSON.parse(raw);
  if(!value||!value.access_token||typeof value.access_token!=='string')
   throw Error('Polestar did not return an access token');
  store().setItem('polestar.access',value.access_token);
  store().setItem('polestar.refresh',value.refresh_token||'');
  store().setItem('polestar.expires.at',
    String(Date.now()+(Number(value.expires_in)||3600)*1000-60000));
  store().setItem('polestar.token.endpoint','https://polestarid.eu.polestar.com/as/token.oauth2');
  // A successful token exchange proves login; car discovery is separate.
  trace('AUTH','Account signed in. Searching for your Polestar…');
  await retryVehicleDiscovery();
 }catch(e){
  // Never leave a token/VIN in a half-connected state after failed discovery.
  for(const k of ['polestar.access','polestar.refresh','polestar.expires.at',
   'polestar.token.endpoint','polestar.c3','vehicle.vin','vehicle.name'])
   store().removeItem(k);
  trace('ERROR',String(e&&e.message||e).slice(0,130));
 }finally{oauthInFlight=false;}
}
function receiveStorageChange({key}={}){
 if(key==='polestar.session.clear'){
  for(const k of ['polestar.access','polestar.refresh','polestar.expires.at',
   'polestar.c3','vehicle.vin','vehicle.name','polestar.token.endpoint',
   'polestar.oauth.result','polestar.oauth.result.at',
   'polestar.vehicle.lookup','polestar.vehicle.discovery.request',
   'vehicle.verified','vehicle.source','polestar.manual.vin.request',
   'polestar.webtext.probe','polestar.vehicle.verify.status',
   'polestar.vehicle.verify.request',
   'polestar.login.request','polestar.login.request.at'])
   store().removeItem(k);
  store().setItem('polestar.login.status','Signed out');
 }else if(key==='polestar.oauth.result'){
  void processOauthResult();
 }else if(key==='polestar.vehicle.discovery.request'){
  store().removeItem('polestar.vehicle.discovery.request');
  void retryVehicleDiscovery();
 }else if(key==='polestar.manual.vin.request'){
  void connectManualVin();
 }else if(key==='polestar.vehicle.verify.request'){
  void verifyVehicleStatus();
 }else if(key==='polestar.probe.request'){
  void processConnectionProbe();
 }else if(key==='polestar.login.probe.request'){
  void processLoginTransportProbe();
 }else if(key==='polestar.login.request'){
  void processDirectLogin();
 }
}
AppSideService(BaseSideService({
 onSettingsChange(change){receiveStorageChange(change||{});},
 onInit(){
  // A queued login expires automatically and is cleared before network calls.
  store().setItem('polestar.side.ready',String(Date.now()));
  void processOauthResult();
  void processConnectionProbe();
  void processLoginTransportProbe();
  void processDirectLogin();
  void connectManualVin();
  if(store().getItem('polestar.vehicle.verify.request'))
   void verifyVehicleStatus();
 },
 onRun(){
  store().setItem('polestar.side.ready',String(Date.now()));
  void processOauthResult();
  void processConnectionProbe();
  void processLoginTransportProbe();
  void processDirectLogin();
  void connectManualVin();
  if(store().getItem('polestar.vehicle.verify.request'))
   void verifyVehicleStatus();
 },
 async onRequest(req,res){
  try{
   if(req.method==='grpc.preflight'){
    res(null,{ok:true,...await grpcTransportPreflight()});return;
   }
   if(req.method==='auth.preflight'){
    res(null,{ok:true,...await authorizationPreflight()});return;
   }
   if(req.method==='login.transport.preflight'){
    res(null,{ok:true,...await syntheticCookiePreflight()});return;
   }
   if(req.method==='zepp.ping'){
    res(null,{ok:true,version:'1.3.23-watch-metrics-fix',auth:!!store().getItem('polestar.access'),pending:!!store().getItem('polestar.login.request'),status:store().getItem('polestar.login.status')||'Not connected'});return;
   }
   if(req.method==='vehicle.capabilities'){
    res(null,{ok:true,authenticated:!!store().getItem('polestar.access'),
     vehicle_configured:!!store().getItem('vehicle.vin'),
     native_verified:store().getItem('vehicle.verified')==='true',
     controls:['lock','unlock','trunk_unlock','flash','honk','honk_flash',
      'windows_open','windows_close','climate_start','climate_stop'],
     // Capability presence is not proof of native transport support.
     control_transport:store().getItem('vehicle.verified')==='true'?'candidate':'unavailable'});
    return;
   }
   const vin=store().getItem('vehicle.vin');
   if(!vin)throw Error('Sign in to your Polestar in Zepp first');
   if(req.method==='vehicle.status'){
    const result=await grpc('GetLatestBattery',vin);
    if(!result.complete)throw Error('Native gRPC completion could not be verified');
    const data=decodeBattery(result.payload);
    store().setItem('vehicle.verified','true');
    try{
     const ext=await grpc('GetLatestExterior',vin);
     data.lock_state=decodeExterior(ext.payload).lock_state;
    }catch(e){data.lock_state='unknown';}
    res(null,{ok:true,...data});return;
   }
   if(req.method==='vehicle.command'){
    const p=req.params||{};
    const allowed={
     lock:'Lock',unlock:'Unlock',trunk_unlock:'TrunkUnlock',
     flash:'Flash',honk:'Honk',honk_flash:'HonkFlash',
     windows_open:'WindowsOpen',windows_close:'WindowsClose',
     climate_start:'ClimateStart',climate_stop:'ClimateStop'
    };
    if(p.confirmed!==true||!Object.prototype.hasOwnProperty.call(allowed,p.action))
     throw Error('Confirmation required for a supported C3 action');
    if(store().getItem('vehicle.verified')!=='true')
     throw Error('Verify live C3 status before any command');
    const method=allowed[p.action];
    const result=await grpc(method,vin,p.options||{});
    if(!result.complete)
     throw Error('C3 command completion status is unavailable');
    const invocation=decodeInvocation(result.payload);
    if(!invocation.ok){
     res(null,{ok:false,error:'Polestar '+method+': '+invocation.status_label});return;
    }
    // Only lock/unlock can currently be independently verified through our
    // existing exterior decoder. Never mark other commands as verified.
    if(p.action!=='lock'&&p.action!=='unlock'){
     res(null,{ok:false,pending:true,error:'C3 acknowledged '+method+
      '; physical result is not yet verified.'});return;
    }
    let observed='unknown';
    try{
     const ext=await grpc('GetLatestExterior',vin);
     if(ext.complete)observed=decodeExterior(ext.payload).lock_state;
    }catch(e){}
    if(observed!==(p.action==='lock'?'locked':'unlocked')){
     res(null,{ok:false,pending:true,error:'Command acknowledged, but car state not verified. Refresh status.'});return;
    }
    res(null,{ok:true,verified:true,command:method,status:invocation.status_label});return;
   }
   throw Error('Unknown request');
  }catch(e){res(null,{ok:false,error:String(e.message||e).slice(0,160)});}
 }
}));
