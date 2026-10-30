import * as ui from '@zos/ui';
import { BasePage } from '@zeppos/zml/base-page';
Page(BasePage({
 build(){
  this.busy=false;this.disposed=false;this.pending=null;
  ui.createWidget(ui.widget.TEXT,{x:58,y:52,w:364,h:48,text:'POLESTAR LINK',text_size:30,color:0xffffff,align_h:ui.align.CENTER_H});
  this.result=ui.createWidget(ui.widget.TEXT,{x:50,y:126,w:380,h:102,text:'Test direct network in Zepp Settings',text_size:23,color:0x9edbd2,text_style:ui.text_style.WRAP,align_h:ui.align.CENTER_H});
  ui.createWidget(ui.widget.BUTTON,{x:62,y:258,w:165,h:66,radius:22,normal_color:0x26473c,press_color:0x396a57,text:'LOCK',text_size:25,color:0xffffff,click_func:()=>this.arm('lock')});
  ui.createWidget(ui.widget.BUTTON,{x:253,y:258,w:165,h:66,radius:22,normal_color:0x55413a,press_color:0x75594b,text:'UNLOCK',text_size:25,color:0xffffff,click_func:()=>this.arm('unlock')});
  ui.createWidget(ui.widget.BUTTON,{x:116,y:351,w:248,h:58,radius:18,normal_color:0x25394d,press_color:0x36526a,text:'STATUS / CONFIRM',text_size:18,color:0xffffff,click_func:()=>this.confirm()});
 },
 show(t){if(!this.disposed)this.result.setProperty(ui.prop.TEXT,t);},
 arm(action){if(this.busy)return;this.pending={action,expires:Date.now()+10000};this.show('Direct control not implemented\nUse Zepp connection test');},
 async confirm(){
  if(this.busy)return;
  if(!this.pending||Date.now()>this.pending.expires){this.pending=null;this.show('No command pending\nConnect in Zepp Settings');return;}
  const action=this.pending.action;this.pending=null;this.busy=true;this.show('Checking '+action+' availability…');
  try{
   const r=await this.request({method:'vehicle.command',params:{action,confirmed:true}},{timeout:60000});
   this.show(r&&r.ok?'Command unavailable in direct test':(r&&r.error)||'Command not confirmed');
  }catch(e){this.show('Command timed out\nCheck actual vehicle state');}
  finally{this.busy=false;}
 },
 onDestroy(){this.disposed=true;}
}));
