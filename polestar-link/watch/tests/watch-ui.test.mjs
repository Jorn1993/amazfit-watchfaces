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
  if(message.method==='vehicle.details')return {ok:true,lock_state:'locked',
   window_state:'open',climate_state:'active',charging_state:'charging',
   charger_connection:'connected',charging_power_watts:6500,time_to_full_minutes:52,
   odometer_km:12458,front_left_door:'closed',front_right_door:'closed',
   rear_left_door:'closed',rear_right_door:'closed',trunk:'closed',hood:'closed'};
  if(message.method==='vehicle.command'){
   commands++;return {ok:false,pending:true,error:'Command outcome not independently verified'};
  }
  throw Error('Unexpected watch request');
 }};
 page.build();
 for(let i=0;i<20;i++)await Promise.resolve();
 return {page,widgets,commands:()=>commands};
}
test('Four watch screens show status, controls and exterior details',async()=>{
 const {page,widgets}=await launch(true);
 assert.equal(page.screen,0);
 assert.equal(widgets.filter(w=>w.type==='IMG').length,1,'real Polestar logo');
 assert.equal(widgets.find(w=>w.type==='IMG').state.src,'polestar-mark.png');
 assert.equal(page.battery.state.text,'77 %');
 assert.equal(page.range.state.text,'340 km');
 const lock=page.toggles.find(t=>t.key==='lock');
 const windows=page.toggles.find(t=>t.key==='window');
 const climate=page.toggles.find(t=>t.key==='climate');
 const charge=page.toggles.find(t=>t.key==='charge');
 assert.equal(lock.off.visible,true,'locked uses the dark card');
 assert.equal(lock.off.state.text,'LOCKED');
 assert.equal(windows.on.visible,true,'open windows use the bright card');
 assert.equal(climate.on.visible,true);
 assert.equal(charge.on.visible,true);
 page.setPage(1);assert.equal(page.screen,1);
 assert.ok(page.widgets.main.every(w=>!w.visible));
 assert.ok(page.widgets.more.some(w=>w.visible));
 const actions=page.widgets.more.filter(w=>w.type==='BUTTON').map(w=>w.state.text);
 assert.deepEqual(JSON.parse(JSON.stringify(actions)),[
  'TRUNK','FLASH','HONK','HONK + FLASH','HOME','STATUS'
 ]);
 page.setPage(2);assert.equal(page.screen,2);
 assert.equal(page.rows.find(x=>x.key==='power').value.state.text,'6500 W');
 assert.equal(page.rows.find(x=>x.key==='timeToFull').value.state.text,'52 min');
 page.setPage(3);assert.equal(page.screen,3);
 assert.equal(page.rows.find(x=>x.key==='trunk').value.state.text,'closed');
 page.setPage(0);assert.ok(page.widgets.exterior.every(w=>!w.visible));
});
test('Unknown detail values never enable a stateful control',async()=>{
 const {page,commands}=await launch(true);
 page.detailValues={};page.render();
 for(const key of ['window','climate','charge']){
  const t=page.toggles.find(x=>x.key===key);
  assert.equal(t.unknown.visible,true);
  assert.equal(t.on.visible,false);
  assert.equal(t.off.visible,false);
 }
 assert.equal(commands(),0);
 page.setPage(2);
 assert.equal(page.rows.find(x=>x.key==='charging').value.state.text,'--');
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

test('Real Zepp BasePage state mutation cannot produce undefined dashboard metrics',async()=>{
 const {page}=await launch(false);
 // Simulate the platform overwriting its reserved `state` object after build.
 page.state={};
 page.polestarMetrics={};
 page.render();
 assert.equal(page.battery.state.text,'-- %');
 assert.equal(page.range.state.text,'-- km');
 page.polestarMetrics={battery:undefined,range:undefined};
 page.render();
 assert.equal(page.battery.state.text,'-- %');
 assert.equal(page.range.state.text,'-- km');
 page.polestarMetrics={battery:NaN,range:Infinity};
 page.render();
 assert.equal(page.battery.state.text,'-- %');
 assert.equal(page.range.state.text,'-- km');
 assert.equal(page.refreshButton.state.text,'SYNC','Use a readable refresh label, not unsupported Unicode');
});
test('Refresh clears stale numbers when vehicle capability is no longer verified',async()=>{
 const {page}=await launch(true);
 assert.equal(page.battery.state.text,'77 %');
 page.phoneRequest=async x=>{
  if(x.method==='vehicle.capabilities')return {
   ok:true,authenticated:true,vehicle_configured:true,native_verified:false};
  throw Error('Vehicle status should not be called without verification');
 };
 await page.refresh();
 assert.equal(page.polestarMetrics.verified,false);
 assert.equal(page.battery.state.text,'-- %');
 assert.equal(page.range.state.text,'-- km');
});
test('Missing numeric status fields never show zero or undefined',async()=>{
 const {page}=await launch(true);
 page.phoneRequest=async x=>{
  if(x.method==='vehicle.capabilities')return {
   ok:true,authenticated:true,vehicle_configured:true,native_verified:true};
  if(x.method==='vehicle.status')return {
   ok:true,battery_percent:null,range_km:undefined,charging:false};
 };
 await page.refresh();
 assert.equal(page.battery.state.text,'-- %');
 assert.equal(page.range.state.text,'-- km');
 assert.match(page.notice.state.text,/values unavailable/);
});
