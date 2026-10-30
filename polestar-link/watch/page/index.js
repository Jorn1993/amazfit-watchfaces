import * as ui from '@zos/ui';
import { BasePage } from '@zeppos/zml/base-page';
Page(BasePage({
 build(){
  this.busy=false;this.disposed=false;this.pending=null;
  ui.createWidget(ui.widget.TEXT,{x:55,y:56,w:370,h:48,text:'POLESTAR LINK',text_size:30,color:0xffffff,align_h:ui.align.CENTER_H});
  this.result=ui.createWidget(ui.widget.TEXT,{x:48,y:124,w:384,h:110,text:'Open Zepp to connect your Polestar',text_size:21,color:0xa9d9d3,text_style:ui.text_style.WRAP,align_h:ui.align.CENTER_H});
  ui.createWidget(ui.widget.BUTTON,{x:65,y:252,w:160,h:66,radius:22,normal_color:0x225b4d,press_color:0x307966,text:'LOCK',text_size:25,color:0xffffff,click_func:()=>this.arm('lock')});
  ui.createWidget(ui.widget.BUTTON,{x:255,y:252,w:160,h:66,radius:22,normal_color:0x674b3b,press_color:0x936a52,text:'UNLOCK',text_size:25,color:0xffffff,click_func:()=>this.arm('unlock')});
  ui.createWidget(ui.widget.BUTTON,{x:110,y:352,w:260,h:62,radius:20,normal_color:0x264059,press_color:0x365b7d,text:'STATUS / CONFIRM',text_size:18,color:0xffffff,click_func:()=>this.action()});
 },
 show(t){if(!this.disposed)this.result.setProperty(ui.prop.TEXT,t);},
 arm(action){if(this.busy)return;this.pending={action,expires:Date.now()+10000};this.show('Confirm '+action.toUpperCase()+'?\nTap CONFIRM within 10 seconds');},
 async action(){
  if(this.busy)return;this.busy=true;
  try{
   if(this.pending && Date.now()<=this.pending.expires){
     const action=this.pending.action;this.pending=null;this.show('Sending '+action+'…');
     const r=await this.request({method:'vehicle.command',params:{action,confirmed:true}},{timeout:60000});
     this.show(r&&r.ok?'Command sent\nRefresh status to verify':(r&&r.error)||'Command failed');
   }else{
     this.pending=null;
     this.show('Checking Zepp phone service…');
     let ping;
     try{
       ping=await this.request({method:'zepp.ping'},{timeout:10000});
     }catch(error){
       this.show('Phone service unavailable.\\nOpen Zepp and try again.');
       return;
     }
     if(!ping||!ping.ok){
       this.show('No response from Zepp phone.');
       return;
     }
     if(!ping.auth){
       this.show('Sign in using Zepp app.\\n'+String(ping.status||'Not connected').slice(0,90));
       return;
     }
     this.show('Fetching Polestar vehicle status…');
     const r=await this.request({method:'vehicle.status'},{timeout:20000});
     this.show(r&&r.ok?'Battery: '+(r.battery_percent??'?')+'%\\nRange: '+(r.range_km??'?')+' km\\nLock: '+(r.lock_state||'unknown'):(r&&r.error)||'Polestar status failed');
   }
  }catch(e){this.show('Connection timed out.\nCheck Zepp on your phone.');}
  finally{this.busy=false;}
 },
 onDestroy(){this.disposed=true;}
}));
