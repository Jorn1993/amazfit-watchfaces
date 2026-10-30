import * as ui from '@zos/ui';
import { BasePage } from '@zeppos/zml/base-page';

// Navigation/layout ports C3 features from kildahldev/unofficial-polestar-api.
// Real car actions are blocked unless Zepp confirms a live C3 connection.
const SCREENS=[
 {title:'OVERVIEW',actions:[{label:'REFRESH',action:'refresh'},{label:'CONTROLS',action:'next'}]},
 {title:'DOOR LOCKS',actions:[{label:'LOCK',action:'lock'},{label:'UNLOCK',action:'unlock'}]},
 {title:'ACCESS',actions:[{label:'TRUNK',action:'trunk_unlock'},{label:'FLASH',action:'flash'}]},
 {title:'CLIMATE',actions:[{label:'START',action:'climate_start'},{label:'STOP',action:'climate_stop'}]},
 {title:'WINDOWS',actions:[{label:'OPEN ALL',action:'windows_open'},{label:'CLOSE ALL',action:'windows_close'}]},
 {title:'HORN & LIGHTS',actions:[{label:'HONK',action:'honk'},{label:'BOTH',action:'honk_flash'}]}
];
Page(BasePage({
 build(){
  this.busy=false;this.disposed=false;this.pending=null;this.screen=0;
  this.header=ui.createWidget(ui.widget.TEXT,{
   x:50,y:56,w:380,h:45,text:'POLESTAR LINK',text_size:29,
   color:0xffffff,align_h:ui.align.CENTER_H
  });
  this.subhead=ui.createWidget(ui.widget.TEXT,{
   x:55,y:117,w:370,h:40,text:'OVERVIEW',text_size:23,
   color:0x75d9bf,align_h:ui.align.CENTER_H
  });
  this.result=ui.createWidget(ui.widget.TEXT,{
   x:45,y:165,w:390,h:120,text:'Press REFRESH to check your Polestar 4',
   text_size:21,color:0xd9e5e2,align_h:ui.align.CENTER_H,
   text_style:ui.text_style.WRAP
  });
  this.left=ui.createWidget(ui.widget.BUTTON,{
   x:53,y:306,w:180,h:66,radius:21,
   normal_color:0x205f50,press_color:0x2f8b74,
   text:'REFRESH',text_size:21,color:0xffffff,
   click_func:()=>this.tap(0)
  });
  this.right=ui.createWidget(ui.widget.BUTTON,{
   x:248,y:306,w:180,h:66,radius:21,
   normal_color:0x284359,press_color:0x376386,
   text:'CONTROLS',text_size:20,color:0xffffff,
   click_func:()=>this.tap(1)
  });
  this.footer=ui.createWidget(ui.widget.BUTTON,{
   x:126,y:399,w:228,h:55,radius:19,
   normal_color:0x273038,press_color:0x3d4e57,
   text:'NEXT PAGE',text_size:18,color:0xc5d8d5,
   click_func:()=>this.footerAction()
  });
  this.render();
 },
 render(){
  if(this.disposed)return;
  const mode=SCREENS[this.screen];
  this.subhead.setProperty(ui.prop.TEXT,mode.title);
  this.left.setProperty(ui.prop.TEXT,mode.actions[0].label);
  this.right.setProperty(ui.prop.TEXT,mode.actions[1].label);
  this.footer.setProperty(ui.prop.TEXT,this.pending?'CONFIRM ACTION':
   this.screen===SCREENS.length-1?'BACK TO HOME':'NEXT PAGE');
 },
 show(message){if(!this.disposed)this.result.setProperty(ui.prop.TEXT,String(message));},
 async phoneRequest(message,timeout){
  if(this.messaging&&typeof this.messaging.request==='function')
   return this.messaging.request(message,{timeout});
  throw Error('Zepp watch-to-phone messaging is unavailable');
 },
 next(){
  this.pending=null;
  this.screen=(this.screen+1)%SCREENS.length;
  this.render();
  this.show(this.screen===0?
   'Press REFRESH to check your Polestar 4':
   'C3 controls require verified vehicle connectivity');
 },
 tap(index){
  const action=SCREENS[this.screen].actions[index].action;
  if(action==='next'){this.next();return;}
  if(action==='refresh'){void this.refresh();return;}
  void this.arm(action);
 },
 async arm(action){
  if(this.busy)return;
  this.busy=true;
  try{
   const cap=await this.phoneRequest({method:'vehicle.capabilities'},12000);
   if(!cap||!cap.ok||!cap.native_verified){
    this.pending=null;
    this.show('Remote controls unavailable.\\nNative C3 connection not verified.');
    this.render();
    return;
   }
   this.pending={action,expires:Date.now()+10000};
   this.show('Confirm '+action.replace(/_/g,' ').toUpperCase()+'?\\nTap CONFIRM within 10 seconds');
   this.render();
  }catch(e){
   this.pending=null;
   this.show('Zepp phone unavailable: '+String(e&&e.message||e).slice(0,65));
   this.render();
  }finally{this.busy=false;}
 },
 async footerAction(){
  if(this.busy)return;
  if(!this.pending){this.next();return;}
  if(Date.now()>this.pending.expires){
   this.pending=null;this.render();this.show('Confirmation expired');return;
  }
  const action=this.pending.action;this.pending=null;this.render();
  this.busy=true;
  try{
   this.show('Sending '+action.replace(/_/g,' ')+'…');
   const r=await this.phoneRequest({
    method:'vehicle.command',params:{action,confirmed:true}
   },60000);
   if(r&&r.ok&&r.verified)this.show('Vehicle state confirmed');
   else this.show(r&&r.error||'Command result not verified');
  }catch(e){this.show('Command transport error: '+String(e&&e.message||e).slice(0,60));}
  finally{this.busy=false;}
 },
 async refresh(){
  if(this.busy)return;
  this.busy=true;this.pending=null;this.render();
  try{
   this.show('Checking vehicle status…');
   const cap=await this.phoneRequest({method:'vehicle.capabilities'},12000);
   if(!cap||!cap.authenticated){
    this.show('Open Polestar Link in Zepp to connect your account');return;
   }
   if(!cap.vehicle_configured){
    this.show('Polestar account connected.\\nAdd your vehicle in Zepp.');return;
   }
   if(!cap.native_verified){
    this.show('Polestar 4 configured.\\nC3 vehicle communication unavailable.');return;
   }
   const result=await this.phoneRequest({method:'vehicle.status'},20000);
   this.show(result&&result.ok?
    'Battery '+result.battery_percent+'%\\nRange '+result.range_km+' km\\nLock '+result.lock_state:
    String(result&&result.error||'Live status not available'));
  }catch(e){this.show('Phone service error: '+String(e&&e.message||e).slice(0,70));}
  finally{this.busy=false;}
 },
 onDestroy(){this.disposed=true;}
}));
