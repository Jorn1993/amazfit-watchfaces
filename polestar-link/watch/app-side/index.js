import { BaseSideService } from '@zeppos/zml/base-side';

AppSideService(BaseSideService({
 onInit(){
  settings.settingsStorage.addListener('change',async ({key})=>{
   if(key!=='direct.check')return;
   settings.settingsStorage.setItem('direct.status','Checking HTTPS from Zepp…');
   try{
    // Public endpoint: no account credentials, tokens or commands.
    const result=await fetch({url:'https://www.polestar.com/',method:'GET'});
    const status=Number(result.status)||0;
    settings.settingsStorage.setItem('direct.status',
      status>=200 && status<500 ? 'HTTPS reachable (HTTP '+status+'); gRPC unverified' :
      'Unexpected HTTP response ('+status+')');
   }catch(e){
    settings.settingsStorage.setItem('direct.status','HTTPS request failed; see Zepp logs');
   }
  });
 },
 onRequest(req,res){
  if(req.method==='zepp.ping'){res(null,{ok:true,version:'0.5.0',directMode:true});return;}
  if(req.method==='vehicle.status'){res(null,{ok:false,error:'Direct Polestar authentication not implemented'});return;}
  if(req.method==='vehicle.command'){res(null,{ok:false,error:'Vehicle commands disabled in direct diagnostic build'});return;}
  res(null,{ok:false,error:'Unknown request'});
 }
}));
