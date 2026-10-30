import { BaseSideService } from '@zeppos/zml/base-side';

AppSideService(BaseSideService({
  onInit() {
    // The Zepp settings page requests diagnostics through its shared settings storage.
    settings.settingsStorage.addListener('change', ({key,newValue}) => {
      if (key === 'connection.checkRequested' && newValue) {
        settings.settingsStorage.setItem('connection.lastCheck','Zepp service responding');
        settings.settingsStorage.setItem('connection.state','not_connected');
      }
    });
  },
  onRequest(req,res) {
    if (req.method === 'zepp.ping') {
      res(null,{ok:true,version:'0.3.0',vehicleConnected:false});
      return;
    }
    if (req.method === 'vehicle.status') {
      res(null,{ok:true,vehicleConnected:false,lockStatus:'unavailable'});
      return;
    }
    // Fail closed: commands may not execute before a verified connection.
    if (req.method === 'vehicle.command') {
      res(null,{ok:false,error:'Not connected to Polestar; no vehicle command sent'});
      return;
    }
    res(null,{ok:false,error:'Unknown request'});
  }
}));
