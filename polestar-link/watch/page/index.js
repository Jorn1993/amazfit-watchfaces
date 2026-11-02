import * as ui from '@zos/ui';
import { BasePage } from '@zeppos/zml/base-page';

// A single state-driven card per control. No inferred vehicle states.
const C={bg:0x0c0e10,surface:0x26302e,card:0x1b1e20,muted:0x9ba8a1,
 ink:0xf3f4f1,active:0xb4e8c7,activeInk:0x09271f};
const VIEWS=['main','more','status','exterior'];
const ACTIONS=[['TRUNK','trunk_unlock'],['FLASH','flash'],
 ['HONK','honk'],['HONK + FLASH','honk_flash']];
const fmt=v=>v===undefined||v===null||v===''||v==='unknown'?'--':String(v);
const num=(v,unit)=>typeof v==='number'&&Number.isFinite(v)&&v>=0?
 Math.round(v)+unit:'--'+unit;
const level=(s,yes,no)=>yes.includes(s)?'on':no.includes(s)?'off':'unknown';
Page(BasePage({
 build(){
  this.screen=0;this.busy=false;this.disposed=false;this.pending=null;
  this.polestarMetrics={battery:null,range:null,charging:null,lock:'unknown',verified:false};
  this.detailValues={};this.widgets={main:[],more:[],status:[],exterior:[]};
  this.toggles=[];this.rows=[];
  const create=(type,params)=>ui.createWidget(type,params);
  const add=(page,type,params)=>{
   const w=create(type,params);this.widgets[page].push(w);return w;
  };
  const txt=(page,x,y,w,h,value,size=18,color=C.ink)=>
   add(page,ui.widget.TEXT,{x,y,w,h,text:value,text_size:size,color,
    align_h:ui.align.CENTER_H,text_style:ui.text_style.WRAP});
  const button=(page,x,y,w,h,label,click,bg=C.surface,size=17,fg=C.ink)=>
   add(page,ui.widget.BUTTON,{x,y,w,h,radius:14,text:label,text_size:size,
    color:fg,normal_color:bg,press_color:0x45554b,click_func:click});
  const navigation=(page,x,label,next)=>button(page,x,423,108,36,label,()=>{
   if(this.pending)void this.confirm();else this.setPage(next);
  },C.surface,14);
  const toggle=(page,x,y,label,key,activate,deactivate)=>{
   const onLabel=key==='lock'?'UNLOCKED':key==='window'?'WINDOWS OPEN':
    key==='climate'?'CLIMATE ON':'CHARGING';
   const offLabel=key==='lock'?'LOCKED':key==='window'?'WINDOWS CLOSED':
    key==='climate'?'CLIMATE OFF':'CHARGE OFF';
   const on=button(page,x,y,163,51,onLabel,()=>void this.arm(deactivate),C.active,16,C.activeInk);
   const off=button(page,x,y,163,51,offLabel,()=>void this.arm(activate),C.surface,16);
   const unknown=button(page,x,y,163,51,label+' --',
    ()=>this.show('Live '+label.toLowerCase()+' state is unavailable'),C.card,16,C.muted);
   this.toggles.push({page,key,on,off,unknown});
  };
  const statusRow=(page,index,label,key)=>{
   const y=188+index*29;
   txt(page,80,y,178,29,label,15,C.muted);
   this.rows.push({page,key,value:txt(page,250,y,148,29,'--',16)});
  };
  create(ui.widget.FILL_RECT,{x:0,y:0,w:480,h:480,color:C.bg});
  create(ui.widget.IMG,{x:218,y:28,w:44,h:44,src:'polestar-mark.png',auto_scale:true});
  create(ui.widget.TEXT,{x:90,y:76,w:300,h:32,text:'P O L E S T A R',
   text_size:22,color:C.ink,align_h:ui.align.CENTER_H});
  this.title=create(ui.widget.TEXT,{x:67,y:116,w:346,h:35,text:'POLESTAR 4',
   text_size:21,color:C.muted,align_h:ui.align.CENTER_H});
  add('main',ui.widget.FILL_RECT,{x:62,y:164,w:356,h:103,radius:22,color:C.card});
  this.battery=txt('main',80,176,150,48,'-- %',38);
  this.range=txt('main',248,176,154,48,'-- km',34);
  txt('main',90,230,130,23,'BATTERY',14,C.muted);
  txt('main',265,230,115,23,'RANGE',14,C.muted);
  this.notice=txt('main',75,269,330,29,'Pair Android in Zepp',14,C.muted);
  this.refreshButton=button('main',354,118,65,34,'SYNC',()=>void this.refresh(),C.surface,15);
  toggle('main',71,301,'LOCK','lock','unlock','lock');
  toggle('main',245,301,'WINDOWS','window','windows_open','windows_close');
  toggle('main',71,360,'CLIMATE','climate','climate_start','climate_stop');
  toggle('main',245,360,'CHARGE','charge','charge_start','charge_stop');
  this.mainMore=navigation('main',128,'CONTROLS',1);
  this.mainStatus=navigation('main',246,'STATUS',2);
  this.moreNotice=txt('more',75,159,330,33,'Actions require confirmation',14,C.muted);
  ACTIONS.forEach((a,i)=>{
   const x=i%2===0?72:246,y=204+Math.floor(i/2)*62;
   button('more',x,y,162,55,a[0],()=>void this.arm(a[1]),C.surface,a[0].length>10?15:18);
  });
  txt('more',84,346,310,43,'State-aware controls are on Home',15,C.muted);
  this.backButton=navigation('more',128,'HOME',0);
  this.moreStatus=navigation('more',246,'STATUS',2);
  this.statusNotice=txt('status',75,157,330,30,'Polestar C3 status',14,C.muted);
  [['BATTERY','battery'],['RANGE','range'],['CHARGING','charging'],
   ['CABLE','cable'],['POWER','power'],['CLIMATE','climate'],
   ['TIME TO FULL','timeToFull'],['ODOMETER','odometer']].forEach((item,i)=>
    statusRow('status',i,item[0],item[1]));
  this.statusHome=navigation('status',128,'HOME',0);
  this.statusNext=navigation('status',246,'EXTERIOR',3);
  this.exteriorNotice=txt('exterior',75,157,330,30,'Doors and windows',14,C.muted);
  [['LOCK','lock'],['WINDOWS','window'],['FRONT LEFT','frontLeftDoor'],
   ['FRONT RIGHT','frontRightDoor'],['REAR LEFT','rearLeftDoor'],
   ['REAR RIGHT','rearRightDoor'],['TRUNK','trunk'],['HOOD','hood']].forEach((item,i)=>
    statusRow('exterior',i,item[0],item[1]));
  this.exteriorHome=navigation('exterior',128,'HOME',0);
  this.exteriorBack=navigation('exterior',246,'STATUS',2);
  this.setPage(0);void this.refresh();
 },
 show(msg){
  if(this.disposed)return;
  const w=[this.notice,this.moreNotice,this.statusNotice,this.exteriorNotice][this.screen];
  if(w)w.setProperty(ui.prop.TEXT,String(msg||'').slice(0,110));
 },
 field(key){
  const m=this.polestarMetrics||{},d=this.detailValues||{};
  switch(key){
   case 'battery':return num(m.battery,' %');
   case 'range':return num(m.range,' km');
   case 'lock':return fmt(m.lock);
   case 'window':return fmt(d.window_state);
   case 'climate':return fmt(d.climate_state);
   case 'charge':case 'charging':return fmt(d.charging_state);
   case 'cable':return fmt(d.charger_connection);
   case 'power':return num(d.charging_power_watts,' W');
   case 'timeToFull':return num(d.time_to_full_minutes,' min');
   case 'odometer':return num(d.odometer_km,' km');
   case 'frontLeftDoor':return fmt(d.front_left_door);
   case 'frontRightDoor':return fmt(d.front_right_door);
   case 'rearLeftDoor':return fmt(d.rear_left_door);
   case 'rearRightDoor':return fmt(d.rear_right_door);
   case 'trunk':return fmt(d.trunk);
   case 'hood':return fmt(d.hood);
   default:return '--';
  }
 },
 mode(key){
  if(!this.polestarMetrics.verified)return 'unknown';
  if(key==='lock')return level(this.polestarMetrics.lock,['unlocked'],['locked']);
  if(key==='window')return level(this.detailValues.window_state,['open','ajar'],['closed']);
  if(key==='climate')return level(this.detailValues.climate_state,['active','starting'],['idle']);
  if(key==='charge')return level(this.detailValues.charging_state,
   ['charging','smart charging'],['idle','scheduled','discharging','complete','paused']);
  return 'unknown';
 },
 render(){
  if(this.disposed)return;
  this.title.setProperty(ui.prop.TEXT,
   ['POLESTAR 4','VEHICLE CONTROLS','VEHICLE STATUS','EXTERIOR STATUS'][this.screen]);
  const current=VIEWS[this.screen];
  for(const page of VIEWS)
   for(const w of this.widgets[page])w.setProperty(ui.prop.VISIBLE,page===current);
  for(const t of this.toggles){
   const m=this.mode(t.key),visible=t.page===current;
   t.on.setProperty(ui.prop.VISIBLE,visible&&m==='on');
   t.off.setProperty(ui.prop.VISIBLE,visible&&m==='off');
   t.unknown.setProperty(ui.prop.VISIBLE,visible&&m==='unknown');
  }
  this.battery.setProperty(ui.prop.TEXT,this.field('battery'));
  this.range.setProperty(ui.prop.TEXT,this.field('range'));
  for(const r of this.rows)r.value.setProperty(ui.prop.TEXT,this.field(r.key));
  for(const b of [this.mainMore,this.backButton,this.statusHome,this.exteriorHome])
   b.setProperty(ui.prop.TEXT,this.pending?'CONFIRM':b===this.mainMore?'CONTROLS':'HOME');
 },
 setPage(page){
  this.pending=null;
  this.screen=Number.isInteger(page)&&page>=0&&page<4?page:0;
  this.render();
  this.show(['Tap control or SYNC','Choose a vehicle action','Live vehicle status',
   'Live exterior status'][this.screen]);
 },
 next(){this.setPage((this.screen+1)%4);},
 async phoneRequest(message,timeout){
  if(this.messaging&&typeof this.messaging.request==='function')
   return this.messaging.request(message,{timeout});
  throw Error('Zepp phone connection unavailable');
 },
 async arm(action){
  if(this.busy)return;
  this.busy=true;
  try{
   const cap=await this.phoneRequest({method:'vehicle.capabilities'},12000);
   if(!cap||!cap.ok||!cap.native_verified||!this.polestarMetrics.verified){
    this.pending=null;this.render();
    this.show('Controls unavailable: refresh verified vehicle state');return;
   }
   this.pending={action,expires:Date.now()+10000};
   this.render();this.show('Confirm '+action.replace(/_/g,' ').toUpperCase()+' within 10s');
  }catch(e){
   this.pending=null;this.render();
   this.show('Phone unavailable: '+String(e&&e.message||e).slice(0,55));
  }finally{this.busy=false;}
 },
 async confirm(){
  if(this.busy||!this.pending)return;
  const p=this.pending;this.pending=null;this.render();
  if(Date.now()>p.expires){this.show('Confirmation expired');return;}
  this.busy=true;
  try{
   this.show('Sending '+p.action.replace(/_/g,' ')+'...');
   const r=await this.phoneRequest({method:'vehicle.command',
    params:{action:p.action,confirmed:true}},60000);
   this.show(r&&r.ok&&r.verified?'Command verified; tap SYNC to update':
    r&&r.error||'Command unverified; refresh before retrying');
  }catch(e){this.show('Command failed: '+String(e&&e.message||e).slice(0,60));}
  finally{this.busy=false;}
 },
 async footerAction(){
  if(this.pending)return this.confirm();
  this.next();
 },
 async refresh(){
  if(this.busy)return;
  this.busy=true;
  this.polestarMetrics={battery:null,range:null,charging:null,lock:'unknown',verified:false};
  this.detailValues={};this.render();
  try{
   const cap=await this.phoneRequest({method:'vehicle.capabilities'},12000);
   if(!cap||!cap.authenticated){this.show('Pair Android companion in Zepp');return;}
   if(!cap.vehicle_configured){this.show('Add vehicle in Android');return;}
   if(!cap.native_verified){this.show('Live status unavailable; refresh Android');return;}
   const r=await this.phoneRequest({method:'vehicle.status'},20000);
   if(!r||!r.ok){this.show(String(r&&r.error||'Vehicle unavailable'));return;}
   const battery=r.battery_percent,range=r.range_km;
   if(typeof battery!=='number'||!Number.isFinite(battery)||battery<0||battery>100||
    typeof range!=='number'||!Number.isFinite(range)||range<0||range>2000){
    this.show('Vehicle values unavailable');return;
   }
   this.polestarMetrics={battery,range,
    charging:typeof r.charging==='boolean'?r.charging:null,
    lock:r.lock_state||'unknown',verified:true};
   this.render();this.show('Reading detailed C3 status...');
   try{
    const d=await this.phoneRequest({method:'vehicle.details'},32000);
    if(d&&d.ok===true){
     this.detailValues=d;
     if(['locked','unlocked'].includes(d.lock_state))
      this.polestarMetrics.lock=d.lock_state;
     this.show('Vehicle status updated');
    }else this.show('Basic status live; details unavailable');
   }catch(e){this.show('Basic status live; details unavailable');}
  }catch(e){this.show('Zepp phone unavailable: '+String(e&&e.message||e).slice(0,70));}
  finally{this.busy=false;this.render();}
 },
 onDestroy(){this.disposed=true;}
}));
