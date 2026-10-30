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
 async phoneRequest(message,timeout){
  // ZML's BasePage.request adds a device-local postMessage bridge.
  // The actual BLE request/response is handled by messaging.request directly.
  // Bypass the extra app-level bridge, which may not complete if the app
  // startup hits a CommonJS module initialization error.
  if(this.messaging && typeof this.messaging.request==='function'){
   return this.messaging.request(message,{timeout});
  }
  // Fail visibly instead of remaining forever at "Checking Zepp".
  throw Error('Zepp messaging did not initialize on the watch');
 },
 arm(action){if(this.busy)return;this.pending={action,expires:Date.now()+10000};this.show('Confirm '+action.toUpperCase()+'?\nTap CONFIRM within 10 seconds');},
 async action(){
  if(this.busy)return;this.busy=true;
  try{
   if(this.pending && Date.now()<=this.pending.expires){
     const action=this.pending.action;this.pending=null;this.show('Sending '+action+'…');
     const r=await this.phoneRequest({method:'vehicle.command',params:{action,confirmed:true}},60000);
     this.show(r&&r.ok&&r.verified?'Car state confirmed':(r&&r.error)||'Command not verified');
   }else{
     this.pending=null;
     this.show('Checking Zepp phone service…');
     let ping;
     try{
       ping=await this.phoneRequest({method:'zepp.ping'},10000);
     }catch(error){
       this.show('Zepp messaging error.\\n'+String(error&&error.message||error).slice(0,95));
       return;
     }
     if(!ping||!ping.ok){
       this.show('Zepp phone returned no response.');
       return;
     }
     if(!ping.auth){
       this.show('Checking Polestar login compatibility…');
       let authProbe;
       try{authProbe=await this.phoneRequest({method:'auth.preflight'},20000);}
       catch(e){
         this.show('Polestar login probe failed.\\n'+String(e&&e.message||e).slice(0,90));
         return;
       }
       if(!authProbe||!authProbe.ok){
         this.show('Polestar login probe failed.\\n'+String(authProbe&&authProbe.error||'No response').slice(0,90));
         return;
       }
       this.show('Testing Polestar gRPC transport…');
       let grpcProbe;
       try{grpcProbe=await this.phoneRequest({method:'grpc.preflight'},20000);}
       catch(e){grpcProbe={ok:false,error:String(e&&e.message||e)};}
       this.show('Login page: '+(authProbe.login_page?'yes':'no')+
        '\\nSession cookies: '+(authProbe.cookie_accessible?'yes':'not available')+
        '\\nPKCE crypto: '+(authProbe.pkce_secure_crypto?'available':'not verified')+
        '\\ngRPC: unverified'+(grpcProbe&&grpcProbe.grpc_http?' (HTTP '+grpcProbe.grpc_http+')':''));
       return;
     }
     this.show('Fetching Polestar vehicle status…');
     const r=await this.phoneRequest({method:'vehicle.status'},20000);
     this.show(r&&r.ok?'Battery: '+(r.battery_percent??'?')+'%\\nRange: '+(r.range_km??'?')+' km\\nLock: '+(r.lock_state||'unknown'):(r&&r.error)||'Polestar status failed');
   }
  }catch(e){this.show('Connection error.\\n'+String(e&&e.message||e).slice(0,95));}
  finally{this.busy=false;}
 },
 onDestroy(){this.disposed=true;}
}));
