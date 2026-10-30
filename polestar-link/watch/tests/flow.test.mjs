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
function flatten(tree){return [tree,...(tree.children||[]).flatMap(c=>typeof c==='object'?flatten(c):[])];}
function msg(id,body){return Uint8Array.from([id*8+2,body.length,...body]);}
function num(id,value){return [id*8,value];}
function dbl(id,value){const b=new ArrayBuffer(8);new DataView(b).setFloat64(0,value,true);return [id*8+1,...new Uint8Array(b)];}

function launch(startImmediately=true){
 const map=new Map(),listeners=[];
 const storage={
  getItem:k=>map.get(k)||'',
  setItem(k,v){map.set(k,String(v));for(const cb of [...listeners])cb({key:k,newValue:String(v)});},
  removeItem:k=>map.delete(k),
  addListener(type,cb){assert.equal(type,'change');listeners.push(cb);}
 };
 let commands=0,locked=false,side,page;
 async function fetchMock({url,body}){
  if(url.includes('/app-backend/api/graphql'))return {status:200,body:{data:{vdms:{getVehiclesInformation:[{vin,content:{model:{name:'Polestar 4'}}}]}}}};
  if(url==='https://cnepmob.volvocars.com/')return {status:200,body:{c3:{grpcHost:'c3.mock.example'}}};
  if(url.startsWith('https://c3.mock.example/')){
   assert.equal(typeof body,'string');
   if(url.includes('/GetLatestBattery'))return {status:200,headers:{'grpc-status':'0'},body:proto.grpcFrame(msg(3,[...dbl(2,84.1),...dbl(4,381.6)]))};
   if(url.includes('/GetLatestExterior'))return {status:200,headers:{'grpc-status':'0'},body:proto.grpcFrame(msg(3,num(2,locked?2:1)))};
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
  AppSettingsPage:arg=>{page=arg;},View,Text,Button,Auth,
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
test('No plaintext password input is available in Zepp settings',()=>{
 const {storage,page}=launch();
 const components=flatten(page.build({settingsStorage:storage}));
 assert.equal(components.filter(x=>x.name==='TextInput').length,0);
 const auth=components.find(x=>x.name==='Auth');
 assert.ok(auth,'Native Zepp OAuth input is available');
 assert.equal(auth.props.pkce,true);
 assert.ok(auth.props.authorizeUrl.startsWith('https://polestarid.eu.polestar.com/'));
 assert.equal(auth.props.clientSecret,undefined);
});
test('Zepp OAuth token callback -> car discovery -> status -> confirmed lock/unlock (simulated network)',async()=>{
 const {storage,side,page,getCommands}=launch();
 const components=flatten(page.build({settingsStorage:storage}));
 const auth=components.find(x=>x.name==='Auth');
 auth.props.onAccessToken({access_token:'simulated-token',refresh_token:'simulated-refresh',expires_in:3600});
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
 const auth=flatten(page.build({settingsStorage:storage})).find(x=>x.name==='Auth');
 auth.props.onAccessToken('simulated-token');
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
 const auth=flatten(page.build({settingsStorage:storage})).find(x=>x.name==='Auth');
 auth.props.onAccessToken('simulated-token');
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
