import { BaseSideService } from '@zeppos/zml/base-side';
AppSideService(BaseSideService({
  onRequest(req,res) {
    if(req.method==='zepp.ping'){
      res(null,{ok:true,mode:'demo',vehicleConnected:false});
      return;
    }
    if(req.method==='vehicle.status'){
      res(null,{ok:true,mode:'demo',vehicleConnected:false,lockStatus:'unavailable'});
      return;
    }
    if(req.method==='vehicle.command'){
      res(null,{ok:false,error:'Vehicle commands disabled until verified Polestar authentication is implemented'});
      return;
    }
    res(null,{ok:false,error:'Unknown request'});
  }
}));
