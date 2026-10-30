import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function makePage(){
 let page;const widgets=[];
 const ui={widget:{TEXT:1,BUTTON:2},prop:{TEXT:3},align:{CENTER_H:1},
  text_style:{WRAP:1},createWidget(type,props){
   const widget={type,props,text:props.text,
    setProperty(key,value){assert.equal(key,3);this.text=value;}};
   widgets.push(widget);return widget;
  }};
 const code=readFileSync(new URL('../page/index.js',import.meta.url),'utf8')
  .replace(/^import .*;\s*$/gm,'');
 vm.runInNewContext(code,{ui,Page:obj=>{page=obj;},BasePage:x=>x,
  Date,JSON,String,Error,Promise,Math,console},{filename:'page/index.js'});
 page.build();
 return {page,widgets};
}
test('Watch reads phone capabilities through direct Zepp messaging, not legacy bridge',async()=>{
 const {page}=makePage();
 page.request=()=>{throw Error('Legacy Page.request must not be called');};
 const calls=[];
 page.messaging={async request(payload,options){
  calls.push([payload.method,options.timeout]);
  if(payload.method==='vehicle.capabilities')
   return {ok:true,authenticated:true,vehicle_configured:true,native_verified:false};
  throw Error('Unexpected request');
 }};
 await page.refresh();
 assert.equal(calls.length,1);
 assert.deepEqual(calls[0],['vehicle.capabilities',12000]);
 assert.match(page.result.text,/communication unavailable/);
 assert.equal(page.busy,false);
});
test('Phone service errors are displayed on watch',async()=>{
 const {page}=makePage();
 page.messaging={async request(){throw Error('BLE channel disconnected');}};
 await page.refresh();
 assert.match(page.result.text,/BLE channel disconnected/);
});
test('Physical commands are blocked unless native C3 is verified',async()=>{
 const {page}=makePage();let commands=0;
 page.messaging={async request(payload){
  if(payload.method==='vehicle.capabilities')
   return {ok:true,authenticated:true,vehicle_configured:true,native_verified:false};
  if(payload.method==='vehicle.command')commands++;
 }};
 page.next();await page.arm('unlock');
 await page.footerAction();
 assert.equal(commands,0);
 assert.match(page.result.text,/Remote controls unavailable|C3 controls require/);
});
test('Confirmed commands use Zepp messaging and never claim success before verification',async()=>{
 const {page}=makePage();const calls=[];
 page.messaging={async request(payload){
  calls.push(payload);
  if(payload.method==='vehicle.capabilities')
   return {ok:true,authenticated:true,vehicle_configured:true,native_verified:true};
  if(payload.method==='vehicle.command')
   return {ok:false,pending:true,error:'Command acknowledged, but car state not verified.'};
 }};
 page.next();
 await page.arm('unlock');
 assert.equal(calls.some(x=>x.method==='vehicle.command'),false);
 await page.footerAction();
 const command=calls.find(x=>x.method==='vehicle.command');
 assert.equal(command.params.confirmed,true);
 assert.equal(command.params.action,'unlock');
 assert.match(page.result.text,/state not verified/);
});
