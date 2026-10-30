import * as ui from '@zos/ui';
import { BasePage } from '@zeppos/zml/base-page';
Page(BasePage({
 build(){
  this.busy=false;this.disposed=false;
  ui.createWidget(ui.widget.TEXT,{x:70,y:60,w:340,h:52,text:'LINK TEST',text_size:32,color:0xffffff,align_h:ui.align.CENTER_H});
  ui.createWidget(ui.widget.TEXT,{x:55,y:115,w:370,h:40,text:'Balance 2 • Android',text_size:22,color:0x9baabb,align_h:ui.align.CENTER_H});
  this.result=ui.createWidget(ui.widget.TEXT,{x:55,y:172,w:370,h:126,text:'Start the bridge on your phone',text_size:24,color:0x79dfbd,align_h:ui.align.CENTER_H,text_style:ui.text_style.WRAP});
  ui.createWidget(ui.widget.BUTTON,{x:90,y:312,w:300,h:64,radius:26,normal_color:0x245e50,press_color:0x34836f,text:'Test connection',text_size:24,color:0xffffff,click_func:()=>this.test()});
  ui.createWidget(ui.widget.TEXT,{x:80,y:390,w:320,h:35,text:'Diagnostic only • no car access',text_size:17,color:0x8997a6,align_h:ui.align.CENTER_H});
 },
 show(text){if(!this.disposed)this.result.setProperty(ui.prop.TEXT,text);},
 async test(){
  if(this.busy)return;this.busy=true;this.show('Checking Zepp…');
  let zepp=false;const started=Date.now();
  try{
   await this.request({method:'zepp.ping'},{timeout:8000});zepp=true;
   this.show('Zepp connected\nChecking Android…');
   const reply=await this.request({method:'bridge.probe',params:{nonce:String(Date.now())}},{timeout:8000});
   this.show(reply.ok?'Connected • '+(Date.now()-started)+' ms\nPhone '+(reply.locked?'locked':'unlocked')+'\nTest #'+reply.count:'Zepp connected\n'+reply.error);
  }catch(e){this.show(zepp?'Zepp connected\nAndroid test timed out':'Zepp not responding\nCheck watch connection');}
  finally{this.busy=false;}
 },
 onDestroy(){this.disposed=true;}
}));
