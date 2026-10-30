import { BaseSideService } from '@zeppos/zml/base-side';
const s=()=>settings.settingsStorage;
function directConfig(){
 const host=(s().getItem('direct.host')||'').trim().replace(/\/$/,'');
 const token=s().getItem('direct.token')||'';
 const vin=s().getItem('direct.vin')||'';
 if(!/^https:\/\/[a-z0-9.-]+(?::443)?$/i.test(host))throw Error('Set HTTPS C3 API host');
 if(!token)throw Error('Set access token');
 if(!/^[a-z0-9]{17}$/i.test(vin))throw Error('Set 17-character VIN');
 return {host,token,vin};
}
async function probe(){
 const {host,token,vin}=directConfig();
 const path=(s().getItem('direct.path')||'').trim();
 if(!/^\/[a-zA-Z0-9._/-]+$/.test(path))throw Error('Set gRPC service/method path');
 const r=await fetch({url:host+path,method:'POST',headers:{
  'Content-Type':'application/grpc','TE':'trailers','Authorization':'Bearer '+token,'vin':vin
 },body:String.fromCharCode(0,0,0,0,0)});
 return {status:r.status,bodyType:typeof r.body,headers:r.headers||{}};
}
AppSideService(BaseSideService({
 onInit(){
  s().addListener('change',async ({key})=>{
   if(key!=='direct.probe')return;
   s().setItem('direct.result','Sending framed gRPC request…');
   try{
    const r=await probe();
    s().setItem('direct.result','HTTP '+r.status+'; response '+r.bodyType+'; gRPC status not verified');
   }catch(e){s().setItem('direct.result','Failed: '+String(e.message||e).slice(0,150));}
  });
 },
 onRequest(req,res){
  if(req.method==='zepp.ping'){res(null,{ok:true,version:'1.1.0-experimental'});return;}
  res(null,{ok:false,error:'Direct C3 gRPC authentication and vehicle commands are not yet implemented. Run transport probe in Zepp settings.'});
 }
}));
