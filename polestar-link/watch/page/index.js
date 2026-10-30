import * as ui from '@zos/ui';
import { BasePage } from '@zeppos/zml/base-page';
Page(BasePage({
 build(){
  this.busy=false;this.disposed=false;
  ui.createWidget(ui.widget.TEXT,{x:60,y:55,w:360,h:48,text:'POLESTAR LINK',text_size:30,color:0xffffff,align_h:ui.align.CENTER_H});
  ui.createWidget(ui.widget.TEXT,{x:55,y:118,w:370,h:35,text:'DEMO • NOT CONNECTED',text_size:20,color:0xffbd73,align_h:ui.align.CENTER_H});
  this.result=ui.createWidget(ui.widget.TEXT,{x:45,y:166,w:390,h:76,text:'Open Zepp app settings to configure',text_size:21,color:0xb9c7d6,text_style:ui.text_style.WRAP,align_h:ui.align.CENTER_H});
  ui.createWidget(ui.widget.BUTTON,{x:62,y:265,w:165,h:66,radius:20,normal_color:0x223c4b,press_color:0x31566c,text:'LOCK',text_size:25,color:0xffffff,click_func:()=>this.demo('Lock')});
  ui.createWidget(ui.widget.BUTTON,{x:253,y:265,w:165,h:66,radius:20,normal_color:0x223c4b,press_color:0x31566c,text:'UNLOCK',text_size:25,color:0xffffff,click_func:()=>this.demo('Unlock')});
  ui.createWidget(ui.widget.BUTTON,{x:110,y:353,w:260,h:56,radius:20,normal_color:0x1d6156,press_color:0x327d6b,text:'Test Zepp',text_size:20,color:0xffffff,click_func:()=>this.test()});
 },
 show(t){if(!this.disposed)this.result.setProperty(ui.prop.TEXT,t);},
 demo(action){this.show(action+' unavailable\nConnect Polestar first');},
 async test(){
  if(this.busy)return;this.busy=true;this.show('Checking Zepp connection…');
  try{
   const r=await this.request({method:'zepp.ping'},{timeout:8000});
   this.show(r&&r.ok?'Zepp connected\nVehicle not configured':'Zepp service not responding');
  }catch(e){this.show('Cannot reach Zepp phone service');}
  finally{this.busy=false;}
 },
 onDestroy(){this.disposed=true;}
}));
