import { BaseSideService } from '@zeppos/zml/base-side';
const storage=()=>settings.settingsStorage;
function config(){
 const s=storage(), url=(s.getItem('gateway.url')||'').replace(/\/$/,'');
 const token=s.getItem('gateway.token')||'';
 if(!/^https:\/\/[a-z0-9.-]+(?::[0-9]+)?$/i.test(url) || token.length<16)
   throw Error('Configure HTTPS bridge URL and access token in Zepp');
 return {url,token};
}
async function api(path,method='GET',payload){
 const {url,token}=config();
 const r=await fetch({url:url+path,method,
   headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   ...(payload?{body:JSON.stringify(payload)}:{})});
 let body;
 try{body=typeof r.body==='string'?JSON.parse(r.body):r.body}catch(e){throw Error('Invalid bridge response');}
 if(r.status<200||r.status>=300)throw Error((body&&body.detail)||'Gateway returned HTTP '+r.status);
 return body;
}
AppSideService(BaseSideService({
 onInit(){
  storage().addListener('change',async ({key})=>{
   if(key!=='gateway.check')return;
   try{
    const result=await api('/api/vehicles');
    const car=result.vehicles&&result.vehicles[0];
    if(!car || !car.vin)throw Error('No vehicle returned by Polestar');
    storage().setItem('gateway.vin',car.vin);
    storage().setItem('gateway.status','Connected: '+(car.name||'Polestar'));
   }catch(e){storage().setItem('gateway.vin','');storage().setItem('gateway.status',e.message||'Connection failed');}
  });
 },
 onRequest(req,res){
  if(req.method==='zepp.ping'){res(null,{ok:true,version:'0.7.0'});return;}
  if(req.method==='vehicle.status'){
   const vin=storage().getItem('gateway.vin');
   if(!vin){res(null,{ok:false,error:'Connect your vehicle in Zepp Settings'});return;}
   api('/api/status/'+encodeURIComponent(vin))
     .then(result=>res(null,{ok:true,...result}))
     .catch(e=>res(null,{ok:false,error:e.message||'Status failed'}));
   return;
  }
  if(req.method==='vehicle.command'){
   const p=req.params||{};
   if(!['lock','unlock'].includes(p.action)||p.confirmed!==true){
     res(null,{ok:false,error:'Explicit confirmation required'});return;
   }
   const vin=storage().getItem('gateway.vin');
   if(!vin){res(null,{ok:false,error:'Connect your vehicle in Zepp Settings'});return;}
   api('/api/command','POST',{vin,action:p.action,confirmed:true})
     .then(r=>res(null,{ok:r.accepted===true,message:r.note||'Check actual vehicle status'}))
     .catch(e=>res(null,{ok:false,error:e.message||'Command failed'}));
   return;
  }
  res(null,{ok:false,error:'Unknown request'});
 }
}));
