// Polestar Link Zepp settings.
// The built-in Zepp Auth redirect is not registered with Polestar and fails.
// Until the phone Fetch cookie/HTTP2 compatibility is proven, never request a
// real password. This screen contains only a harmless masked-input preview.
// The Settings UI may have its own browser fetch, separate from Zepp Side
// Service Fetch. Probe anonymous Polestar metadata only. Never request real
// credentials in this Settings App or write secrets to settingsStorage.
async function checkSettingsBrowser(s){
 const result={browser_fetch_available:typeof fetch==='function',
  browser_polestar_http:null,browser_polestar_readable:false};
 if(result.browser_fetch_available){
  try{
   const response=await fetch(
    'https://polestarid.eu.polestar.com/.well-known/openid-configuration',
    {method:'GET',credentials:'omit',redirect:'manual',cache:'no-store'});
   const code=Number(response&&response.status);
   result.browser_polestar_http=Number.isInteger(code)?code:null;
   result.browser_polestar_readable=code===200 &&
    (!response.type || response.type!=='opaque');
  }catch(e){}
 }
 s.setItem('polestar.browser.probe.result',JSON.stringify(result));
 s.setItem('polestar.browser.probe.status','Browser login networking check completed.');
}
let loginEmail='';
let loginPassword='';
AppSettingsPage({
 build(props){
  const s=props.settingsStorage;
  // Credentials enter Settings through input handlers, not through logs.
  const session=!!s.getItem('polestar.access')&&!!s.getItem('vehicle.vin')&&!!s.getItem('polestar.c3');
  let report={};
  try{report=JSON.parse(s.getItem('polestar.probe.result')||'{}');}catch(e){}
  let loginReport={},browserReport={};
  try{loginReport=JSON.parse(s.getItem('polestar.login.probe.result')||'{}');}catch(e){}
  try{browserReport=JSON.parse(s.getItem('polestar.browser.probe.result')||'{}');}catch(e){}
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
       'HTTP '+report.auth_http+(report.login_page?' (detected)':report.auth_http===302?' (redirect; form not fetched)':' (not detected)'))),
    Text({paragraph:true},
     'Session cookie response: '+(report.cookie_accessible?'readable':'not verified')),
    Text({paragraph:true},
     'PKCE cryptography: '+(report.pkce_secure_crypto?'available':'not verified')),
    Text({paragraph:true},
     'Vehicle API: '+(report.grpc_http?'HTTP '+report.grpc_http:'not verified')),
    Text({paragraph:true},
     'Binary response: '+(report.grpc_binary_readable?'native bytes received':'not verified')),
    Text({paragraph:true},'Vehicle gRPC and commands: NOT verified'),
    report.auth_error?Text({paragraph:true,style:{color:'#a23838'}},report.auth_error):Text({},''),
    report.grpc_error?Text({paragraph:true,style:{color:'#a23838'}},report.grpc_error):Text({},''),
    Text({bold:true,style:{marginTop:'20px'}},'Connect your Polestar account'),
    Text({paragraph:true},'Personal experimental login using Polestar ID. Your password is cleared from the form after submission.'),
    TextInput({label:'Polestar email',value:loginEmail||s.getItem('polestar.email')||'',
      placeholder:'you@example.com',onChange:value=>{loginEmail=String(value||'');},
      subStyle:{borderRadius:'8px',padding:'12px',background:'#eef2f3'}}),
    TextInput({label:'Polestar password',value:loginPassword,
      placeholder:'Password',onChange:value=>{loginPassword=String(value||'');},
      subStyle:{WebkitTextSecurity:'disc',webkitTextSecurity:'disc',
       borderRadius:'8px',padding:'12px',background:'#eef2f3'}}),
    Button({label:'Sign in to Polestar',style:{
      borderRadius:'12px',padding:'12px',background:'#245d53',color:'#ffffff'
     },onClick:()=>{
      const email=(loginEmail||s.getItem('polestar.email')||'').trim();
      const password=loginPassword;
      if(!email||!password){
       s.setItem('polestar.login.status','ERROR: Enter email and password');
       return;
      }
      // Zepp Settings <-> Side Service offers only shared settingsStorage.
      // Use a one-shot request and erase it immediately on the phone side.
      s.setItem('polestar.email',email);
      s.setItem('polestar.login.status','AUTH: Connecting to Polestar ID…');
      s.setItem('polestar.login.request.at',String(Date.now()));
      s.setItem('polestar.login.request',JSON.stringify({email,password}));
      loginPassword='';
     }}),
    Text({paragraph:true},s.getItem('polestar.login.status')||'Not connected'),
    Text({paragraph:true,style:{fontSize:'12px',color:'#777777'}},
      'Personal-use build. Zepp temporarily transfers login details through its local settings storage; do not use on a shared phone. Login may fail if Polestar redirects cannot be captured.'),
    Link({source:'https://www.polestar.com/nl-be/'},
      Text({bold:true},'Open official Polestar site')),
    Text({paragraph:true},
      'This opens Polestar in your browser. The website session is separate from the watch app.'),
    Text({bold:true,style:{marginTop:'20px'}},'Account sign-in feasibility'),
    Button({label:'Test login options (no password)',style:{
      borderRadius:'12px',padding:'12px',background:'#264059',color:'#ffffff'
     },onClick:()=>{
      s.setItem('polestar.login.probe.status','Checking safe login transport…');
      s.setItem('polestar.login.probe.request',String(Date.now()));
      s.setItem('polestar.browser.probe.status','Checking Settings browser networking…');
      void checkSettingsBrowser(s);
     }}),
    Text({paragraph:true,style:{color:'#555555'}},
      s.getItem('polestar.login.probe.status')||'Login transport: not tested'),
    Text({paragraph:true},
      'Dummy cookie forwarding: '+(loginReport.cookie_header_forwarded?'supported':
       loginReport.cookie_echo_http===null||loginReport.cookie_echo_http===undefined?
       'not tested':'not verified')+
       (loginReport.cookie_echo_http?' (HTTP '+loginReport.cookie_echo_http+')':'')),
    Text({paragraph:true},
      'Direct Settings login page: '+(browserReport.browser_polestar_readable?
       'HTTP '+browserReport.browser_polestar_http:
       browserReport.browser_fetch_available===false?'browser fetch unavailable':
       browserReport.browser_polestar_http?'HTTP '+browserReport.browser_polestar_http:
       'not verified / possibly blocked by CORS')),
    Text({paragraph:true,style:{color:'#666666'}},
      'Existing Polestar app sign-in: not shared with Zepp. No account or password is accessed by this test.'),
    Text({paragraph:true,style:{color:'#666666',fontSize:'12px'}},
      'Cookie forwarding uses only a dummy value sent to httpbin.org, never a real Polestar session.'),
    Text({paragraph:true,style:{marginTop:'16px',color:'#777777'}},
      'The old demo password field is replaced with real account login. Vehicle commands are still experimental.')
   );
  }
  return View({style:{padding:'22px',background:'#ffffff'}},content);
 }
});
