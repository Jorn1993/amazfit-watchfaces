import { BaseSideService } from '@zeppos/zml/base-side';
const store=()=>settings.settingsStorage;
const checks=[
 {name:'OAuth authorization',url:'https://polestarid.eu.polestar.com/as/authorization.oauth2?response_type=code&client_id=l3oopkc_10&redirect_uri=https%3A%2F%2Fwww.polestar.com%2Fsign-in-callback&scope=openid%20profile%20email&state=zepp-probe',method:'GET'},
 {name:'Polestar ID root',url:'https://polestarid.eu.polestar.com/',method:'GET'},
 {name:'Public website control',url:'https://www.polestar.com/',method:'GET'}
];
AppSideService(BaseSideService({
 onInit(){
  store().addListener('change',async ({key})=>{
   if(key!=='probe.request')return;
   const results=[];
   for(const check of checks){
    try{
      const r=await fetch({url:check.url,method:check.method});
      results.push(check.name+': HTTP '+r.status);
    }catch(e){
      results.push(check.name+': '+String(e&&e.message||e).slice(0,90));
    }
    store().setItem('probe.result',results.join(' | '));
   }
  });
 },
 onRequest(req,res){
   if(req.method==='zepp.ping'){res(null,{ok:true,version:'0.9.1'});return;}
   res(null,{ok:false,error:'Polestar sign-in and vehicle commands not implemented'});
 }
}));
