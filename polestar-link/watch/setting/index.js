AppSettingsPage({
 build(props){
  const s=props.settingsStorage;
  return View({style:{padding:'16px'}},[
   Text({bold:true,style:{fontSize:'23px'}},'Polestar Link'),
   Text({},'v0.5.0 • Direct compatibility check'),
   Text({},'No gateway is required for this network diagnostic. No Polestar credentials are used.'),
   Button({label:'Test direct Zepp network',onClick:()=>s.setItem('direct.check',String(Date.now()))}),
   Text({},'Connection test: '+(s.getItem('direct.status')||'Not tested')),
   Text({},'Polestar sign-in and lock/unlock are not yet available in direct mode.'),
   Text({},'The Polestar 4 cloud uses OAuth and gRPC over HTTP/2; Zepp Fetch compatibility is still unverified.'),
   Text({},'Do not enter your Polestar password or tokens into this app.')
  ]);
 }
});
