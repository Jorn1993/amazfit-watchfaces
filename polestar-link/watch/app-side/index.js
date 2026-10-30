import { BaseSideService } from '@zeppos/zml/base-side';
const s=()=>settings.settingsStorage;
const provider='https://polestarid.eu.polestar.com';
function log(message){s().setItem('polestar.log',new Date().toISOString()+' '+message);}
function parse(response){try{return typeof response.body==='string'?JSON.parse(response.body):response.body;}catch(e){return null;}}
async function discover(){
 const r=await fetch({url:provider+'/.well-known/openid-configuration',method:'GET'});
 const data=parse(r);
 if(r.status!==200||!data||!data.authorization_endpoint||!data.token_endpoint)throw Error('OIDC discovery HTTP '+r.status);
 if(!data.authorization_endpoint.startsWith(provider+'/')||!data.token_endpoint.startsWith(provider+'/'))throw Error('Unexpected identity endpoint');
 return data;
}
async function beginLogin(){
 log('Checking official Polestar ID discovery…');
 const config=await discover();
 s().setItem('polestar.auth.endpoint',config.authorization_endpoint);
 s().setItem('polestar.token.endpoint',config.token_endpoint);
 log('Polestar ID discovered. OAuth PKCE login transport pending.');
}
AppSideService(BaseSideService({
 onInit(){
  s().addListener('change',async ({key})=>{
   if(key!=='polestar.login.request')return;
   try{await beginLogin();}catch(e){log('Login preparation failed: '+String(e.message||e).slice(0,160));}
  });
 },
 onRequest(req,res){
  if(req.method==='zepp.ping'){res(null,{ok:true,version:'1.2.0-experimental'});return;}
  res(null,{ok:false,error:'Polestar ID authentication is not complete; no vehicle commands issued.'});
 }
}));
