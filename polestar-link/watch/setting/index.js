// Polestar Link — premium, single-column Zepp companion settings.
// Zepp TextInput uses the system editor popup, not an inline keyboard.
// Surface the completed email and masked password state on the page.
// Password remains one-shot in memory; the OAuth refresh token persists instead.
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
  const status=String(s.getItem('polestar.login.status')||'')
   .replace(/^(?:AUTH|READY|ERROR):\s*/,'');
  const error=String(s.getItem('polestar.login.status')||'').startsWith('ERROR:');
  const email=(loginEmail||s.getItem('polestar.email')||'').trim();
  const palette={
   ink:'#171c1b',muted:'#66716d',accent:'#164f43',surface:'#f3f5f3',
   line:'#dfe4e1',alert:'#ad463e'
  };
  const buttonMain={borderRadius:'14px',padding:'14px 16px',
   background:palette.ink,color:'#ffffff',fontWeight:'600'};
  const buttonSoft={borderRadius:'12px',padding:'10px 12px',
   background:palette.surface,color:palette.ink};
  const field={borderRadius:'12px',padding:'14px',background:palette.surface,
   border:'1px solid '+palette.line};
  const muted={fontSize:'13px',color:palette.muted,lineHeight:'1.5'};
  const items=[];
  const add=x=>items.push(x);
  add(Text({bold:true,style:{fontSize:'28px',letterSpacing:'3px',
   color:palette.ink}},'POLESTAR'));
  add(Text({bold:true,style:{fontSize:'19px',color:palette.ink}},
   signedIn?'Polestar 4':'Connect your account'));
  if(!signedIn){
   add(Text({paragraph:true,style:muted},
    'Edit each field in Zepp. Your entered details are shown here after closing the editor.'));
   add(TextInput({label:'Polestar email',value:email,
    placeholder:'Email address',subStyle:field,onChange:value=>{
     loginEmail=String(value||'').trim();
     s.setItem('polestar.email',loginEmail);
    }}));
   add(Text({paragraph:true,style:{
    fontSize:'14px',fontWeight:'600',color:palette.ink
   }},email?'Email: '+email:'Email: not entered'));
   add(TextInput({label:'Polestar password',value:loginPassword,
    placeholder:'Password',onChange:value=>{
     loginPassword=String(value||'');
     // Request a reactive redraw without persisting the actual password.
     s.setItem('polestar.ui.password.changed',String(Date.now()));
    },subStyle:{...field,WebkitTextSecurity:'disc',webkitTextSecurity:'disc'}}));
   add(Text({paragraph:true,style:{fontSize:'14px',
    color:loginPassword?palette.accent:palette.muted}},
    loginPassword?'Password: •••••••• (entered)':'Password: not entered'));
   add(Text({paragraph:true,style:muted},
    'Your password is used only for sign-in. Leave it blank to try an existing Polestar session.'));
   add(Button({label:'Connect to Polestar',style:buttonMain,onClick:()=>{
    // Zepp's TextInput editor may update after this page was built.
    // Read the current value here; never use a stale render-time variable.
    const currentEmail=(loginEmail||s.getItem('polestar.email')||'').trim();
    if(!/^\S+@\S+\.\S+$/.test(currentEmail)){
     s.setItem('polestar.login.status','ERROR: Enter your Polestar email');
     return;
    }
    s.setItem('polestar.email',currentEmail);
    s.setItem('polestar.login.status','AUTH: Connecting securely…');
    s.setItem('polestar.login.request.at',String(Date.now()));
    s.setItem('polestar.login.request',JSON.stringify({email:currentEmail,password:loginPassword}));
    loginPassword='';
    s.removeItem('polestar.ui.password.changed');
   }}));
   add(Text({paragraph:true,style:muted},
    'Some Polestar accounts require an email verification code. The current direct login supports existing authenticated sessions; a fresh verification challenge may still require additional handling.'));
  }else{
   add(Text({bold:true,style:{color:palette.accent}},'● Polestar ID connected'));
   if(!vin){
    add(Text({paragraph:true,style:muted},
     'Your car was not returned by the account list. Enter your VIN to configure it, or search again.'));
    add(TextInput({label:'Vehicle VIN (optional)',value:manualVin,
     placeholder:'17-character VIN',subStyle:field,onChange:value=>{
      manualVin=String(value||'').trim().toUpperCase();
     }}));
    add(Button({label:'Find my Polestar 4',style:buttonMain,onClick:()=>{
     if(manualVin){
      if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(manualVin)){
       s.setItem('polestar.login.status','ERROR: Enter a valid 17-character VIN');
       return;
      }
      s.setItem('polestar.vehicle.verify.status','queued');
      s.setItem('polestar.login.status','AUTH: Checking your vehicle…');
      s.setItem('polestar.manual.vin.request',manualVin);
     }else{
      s.setItem('polestar.login.status','AUTH: Searching linked cars…');
      s.setItem('polestar.vehicle.discovery.request',String(Date.now()));
     }
    }}));
   }else{
    add(Text({paragraph:true,style:{
     fontSize:'16px',color:palette.ink
    }},'Vehicle: Polestar 4'));
    add(Text({paragraph:true,style:muted},verified?
     'Live native vehicle status verified.':
     'Vehicle configured. Remote data and controls are not yet verified.'));
    if(!verified)add(Button({label:'Check vehicle connection',
     style:buttonMain,onClick:()=>{
      s.setItem('polestar.vehicle.verify.status','queued');
      s.setItem('polestar.login.status','AUTH: Verifying Polestar cloud…');
      s.setItem('polestar.vehicle.verify.request',String(Date.now()));
     }}));
   }
   add(Button({label:'Sign out',style:buttonSoft,onClick:()=>{
    loginPassword='';
    s.setItem('polestar.session.clear',String(Date.now()));
   }}));
  }
  const details=verification==='queued'?'Checking vehicle connection…':
   verification==='testing_native'?'Testing Polestar native connection…':
   verification==='testing_text'?'Checking alternative vehicle transport…':
   verification==='native_verified'?'Native vehicle data verified.':
   verification.startsWith('text_')?'Alternative transport unavailable; car controls not verified.':'';
  if(details||status)add(Text({paragraph:true,style:{
   fontSize:'13px',color:error?palette.alert:palette.muted
  }},details||status));
  if(signedIn&&vin){
   let probe={};
   try{probe=JSON.parse(s.getItem('polestar.c3.transport.report')||'{}');}catch(e){}
   const progress=String(s.getItem('polestar.c3.transport.status')||'');
   add(Text({bold:true,style:{fontSize:'17px',color:palette.ink}},
    'Direct C3 connection'));
   add(Text({paragraph:true,style:muted},
    'Read-only test of Polestar\'s native gRPC interface. No door, climate or other control commands are sent.'));
   add(Button({label:progress.startsWith('testing')?'Checking C3 transport…':'Test native C3 connection',
    style:buttonSoft,onClick:()=>{
     if(String(s.getItem('polestar.c3.transport.status')||'').startsWith('testing'))return;
     s.removeItem('polestar.c3.transport.report');
     s.setItem('polestar.c3.transport.status','queued');
     s.setItem('polestar.c3.transport.request',String(Date.now()));
    }}));
   if(progress.startsWith('testing')||progress==='queued')
    add(Text({paragraph:true,style:muted},'Testing native read-only battery connection…'));
   if(probe.tested){
    add(Text({paragraph:true,style:{fontSize:'14px',
     color:probe.verified?palette.accent:palette.alert}},
     probe.verified?'Native C3 battery connection verified':
      'Native C3 connection is not yet usable'));
    for(const step of probe.attempts||[]){
     const val=x=>x===undefined||x===null?'—':String(x);
     add(Text({paragraph:true,style:muted},
      (step.mode==='arraybuffer'?'Binary body':'String body')+
      ': HTTP '+val(step.http)+
      ' · response '+val(step.shape)+
      ' · replacement chars '+val(step.utf8_replacement)+
      (step.error?' · '+step.error:'')+
      (step.battery_payload_valid===false?' · invalid gRPC data':'')));
    }
   }
  }
  if(signedIn&&vin)add(Text({paragraph:true,style:muted},
   'Connection: '+(verified?'verified':'not verified')+
   '  •  No remote command is sent without confirmation.'));
  return View({style:{
   padding:'24px',background:'#ffffff',display:'flex',
   flexDirection:'column',alignItems:'stretch',gap:'4px'
  }},items.map(item=>View({style:{
   display:'block',width:'100%',marginBottom:'14px',clear:'both'
  }},[item])));
 }
});
