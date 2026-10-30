import { BaseSideService } from '@zeppos/zml/base-side';
import { sha256 } from 'js-sha256';
const store=()=>settings.settingsStorage;
const ID='https://polestarid.eu.polestar.com';
const CLIENT='lp8dyrd_10', REDIRECT='polestar-explore://explore.polestar.com';
const SCOPE='openid profile email customer:attributes customer:attributes:write';
const GQL='https://pc-api.polestar.com/eu-north-1/app-backend/api/graphql';
const enc=encodeURIComponent;
function trace(stage,detail){store().setItem('polestar.log',stage+': '+String(detail||'').slice(0,180));}
function json(r){try{return typeof r.body==='string'?JSON.parse(r.body):r.body;}catch(e){return null;}}
function header(r,key){const h=r.headers||{};return h[key]||h[key.toLowerCase()]||h[key.toUpperCase()]||'';}
function form(obj){return Object.keys(obj).map(k=>enc(k)+'='+enc(obj[k])).join('&');}
function b64(bytes){
 const abc='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';let out='';
 for(let i=0;i<bytes.length;i+=3){const a=bytes[i],b=bytes[i+1],c=bytes[i+2];out+=abc[a>>2]+abc[((a&3)<<4)|((b||0)>>4)];if(i+1<bytes.length)out+=abc[((b&15)<<2)|((c||0)>>6)];if(i+2<bytes.length)out+=abc[c&63];}
 return out;
}
function randomVerifier(){let a=[];for(let i=0;i<48;i++)a.push(Math.floor(Math.random()*256));return b64(a);}
function codeFrom(location){const m=String(location).match(/[?&]code=([^&#]+)/);return m?decodeURIComponent(m[1]):null;}
async function http(url,method='GET',headers={},body){
 const r=await fetch({url,method,headers,...(body===undefined?{}:{body})});
 return r;
}
async function authenticate(email,password){
 trace('AUTH','OIDC discovery');
 const discovery=json(await http(ID+'/.well-known/openid-configuration'));
 if(!discovery||!discovery.authorization_endpoint||!discovery.token_endpoint)throw Error('OIDC discovery unavailable');
 const verifier=randomVerifier(),challenge=b64(sha256.array(verifier));
 const params={response_type:'code',client_id:CLIENT,redirect_uri:REDIRECT,scope:SCOPE,state:randomVerifier(),code_challenge:challenge,code_challenge_method:'S256',response_mode:'query'};
 const query=form(params);
 trace('AUTH','Loading login session');
 const start=await http(discovery.authorization_endpoint+'?'+query);
 const html=String(start.body||'');
 const match=html.match(/(?:url|action):\s*"([^"]+)"/);
 if(!match)throw Error('Login session unavailable HTTP '+start.status);
 const resume=new URL(match[1],ID).toString();
 if(!resume.startsWith(ID+'/'))throw Error('Unexpected login destination');
 trace('AUTH','Submitting Polestar ID');
 const response=await http(resume+'?'+query,'POST',{'Content-Type':'application/x-www-form-urlencoded'},form({'pf.username':email,'pf.pass':password}));
 const location=header(response,'location');
 const code=codeFrom(location);
 if(!code)throw Error('Authorization response HTTP '+response.status+'; redirect '+(location?'without code':'missing'));
 trace('AUTH','Exchanging authorization code');
 const tokenResponse=await http(discovery.token_endpoint,'POST',{'Content-Type':'application/x-www-form-urlencoded'},form({grant_type:'authorization_code',code,redirect_uri:REDIRECT,client_id:CLIENT,code_verifier:verifier}));
 const tokens=json(tokenResponse);
 if(!tokens||!tokens.access_token)throw Error('Token exchange HTTP '+tokenResponse.status);
 store().setItem('polestar.access',tokens.access_token);
 if(tokens.refresh_token)store().setItem('polestar.refresh',tokens.refresh_token);
 store().setItem('polestar.token.endpoint',discovery.token_endpoint);
 trace('AUTH','Authenticated');
 return tokens.access_token;
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
function pbString(field,value){const bytes=Array.from(unescape(encodeURIComponent(value)),c=>c.charCodeAt(0));return [field*8+2,bytes.length,...bytes];}
function frame(bytes){const n=bytes.length;return String.fromCharCode(0,(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255,...bytes);}
async function grpc(method,vin){
 const host=store().getItem('polestar.c3'),token=store().getItem('polestar.access');
 if(!host||!token||!vin)throw Error('Sign in first');
 const request=pbString(1,vin);
 const payload=method==='GetLatestBattery'?request:[10,request.length,...request];
 const path=method==='GetLatestBattery'?'/services.vehiclestates.battery.BatteryService/GetLatestBattery':'/invocation.InvocationService/'+method;
 const r=await http('https://'+host+path,'POST',{'Content-Type':'application/grpc','TE':'trailers','Authorization':'Bearer '+token,'vin':vin,'grpc-accept-encoding':'identity','User-Agent':'grpc-java-okhttp/1.68.2'},frame(payload));
 trace('GRPC',method+' HTTP '+r.status+' grpc-status '+header(r,'grpc-status'));
 if(r.status!==200)throw Error(method+' HTTP '+r.status);
 const grpcStatus=header(r,'grpc-status');
 if(grpcStatus==='')throw Error(method+' response lacks gRPC completion status; cannot verify success');
 if(String(grpcStatus)!=='0')throw Error(method+' gRPC status '+grpcStatus);
 return {http:r.status,grpcStatus:header(r,'grpc-status'),body:r.body};
}
AppSideService(BaseSideService({
 onInit(){
  store().addListener('change',async ({key})=>{
   if(key!=='polestar.login.request')return;
   try{
    const raw=store().getItem('polestar.login.request');
    const input=JSON.parse(raw||'{}');
    store().removeItem('polestar.login.request');
    if(!input.email||!input.password)throw Error('Enter email and password');
    const token=await authenticate(input.email,input.password);
    const car=await vehicles(token);
    await endpoint(token);
    trace('READY','Connected '+(car.content?.model?.name||'Polestar'));
   }catch(e){trace('ERROR',e.message||e);}
  });
 },
 async onRequest(req,res){
  try{
   if(req.method==='zepp.ping'){res(null,{ok:true,version:'1.2.0-experimental'});return;}
   const vin=store().getItem('vehicle.vin');
   if(req.method==='vehicle.status'){const result=await grpc('GetLatestBattery',vin);res(null,{ok:false,error:'gRPC response decoding for battery/range is not implemented'});return;}
   if(req.method==='vehicle.command'){
    const p=req.params||{};
    if(p.confirmed!==true||!['lock','unlock'].includes(p.action))throw Error('Confirmation required');
    const result=await grpc(p.action==='lock'?'Lock':'Unlock',vin);
    res(null,{ok:false,error:'gRPC transport completed; vehicle command delivery is not verified'});return;
   }
   throw Error('Unknown request');
  }catch(e){res(null,{ok:false,error:String(e.message||e)});}
 }
}));
