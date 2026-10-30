import { BaseSideService } from '@zeppos/zml/base-side';
const s=()=>settings.settingsStorage;
const checks=[
 {name:'GET',url:'https://www.polestar.com/',method:'GET'},
 {name:'POST JSON',url:'https://postman-echo.com/post',method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({probe:'polestar-link'})},
 {name:'POST custom',url:'https://postman-echo.com/post',method:'POST',headers:{'Content-Type':'application/json','X-Polestar-Link-Probe':'1'},body:JSON.stringify({probe:true})},
 {name:'POST framed',url:'https://postman-echo.com/post',method:'POST',headers:{'Content-Type':'application/grpc'},body:String.fromCharCode(0,0,0,0,0)}
];
AppSideService(BaseSideService({
 onInit(){
  s().addListener('change',async ({key})=>{
   if(key!=='probe.request')return;
   const output=[];
   for(const check of checks){
    try{
     const {name,...opts}=check;
     const r=await fetch(opts);
     output.push(name+': HTTP '+r.status);
    }catch(e){
     output.push(check.name+': '+String(e&&e.message||e).slice(0,110));
    }
    s().setItem('probe.result',output.join(' | '));
   }
  });
 },
 onRequest(req,res){
  if(req.method==='zepp.ping'){res(null,{ok:true,version:'0.8.1'});return;}
  res(null,{ok:false,error:'Vehicle authentication and commands unavailable in diagnostic build'});
 }
}));
