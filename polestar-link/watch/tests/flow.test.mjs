import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as proto from '../app-side/proto.js';
import * as webtext from '../app-side/grpc-web-text.js';
import * as c3Actions from '../app-side/c3-actions.js';
import * as c3Transport from '../app-side/c3-transport.js';

const vin='YSMABCDE0R0000001';
const wrap=(name,props={},children=[])=>({name,props,children});
const View=(props,children)=>wrap('View',props,children);
const Text=(props,value)=>wrap('Text',props,[value]);
const Button=props=>wrap('Button',props);
const Auth=props=>wrap('Auth',props);
const TextInput=props=>wrap('TextInput',props);
const Link=(props,children)=>wrap('Link',props,children);
function flatten(tree){if(!tree||typeof tree!=='object')return [];
 const children=Array.isArray(tree.children)?tree.children:tree.children?[tree.children]:[];
 return [tree,...children.flatMap(flatten)];}
function msg(id,body){return Uint8Array.from([id*8+2,body.length,...body]);}
function num(id,value){return [id*8,value];}
function dbl(id,value){const b=new ArrayBuffer(8);new DataView(b).setFloat64(0,value,true);return [id*8+1,...new Uint8Array(b)];}

function launch(startImmediately=true,options={}){
 const map=new Map(),listeners=[];
 const storage={
  getItem:k=>map.get(k)||'',
  setItem(k,v){map.set(k,String(v));for(const cb of [...listeners])cb({key:k,newValue:String(v)});},
  removeItem:k=>map.delete(k),
  addListener(type,cb){assert.equal(type,'change');listeners.push(cb);}
 };
 let commands=0,locked=false,side,page,logins=0;
 async function fetchMock({url,body,headers={}}){
  if(url.startsWith('http://127.0.0.1:18764/')){
   if(url.endsWith('/pair'))return {status:200,body:{token:'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123'}};
   if(url.endsWith('/capabilities'))return {status:200,body:{ok:true,authenticated:true,
    vehicle_configured:true,native_verified:true}};
   if(url.endsWith('/status'))return {status:200,body:{ok:true,battery_percent:79,
    range_km:363,charging:false,lock_state:'locked'}};
   if(url.endsWith('/command')){
    commands++;
    return {status:200,body:{ok:true,verified:true,command:'Lock'}};
   }
  }
  if(url==='https://httpbin.org/cookies')
   return {status:200,body:{cookies:{zepp_probe_only:'harmless'}}};
  if(url.endsWith('/.well-known/openid-configuration'))
   return {status:200,body:{authorization_endpoint:'https://polestarid.eu.polestar.com/as/authorization.oauth2'}};
  if(url.startsWith('https://polestarid.eu.polestar.com/as/authorization.oauth2?'))
   return {status:200,body:'url: "/as/aBcD/resume"',headers:{'Set-Cookie':'PF=mock-session; HttpOnly; Secure'}};
  if(url.includes('/app-backend/api/graphql'))return {status:200,body:{data:{vdms:{getVehiclesInformation:options.noCars||options.mobileEmpty?[]:[{vin,content:{model:{name:'Polestar 4'}}}]}}}};
  if(url.includes('/mystar-v2/'))return {status:options.v2Http===401&&headers.Authorization==='simulated-token'&&options.rawTokenWorks?200:options.v2Http||200,body:{data:{getConsumerCarsV2:options.noCars||options.v2Empty?[]:[{vin,modelName:'Polestar 4',modelYear:'2026'}]}}};
  if(url==='https://cnepmob.volvocars.com/')return {status:200,body:{c3:{grpcHost:'c3.mock.example'}}};
  if(url.startsWith('https://c3.mock.example/')){
   assert.ok(typeof body==='string'||body instanceof ArrayBuffer);
   if(headers['Content-Type']==='application/grpc-web-text+proto'){
    if(!options.webTextWorks)return {status:415,headers:{'Content-Type':'text/plain'},body:'unsupported'};
    const payload=proto.grpcFrame(msg(3,[...dbl(2,84.1),...dbl(4,381.6)]));
    return {status:200,headers:{'Content-Type':'application/grpc-web-text'},body:webtext.toBase64(payload)};
   }
   if(url.endsWith('/GetMyCars')){
    if(!options.c3Cars)return {status:503,body:''};
    const str=value=>[...String(value)].map(ch=>ch.charCodeAt(0));
    const block=(id,data)=>[id*8+2,data.length,...data];
    const car=block(1,[...block(1,str(vin)),...block(6,str('Polestar 4'))]);
    return {status:200,headers:{'grpc-status':'0'},body:proto.grpcFrame(Uint8Array.from(block(1,car)))};
   }
   if(url.includes('/GetLatestBattery')){
    if(options.c3NativeProbe){
     const typed=body instanceof ArrayBuffer;
     if(typed&&options.c3NativeProbe==='typedWorks')
      return {status:200,headers:{'grpc-status':'0','Content-Type':'application/grpc'},body:proto.grpcFrame(msg(3,[...dbl(2,84.1),...dbl(4,381.6)]))};
     if(typed)return {status:415,headers:{'Content-Type':'text/plain'},body:'unsupported body'};
     return {status:200,headers:{'Content-Type':'application/grpc'},body:'\uFFFDgarbled binary'};
    }
    return options.grpcBinaryBlocked?{status:200,headers:{},body:'not binary'}:{status:200,headers:{'grpc-status':'0','Content-Type':'application/grpc'},body:proto.grpcFrame(msg(3,[...dbl(2,84.1),...dbl(4,381.6)]))};
   }
   if(url.includes('/GetLatestExterior'))return {status:200,headers:{'grpc-status':'0'},body:proto.grpcFrame(msg(3,num(2,(options.staleExterior?false:locked)?2:1)))};
   if(['/HonkFlash','/WindowControl','/ClimatizationStart','/ClimatizationStop'].some(s=>url.endsWith(s))){
    commands++;
    return {status:200,headers:{'grpc-status':'0'},
     body:proto.grpcFrame(msg(1,num(3,6)))};
   }
   if(url.endsWith('/Lock')||url.endsWith('/Unlock')){
    commands++;locked=url.endsWith('/Lock');
    return {status:200,headers:{'grpc-status':'0'},body:Uint8Array.from([...proto.grpcFrame(msg(1,num(3,1))),...proto.grpcFrame(msg(1,num(3,4))),...proto.grpcFrame(msg(1,num(3,6)))])};
   }
  }
  throw Error('Unexpected mocked request '+url);
 }
 const sideCode=readFileSync(new URL('../app-side/index.js',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'');
 const settingsCode=readFileSync(new URL('../setting/index.js',import.meta.url),'utf8');
 const common={settings:{settingsStorage:storage},fetch:fetchMock,crypto:{},...proto,...webtext,...c3Actions,...c3Transport,
  authenticatePolestar:async(email,password)=>{
   logins++;
   assert.equal(email,'driver@example.test');
   assert.equal(password,options.sessionLogin?'':'test-password');
   if(options.loginFailure)throw Error('Login not accepted');
   return {access_token:'simulated-token',refresh_token:'simulated-refresh',expires_in:900};
  },
  AppSideService:arg=>{side=arg;},
  BaseSideService:arg=>({
   ...arg,
   onInit(){
    assert.equal(typeof arg.onSettingsChange,'function');
    storage.addListener('change',e=>arg.onSettingsChange(e));
    if(storage.getItem('polestar.oauth.result'))arg.onSettingsChange({key:'polestar.oauth.result'});
    arg.onInit?.call(this);
   }
  }),
  AppSettingsPage:arg=>{page=arg;},View,Text,Button,Auth,TextInput,Link,
  URL,Date,Math,JSON,ArrayBuffer,Uint8Array,TextDecoder,encodeURIComponent,decodeURIComponent,
  String,Number,Error,Promise,Array,Object,RegExp,console};
 vm.runInNewContext(sideCode,common,{filename:'app-side/index.js'});
 vm.runInNewContext(settingsCode,common,{filename:'setting/index.js'});
 if(startImmediately)side.onInit();
 return {storage,side,page,getCommands:()=>commands,getLogins:()=>logins};
}
async function eventually(testValue){
 for(let i=0;i<100;i++){
  if(testValue())return;
  await new Promise(resolve=>setTimeout(resolve,5));
 }
 throw Error('OAuth token processing timed out');
}
function ask(side,method,params){
 return new Promise((resolve,reject)=>side.onRequest({method,params},(err,response)=>err?reject(err):resolve(response)));
}
test('Personal login renders an email and a visually masked password field',()=>{
 const {storage,page}=launch();
 const components=flatten(page.build({settingsStorage:storage}));
 const inputs=components.filter(x=>x.name==='TextInput');
 assert.equal(inputs.length,3);
 assert.equal(inputs[0].props.label,'Android pairing code');
 assert.equal(inputs[1].props.label,'Polestar email');
 assert.equal(inputs[2].props.label,'Polestar password');
 assert.equal(inputs[2].props.subStyle.WebkitTextSecurity,'disc');
 assert.equal(components.some(x=>x.name==='Auth'),false);
});

test('Zepp OAuth token callback -> car discovery -> status -> confirmed lock/unlock (simulated network)',async()=>{
 const {storage,side,page,getCommands}=launch();
 const components=flatten(page.build({settingsStorage:storage}));
 storage.setItem('polestar.oauth.result.at',String(Date.now()));
 storage.setItem('polestar.oauth.result',JSON.stringify({
  access_token:'simulated-token',refresh_token:'simulated-refresh',expires_in:3600
 }));
 await eventually(()=>storage.getItem('polestar.login.status').startsWith('READY:'));
 assert.equal(storage.getItem('vehicle.vin'),vin);
 assert.equal(storage.getItem('polestar.oauth.result'),'');
 let status=await ask(side,'vehicle.status');
 assert.deepEqual(JSON.parse(JSON.stringify(status)),{ok:true,battery_percent:84,range_km:382,charging:false,lock_state:'unlocked'});
 const denied=await ask(side,'vehicle.command',{action:'unlock'});
 assert.equal(denied.ok,false);assert.equal(getCommands(),0);
 assert.equal((await ask(side,'vehicle.command',{action:'lock',confirmed:true})).ok,true);
 assert.equal(getCommands(),1);
 status=await ask(side,'vehicle.status');assert.equal(status.lock_state,'locked');
 assert.equal((await ask(side,'vehicle.command',{action:'unlock',confirmed:true})).ok,true);
 status=await ask(side,'vehicle.status');assert.equal(status.lock_state,'unlocked');
 assert.doesNotMatch(storage.getItem('polestar.log'),/simulated-token/);
});
test('OAuth handoff works when Zepp Side Service begins after authorization',async()=>{
 const {storage,side,page}=launch(false);
 storage.setItem('polestar.oauth.result.at',String(Date.now()));
 storage.setItem('polestar.oauth.result',JSON.stringify({access_token:'simulated-token'}));
 assert.ok(storage.getItem('polestar.oauth.result'));
 side.onInit();
 await eventually(()=>storage.getItem('polestar.login.status').startsWith('READY:'));
 assert.equal(storage.getItem('polestar.oauth.result'),'');
 assert.equal(storage.getItem('polestar.login.request'),'');
});
test('Old password requests are discarded without being submitted',async()=>{
 const {storage,side}=launch(false);
 storage.setItem('polestar.login.request',JSON.stringify({email:'old@example.org',password:'not-a-real-secret'}));
 side.onInit();
 assert.equal(storage.getItem('polestar.login.request'),'');
 const pong=await ask(side,'zepp.ping');
 assert.equal(pong.ok,true);
 assert.equal(pong.auth,false);
});
test('Sign-out removes session tokens',async()=>{
 const {storage,side,page}=launch();
 storage.setItem('polestar.oauth.result.at',String(Date.now()));
 storage.setItem('polestar.oauth.result',JSON.stringify({access_token:'simulated-token'}));
 await eventually(()=>storage.getItem('polestar.login.status').startsWith('READY:'));
 const buttons=flatten(page.build({settingsStorage:storage})).filter(x=>x.name==='Button');
 buttons.find(x=>x.props.label==='Sign out').props.onClick();
 assert.equal(storage.getItem('polestar.access'),'');
 assert.equal(storage.getItem('polestar.refresh'),'');
 assert.equal(storage.getItem('vehicle.vin'),'');
});

test('Expired OAuth message is erased, not replayed to Polestar',async()=>{
 const {side,storage}=launch(false);
 storage.setItem('polestar.oauth.result.at',String(Date.now()-130000));
 storage.setItem('polestar.oauth.result',JSON.stringify({access_token:'stale-mock-token'}));
 side.onInit();
 await eventually(()=>storage.getItem('polestar.login.status').startsWith('ERROR:'));
 assert.equal(storage.getItem('polestar.oauth.result'),'');
 assert.equal(storage.getItem('polestar.access'),'');
});

test('Anonymous Polestar OAuth probe checks real Zepp Fetch cookie support without sending credentials',async()=>{
 const {side,storage}=launch();
 const result=await ask(side,'auth.preflight');
 assert.equal(result.ok,true);
 assert.equal(result.discovery_http,200);
 assert.equal(result.auth_http,200);
 assert.equal(result.login_page,true);
 assert.equal(result.cookie_accessible,true);
 assert.equal('cookie' in result,false);
 assert.equal('password' in result,false);
 assert.equal(storage.getItem('polestar.access'),'');
});

test('Anonymous C3 gRPC probe does not require credentials or invoke vehicle commands',async()=>{
 const {side,storage,getCommands}=launch();
 const response=await ask(side,'grpc.preflight');
 assert.equal(response.ok,true);
 assert.equal(response.discovery_http,200);
 assert.equal(response.grpc_http,200);
 assert.equal(response.grpc_reached,true);
 assert.equal(response.grpc_verified,false,'Anonymous HTTP is not proof of working gRPC');
 assert.equal(response.grpc_binary_readable,true,'Mock transport returns native bytes');
 assert.equal(response.grpc_content_type,'application/grpc');
 assert.equal(getCommands(),0);
 assert.equal(storage.getItem('polestar.access'),'');
 assert.equal('vin' in response,false);
 assert.equal('host' in response,false);
});

test('Diagnostic network RPCs remain available without extra Settings buttons',async()=>{
 const {side,storage,page}=launch();
 const buttons=flatten(page.build({settingsStorage:storage}))
  .filter(x=>x.name==='Button').map(x=>x.props.label);
 assert.deepEqual(buttons,['Pair Android app','Connect to Polestar']);
 const auth=await ask(side,'auth.preflight');
 assert.equal(auth.ok,true);
 const grpc=await ask(side,'grpc.preflight');
 assert.equal(grpc.ok,true);
 assert.equal(grpc.grpc_verified,false);
 assert.equal(storage.getItem('polestar.login.request'),'');
});

test('Successful command RPC without matching exterior state is pending, not success',async()=>{
 const {storage,side,getCommands}=launch(true,{staleExterior:true});
 storage.setItem('polestar.oauth.result.at',String(Date.now()));
 storage.setItem('polestar.oauth.result',JSON.stringify({access_token:'mock-token'}));
 await eventually(()=>storage.getItem('polestar.login.status').startsWith('READY:'));
 // The test explicitly verifies status before allowing a command.
 const status=await ask(side,'vehicle.status');
 assert.equal(status.ok,true);
 const result=await ask(side,'vehicle.command',{action:'lock',confirmed:true});
 assert.equal(result.ok,false);
 assert.equal(result.pending,true);
 assert.match(result.error,/not verified/);
 assert.equal(getCommands(),1,'Never retry a lock command automatically');
});

test('Mobile list empty: MyStar V2 fallback finds the account car',async()=>{
 const {storage,getCommands}=launch(true,{mobileEmpty:true});
 storage.setItem('polestar.oauth.result.at',String(Date.now()));
 storage.setItem('polestar.oauth.result',JSON.stringify({
  access_token:'mock-token',refresh_token:'mock-refresh',expires_in:900
 }));
 await eventually(()=>storage.getItem('polestar.login.status').startsWith('READY:'));
 const report=JSON.parse(storage.getItem('polestar.vehicle.lookup'));
 assert.equal(report.mobile_count,0);
 assert.equal(report.consumer_v2_http,200);
 assert.equal(report.consumer_v2_count,1);
 assert.equal(storage.getItem('vehicle.vin'),vin);
 assert.equal(storage.getItem('vehicle.name'),'Polestar 4');
 assert.equal(getCommands(),0);
});

test('When both car APIs return no cars, keep valid login and allow password-free retry',async()=>{
 const options={noCars:true};
 const {storage,page,getCommands}=launch(true,options);
 storage.setItem('polestar.oauth.result.at',String(Date.now()));
 storage.setItem('polestar.oauth.result',JSON.stringify({
  access_token:'mock-token',refresh_token:'mock-refresh',expires_in:900
 }));
 await eventually(()=>storage.getItem('polestar.login.status').includes('Vehicle lookup:'));
 assert.equal(storage.getItem('polestar.access'),'mock-token','Valid account token is retained');
 assert.equal(storage.getItem('vehicle.vin'),'');
 const report=JSON.parse(storage.getItem('polestar.vehicle.lookup'));
 assert.equal(report.mobile_count,0);
 assert.equal(report.consumer_v2_count,0);
 const ui=flatten(page.build({settingsStorage:storage}));
 const retry=ui.find(x=>x.name==='Button'&&x.props.label==='Find my Polestar 4');
 assert.ok(retry);
 options.noCars=false;
 retry.props.onClick();
 await eventually(()=>storage.getItem('polestar.login.status').startsWith('READY:'));
 assert.equal(storage.getItem('vehicle.vin'),vin);
 assert.equal(getCommands(),0);
});

test('MyStar fallback errors show safe status without leaking vehicle details',async()=>{
 const {storage}=launch(true,{mobileEmpty:true,v2Http:403});
 storage.setItem('polestar.oauth.result.at',String(Date.now()));
 storage.setItem('polestar.oauth.result',JSON.stringify({access_token:'mock-token',expires_in:900}));
 await eventually(()=>storage.getItem('polestar.login.status').includes('Vehicle lookup:'));
 const report=JSON.parse(storage.getItem('polestar.vehicle.lookup'));
 assert.equal(report.consumer_v2_http,403);
 assert.equal(report.consumer_v2_count,0);
 assert.equal(storage.getItem('vehicle.vin'),'');
 assert.doesNotMatch(JSON.stringify(report),new RegExp(vin));
 assert.doesNotMatch(JSON.stringify(report),/mock-token/);
});

test('Compact Settings shows exactly one primary login button and no dynamic diagnostics toggle',async()=>{
 const {storage,side,page,getCommands}=launch();
 const ui=flatten(page.build({settingsStorage:storage}));
 assert.deepEqual(ui.filter(x=>x.name==='Button').map(x=>x.props.label),['Pair Android app','Connect to Polestar']);
 assert.equal(ui.filter(x=>x.name==='TextInput').length,3);
 const response=await ask(side,'login.transport.preflight');
 assert.equal(response.cookie_header_forwarded,true);
 assert.equal(getCommands(),0);
});

test('Credentials are only submitted on explicit sign-in',async()=>{
 const {storage,page,getLogins,getCommands}=launch();
 const controls=flatten(page.build({settingsStorage:storage}));
 const inputs=controls.filter(x=>x.name==='TextInput');
 inputs[0].props.onChange('driver@example.test');
 inputs.find(x=>x.props.label==='Polestar password').props.onChange('test-password');
 assert.equal(getLogins(),0);
 assert.equal(storage.getItem('polestar.login.request'),'');
 assert.equal(getCommands(),0);
 const button=controls.find(x=>x.name==='Button'&&x.props.label==='Connect to Polestar');
 button.props.onClick();
 await eventually(()=>storage.getItem('polestar.login.status').startsWith('READY:'));
 assert.equal(getLogins(),1);
 assert.equal(storage.getItem('polestar.login.request'),'');
 assert.equal(storage.getItem('polestar.login.request.at'),'');
 assert.equal(storage.getItem('polestar.email'),'driver@example.test');
 assert.equal(storage.getItem('vehicle.vin'),vin);
 assert.equal(getCommands(),0);
});

test('Failed login does not keep password or mark a car connected',async()=>{
 const {storage,page,getLogins}=launch(true,{loginFailure:true});
 const controls=flatten(page.build({settingsStorage:storage}));
 const inputs=controls.filter(x=>x.name==='TextInput');
 inputs[0].props.onChange('driver@example.test');
 inputs[1].props.onChange('test-password');
 controls.find(x=>x.name==='Button'&&x.props.label==='Connect to Polestar').props.onClick();
 await eventually(()=>storage.getItem('polestar.login.status').startsWith('ERROR:'));
 assert.equal(getLogins(),1);
 assert.equal(storage.getItem('polestar.login.request'),'');
 assert.equal(storage.getItem('polestar.access'),'');
 assert.equal(storage.getItem('vehicle.vin'),'');
});

test('Signed-in Settings does not request password again and hides advanced diagnostics',async()=>{
 const {storage,page}=launch();
 storage.setItem('polestar.access','sample-access');
 const ui=flatten(page.build({settingsStorage:storage}));
 assert.equal(ui.some(x=>x.name==='TextInput'&&x.props.label==='Polestar password'),false);
 assert.ok(ui.some(x=>x.name==='Button'&&x.props.label==='Find my Polestar 4'));
 assert.equal(ui.some(x=>x.name==='Button'&&x.props.label==='Run compatibility check'),false);
});
test('One Connect button supports an existing session without providing password',async()=>{
 const {storage,page,getLogins,getCommands}=launch(true,{sessionLogin:true});
 const ui=flatten(page.build({settingsStorage:storage}));
 ui.find(x=>x.name==='TextInput'&&x.props.label==='Polestar email').props.onChange('driver@example.test');
 const button=ui.find(x=>x.name==='Button'&&x.props.label==='Connect to Polestar');
 button.props.onClick();
 await eventually(()=>storage.getItem('polestar.login.status').startsWith('READY:'));
 assert.equal(getLogins(),1);
 assert.equal(storage.getItem('polestar.login.request'),'');
 assert.equal(storage.getItem('vehicle.vin'),vin);
 assert.equal(getCommands(),0);
});
test('Existing Polestar session requires an email but never prompts for a password',()=>{
 const {storage,page,getLogins}=launch();
 const ui=flatten(page.build({settingsStorage:storage}));
 const button=ui.find(x=>x.name==='Button'&&x.props.label==='Connect to Polestar');
 button.props.onClick();
 assert.match(storage.getItem('polestar.login.status'),/Enter your Polestar email/);
 assert.equal(storage.getItem('polestar.login.request'),'');
 assert.equal(getLogins(),0);
});

test('C3 GetMyCars read-only fallback finds one linked car when both GraphQL lists are empty',async()=>{
 const {storage,getCommands}=launch(true,{noCars:true,c3Cars:true});
 storage.setItem('polestar.oauth.result.at',String(Date.now()));
 storage.setItem('polestar.oauth.result',JSON.stringify({access_token:'simulated-token',expires_in:900}));
 await eventually(()=>storage.getItem('polestar.login.status').startsWith('READY:'));
 const report=JSON.parse(storage.getItem('polestar.vehicle.lookup'));
 assert.equal(report.c3_http,200);
 assert.equal(report.c3_count,1);
 assert.equal(storage.getItem('vehicle.vin'),vin);
 assert.equal(getCommands(),0);
});

test('Secondary-car VIN entry remains unverified if Zepp cannot read gRPC bytes',async()=>{
 const {storage,page,side,getCommands}=launch(true,{noCars:true,grpcBinaryBlocked:true});
 storage.setItem('polestar.oauth.result.at',String(Date.now()));
 storage.setItem('polestar.oauth.result',JSON.stringify({access_token:'simulated-token',expires_in:900}));
 await eventually(()=>storage.getItem('polestar.login.status').includes('Vehicle lookup:'));
 const ui=flatten(page.build({settingsStorage:storage}));
 const field=ui.find(x=>x.name==='TextInput'&&x.props.label==='Vehicle VIN (optional)');
 assert.ok(field);
 field.props.onChange(vin);
 ui.find(x=>x.name==='Button'&&x.props.label==='Find my Polestar 4').props.onClick();
 await eventually(()=>storage.getItem('polestar.webtext.probe')!=='');
 assert.equal(storage.getItem('vehicle.vin'),vin);
 assert.equal(storage.getItem('vehicle.verified'),'');
 const probe=JSON.parse(storage.getItem('polestar.webtext.probe'));
 assert.equal(probe.result,'http_error');
 const command=await ask(side,'vehicle.command',{action:'unlock',confirmed:true});
 assert.equal(command.ok,false);
 assert.match(command.error,/Verify live C3 status/);
 assert.equal(getCommands(),0);
});

test('MyStar raw Authorization variant is tried only after 401 and can find vehicle',async()=>{
 const {storage}=launch(true,{mobileEmpty:true,v2Http:401,rawTokenWorks:true});
 storage.setItem('polestar.oauth.result.at',String(Date.now()));
 storage.setItem('polestar.oauth.result',JSON.stringify({access_token:'simulated-token',expires_in:900}));
 await eventually(()=>storage.getItem('polestar.login.status').startsWith('READY:'));
 const report=JSON.parse(storage.getItem('polestar.vehicle.lookup'));
 assert.equal(report.consumer_v2_http,401);
 assert.equal(report.consumer_v2_raw_http,200);
 assert.equal(report.consumer_v2_count,1);
 assert.equal(storage.getItem('vehicle.vin'),vin);
});

test('Native binary failure probes read-only Web text and keeps lock blocked',async()=>{
 for(const supported of [false,true]){
  const {storage,side,page,getCommands}=launch(true,{noCars:true,grpcBinaryBlocked:true,webTextWorks:supported});
  storage.setItem('polestar.oauth.result.at',String(Date.now()));
  storage.setItem('polestar.oauth.result',JSON.stringify({access_token:'simulated-token',expires_in:900}));
  await eventually(()=>storage.getItem('polestar.login.status').includes('Vehicle lookup:'));
  const ui=flatten(page.build({settingsStorage:storage}));
  ui.find(x=>x.name==='TextInput'&&x.props.label==='Vehicle VIN (optional)').props.onChange(vin);
  ui.find(x=>x.name==='Button'&&x.props.label==='Find my Polestar 4').props.onClick();
  await eventually(()=>storage.getItem('polestar.webtext.probe')!=='');
  flatten(page.build({settingsStorage:storage}))
   .find(x=>x.name==='Button'&&x.props.label==='Check vehicle connection').props.onClick();
  await eventually(()=>storage.getItem('polestar.webtext.probe')!=='');
  const r=JSON.parse(storage.getItem('polestar.webtext.probe'));
  assert.equal(r.http,supported?200:415);
  assert.equal(r.result,supported?'battery_verified':'http_error');
  if(supported)assert.equal(r.battery_percent,84);
  assert.equal(storage.getItem('vehicle.verified'),'');
  const response=await ask(side,'vehicle.command',{action:'unlock',confirmed:true});
  assert.equal(response.ok,false);
  assert.equal(getCommands(),0);
 }
});

test('Settings view wraps each control in its own vertically stacked block',()=>{
 const {page,storage}=launch();
 const root=page.build({settingsStorage:storage});
 assert.equal(root.name,'View');
 assert.equal(root.props.style.flexDirection,'column');
 assert.ok(root.children.length>=3);
 for(const item of root.children){
  assert.equal(item.name,'View');
  assert.equal(item.props.style.display,'block');
  assert.equal(item.children.length,1);
 }
});

test('VIN entry automatically runs text transport diagnostic and exposes a result',async()=>{
 const {storage,page,getCommands}=launch(true,{noCars:true,grpcBinaryBlocked:true});
 storage.setItem('polestar.oauth.result.at',String(Date.now()));
 storage.setItem('polestar.oauth.result',JSON.stringify({access_token:'simulated-token',expires_in:900}));
 await eventually(()=>storage.getItem('polestar.login.status').includes('Vehicle lookup:'));
 const controls=flatten(page.build({settingsStorage:storage}));
 controls.find(x=>x.name==='TextInput'&&x.props.label==='Vehicle VIN (optional)').props.onChange(vin);
 controls.find(x=>x.name==='Button'&&x.props.label==='Find my Polestar 4').props.onClick();
 await eventually(()=>storage.getItem('polestar.webtext.probe')!=='');
 const report=JSON.parse(storage.getItem('polestar.webtext.probe'));
 assert.equal(report.http,415);
 assert.equal(report.result,'http_error');
 assert.equal(storage.getItem('polestar.vehicle.verify.status'),'text_http_error');
 const shown=flatten(page.build({settingsStorage:storage}));
 const text=shown.filter(x=>x.name==='Text').map(x=>x.children.join(' ')).join(' | ');
 assert.match(text,/Alternative transport unavailable/);
 assert.equal(storage.getItem('vehicle.verified'),'');
 assert.equal(getCommands(),0);
});

test('Reference C3 capability list is visible but commands remain gated by verified transport',async()=>{
 const {storage,side,getCommands}=launch();
 let cap=await ask(side,'vehicle.capabilities');
 assert.equal(cap.ok,true);
 assert.equal(cap.authenticated,false);
 assert.equal(cap.native_verified,false);
 assert.equal(cap.control_transport,'unavailable');
 assert.equal(cap.controls.includes('trunk_unlock'),true);
 assert.equal(cap.controls.includes('windows_close'),true);
 let denied=await ask(side,'vehicle.command',{action:'trunk_unlock',confirmed:true});
 assert.equal(denied.ok,false);
 assert.equal(getCommands(),0);
});
test('Reference additional C3 actions never report verified physical effects from RPC alone',async()=>{
 const {storage,side,getCommands}=launch();
 storage.setItem('polestar.oauth.result.at',String(Date.now()));
 storage.setItem('polestar.oauth.result',JSON.stringify({
  access_token:'simulated-token',refresh_token:'mock-refresh',expires_in:1800
 }));
 await eventually(()=>storage.getItem('polestar.login.status').startsWith('READY:'));
 const status=await ask(side,'vehicle.status');
 assert.equal(status.ok,true);
 const cap=await ask(side,'vehicle.capabilities');
 assert.equal(cap.native_verified,true);
 for(const action of ['trunk_unlock','honk_flash','windows_close','climate_start','climate_stop']){
  const result=await ask(side,'vehicle.command',{action,confirmed:true});
  assert.equal(result.ok,false);
  assert.equal(result.pending,true);
  assert.match(result.error,/not yet verified/);
 }
 assert.equal(getCommands(),5);
});

test('Zepp login shows email and one-shot masked password after closing native input popup',()=>{
 const {storage,page}=launch(false);
 let ui=flatten(page.build({settingsStorage:storage}));
 ui.find(x=>x.name==='TextInput'&&x.props.label==='Polestar email')
  .props.onChange('driver@example.test');
 ui.find(x=>x.name==='TextInput'&&x.props.label==='Polestar password')
  .props.onChange('test-password');
 ui=flatten(page.build({settingsStorage:storage}));
 const visible=ui.filter(x=>x.name==='Text').map(x=>x.children.join(' ')).join(' | ');
 assert.match(visible,/Email: driver@example.test/);
 assert.match(visible,/Password: •••••••• \(entered\)/);
 assert.doesNotMatch(visible,/test-password/);
 assert.equal(storage.getItem('polestar.email'),'driver@example.test');
 assert.equal(storage.getItem('polestar.password'),'');
 assert.equal(storage.getItem('polestar.login.request'),'');
});

test('C3 direct native probe reports both request encodings without unlocking any controls',async()=>{
 const {storage,page,getCommands}=launch(true,{c3NativeProbe:'rejected'});
 storage.setItem('polestar.oauth.result.at',String(Date.now()));
 storage.setItem('polestar.oauth.result',JSON.stringify({
  access_token:'simulated-token',expires_in:3600
 }));
 await eventually(()=>storage.getItem('polestar.login.status').startsWith('READY:'));
 const controls=flatten(page.build({settingsStorage:storage}));
 const button=controls.find(x=>x.name==='Button'&&x.props.label==='Test native C3 connection');
 assert.ok(button);
 button.props.onClick();
 await eventually(()=>storage.getItem('polestar.c3.transport.status')==='complete');
 const report=JSON.parse(storage.getItem('polestar.c3.transport.report'));
 assert.equal(report.tested,true);
 assert.equal(report.verified,false);
 assert.equal(report.attempts.length,2);
 assert.equal(report.attempts[0].mode,'arraybuffer');
 assert.equal(report.attempts[0].http,415);
 assert.equal(report.attempts[1].mode,'string');
 assert.equal(report.attempts[1].utf8_replacement>0,true);
 assert.equal(getCommands(),0);
 assert.equal(storage.getItem('vehicle.verified'),'');
 assert.equal(JSON.stringify(report).includes('simulated-token'),false);
 assert.equal(JSON.stringify(report).includes(vin),false);
});
test('A truly byte-perfect read-only C3 response does not silently enable car controls',async()=>{
 const {storage,page,getCommands}=launch(true,{c3NativeProbe:'typedWorks'});
 storage.setItem('polestar.oauth.result.at',String(Date.now()));
 storage.setItem('polestar.oauth.result',JSON.stringify({
  access_token:'simulated-token',expires_in:3600
 }));
 await eventually(()=>storage.getItem('polestar.login.status').startsWith('READY:'));
 flatten(page.build({settingsStorage:storage})).find(
  x=>x.name==='Button'&&x.props.label==='Test native C3 connection').props.onClick();
 await eventually(()=>storage.getItem('polestar.c3.transport.status')==='complete');
 const report=JSON.parse(storage.getItem('polestar.c3.transport.report'));
 assert.equal(report.verified,true);
 assert.equal(report.outcome,'verified_native_battery');
 assert.equal(report.supported_mode,'arraybuffer');
 assert.equal(report.attempts.length,1);
 assert.equal(report.battery_percent,84);
 assert.equal(getCommands(),0);
 assert.equal(storage.getItem('vehicle.verified'),'');
});

test('Native Android companion pairing and authenticated C3 watch routing',async()=>{
 const {storage,side,page,getCommands}=launch();
 const ui=flatten(page.build({settingsStorage:storage}));
 ui.find(x=>x.name==='TextInput'&&x.props.label==='Android pairing code')
  .props.onChange('123456');
 ui.find(x=>x.name==='Button'&&x.props.label==='Pair Android app').props.onClick();
 await eventually(()=>storage.getItem('polestar.bridge.token')!=='');
 assert.equal(storage.getItem('polestar.bridge.status'),'Android companion paired');
 const cap=await ask(side,'vehicle.capabilities');
 assert.equal(cap.native_verified,true);
 assert.equal(cap.source,'native_android');
 const data=await ask(side,'vehicle.status');
 assert.equal(data.ok,true);
 assert.equal(data.battery_percent,79);
 let denied=await ask(side,'vehicle.command',{action:'unlock'});
 assert.equal(denied.ok,false);
 assert.equal(getCommands(),0);
 let allowed=await ask(side,'vehicle.command',{action:'lock',confirmed:true});
 assert.equal(allowed.ok,true);
 assert.equal(getCommands(),1);
 assert.equal(storage.getItem('polestar.access'),'');
});
