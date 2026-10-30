import { BaseSideService } from '@zeppos/zml/base-side';
const storage = () => settings.settingsStorage;
function configuration() {
 const url = (storage().getItem('gateway.url') || '').trim().replace(/\/$/, '');
 const token = storage().getItem('gateway.token') || '';
 if (!url.startsWith('https://') || !token) throw Error('Configure the private connector in Zepp');
 return {url, token};
}
async function request(path, method, payload) {
 const cfg = configuration();
 const response = await fetch({
  url: cfg.url + path,
  method: method || 'GET',
  headers: {'Authorization': 'Bearer ' + cfg.token, 'Content-Type': 'application/json'},
  ...(payload ? {body: JSON.stringify(payload)} : {})
 });
 let result;
 try { result = typeof response.body === 'string' ? JSON.parse(response.body) : response.body; }
 catch (e) { throw Error('Unexpected connector response'); }
 if (response.status < 200 || response.status >= 300) throw Error(result.detail || 'HTTP ' + response.status);
 return result;
}
async function discover() {
 const result = await request('/api/vehicles');
 const car = result.vehicles && result.vehicles[0];
 if (!car) throw Error('No vehicles found');
 storage().setItem('vehicle.vin', car.vin);
 storage().setItem('vehicle.name', car.name || 'Polestar');
 return car;
}
AppSideService(BaseSideService({
 onInit() {
  storage().addListener('change', async ({key}) => {
   if (key !== 'gateway.check') return;
   try {
    const car = await discover();
    storage().setItem('gateway.status', 'Connected: ' + car.name);
   } catch (e) {
    storage().setItem('gateway.status', String(e.message || e));
   }
  });
 },
 async onRequest(req, res) {
  try {
   if (req.method === 'zepp.ping') { res(null, {ok:true, version:'1.0.0'}); return; }
   let vin = storage().getItem('vehicle.vin');
   if (!vin) vin = (await discover()).vin;
   if (req.method === 'vehicle.status') {
    const result = await request('/api/status/' + encodeURIComponent(vin));
    res(null, {ok:true, ...result}); return;
   }
   if (req.method === 'vehicle.command') {
    const params = req.params || {};
    if (params.confirmed !== true || !['lock', 'unlock'].includes(params.action)) throw Error('Confirmation required');
    const result = await request('/api/command', 'POST', {vin, action:params.action, confirmed:true});
    res(null, {ok:result.accepted === true, ...result}); return;
   }
   throw Error('Unknown request');
  } catch (e) { res(null, {ok:false, error:String(e.message || e)}); }
 }
}));
