// Personal Polestar Link companion Settings.
// Keep a stable, single-column view across reactive storage updates.
// A valid OAuth login is distinct from verified vehicle connectivity.
let loginEmail='';
let loginPassword='';
let manualVin='';
AppSettingsPage({
 build(props){
  const s=props.settingsStorage;
  const signedIn=!!s.getItem('polestar.access');
  const vin=String(s.getItem('vehicle.vin')||'');
  const verified=s.getItem('vehicle.verified')==='true';
  const verification=String(s.getItem('polestar.vehicle.verify.status')||'');
  let lookup={},webtext={};
  try{lookup=JSON.parse(s.getItem('polestar.vehicle.lookup')||'{}');}catch(e){}
  try{webtext=JSON.parse(s.getItem('polestar.webtext.probe')||'{}');}catch(e){}
  const rawStatus=s.getItem('polestar.login.status')||'';
  const status=rawStatus.replace(/^(?:AUTH|READY|ERROR):\s*/,'');
  const primary={borderRadius:'12px',padding:'12px',background:'#245d53',color:'#fff'};
  const secondary={borderRadius:'10px',padding:'10px',background:'#eef2f3',color:'#245d53'};
  const field={borderRadius:'9px',padding:'12px',background:'#eef2f3'};
  const textMuted={color:'#667075',fontSize:'13px'};
  const content=[Text({bold:true,style:{fontSize:'25px'}},'Polestar Link')];
  const add=component=>content.push(component);
  if(!signedIn){
   add(Text({paragraph:true,style:textMuted},'Connect your Polestar account.'));
   add(TextInput({label:'Polestar email',
    value:loginEmail||s.getItem('polestar.email')||'',
    placeholder:'Email address',subStyle:field,
    onChange:value=>{loginEmail=String(value||'');}}));
   add(TextInput({label:'Polestar password (optional if already signed in)',
    value:loginPassword,placeholder:'Password',
    subStyle:{...field,WebkitTextSecurity:'disc',webkitTextSecurity:'disc'},
    onChange:value=>{loginPassword=String(value||'');}}));
   add(Button({label:'Connect to Polestar',style:primary,onClick:()=>{
    const email=(loginEmail||s.getItem('polestar.email')||'').trim();
    if(!email){s.setItem('polestar.login.status','ERROR: Enter your email');return;}
    s.setItem('polestar.email',email);
    s.setItem('polestar.login.status','AUTH: Connecting to Polestar ID…');
    s.setItem('polestar.login.request.at',String(Date.now()));
    s.setItem('polestar.login.request',JSON.stringify({email,password:loginPassword}));
    loginPassword='';
   }}));
   add(Text({paragraph:true,style:textMuted},
    'Leave the password empty if you have an active Polestar session.'));
  }else if(!vin){
   add(Text({bold:true,style:{color:'#236956'}},'Polestar ID connected'));
   add(Text({paragraph:true,style:textMuted},
    'Your vehicle is not listed by the account APIs. You can search again or enter its VIN.'));
   add(TextInput({label:'Vehicle VIN (optional)',value:manualVin,
    placeholder:'17-character VIN',subStyle:field,
    onChange:value=>{manualVin=String(value||'').trim().toUpperCase();}}));
   add(Button({label:'Find my Polestar 4',style:primary,onClick:()=>{
    if(manualVin){
     if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(manualVin)){
      s.setItem('polestar.login.status','ERROR: VIN must be 17 valid characters');return;
     }
     s.setItem('polestar.vehicle.verify.status','queued');
     s.setItem('polestar.login.status','AUTH: Testing your VIN with Polestar cloud…');
     s.setItem('polestar.manual.vin.request',manualVin);
    }else{
     s.setItem('polestar.login.status','AUTH: Searching linked Polestar vehicles…');
     s.setItem('polestar.vehicle.discovery.request',String(Date.now()));
    }
   }}));
  }else{
   add(Text({bold:true,style:{color:'#236956'}},
    (s.getItem('vehicle.name')||'Polestar 4')+(verified?' — connected':' — configured')));
   add(Text({paragraph:true,style:textMuted},verified?
    'Live native vehicle status has been verified.':
    'VIN configured. Vehicle data and commands are not verified yet.'));
   if(!verified)add(Button({label:'Verify vehicle connection',style:primary,onClick:()=>{
    // A visible queued status makes a missing Side Service listener detectable.
    s.setItem('polestar.vehicle.verify.status','queued');
    s.setItem('polestar.login.status','AUTH: Checking native and text transport…');
    s.setItem('polestar.vehicle.verify.request',String(Date.now()));
   }}));
  }
  const verificationLabel=verification==='queued'?'Verification requested — waiting for phone service…':
   verification==='testing_native'?'Testing native vehicle connection…':
   verification==='testing_text'?'Native connection unavailable. Testing text transport…':
   verification==='native_verified'?'Live native vehicle status verified.':
   verification.startsWith('text_')?
    'Text transport: '+String(webtext.http===null||webtext.http===undefined?'no response':'HTTP '+webtext.http)+
    ' ('+String(webtext.result||'unknown')+'). Lock/unlock not verified.':'';
  if(signedIn&&verificationLabel)
   add(Text({paragraph:true,style:{color:verified?'#236956':'#555555'}},verificationLabel));
  else if(status)add(Text({paragraph:true,style:{
   color:rawStatus.startsWith('ERROR:')?'#a23838':'#555555'
  }},status));
  if(signedIn)add(Button({label:'Sign out',style:secondary,onClick:()=>{
   s.setItem('polestar.session.clear',String(Date.now()));
  }}));
  if(signedIn){
   const val=x=>x===undefined||x===null?'—':String(x);
   add(Text({bold:true,style:{marginTop:'14px'}},'Connection diagnostics'));
   add(Text({paragraph:true,style:textMuted},
    'Car lists: mobile '+val(lookup.mobile_count||0)+
    ', MyStar HTTP '+val(lookup.consumer_v2_http)+
    ', C3 '+val(lookup.c3_shape||'not tested')));
   add(Text({paragraph:true,style:textMuted},
    'Native gRPC: '+(verified?'verified':'unavailable / unverified')));
   add(Text({paragraph:true,style:textMuted},
    'gRPC-Web text: '+(webtext.tested?
     (webtext.http===null?'no response':'HTTP '+webtext.http)+
       ' ('+(webtext.result||'unknown')+')':'not tested')));
  }
  return View({style:{
   padding:'22px',background:'#ffffff',display:'flex',
   flexDirection:'column',alignItems:'stretch',gap:'6px'
  }},content.map(item=>View({style:{
   display:'block',width:'100%',marginBottom:'12px',clear:'both'
  }},[item])));
 }
});
