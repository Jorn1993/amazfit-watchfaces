import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

async function launch(verified=false){
 let page,commands=0;const widgets=[];
 const ui={widget:{TEXT:'TEXT',BUTTON:'BUTTON',FILL_RECT:'RECT',IMG:'IMG'},
  prop:{TEXT:'TEXT',VISIBLE:'VISIBLE'},align:{CENTER_H:'CENTER'},
  text_style:{WRAP:'WRAP'},
  createWidget(type,props){
   const w={type,state:{...props},visible:true,
    setProperty(prop,value){if(prop==='VISIBLE')this.visible=!!value;
     else this.state[prop.toLowerCase()]=value;}};
   widgets.push(w);return w;
  }};
 const src=readFileSync(new URL('../page/index.js',import.meta.url),'utf8')
  .replace(/^import .*;\s*$/gm,'');
 vm.runInNewContext(src,{ui,Page:x=>{page=x;},BasePage:x=>x,
  Date,Math,Error,String,Number},{filename:'watch/page/index.js'});
 page.messaging={request:async (message)=>{
  if(message.method==='vehicle.capabilities')
   return {ok:true,authenticated:true,vehicle_configured:true,
    native_verified:verified};
  if(message.method==='vehicle.status')return {ok:true,
   battery_percent:77,range_km:340,charging:true,lock_state:'locked'};
  if(message.method==='vehicle.command'){
   commands++;return {ok:false,pending:true,error:'Command outcome not independently verified'};
  }
  throw Error('Unexpected watch request');
 }};
 page.build();
 for(let i=0;i<6;i++)await Promise.resolve();
 return {page,widgets,commands:()=>commands};
}
test('Two watch views only: main dashboard and the full C3 action grid',async()=>{
 const {page,widgets}=await launch();
 assert.equal(page.screen,0);
 assert.equal(widgets.filter(w=>w.type==='IMG').length,1,'real Polestar logo on watch');
 assert.equal(widgets.find(w=>w.type==='IMG').state.src,'polestar-mark.png');
 assert.equal(page.state.battery,77);
 assert.equal(page.state.range,340);
 assert.equal(page.battery.state.text,'77 %');
 assert.equal(page.range.state.text,'340 km');
 assert.equal(page.widgets.main.some(w=>w.state.text==='LOCK'),true);
 page.setPage(1);
 assert.equal(page.screen,1);
 assert.ok(page.widgets.main.every(w=>w.visible===false));
 assert.ok(page.widgets.more.every(w=>w.visible===true));
 const actions=page.widgets.more.filter(w=>w.type==='BUTTON').map(w=>w.state.text);
 assert.deepEqual(actions,[
  'TRUNK','FLASH','HONK','HONK + FLASH',
  'OPEN WINDOWS','CLOSE WINDOWS','CLIMATE ON','CLIMATE OFF','BACK'
 ]);
 page.setPage(0);
 assert.equal(page.screen,0);
 assert.ok(page.widgets.more.every(w=>w.visible===false));
});
test('Unverified native C3 blocks every physical control',async()=>{
 const {page,commands}=await launch(false);
 page.setPage(1);
 for(const action of ['trunk_unlock','flash','honk','honk_flash',
  'windows_open','windows_close','climate_start','climate_stop']){
  await page.arm(action);
  assert.equal(page.pending,null);
 }
 assert.equal(commands(),0);
 assert.match(page.moreNotice.state.text,/unavailable/);
});
test('Verified C3 still needs a second explicit confirmation',async()=>{
 const {page,commands}=await launch(true);
 page.setPage(1);
 await page.arm('trunk_unlock');
 assert.equal(page.pending.action,'trunk_unlock');
 assert.equal(page.backButton.state.text,'CONFIRM');
 assert.equal(commands(),0);
 await page.confirm();
 assert.equal(commands(),1);
 assert.match(page.moreNotice.state.text,/not independently verified/);
});
test('Expired confirmation cannot send a command',async()=>{
 const {page,commands}=await launch(true);
 page.setPage(1);
 await page.arm('windows_open');
 page.pending.expires=Date.now()-1;
 await page.confirm();
 assert.equal(commands(),0);
 assert.match(page.moreNotice.state.text,/expired/);
});
