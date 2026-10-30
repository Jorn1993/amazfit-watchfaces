import { BaseSideService } from '@zeppos/zml/base-side';
import { probe } from './probe';
AppSideService(BaseSideService({
 onRequest(req,res){
  if(req.method==='zepp.ping'){res(null,{ok:true});return;}
  if(req.method!=='bridge.probe'){res(null,{ok:false,error:'Unknown test'});return;}
  probe(fetch,req.params.nonce).then(result=>res(null,result));
 }
}));
