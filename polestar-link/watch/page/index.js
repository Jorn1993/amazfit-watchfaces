import * as ui from '@zos/ui';
import { BasePage } from '@zeppos/zml/base-page';

// Two-view Zepp UI for Polestar 4. Controls never send a C3 command until
// real native vehicle state was verified and the wearer confirms within 10s.
const MAIN=[
 {label:'LOCK',action:'lock'},{label:'UNLOCK',action:'unlock'},
 {label:'CLIMATE',action:'climate_start'},{label:'MORE',action:'more'}
];
const MORE=[
 {label:'TRUNK',action:'trunk_unlock'},{label:'FLASH',action:'flash'},
 {label:'HONK',action:'honk'},{label:'HONK + FLASH',action:'honk_flash'},
 {label:'OPEN WINDOWS',action:'windows_open'},
 {label:'CLOSE WINDOWS',action:'windows_close'},
 {label:'CLIMATE ON',action:'climate_start'},
 {label:'CLIMATE OFF',action:'climate_stop'}
];
const PALETTE={
 bg:0x0c0e10,card:0x1b1e20,surface:0x252a2c,accent:0xd9e1db,
 text:0xf2f3f0,muted:0x9da6a3,warning:0xb4b9b6
};
Page(BasePage({
 build(){
  this.busy=false;this.disposed=false;this.pending=null;this.screen=0;
  this.polestarMetrics={battery:null,range:null,charging:false,lock:'unknown',verified:false};
  this.widgets={main:[],more:[]};
  const shared=(type,params)=>ui.createWidget(type,params);
  const add=(page,type,params)=>{
   const w=shared(type,params);this.widgets[page].push(w);return w;
  };
  const txt=(page,x,y,w,h,text,size=20,color=PALETTE.text)=>add(
   page,ui.widget.TEXT,{x,y,w,h,text,text_size:size,color,
    align_h:ui.align.CENTER_H,text_style:ui.text_style.WRAP});
  const button=(page,x,y,w,h,label,callback,color=PALETTE.surface,size=20)=>
   add(page,ui.widget.BUTTON,{x,y,w,h,radius:16,text:label,
    text_size:size,color:PALETTE.text,normal_color:color,
    press_color:0x43504c,click_func:callback});
  const background=shared(ui.widget.FILL_RECT,{x:0,y:0,w:480,h:480,color:PALETTE.bg});
  this.logo=shared(ui.widget.IMG,{x:216,y:36,w:48,h:48,
   src:'polestar-mark.png',auto_scale:true});
  this.brand=shared(ui.widget.TEXT,{x:90,y:89,w:300,h:35,
   text:'P O L E S T A R',text_size:23,color:PALETTE.text,
   align_h:ui.align.CENTER_H});
  this.title=shared(ui.widget.TEXT,{x:64,y:132,w:352,h:35,
   text:'POLESTAR 4',text_size:21,color:PALETTE.muted,align_h:ui.align.CENTER_H});
  // Small refresh action available without adding a third watch page.
  this.refreshButton=button('main',354,130,64,36,'SYNC',
   ()=>{void this.refresh();},PALETTE.surface,15);
  // Overview: large paired vehicle metrics, no invented live data.
  add('main',ui.widget.FILL_RECT,{x:56,y:171,w:368,h:110,radius:25,color:PALETTE.card});
  this.battery=txt('main',73,189,164,46,'-- %',41);
  this.range=txt('main',243,189,164,46,'-- km',36);
  txt('main',78,239,156,22,'BATTERY',15,PALETTE.muted);
  txt('main',245,239,158,22,'RANGE',15,PALETTE.muted);
  this.notice=txt('main',67,283,346,32,'Connect in Zepp to get started',16,PALETTE.muted);
  MAIN.forEach((item,i)=>{
   const firstRow=i<2,x=firstRow?(i===0?66:246):(i===2?99:248);
   const y=firstRow?326:391,w=firstRow?169:133,h=firstRow?56:42;
   const widget=button('main',x,y,w,h,item.label,()=>{
    if(item.action==='more'){
     if(this.pending)void this.confirm();else this.setPage(1);
    }else void this.arm(item.action);
   },i===1?0x353c3b:PALETTE.surface,firstRow?21:18);
   if(i===3)this.mainMore=widget;
  });
  // Second page: eight actions, arranged in a compact 2-column grid.
  MORE.forEach((item,i)=>{
   const col=i%2,row=Math.floor(i/2),x=62+col*180,y=197+row*55;
   button('more',x,y,176,48,item.label,()=>{void this.arm(item.action);},
    PALETTE.surface,item.label.length>9?15:18);
  });
  this.backButton=button('more',159,423,162,39,'BACK',()=>{
   if(this.pending)void this.confirm();else this.setPage(0);
  },0x323839,17);
  this.moreNotice=txt('more',65,164,350,27,'',15,PALETTE.muted);
  this.setPage(0);
  void this.refresh();
 },
 show(message){
  if(this.disposed)return;
  const msg=String(message||'').slice(0,126);
  if(this.screen===0)this.notice.setProperty(ui.prop.TEXT,msg);
  else this.moreNotice.setProperty(ui.prop.TEXT,msg);
 },
 render(){
  if(this.disposed)return;
  this.title.setProperty(ui.prop.TEXT,this.screen===0?'POLESTAR 4':'VEHICLE CONTROLS');
  for(const page of ['main','more']){
   const visible=(page==='main')===(this.screen===0);
   for(const item of this.widgets[page])item.setProperty(ui.prop.VISIBLE,visible);
  }
  if(this.pending){
   if(this.screen===0)this.mainMore.setProperty(ui.prop.TEXT,'CONFIRM');
   else this.backButton.setProperty(ui.prop.TEXT,'CONFIRM');
  }else{
   this.mainMore.setProperty(ui.prop.TEXT,'MORE');
   this.backButton.setProperty(ui.prop.TEXT,'BACK');
  }
  // BasePage may own a framework-managed 'state' property on real Zepp OS.
  // Keep our metrics separate and never stringify undefined or invalid values.
  const values=this.polestarMetrics||{};
  const battery=Number.isFinite(values.battery)&&values.battery>=0&&values.battery<=100?
   Math.round(values.battery)+' %':'-- %';
  const range=Number.isFinite(values.range)&&values.range>=0&&values.range<=2000?
   Math.round(values.range)+' km':'-- km';
  this.battery.setProperty(ui.prop.TEXT,battery);
  this.range.setProperty(ui.prop.TEXT,range);
 },
 setPage(page){
  this.pending=null;this.screen=page===1?1:0;
  this.render();
  this.show(page===1?'Choose an action':'Tap a control or refresh in Zepp');
 },
 next(){this.setPage(this.screen===0?1:0);},
 async phoneRequest(message,timeout){
  if(this.messaging&&typeof this.messaging.request==='function')
   return this.messaging.request(message,{timeout});
  throw Error('Zepp phone connection unavailable');
 },
 async arm(action){
  if(this.busy)return;
  this.busy=true;
  // Never display stale live telemetry after reconnection or a failed refresh.
  this.polestarMetrics={battery:null,range:null,charging:false,lock:'unknown',verified:false};
  this.render();
  try{
   const cap=await this.phoneRequest({method:'vehicle.capabilities'},12000);
   if(!cap||!cap.ok||!cap.native_verified){
    this.pending=null;this.render();
    this.show('Controls unavailable: native C3 not verified.');
    return;
   }
   this.pending={action,expires:Date.now()+10000};this.render();
   this.show('Confirm '+action.replace(/_/g,' ').toUpperCase()+' within 10s');
  }catch(e){
   this.pending=null;this.render();
   this.show('Phone connection unavailable: '+String(e&&e.message||e).slice(0,50));
  }finally{this.busy=false;}
 },
 async confirm(){
  if(this.busy||!this.pending)return;
  const p=this.pending;this.pending=null;this.render();
  if(Date.now()>p.expires){this.show('Confirmation expired');return;}
  this.busy=true;
  try{
   this.show('Sending '+p.action.replace(/_/g,' ')+'…');
   const r=await this.phoneRequest({
    method:'vehicle.command',params:{action:p.action,confirmed:true}
   },60000);
   this.show(r&&r.ok&&r.verified?'Vehicle state verified':
    r&&r.error||'Command not verified');
  }catch(e){this.show('Command failed: '+String(e&&e.message||e).slice(0,65));}
  finally{this.busy=false;}
 },
 async footerAction(){
  if(this.pending)return this.confirm();
  this.next();
 },
 async refresh(){
  if(this.busy)return;
  this.busy=true;
  try{
   const cap=await this.phoneRequest({method:'vehicle.capabilities'},12000);
   if(!cap||!cap.authenticated){this.show('Connect your Polestar ID in Zepp');return;}
   if(!cap.vehicle_configured){this.show('Add your vehicle VIN in Zepp');return;}
   if(!cap.native_verified){
    this.show('Polestar 4 saved • live status unavailable');return;
   }
   const r=await this.phoneRequest({method:'vehicle.status'},20000);
   if(!r||!r.ok){this.show(String(r&&r.error||'Vehicle unavailable'));return;}
   const battery=Number(r.battery_percent),range=Number(r.range_km);
   if(!Number.isFinite(battery)||battery<0||battery>100||
      !Number.isFinite(range)||range<0||range>2000){
    this.show('Vehicle values unavailable');return;
   }
   this.polestarMetrics={battery,range,charging:!!r.charging,
    lock:r.lock_state||'unknown',verified:true};
   this.show('Lock '+this.polestarMetrics.lock+
    (this.polestarMetrics.charging?' • Charging':' • Connected'));
  }catch(e){this.show('Zepp phone unavailable: '+String(e&&e.message||e).slice(0,70));}
  finally{this.busy=false;this.render();}
 },
 onDestroy(){this.disposed=true;}
}));
