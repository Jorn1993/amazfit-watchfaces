AppSettingsPage({
 build(props){
  const s=props.settingsStorage;
  const url=s.getItem('gateway.url')||'';
  const key=s.getItem('gateway.token')||'';
  const status=s.getItem('gateway.status')||'Not connected';
  const vin=s.getItem('gateway.vin')||'';
  return View({style:{padding:'16px'}},[
   Text({bold:true,style:{fontSize:'22px'}},'Polestar Link'),
   Text({},'v0.4.0 • Private gateway'),
   Text({},'This connects through your own HTTPS gateway, not directly to Polestar.'),
   TextInput({placeholder:'https://your-gateway.example',value:url,onChange:v=>s.setItem('gateway.url',v)}),
   TextInput({placeholder:'Gateway access token',value:key,onChange:v=>s.setItem('gateway.token',v)}),
   Button({label:'Connect / Find vehicles',onClick:()=>s.setItem('gateway.check',String(Date.now()))}),
   Text({},'Status: '+status),
   Text({},'Vehicle: '+(vin||'None')),
   Button({label:'Disconnect',onClick:()=>{
     ['gateway.url','gateway.token','gateway.vin','gateway.status'].forEach(k=>s.removeItem(k));
   }}),
   Text({},'Do not type your Polestar account password here. Configure it only on your trusted gateway server.')
  ]);
 }
});
