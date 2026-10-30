// Polestar Link personal Zepp Settings: one primary action per stage.
// Advanced transport diagnostics stay hidden unless requested.
let loginEmail='';
let loginPassword='';
let manualVin='';
AppSettingsPage({
 build(props){
  const s=props.settingsStorage;
  const signedIn=!!s.getItem('polestar.access');
  const vin=s.getItem('vehicle.vin')||'';
  const verified=s.getItem('vehicle.verified')==='true';
  const details=s.getItem('polestar.ui.details')==='true';
  let lookup={},report={};
  try{lookup=JSON.parse(s.getItem('polestar.vehicle.lookup')||'{}');}catch(e){}
  try{report=JSON.parse(s.getItem('polestar.probe.result')||'{}');}catch(e){}
  const rawStatus=s.getItem('polestar.login.status')||'';
  const status=rawStatus.replace(/^(?:AUTH|READY|ERROR):\s*/,'');
  const primary={borderRadius:'12px',padding:'12px',marginTop:'10px',
   background:'#245d53',color:'#ffffff'};
  const secondary={borderRadius:'10px',padding:'9px',marginTop:'12px',
   background:'#eef2f3',color:'#245d53'};
  const field={borderRadius:'10px',padding:'12px',background:'#eef2f3'};
  const content=[
   Text({bold:true,style:{fontSize:'25px',marginBottom:'10px'}},'Polestar Link')
  ];
  if(!signedIn){
   content.push(
    Text({paragraph:true,style:{color:'#555555',marginBottom:'14px'}},
     'Connect your Polestar account to your watch.'),
    TextInput({label:'Polestar email',value:loginEmail||s.getItem('polestar.email')||'',
     placeholder:'Email address',onChange:value=>{loginEmail=String(value||'');},
     subStyle:field}),
    TextInput({label:'Polestar password (optional if already signed in)',
     value:loginPassword,placeholder:'Password',onChange:value=>{
      loginPassword=String(value||'');
     },subStyle:{...field,WebkitTextSecurity:'disc',webkitTextSecurity:'disc'}}),
    Button({label:'Connect to Polestar',style:primary,onClick:()=>{
     const email=(loginEmail||s.getItem('polestar.email')||'').trim();
     if(!email){s.setItem('polestar.login.status','ERROR: Enter your email');return;}
     s.setItem('polestar.email',email);
     s.setItem('polestar.login.status','AUTH: Connecting to Polestar ID…');
     s.setItem('polestar.login.request.at',String(Date.now()));
     s.setItem('polestar.login.request',JSON.stringify({email,password:loginPassword}));
     loginPassword='';
    }}),
    Text({paragraph:true,style:{color:'#777777',fontSize:'12px'}},
     'Leave the password empty to try an existing Polestar login session.')
   );
  }else if(!vin){
   content.push(
    Text({bold:true,style:{color:'#236956'}},'Polestar ID connected'),
    Text({paragraph:true,style:{color:'#555555',marginTop:'10px'}},
     'Your vehicle is not listed by the account APIs. Linked or secondary accounts can require a VIN.'),
    TextInput({label:'Vehicle VIN (optional)',value:manualVin,
     placeholder:'17-character VIN',onChange:value=>{
      manualVin=String(value||'').trim().toUpperCase();
     },subStyle:field}),
    Text({paragraph:true,style:{color:'#777777',fontSize:'12px'}},
     'Leave VIN empty to search again, or enter the VIN from your vehicle details.'),
    Button({label:'Find my Polestar 4',style:primary,onClick:()=>{
     if(manualVin){
      if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(manualVin)){
       s.setItem('polestar.login.status','ERROR: VIN must be 17 valid characters');
       return;
      }
      s.setItem('polestar.login.status','AUTH: Checking vehicle VIN…');
      s.setItem('polestar.manual.vin.request',manualVin);
     }else{
      s.setItem('polestar.login.status','AUTH: Searching vehicle accounts…');
      s.setItem('polestar.vehicle.discovery.request',String(Date.now()));
     }
    }})
   );
  }else{
   content.push(
    Text({bold:true,style:{color:'#236956'}},
     (s.getItem('vehicle.name')||'Polestar 4')+(verified?' — connected':' — configured')),
    Text({paragraph:true,style:{color:'#555555'}},
     verified?'Vehicle status communication was verified.':
     'Vehicle identification is set, but live status is not verified yet.'),
    verified?Text({},''):Button({label:'Verify vehicle connection',style:primary,
     onClick:()=>{
      s.setItem('polestar.login.status','AUTH: Verifying car status…');
      s.setItem('polestar.vehicle.verify.request',String(Date.now()));
     }})
   );
  }
  if(status)content.push(Text({paragraph:true,style:{
   marginTop:'14px',color:rawStatus.startsWith('ERROR:')?'#a23838':'#555555'
  }},status));
  if(signedIn)content.push(
   Button({label:'Sign out',style:secondary,onClick:()=>{
    s.setItem('polestar.session.clear',String(Date.now()));
   }})
  );
  content.push(
   Button({label:details?'Hide technical details':'Technical details',
    style:{...secondary,marginTop:'22px'},onClick:()=>{
     s.setItem('polestar.ui.details',details?'false':'true');
    }})
  );
  if(details){
   const info=(value)=>value===null||value===undefined?'—':String(value);
   content.push(
    Text({bold:true,style:{marginTop:'12px'}},'Vehicle discovery'),
    Text({paragraph:true},'Mobile API: HTTP '+info(lookup.mobile_http)+
     ' · '+info(lookup.mobile_count||0)+' cars · '+info(lookup.mobile_shape)),
    Text({paragraph:true},'MyStar V2: HTTP '+info(lookup.consumer_v2_http)+
     ' · raw header '+info(lookup.consumer_v2_raw_http)+
     ' · '+info(lookup.consumer_v2_count||0)+' cars'),
    Text({paragraph:true},'C3 car list: HTTP '+info(lookup.c3_http)+
     ' · '+info(lookup.c3_count||0)+' cars · '+info(lookup.c3_shape)),
    Text({paragraph:true},'Polestar ID: '+(signedIn?'authenticated':'not connected')),
    Text({paragraph:true},'Vehicle status: '+(verified?'verified':'not verified')),
    Text({paragraph:true,style:{color:'#777777',fontSize:'12px'}},
     'Diagnostic statuses only. No passwords, VINs, or tokens are shown.'),
    Text({bold:true,style:{marginTop:'12px'}},'Zepp network'),
    Text({paragraph:true},'Identity HTTP: '+info(report.auth_http)+
     ' · PKCE: '+(report.pkce_secure_crypto?'available':'not tested')),
    Text({paragraph:true},'gRPC binary: '+(report.grpc_binary_readable?'available':'not verified')),
    Button({label:'Run compatibility check',style:secondary,onClick:()=>{
     s.setItem('polestar.probe.status','Checking compatibility…');
     s.setItem('polestar.probe.request',String(Date.now()));
    }})
   );
  }
  return View({style:{padding:'22px',background:'#ffffff'}},content);
 }
});
