// Secure-login experiment: Zepp's TextInput cannot mask passwords.
// Use the native Auth OAuth component so no password is handled by this app.
const POLESTAR_AUTH='https://polestarid.eu.polestar.com/as/authorization.oauth2';
const POLESTAR_TOKEN='https://polestarid.eu.polestar.com/as/token.oauth2';
const POLESTAR_CLIENT='lp8dyrd_10';
const POLESTAR_SCOPES='openid profile email customer:attributes customer:attributes:write';

function tokenPayload(value) {
  if(typeof value==='string')return {access_token:value};
  if(!value||typeof value!=='object')return null;
  // Zepp's Auth callback is provider-dependent.
  const access=value.access_token||value.accessToken||value.token;
  if(!access||typeof access!=='string')return null;
  return {
    access_token:access,
    refresh_token:value.refresh_token||value.refreshToken||'',
    expires_in:Number(value.expires_in||value.expiresIn||3600)
  };
}
AppSettingsPage({
 build(props) {
  const s=props.settingsStorage;
  const status=s.getItem('polestar.login.status')||'Not connected';
  const vin=s.getItem('vehicle.vin');
  const hasSession=!!s.getItem('polestar.access')&&!!vin&&!!s.getItem('polestar.c3');
  const content=[
   Text({bold:true,style:{fontSize:'24px',marginBottom:'12px'}},'Polestar Link'),
   Text({paragraph:true,style:{marginBottom:'18px',color:'#555555'}},
    'Sign in directly with Polestar. Your password never appears in this app.')
  ];
  if(hasSession){
   content.push(
    Text({bold:true,style:{fontSize:'18px'}},s.getItem('vehicle.name')||'Polestar 4'),
    Text({paragraph:true,style:{color:'#21634c',marginTop:'8px'}},'Connected'),
    Button({label:'Sign out',onClick:()=>{
      s.setItem('polestar.session.clear',String(Date.now()));
      s.setItem('polestar.login.status','Signed out');
    }})
   );
  }else{
   content.push(Auth({
    title:'Polestar ID',
    label:'Sign in with Polestar',
    description:'Secure authorization through Polestar ID. No password is saved by Polestar Link.',
    authorizeUrl:POLESTAR_AUTH,
    requestTokenUrl:POLESTAR_TOKEN,
    clientId:POLESTAR_CLIENT,
    scope:POLESTAR_SCOPES,
    pkce:true,
    onAccessToken:value=>{
     const tokens=tokenPayload(value);
     if(!tokens){
      s.setItem('polestar.login.status','Polestar login did not return a usable token.');
      return;
     }
     s.setItem('polestar.login.status','Connecting your Polestar…');
     s.setItem('polestar.oauth.result',JSON.stringify(tokens));
    },
    onReturn:value=>{
     // A callback code is not proof of authentication.
     if(!value)return;
     s.setItem('polestar.oauth.return','Authorization page returned');
    }
   }));
  }
  content.push(Text({paragraph:true,style:{marginTop:'20px',color:'#666666'}},status));
  if(!hasSession){
   content.push(Text({paragraph:true,style:{fontSize:'12px',marginTop:'8px',color:'#888888'}},
    'Experimental: Polestar may reject Zepp\'s OAuth callback. Authentication is not yet verified.'));
  }
  return View({style:{padding:'22px',background:'#ffffff'}},content);
 }
});
