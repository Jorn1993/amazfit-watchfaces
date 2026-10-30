import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function makePage() {
 let page;
 const widgets=[];
 const ui={
  widget:{TEXT:1,BUTTON:2},
  prop:{TEXT:3},
  align:{CENTER_H:1},
  text_style:{WRAP:1},
  createWidget(type,props){
   const object={type,props,text:props.text,
    setProperty(prop,text){assert.equal(prop,3);this.text=text;}};
   widgets.push(object);
   return object;
  }
 };
 const code=readFileSync(new URL('../page/index.js',import.meta.url),'utf8')
  .replace(/^import .*;\s*$/gm,'');
 vm.runInNewContext(code,{ui,Page:object=>{page=object;},
  BasePage:object=>object,Date,JSON,String,Error,Promise,console},
  {filename:'page/index.js'});
 page.build();
 return {page,widgets};
}
test('status bypasses app-local Promise bridge and uses Zepp BLE messaging directly',async()=>{
 const {page,widgets}=makePage();
 let called=0;
 page.request=()=>{throw Error('Legacy Page.request bridge must not be called');};
 page.messaging={async request(payload,options){
  called++;
  if(payload.method==='zepp.ping'){
    assert.equal(options.timeout,10000);
    return {ok:true,auth:false,status:'Not connected'};
  }
  assert.equal(payload.method,'auth.preflight');
  assert.equal(options.timeout,20000);
  return {ok:true,auth_http:200,login_page:true,cookie_accessible:false};
 }};
 await page.action();
 assert.equal(called,2);
 assert.match(widgets.find(w=>w.type===1&&w.props.y===124).text,/Session cookies: not available/);
 assert.equal(page.busy,false);
});
test('phone service and watch messaging failures are displayed, not silently swallowed',async()=>{
 const {page,widgets}=makePage();
 page.messaging={async request(){throw Error('BLE channel disconnected');}};
 await page.action();
 assert.match(widgets.find(w=>w.type===1&&w.props.y===124).text,/BLE channel disconnected/);
});
test('confirmed commands cannot execute without user arming action',async()=>{
 const {page,widgets}=makePage();
 const calls=[];
 page.messaging={async request(payload){
  calls.push(payload);
  if(payload.method==='zepp.ping')return {ok:true,auth:false};
  if(payload.method==='auth.preflight')return {ok:true,auth_http:200,login_page:true,cookie_accessible:true};
  if(payload.method==='vehicle.command')return {ok:true};
  throw Error('Unexpected command');
 }};
 await page.action();
 assert.equal(calls.some(c=>c.method==='vehicle.command'),false);
 page.arm('unlock');
 await page.action();
 assert.equal(calls.find(c=>c.method==='vehicle.command').params.confirmed,true);
 assert.equal(calls.find(c=>c.method==='vehicle.command').params.action,'unlock');
 assert.match(widgets.find(w=>w.type===1&&w.props.y===124).text,/Command sent/);
});
