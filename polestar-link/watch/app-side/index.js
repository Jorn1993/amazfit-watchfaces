import { BaseSideService } from '@zeppos/zml/base-side';
const storage=()=>settings.settingsStorage;
const config=()=>{
 const s=storage(),url=(s.getItem('gateway.url')||'').replace(/\/$/,'');
 const token=s.getItem('gateway.token')||'';
 if(!/^https:\/\/[a-z0-9.-]+(?::[0-9]+)?$/i.test(url)||!token)throw Error('Configure HTTPS gateway and token in Zepp');
 return {url,token};
};
async function api(path,method='GET',payload){
 const {url,token}=config();
 const response=await fetch({url:url+path,method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{})});
 const body=typeof response.body==='string'?JSON.parse(response.body):response.body;
 if(response.status>=400||!body)throw Error('Gateway request failed ('+response.status+')');
 return body;
}
AppSideService(BaseSideService({
 onInit(){
  storage().addListener('change',async ({key})=>{
   if(key!=='gateway.check')return;
   try{
    const result=await api('/api/vehicles');
    const car=result.vehicles&&result.vehicles[0];
    if(!car||!car.vin)throw Error('No Polestar vehicles found');
    storage().setItem('gateway.vin',car.vin);
    storage().setItem('gateway.status','Connected: '+(car.name||'Polestar'));
   }catch(e){storage().setItem('gateway.status',String(e.message||'Connection failed'));}
  });
 },
 onRequest(req,res){
  if(req.method==='zepp.ping'){res(null,{ok:true,version:'0.4.0'});return;}
  if(req.method==='vehicle.status'){
   res(null,{ok:true,connected:!!storage().getItem('gateway.vin'),name:storage().getItem('gateway.status')});return;
  }
  if(req.method==='vehicle.command'){
   const p=req.params||{};
   if(!['lock','unlock'].includes(p.action)||p.confirmed!==true){res(null,{ok:false,error:'Confirmation required'});return;}
   const vin=storage().getItem('gateway.vin');
   if(!vin){res(null,{ok:false,error:'Connect vehicle in Zepp first'});return;}
   api('/api/command','POST',{vin,action:p.action,confirmed:true})
    .then(data=>res(null,{ok:data.accepted===true,message:data.accepted?'Request accepted by gateway':'Command not confirmed'}))
    .catch(e=>res(null,{ok:false,error:String(e.message||'Command failed')}));
   return;
  }
  res(null,{ok:false,error:'Unknown request'});
 }
}));
