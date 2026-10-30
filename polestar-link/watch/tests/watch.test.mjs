import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
async function makePage(){
 let page;
 const ui={widget:{TEXT:1,BUTTON:2,FILL_RECT:3,IMG:4},
  prop:{TEXT:'TEXT',VISIBLE:'VISIBLE'},
  align:{CENTER_H:1},text_style:{WRAP:1},
  createWidget(type,props){return {type,props,text:props.text,visible:true,
   setProperty(key,value){if(key==='VISIBLE')this.visible=!!value;
    else if(key==='TEXT')this.text=value;}};}};
 const code=readFileSync(new URL('../page/index.js',import.meta.url),'utf8')
  .replace(/^import .*;\s*$/gm,'');
 vm.runInNewContext(code,{ui,Page:x=>{page=x;},BasePage:x=>x,
  Date,JSON,String,Number,Math,Error,Promise},{filename:'page/index.js'});
 return {page};
}
test('Watch uses direct BLE request and never calls obsolete Page.request',async()=>{
 const {page}=await makePage();
 const calls=[];
 page.request=()=>{throw Error('Deprecated app-level bridge must not be called');};
 page.messaging={async request(message,options){
  calls.push({method:message.method,timeout:options.timeout});
  return {ok:true,authenticated:true,vehicle_configured:true,native_verified:false};
 }};
 page.build();
 for(let i=0;i<8;i++)await Promise.resolve();
 assert.equal(calls[0].method,'vehicle.capabilities');
 assert.equal(calls[0].timeout,12000);
 assert.match(page.notice.text,/status unavailable/);
});
test('Watch reports phone connectivity failure and shows no fabricated telemetry',async()=>{
 const {page}=await makePage();
 page.messaging={async request(){throw Error('BLE channel disconnected');}};
 page.build();
 for(let i=0;i<8;i++)await Promise.resolve();
 assert.match(page.notice.text,/BLE channel disconnected/);
 assert.equal(page.battery.text,'-- %');
 assert.equal(page.range.text,'-- km');
});
test('A blocked account cannot send any commands even on the extra control page',async()=>{
 const {page}=await makePage();let count=0;
 page.messaging={async request(message){
  if(message.method==='vehicle.capabilities')return {
   ok:true,authenticated:false,vehicle_configured:false,native_verified:false};
  if(message.method==='vehicle.command')count++;
 }};
 page.build();
 for(let i=0;i<8;i++)await Promise.resolve();
 page.setPage(1);
 await page.arm('unlock');
 await page.footerAction();
 assert.equal(count,0);
});
test('Lock action never reports successful outcome until vehicle state is confirmed',async()=>{
 const {page}=await makePage();const sent=[];
 page.messaging={async request(message){
  sent.push(message);
  if(message.method==='vehicle.capabilities')return {
   ok:true,authenticated:true,vehicle_configured:true,native_verified:true};
  if(message.method==='vehicle.status')return {
   ok:false,error:'Unverified native response'};
  if(message.method==='vehicle.command')return {
   ok:false,pending:true,error:'Command acknowledged, but car state not verified.'};
 }};
 page.build();
 for(let i=0;i<8;i++)await Promise.resolve();
 await page.arm('unlock');
 assert.equal(sent.filter(x=>x.method==='vehicle.command').length,0);
 await page.footerAction();
 assert.equal(sent.filter(x=>x.method==='vehicle.command').length,1);
 assert.match(page.notice.text,/state not verified/);
});
