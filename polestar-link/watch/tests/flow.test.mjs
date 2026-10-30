import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import vm from 'node:vm';
import * as proto from '../app-side/proto.js';

const vin='YSMABCDE0R0000001';
const storageMap=new Map();
const listeners=[];
const storage={
  getItem:key=>storageMap.get(key)||'',
  setItem(key,value){const oldValue=storageMap.get(key);storageMap.set(key,String(value));for(const cb of listeners)cb({key,newValue:String(value),oldValue});},
  removeItem:key=>storageMap.delete(key),
  addListener(event,cb){assert.equal(event,'change');listeners.push(cb);}
};
const wrap=(name,props={},children=[])=>({name,props,children});
const View=({style},children)=>wrap('View',{style},children);
const Text=(props,value)=>wrap('Text',props,[value]);
const TextInput=props=>wrap('TextInput',props);
const Button=props=>wrap('Button',props);
function flatten(tree){return [tree,...(tree.children||[]).flatMap(c=>typeof c==='object'?flatten(c):[])];}
function msg(id,body){return Uint8Array.from([id*8+2,body.length,...body]);}
function num(id,value){return [id*8,value];}
function dbl(id,value){const b=new ArrayBuffer(8);new DataView(b).setFloat64(0,value,true);return [id*8+1,...new Uint8Array(b)];}
const authEndpoint='https://polestarid.eu.polestar.com/authorize';
const tokenEndpoint='https://polestarid.eu.polestar.com/token';
let locked=false,commands=0;
async function fetchMock({url,method,body}){
  if(url.startsWith('https://c3.mock.example/')){
    assert.equal(typeof body,'string','Zepp Fetch requires a string body for this gRPC request');
    assert.equal(body.charCodeAt(0),0,'gRPC frame must be uncompressed');
  }
  if(url.endsWith('/.well-known/openid-configuration'))
    return {status:200,body:{authorization_endpoint:authEndpoint,token_endpoint:tokenEndpoint}};
  if(url.startsWith(authEndpoint))return {status:200,body:'url: "/resume"'};
  if(url.startsWith('https://polestarid.eu.polestar.com/resume'))return {status:302,headers:{location:'polestar-explore://explore.polestar.com?code=test-auth-code'}};
  if(url===tokenEndpoint)return {status:200,body:{access_token:'mock-access',refresh_token:'mock-refresh',expires_in:3600}};
  if(url.includes('/app-backend/api/graphql'))return {status:200,body:{data:{vdms:{getVehiclesInformation:[{vin,content:{model:{name:'Polestar 4'}}}]}}}};
  if(url==='https://cnepmob.volvocars.com/')return {status:200,body:{c3:{grpcHost:'c3.mock.example'}}};
  if(url.includes('/GetLatestBattery'))return {status:200,headers:{'grpc-status':'0'},body:proto.grpcFrame(msg(3,[...dbl(2,84.1),...dbl(4,381.6)]))};
  if(url.includes('/GetLatestExterior'))return {status:200,headers:{'grpc-status':'0'},body:proto.grpcFrame(msg(3,num(2,locked?2:1)))};
  if(url.endsWith('/Lock')||url.endsWith('/Unlock')){
    commands++;locked=url.endsWith('/Lock');
    return {status:200,headers:{'grpc-status':'0'},body:Uint8Array.from([...proto.grpcFrame(msg(1,num(3,1))),...proto.grpcFrame(msg(1,num(3,4))),...proto.grpcFrame(msg(1,num(3,6)))])};
  }
  throw Error('Unexpected mocked network call '+url);
}
function launch(){
 const sideScript=readFileSync(new URL('../app-side/index.js',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'');
 const settingScript=readFileSync(new URL('../setting/index.js',import.meta.url),'utf8');
 let side,page;
 const common={settings:{settingsStorage:storage},fetch:fetchMock,crypto:webcrypto,
   sha256:{array:input=>[...createHash('sha256').update(input).digest()]},
   ...proto,AppSideService:o=>{side=o;},BaseSideService:o=>o,
   AppSettingsPage:o=>{page=o;},View,Text,TextInput,Button,
   URL,Date,Math,JSON,ArrayBuffer,Uint8Array,TextDecoder,encodeURIComponent,decodeURIComponent,
   String,Number,Error,Promise,Array,Object,RegExp,console};
 vm.runInNewContext(sideScript,common,{filename:'app-side/index.js'});
 vm.runInNewContext(settingScript,common,{filename:'setting/index.js'});
 side.onInit();
 return {side,page};
}
async function waitFor(testValue){
 for(let i=0;i<100;i++){if(testValue())return;await new Promise(resolve=>setTimeout(resolve,5));}
 throw Error('Login completion timed out');
}
function ask(service,method,params){
 return new Promise((resolve,reject)=>service.onRequest({method,params},(err,result)=>err?reject(err):resolve(result)));
}
test('Zepp settings -> OAuth -> vehicle discovery -> watch status -> confirmed lock/unlock',async()=>{
 const {side,page}=launch();
 const components=flatten(page.build({settingsStorage:storage}));
 const inputs=components.filter(x=>x.name==='TextInput');
 assert.equal(inputs.length,2);
 inputs[0].props.onChange('test@example.com');
 inputs[1].props.onChange('dummy-secret');
 const signIn=components.find(x=>x.name==='Button'&&x.props.label==='Sign in');
 signIn.props.onClick();
 await waitFor(()=>storage.getItem('polestar.login.status').startsWith('Connected'));
 assert.equal(storage.getItem('vehicle.vin'),vin);
 assert.equal(storage.getItem('polestar.login.request'),'');
 assert.equal(storage.getItem('polestar.login.status'),'Connected: Polestar 4');
 let status=await ask(side,'vehicle.status');
 assert.deepEqual(JSON.parse(JSON.stringify(status)),{ok:true,battery_percent:84,range_km:382,charging:false,lock_state:'unlocked'});
 const denied=await ask(side,'vehicle.command',{action:'unlock'});
 assert.equal(denied.ok,false);
 assert.equal(commands,0);
 const lock=await ask(side,'vehicle.command',{action:'lock',confirmed:true});
 assert.equal(lock.ok,true);assert.equal(commands,1);
 status=await ask(side,'vehicle.status');
 assert.equal(status.lock_state,'locked');
 const unlock=await ask(side,'vehicle.command',{action:'unlock',confirmed:true});
 assert.equal(unlock.ok,true);assert.equal(commands,2);
 status=await ask(side,'vehicle.status');assert.equal(status.lock_state,'unlocked');
 assert.doesNotMatch(storage.getItem('polestar.log'),/dummy-secret/);
});
