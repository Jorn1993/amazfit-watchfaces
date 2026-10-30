// Polestar ID OIDC/PKCE direct-flow client, derived from the public protocol
// described in pypolestar/pypolestar and kaohlive/Polestar (Homey).
// Experimental personal-use login; physical Zepp networking is not yet proven.
// SECURITY: no plaintext credentials or auth codes in errors, logs or storage.
const BASE='https://polestarid.eu.polestar.com';
const CLIENT='lp8dyrd_10';
const REDIRECT='polestar-explore://explore.polestar.com';
const SCOPE='openid profile email customer:attributes customer:attributes:write';
function encoding(input){
 return Object.keys(input).map(k=>encodeURIComponent(k)+'='+encodeURIComponent(input[k])).join('&');
}
function lookupHeader(headers,key){
 if(headers&&typeof headers.get==='function')return headers.get(key)||'';
 for(const name of Object.keys(headers||{})){
  if(name.toLowerCase()===key.toLowerCase())return headers[name];
 }
 return '';
}
function safeBody(r){
 if(typeof r.body==='string')return r.body;
 throw Error('Polestar OIDC response is not text');
}
function cookieMap(raw){
 const result={};
 const joined=Array.isArray(raw)?raw.join(', '):String(raw||'');
 // Only forward PingFederate cookies to the exact Polestar identity host.
 const cookiePairs=joined.split(/,(?=\s*[^,;=\s]+\s*=)/);
 for(const cookie of cookiePairs){
  const match=cookie.match(/^\s*(PF(?:\.PERSISTENT)?)=([^;\r\n]*)/);
  if(match)result[match[1]]=match[2];
 }
 return result;
}
function cookieHeader(map){return Object.keys(map).map(key=>key+'='+map[key]).join('; ');}
function mergeCookies(map,response){
 const added=cookieMap(lookupHeader(response.headers,'set-cookie'));
 for(const key of Object.keys(added))map[key]=added[key];
}
// Polestar may respond with 302 to its website containing a `resumePath`.
// The redirect is a *hint* for the PingFederate resume endpoint, NOT a site
// to send the password/cookies to. Keep every request on the identity origin.
function redirectDestination(location){
 if(typeof location!=='string'||!location||/[\\\r\n]/.test(location))
  throw Error('Polestar redirect location missing or unsafe');
 if(location.startsWith('/')&&!location.startsWith('//'))return BASE+location;
 if(location.startsWith(BASE+'/')||location===BASE)return location;
 // Report only a validated hostname, never a full URL, query, token or code.
 let host='';
 if(location.startsWith('https://')){
  const tail=location.slice(8);
  host=tail.split('/')[0].split('?')[0].split('#')[0].split(':')[0];
  if(!/^[a-z0-9.-]+$/i.test(host))host='';
 }
 const label=host?host.slice(0,64):location.startsWith(REDIRECT)?'app-callback':'unknown';
 throw Error('Polestar login redirected outside identity service ('+label+')');
}
function resumePathFromRedirect(location){
 if(typeof location!=='string'||!location||/[\\\r\n]/.test(location))
  throw Error('Polestar redirect location missing or unsafe');
 // Only an official Polestar host can provide a resumePath. An external
 // redirect with a matching query name is never trusted.
 const official=location.startsWith(BASE+'/')||
  /^https:\/\/(?:www\.)?polestar\.com(?:[/?#]|$)/.test(location)||
  (location.startsWith('/')&&!location.startsWith('//'));
 if(!official)return '';
 const match=location.match(/[?&]resumePath=([A-Za-z0-9_-]{1,128})(?:[&#]|$)/);
 if(!match)return '';
 return '/as/'+match[1]+'/resume/as/authorization.ping';
}
async function openAuthorizationPage(url,http,cookies){
 for(let count=0;count<=6;count++){
  const cookie=cookieHeader(cookies);
  const response=await http(url,'GET',cookie?{'Cookie':cookie}:{});
  mergeCookies(cookies,response);
  if(response.status===200)return {response,postPath:''};
  if(![301,302,303,307,308].includes(response.status))
   throw Error('Polestar authorization HTTP '+response.status);
  const location=lookupHeader(response.headers,'location');
  if(!location)throw Error('Zepp Fetch did not expose Polestar redirect Location');
  // PingFederate may immediately return the registered app callback if a
  // previous Polestar login is still valid. Treat it as an authorization
  // *result*, not as an HTTP URL to follow or a reason to submit a password.
  if(location.startsWith(REDIRECT+'?'))
   return {response:null,postPath:'',callback:location};
  // No request is ever made to the website; use only the validated token.
  const postPath=resumePathFromRedirect(location);
  if(postPath)return {response:null,postPath};
  if(count===6)throw Error('Polestar authorization exceeded redirect limit');
  url=redirectDestination(location);
 }
 throw Error('Polestar login redirect failed');
}
function randomBase64Url(cryptoApi){
 if(!cryptoApi||typeof cryptoApi.getRandomValues!=='function')
  throw Error('Zepp lacks secure random generation required for Polestar login');
 const bytes=new Uint8Array(32);cryptoApi.getRandomValues(bytes);
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
 // Avoid btoa/Buffer global dependencies; one 6-bit char per 3/4 byte entropy.
 let b64='';
 for(let i=0;i<bytes.length;i+=3){
  const n=(bytes[i]<<16)|((bytes[i+1]||0)<<8)|(bytes[i+2]||0);
  b64+=alphabet[(n>>>18)&63]+alphabet[(n>>>12)&63];
  if(i+1<bytes.length)b64+=alphabet[(n>>>6)&63];
  if(i+2<bytes.length)b64+=alphabet[n&63];
 }
 return b64;
}
async function pkceChallenge(verifier,cryptoApi){
 if(!cryptoApi||!cryptoApi.subtle||typeof cryptoApi.subtle.digest!=='function')
  throw Error('Zepp lacks secure SHA-256 required for Polestar login');
 const bytes=Uint8Array.from(verifier,c=>c.charCodeAt(0));
 const digest=new Uint8Array(await cryptoApi.subtle.digest('SHA-256',bytes));
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
 let b64='';
 for(let i=0;i<digest.length;i+=3){
  const n=(digest[i]<<16)|((digest[i+1]||0)<<8)|(digest[i+2]||0);
  b64+=alphabet[(n>>>18)&63]+alphabet[(n>>>12)&63];
  if(i+1<digest.length)b64+=alphabet[(n>>>6)&63];
  if(i+2<digest.length)b64+=alphabet[n&63];
 }
 return b64;
}
function parseCode(location,state){
 if(typeof location!=='string'||!location.startsWith(REDIRECT))
  throw Error('Polestar returned an unexpected login redirect');
 const query=location.split('?')[1]||'';
 const fields={};
 for(const item of query.split('&')){
  if(!item)continue;
  const equal=item.indexOf('=');
  if(equal<0)continue;
  const k=decodeURIComponent(item.slice(0,equal));
  fields[k]=decodeURIComponent(item.slice(equal+1).replace(/\+/g,'%20'));
 }
 if(!fields.state||fields.state!==state)throw Error('Polestar login state missing or mismatched');
 if(!fields.code||fields.code.length>4096)throw Error('Polestar did not return an authorization code');
 return fields.code;
}
export async function authenticatePolestar(email,password,http,cryptoApi){
 if(typeof email!=='string'||!/^\S+@\S+\.\S+$/.test(email)||email.length>254)
  throw Error('Invalid Polestar email');
 // An already-authenticated Polestar ID session can return a mobile callback
 // without any password. Require the password only if the provider actually
 // presents a login form; never submit an empty password.
 if(password!==undefined&&password!==''&&typeof password!=='string')
  throw Error('Invalid Polestar password');
 const verifier=randomBase64Url(cryptoApi),state=randomBase64Url(cryptoApi);
 const challenge=await pkceChallenge(verifier,cryptoApi);
 const discovery=await http(BASE+'/.well-known/openid-configuration');
 if(discovery.status!==200)throw Error('Polestar identity discovery HTTP '+discovery.status);
 const config=typeof discovery.body==='string'?JSON.parse(discovery.body):discovery.body;
 const authorize=config&&config.authorization_endpoint,tokenEndpoint=config&&config.token_endpoint;
 if(typeof authorize!=='string'||!authorize.startsWith(BASE+'/')||
    typeof tokenEndpoint!=='string'||!tokenEndpoint.startsWith(BASE+'/'))
  throw Error('Unexpected Polestar OIDC endpoints');
 const params={
  response_type:'code',client_id:CLIENT,redirect_uri:REDIRECT,scope:SCOPE,
  state,code_challenge:challenge,code_challenge_method:'S256',response_mode:'query'
 };
 const cookies={};
 const initial=await openAuthorizationPage(authorize+'?'+encoding(params),http,cookies);
 let code;
 if(initial.callback){
  // This works with an existing active Polestar ID session in Zepp. It never
  // submits the entered password, and requires an exact CSRF state match.
  code=parseCode(initial.callback,state);
 }else{
  const postPath=initial.postPath || (safeBody(initial.response).match(/(?:url|action)\s*:\s*"([^"]+)"/)||[])[1];
  if(!postPath||!postPath.startsWith('/')||postPath.startsWith('//')||postPath.includes('\\'))
   throw Error('Polestar login form missing a safe resume path');
  if(!cookieHeader(cookies))throw Error('Zepp Fetch did not expose Polestar session cookies');
  if(typeof password!=='string'||!password)
   throw Error('No active Polestar login session. Enter your password to sign in.');
  const postUrl=BASE+postPath+'?'+encoding(params);
  let response=await http(postUrl,'POST',{
   'Content-Type':'application/x-www-form-urlencoded',
   'Cookie':cookieHeader(cookies)
  },encoding({'pf.username':email,'pf.pass':password}));
  mergeCookies(cookies,response);
  if(response.status!==302&&response.status!==303)
   throw Error('Polestar sign-in did not return a redirect (HTTP '+response.status+')');
  let location=lookupHeader(response.headers,'location');
  if(typeof location!=='string'||!location.startsWith(REDIRECT)){
   // Some accounts must accept Terms & Conditions before returning an auth code.
   const uid=/[?&]uid=([^&]+)/.exec(String(location||''));
   if(!uid)throw Error('Zepp could not obtain Polestar authorization redirect');
   response=await http(postUrl,'POST',{
    'Content-Type':'application/x-www-form-urlencoded',
    'Cookie':cookieHeader(cookies)
   },encoding({'pf.submit':'true',subject:decodeURIComponent(uid[1])}));
   if(response.status!==302&&response.status!==303)
    throw Error('Polestar consent HTTP '+response.status);
   location=lookupHeader(response.headers,'location');
  }
   code=parseCode(location,state);
 }
 const token=await http(tokenEndpoint,'POST',{
  'Content-Type':'application/x-www-form-urlencoded'
 },encoding({grant_type:'authorization_code',code,redirect_uri:REDIRECT,
   client_id:CLIENT,code_verifier:verifier}));
 if(token.status!==200)throw Error('Polestar token exchange HTTP '+token.status);
 const result=typeof token.body==='string'?JSON.parse(token.body):token.body;
 if(!result||typeof result.access_token!=='string'||!result.access_token)
  throw Error('Polestar did not issue an access token');
 return {
  access_token:result.access_token,
  refresh_token:result.refresh_token||'',
  expires_in:Number(result.expires_in||3600)
 };
}
