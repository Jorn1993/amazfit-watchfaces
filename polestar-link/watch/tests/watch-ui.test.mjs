import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function launch(nativeVerified=false){
 const source=readFileSync(new URL('../page/index.js',import.meta.url),'utf8')
  .replace(/^import .*;\s*$/gm,'');
 let page,commands=0;
 const widgets=[];
 const ui={widget:{TEXT:'TEXT',BUTTON:'BUTTON'},prop:{TEXT:'TEXT'},
  align:{CENTER_H:'CENTER'},text_style:{WRAP:'WRAP'},
  createWidget(type,properties){
   const state={...properties};
   const el={type,state,setProperty(name,value){state[name==='TEXT'?'text':name]=value;}};
   widgets.push(el);return el;
  }};
 vm.runInNewContext(source,{ui,BasePage:x=>x,Page:x=>{page=x;},Date,Math,Error,String});
 page.messaging={request:async x=>{
  if(x.method==='vehicle.capabilities')
   return {ok:true,authenticated:true,vehicle_configured:true,
    native_verified:nativeVerified};
  if(x.method==='vehicle.status')
   return {ok:false,error:'No real battery result'};
  if(x.method==='vehicle.command'){
   commands++;
   return {ok:false,error:'Command outcome not independently verified'};
  }
  throw Error('Unexpected method '+x.method);
 }};
 page.build();
 const controls=widgets.filter(x=>x.type==='BUTTON');
 return {page,widgets,controls,commands:()=>commands};
}
test('Watch C3 UI exposes the full safety-gated basic control catalogue',()=>{
 const {page,controls}=launch();
 const pairs=[];
 for(let i=0;i<6;i++){
  pairs.push([controls[0].state.text,controls[1].state.text]);
  page.next();
 }
 assert.deepEqual(pairs,[
  ['REFRESH','CONTROLS'],['LOCK','UNLOCK'],['TRUNK','FLASH'],
  ['START','STOP'],['OPEN ALL','CLOSE ALL'],['HONK','BOTH']
 ]);
});
test('Unverified C3 transport prevents sending a single physical command',async()=>{
 const {page,controls,commands}=launch(false);
 page.next();
 await page.arm('unlock');
 assert.equal(page.pending,null);
 assert.match(page.result.state.text,/Remote controls unavailable/);
 await page.footerAction();
 assert.equal(commands(),0);
});
test('When native C3 is verified, every command still needs a separate confirmation',async()=>{
 const {page,controls,commands}=launch(true);
 page.next();
 await page.arm('lock');
 assert.equal(page.pending.action,'lock');
 assert.equal(controls[2].state.text,'CONFIRM ACTION');
 assert.equal(commands(),0);
 await page.footerAction();
 assert.equal(commands(),1);
 assert.match(page.result.state.text,/not independently verified/);
});
test('Control request expires without network side effect',async()=>{
 const {page,commands}=launch(true);
 page.next();
 await page.arm('lock');
 page.pending.expires=Date.now()-1;
 await page.footerAction();
 assert.equal(commands(),0);
 assert.match(page.result.state.text,/expired/);
});
