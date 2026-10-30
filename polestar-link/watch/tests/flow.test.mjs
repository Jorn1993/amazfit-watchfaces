import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as proto from '../app-side/proto.js';

const vin='YSMABCDE0R0000001';
const wrap=(name,props={},children=[])=>({name,props,children});
const View=(props,children)=>wrap('View',props,children);
const Text=(props,value)=>wrap('Text',props,[value]);
const Button=props=>wrap('Button',props);
const Auth=props=>wrap('Auth',props);
const TextInput=props=>wrap('TextInput',props);
const Link=(props,children)=>wrap('Link',props,children);
function flatten(tree){return [tree,...(tree.children||[]).flatMap(c=>typeof c==='object'?flatten(c):[])];}
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
 let commands=0,locked=false,side,page;
 async function fetchMock({url,body}){
  if(url==='https://httpbin.org/cookies')
   return {status:200,body:{cookies:{zepp_probe_only:'harmless'}}};
  if(url.endsWith('/.well-known/openid-configuration'))
   return {status:200,body:{authorization_endpoint:'https://polestarid.eu.polestar.com/as/authorization.oauth2'}};
  if(url.startsWith('https://polestarid.eu.polestar.com/as/authorization.oauth2?'))
   return {status:200,body:'url: "/as/aBcD/resume"',headers:{'Set-Cookie':'PF=mock-session; HttpOnly; Secure'}};
  if(url.includes('/app-backend/api/graphql'))return {status:200,body:{data:{vdms:{getVehiclesInformation:options.noCars?[]:[{vin,content:{model:{name:'Polestar 4'}}}]}}}};
  if(url==='https://cnepmob.volvocars.com/')return {status:200,body:{c3:{grpcHost:'c3.mock.example'}}};
  if(url.startsWith('https://c3.mock.example/')){
   assert.equal(typeof body,'string');
   if(url.includes('/GetLatestBattery'))return {status:200,headers:{'grpc-status':'0','Content-Type':'application/grpc'},body:proto.grpcFrame(msg(3,[...dbl(2,84.1),...dbl(4,381.6)]))};
   if(url.includes('/GetLatestExterior'))return {status:200,headers:{'grpc-status':'0'},body:proto.grpcFrame(msg(3,num(2,(options.staleExterior?false:locked)?2:1)))};
   if(url.endsWith('/Lock')||url.endsWith('/Unlock')){
    commands++;locked=url.endsWith('/Lock');
    return {status:200,headers:{'grpc-status':'0'},body:Uint8Array.from([...proto.grpcFrame(msg(1,num(3,1))),...proto.grpcFrame(msg(1,num(3,4))),...proto.grpcFrame(msg(1,num(3,6)))])};
   }
  }
  throw Error('Unexpected mocked request '+url);
 }
 const sideCode=readFileSync(new URL('../app-side/index.js',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'');
 const settingsCode=readFileSync(new URL('../setting/index.js',import.meta.url),'utf8');
 const common={settings:{settingsStorage:storage},fetch:fetchMock,...proto,
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
 return {storage,side,page,getCommands:()=>commands};
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
test('Zepp login never renders real password input or broken OAuth redirect',()=>{
 const {storage,page}=launch();
 const components=flatten(page.build({settingsStorage:storage}));
 const inputs=components.filter(x=>x.name==='TextInput');
 assert.equal(inputs.length,1,'Only non-secret mask preview is present');
 assert.equal(inputs[0].props.disabled,true);
 assert.equal(inputs[0].props.value,'Demo123!');
 assert.equal(inputs[0].props.subStyle.WebkitTextSecurity,'disc');
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

test('Zepp settings compatibility button runs both probes without password input',async()=>{
 const {side,storage,page}=launch();
 const button=flatten(page.build({settingsStorage:storage}))
  .find(x=>x.name==='Button'&&x.props.label==='Check Polestar compatibility');
 assert.ok(button);
 button.props.onClick();
 await eventually(()=>storage.getItem('polestar.probe.status')==='Polestar compatibility test completed.');
 const report=JSON.parse(storage.getItem('polestar.probe.result'));
 assert.equal(report.auth_http,200);
 assert.equal(report.login_page,true);
 assert.equal(report.cookie_accessible,true);
 assert.equal(report.grpc_reached,true);
 assert.equal(report.grpc_verified,false);
 assert.equal(report.pkce_secure_crypto,false,'Mock Zepp runtime does not expose WebCrypto');
 assert.equal(storage.getItem('polestar.login.request'),'');
 assert.equal(storage.getItem('polestar.access'),'');
});

test('Successful command RPC without matching exterior state is pending, not success',async()=>{
 const {storage,side,getCommands}=launch(true,{staleExterior:true});
 storage.setItem('polestar.oauth.result.at',String(Date.now()));
 storage.setItem('polestar.oauth.result',JSON.stringify({access_token:'mock-token'}));
 await eventually(()=>storage.getItem('polestar.login.status').startsWith('READY:'));
 const result=await ask(side,'vehicle.command',{action:'lock',confirmed:true});
 assert.equal(result.ok,false);
 assert.equal(result.pending,true);
 assert.match(result.error,/not verified/);
 assert.equal(getCommands(),1,'Never retry a lock command automatically');
});

test('Failed vehicle discovery removes transient session credentials',async()=>{
 const {storage}=launch(true,{noCars:true});
 storage.setItem('polestar.oauth.result.at',String(Date.now()));
 storage.setItem('polestar.oauth.result',JSON.stringify({
  access_token:'mock-token',refresh_token:'mock-refresh',expires_in:900
 }));
 await eventually(()=>storage.getItem('polestar.login.status').startsWith('ERROR:'));
 for(const key of ['polestar.access','polestar.refresh','polestar.expires.at','vehicle.vin','polestar.c3'])
  assert.equal(storage.getItem(key),'',key+' should be cleared');
});

test('Account-login feasibility check uses only synthetic cookie and no password',async()=>{
 const {storage,side,page,getCommands}=launch();
 const controls=flatten(page.build({settingsStorage:storage}));
 const button=controls.find(x=>x.name==='Button'&&x.props.label==='Test login options (no password)');
 assert.ok(button,'Settings must expose a safe login transport check');
 button.props.onClick();
 await eventually(()=>storage.getItem('polestar.login.probe.status')==='Login transport check completed.');
 const report=JSON.parse(storage.getItem('polestar.login.probe.result'));
 assert.equal(report.cookie_echo_http,200);
 assert.equal(report.cookie_header_forwarded,true);
 assert.equal(report.cookie_echo_error,false);
 const browser=JSON.parse(storage.getItem('polestar.browser.probe.result'));
 assert.equal(browser.browser_polestar_readable,false,'Mock Settings browser has no native CORS-capable fetch');
 assert.equal(storage.getItem('polestar.login.request'),'','No password handoff may be created');
 assert.equal(storage.getItem('polestar.access'),'','No auth tokens may be created');
 assert.equal(getCommands(),0,'No vehicle action allowed in diagnostic mode');
 const again=await ask(side,'login.transport.preflight');
 assert.equal(again.ok,true);
 assert.equal(again.cookie_header_forwarded,true);
});

test('Browser login probe cannot take credentials from a Settings input',()=>{
 const {storage,page}=launch();
 const controls=flatten(page.build({settingsStorage:storage}));
 const input=controls.filter(x=>x.name==='TextInput');
 assert.equal(input.length,1);
 assert.equal(input[0].props.disabled,true,'Password field stays an inert masking preview');
 assert.equal(controls.some(x=>x.name==='Auth'),false,'Do not enable rejected Zepp OAuth callback');
});

test('Official Polestar website link is present but does not claim to connect watch',()=>{
 const {storage,page}=launch();
 const widgets=flatten(page.build({settingsStorage:storage}));
 const links=widgets.filter(x=>x.name==='Link');
 assert.equal(links.length,1);
 assert.equal(links[0].props.source,'https://www.polestar.com/nl-be/');
 const title=widgets.filter(x=>x.name==='Text').flatMap(x=>x.children.map(String)).join(' ');
 assert.match(title,/website session is separate from the watch app/);
 assert.equal(storage.getItem('polestar.access'),'');
});
