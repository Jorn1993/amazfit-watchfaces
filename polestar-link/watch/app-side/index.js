import { BaseSideService } from '@zeppos/zml/base-side';

function report(message) {
  settings.settingsStorage.setItem('probe.result',message);
}

AppSideService(BaseSideService({
  onInit() {
    settings.settingsStorage.addListener('change', async ({key}) => {
      if(key!=='probe.request')return;
      report('Testing POST request…');
      try {
        // Echo endpoint only: no Polestar credentials or vehicle traffic.
        // The five bytes are the empty-message gRPC frame.
        const frame = String.fromCharCode(0,0,0,0,0);
        const r = await fetch({
          url:'https://postman-echo.com/post',
          method:'POST',
          headers:{'Content-Type':'application/grpc','TE':'trailers','X-Polestar-Link-Probe':'1'},
          body:frame
        });
        const raw = typeof r.body==='string'?JSON.parse(r.body):r.body;
        const contentType = raw && raw.headers && (raw.headers['content-type']||raw.headers['Content-Type']);
        const echoed = raw && typeof raw.data==='string' ? raw.data : '';
        const framePreserved = echoed.length===5 && echoed.charCodeAt(0)===0;
        report('HTTP '+r.status+'; gRPC header '+(contentType?'echoed':'unknown')+
          '; frame '+(framePreserved?'preserved':'not verified')+
          '; HTTP/2 + trailers NOT verified');
      } catch(e) {
        report('POST probe failed; inspect Zepp logs');
      }
    });
  },
  onRequest(req,res){
    if(req.method==='zepp.ping'){res(null,{ok:true,version:'0.8.0'});return;}
    if(req.method==='vehicle.status'||req.method==='vehicle.command'){
      res(null,{ok:false,error:'No authenticated Polestar session; vehicle commands disabled'});return;
    }
    res(null,{ok:false,error:'Unknown request'});
  }
}));
