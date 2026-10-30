// Polestar Link Zepp settings.
// The built-in Zepp Auth redirect is not registered with Polestar and fails.
// Until the phone Fetch cookie/HTTP2 compatibility is proven, never request a
// real password. This screen contains only a harmless masked-input preview.
AppSettingsPage({
 build(props){
  const s=props.settingsStorage;
  // Delete unsafe credential messages from earlier experimental releases.
  for(const key of ['polestar.login.request','polestar.login.request.at']){
   if(s.getItem(key))s.removeItem(key);
  }
  const session=!!s.getItem('polestar.access')&&!!s.getItem('vehicle.vin')&&!!s.getItem('polestar.c3');
  let report={};
  try{report=JSON.parse(s.getItem('polestar.probe.result')||'{}');}catch(e){}
  const content=[
   Text({bold:true,style:{fontSize:'25px',marginBottom:'10px'}},'Polestar Link')
  ];
  if(session){
   content.push(
    Text({paragraph:true,style:{color:'#236956',marginBottom:'10px'}},'Connected to Polestar'),
    Text({bold:true},s.getItem('vehicle.name')||'Polestar 4'),
    Button({label:'Sign out',onClick:()=>{
     s.setItem('polestar.session.clear',String(Date.now()));
     s.setItem('polestar.login.status','Signed out');
    }})
   );
  }else{
   content.push(
    Text({paragraph:true,style:{marginBottom:'16px'}},
     'Polestar rejected the original login redirect. Checking whether a direct, secure connection can work entirely inside Zepp.'),
    Button({label:'Check Polestar compatibility',style:{
      borderRadius:'12px',padding:'12px',background:'#245d53',color:'#ffffff'
     },onClick:()=>{
      s.setItem('polestar.probe.status','Checking login and vehicle connection…');
      s.setItem('polestar.probe.request',String(Date.now()));
     }}),
    Text({paragraph:true,style:{marginTop:'14px',color:'#555555'}},
     s.getItem('polestar.probe.status')||'Not checked yet'),
    Text({paragraph:true,style:{marginTop:'8px'}},
     'Login page: '+(report.auth_http===null||report.auth_http===undefined?'not checked':
       'HTTP '+report.auth_http+(report.login_page?' (detected)':' (not detected)'))),
    Text({paragraph:true},
     'Session cookie access: '+(report.cookie_accessible?'supported':'not verified')),
    Text({paragraph:true},
     'Vehicle gRPC: '+(report.grpc_reached?'reachable':
       report.grpc_http?'HTTP '+report.grpc_http:'not verified')),
    report.auth_error?Text({paragraph:true,style:{color:'#a23838'}},report.auth_error):Text({},''),
    report.grpc_error?Text({paragraph:true,style:{color:'#a23838'}},report.grpc_error):Text({},''),
    Text({paragraph:true,style:{marginTop:'24px',color:'#666666'}},
      'Password field safety preview (not a real password). It should show dots, not Demo123!:'),
    TextInput({
      label:'Masking test only',
      value:'Demo123!',
      disabled:true,
      subStyle:{
       WebkitTextSecurity:'disc',
       webkitTextSecurity:'disc',
       borderRadius:'8px',
       padding:'10px',
       background:'#eef2f3'
      }
    }),
    Text({paragraph:true,style:{fontSize:'12px',marginTop:'12px',color:'#777777'}},
      'Do not enter your Polestar password here. The watch can communicate with Zepp; secure Polestar authorization remains under development.')
   );
  }
  return View({style:{padding:'22px',background:'#ffffff'}},content);
 }
});
