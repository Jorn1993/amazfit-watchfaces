import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto, createHash } from 'node:crypto';
import { authenticatePolestar } from '../app-side/oidc.js';

const ID='https://polestarid.eu.polestar.com';
function fakeTransport({cookie=true,stateMismatch=false,failOnUnexpected=true}={}){
 const trace=[];let state='';
 const http=async(url,method='GET',headers={},body)=>{
  const path=url.split('?')[0];trace.push({path,method,bodyType:typeof body});
  if(path===ID+'/.well-known/openid-configuration')
   return {status:200,body:{authorization_endpoint:ID+'/as/authorization.oauth2',
    token_endpoint:ID+'/as/token.oauth2'}};
  if(path===ID+'/as/authorization.oauth2'){
   assert.equal(method,'GET');
   const p=new URL(url).searchParams;
   assert.equal(p.get('redirect_uri'),'polestar-explore://explore.polestar.com');
   assert.equal(p.get('client_id'),'lp8dyrd_10');
   assert.equal(p.get('code_challenge_method'),'S256');
   assert.equal(p.get('code_challenge').length,43);
   state=p.get('state');
   return {status:200,body:'form: true, url: "/resume"',
    headers:cookie?{'Set-Cookie':'PF=dummy-cookie; Path=/; HttpOnly'}:{}};
  }
  if(path===ID+'/resume'){
   assert.equal(method,'POST');
   assert.equal(headers.Cookie,'PF=dummy-cookie');
   const p=new URLSearchParams(body);
   assert.equal(p.get('pf.username'),'nobody@example.invalid');
   assert.equal(p.get('pf.pass'),'fake-test-password');
   return {status:302,headers:{Location:'polestar-explore://explore.polestar.com?code=mock-code&state='+
     (stateMismatch?'different-state':state)}};
  }
  if(path===ID+'/as/token.oauth2'){
   assert.equal(method,'POST');
   const p=new URLSearchParams(body);
   assert.equal(p.get('code'),'mock-code');
   assert.equal(p.get('redirect_uri'),'polestar-explore://explore.polestar.com');
   const verifier=p.get('code_verifier');
   const computed=createHash('sha256').update(verifier).digest('base64url');
   assert.ok(computed);
   return {status:200,body:{access_token:'mock-token',refresh_token:'mock-refresh',expires_in:900}};
  }
  if(failOnUnexpected)throw Error('Unexpected mock request: '+path);
  return {status:404};
 };
 return {http,trace};
}
test('Homey-style Polestar mobile PKCE flow exchanges code with session cookies',async()=>{
 const {http,trace}=fakeTransport();
 const tokens=await authenticatePolestar('nobody@example.invalid','fake-test-password',http,webcrypto);
 assert.deepEqual(tokens,{access_token:'mock-token',refresh_token:'mock-refresh',expires_in:900});
 assert.deepEqual(trace.map(x=>x.method),['GET','GET','POST','POST']);
 assert.ok(trace.every(x=>!x.path.includes('mock-code')));
 assert.ok(trace.every(x=>!x.path.includes('fake-test-password')));
});
test('Fail closed if Zepp Fetch cannot access Polestar login session cookie',async()=>{
 const {http,trace}=fakeTransport({cookie:false});
 await assert.rejects(
  authenticatePolestar('nobody@example.invalid','fake-test-password',http,webcrypto),
  /did not expose Polestar session cookies/
 );
 assert.equal(trace.length,2,'Never submit a password without session cookie');
});
test('Do not exchange a Polestar authorization code with mismatched OAuth state',async()=>{
 const {http,trace}=fakeTransport({stateMismatch:true});
 await assert.rejects(
  authenticatePolestar('nobody@example.invalid','fake-test-password',http,webcrypto),
  /state missing or mismatched/
 );
 assert.equal(trace.length,3);
});
test('Refuse authentication without platform secure randomness',async()=>{
 const {http,trace}=fakeTransport();
 await assert.rejects(
  authenticatePolestar('nobody@example.invalid','fake-test-password',http,{}),
  /secure random/
 );
 assert.equal(trace.length,0);
});

test('Missing Polestar OAuth state is rejected before token exchange',async()=>{
 const {http:baseline,trace}=fakeTransport();
 const http=async(...args)=>{
  const response=await baseline(...args);
  if(args[0].split('?')[0]===ID+'/resume'){
   response.headers.Location='polestar-explore://explore.polestar.com?code=mock-code';
  }
  return response;
 };
 await assert.rejects(
  authenticatePolestar('nobody@example.invalid','fake-test-password',http,webcrypto),
  /state missing or mismatched/
 );
 assert.equal(trace.length,3,'No token exchange on state-less redirect');
});

test('Follows an intermediate HTTP 302 and preserves Polestar session cookie before password submission',async()=>{
 const {http:baseline,trace}=fakeTransport();
 let redirected=false,forwarded=false;
 const http=async(url,method='GET',headers={},body)=>{
  if(url.startsWith(ID+'/as/authorization.oauth2?')&&!redirected){
   await baseline(url,method,headers,body); // Capture OAuth state in the simulated server.
   redirected=true;
   return {status:302,headers:{Location:'/as/login-step','Set-Cookie':'PF=dummy-cookie; Path=/; HttpOnly'}};
  }
  if(url===ID+'/as/login-step'){
   assert.equal(method,'GET');
   assert.equal(headers.Cookie,'PF=dummy-cookie');
   forwarded=true;
   return {status:200,body:'url: "/resume"',headers:{}};
  }
  return baseline(url,method,headers,body);
 };
 const tokens=await authenticatePolestar('nobody@example.invalid','fake-test-password',http,webcrypto);
 assert.equal(tokens.access_token,'mock-token');
 assert.equal(redirected,true);
 assert.equal(forwarded,true);
 assert.equal(trace.some(x=>x.method==='POST'&&x.path===ID+'/resume'),true);
});

test('Never follow an OIDC redirect outside Polestar ID or send credentials there',async()=>{
 const {http:baseline,trace}=fakeTransport();
 const http=async(url,method='GET',headers={},body)=>{
  if(url.startsWith(ID+'/as/authorization.oauth2?'))
   return {status:302,headers:{Location:'https://example.org/collect','Set-Cookie':'PF=dummy-cookie'}};
  return baseline(url,method,headers,body);
 };
 await assert.rejects(
  authenticatePolestar('nobody@example.invalid','fake-test-password',http,webcrypto),
  /outside identity service/
 );
 assert.equal(trace.length,1,'Only provider discovery is allowed');
});

test('Fail visibly if Zepp hides the Location header on an authorization redirect',async()=>{
 const {http:baseline,trace}=fakeTransport();
 const http=async(...args)=>{
  if(args[0].startsWith(ID+'/as/authorization.oauth2?'))
   return {status:302,headers:{'Set-Cookie':'PF=dummy-cookie'}};
  return baseline(...args);
 };
 await assert.rejects(
  authenticatePolestar('nobody@example.invalid','fake-test-password',http,webcrypto),
  /did not expose Polestar redirect Location/
 );
 assert.equal(trace.length,1,'No password submitted');
});

test('Stop repeated authentication redirects instead of looping forever',async()=>{
 const {http:baseline}=fakeTransport();
 let redirected=0;
 const http=async(url,...args)=>{
  if(url.startsWith(ID+'/as/authorization.oauth2?')||url===ID+'/as/redirect-loop'){
   redirected++;
   return {status:302,headers:{Location:'/as/redirect-loop','Set-Cookie':'PF=dummy-cookie'}};
  }
  return baseline(url,...args);
 };
 await assert.rejects(
  authenticatePolestar('nobody@example.invalid','fake-test-password',http,webcrypto),
  /exceeded redirect limit/
 );
 assert.equal(redirected,7);
});


test('A Polestar website resumePath redirect leads directly to the identity resume POST',async()=>{
 const {http:baseline,trace}=fakeTransport();
 const destinations=[];let posted=false;
 const http=async(url,method='GET',headers={},body)=>{
  destinations.push(url.split('?')[0]);
  if(url.startsWith(ID+'/as/authorization.oauth2?')){
   await baseline(url,method,headers,body); // mock provider remembers state
   return {status:302,headers:{
    Location:'https://www.polestar.com/sign-in?resumePath=aBcD123',
    'Set-Cookie':'PF=dummy-cookie; Path=/; Secure; HttpOnly'
   }};
  }
  if(url.startsWith(ID+'/as/aBcD123/resume/as/authorization.ping?')){
   assert.equal(method,'POST');
   assert.equal(headers.Cookie,'PF=dummy-cookie');
   const fields=new URLSearchParams(body);
   assert.equal(fields.get('pf.username'),'nobody@example.invalid');
   assert.equal(fields.get('pf.pass'),'fake-test-password');
   posted=true;
   const state=new URL(url).searchParams.get('state');
   return {status:302,headers:{
    Location:'polestar-explore://explore.polestar.com?code=mock-code&state='+state
   }};
  }
  return baseline(url,method,headers,body);
 };
 const result=await authenticatePolestar('nobody@example.invalid','fake-test-password',http,webcrypto);
 assert.equal(result.access_token,'mock-token');
 assert.equal(posted,true);
 assert.equal(destinations.some(url=>url.startsWith('https://www.polestar.com')),false,
  'Do not fetch the website URL or send Polestar PF cookies there');
 assert.equal(trace.filter(item=>item.method==='POST').length,1,'Token exchange only in baseline transport');
});

test('Reject external resumePath injection without sending credentials',async()=>{
 const {http:baseline,trace}=fakeTransport();
 const http=async(url,method='GET',headers={},body)=>{
  if(url.startsWith(ID+'/as/authorization.oauth2?'))
   return {status:302,headers:{
    Location:'https://another-example.org/login?resumePath=aBcD123',
    'Set-Cookie':'PF=dummy-cookie'
   }};
  return baseline(url,method,headers,body);
 };
 await assert.rejects(
  authenticatePolestar('nobody@example.invalid','fake-test-password',http,webcrypto),
  /outside identity service/
 );
 assert.equal(trace.length,1,'No credentials may be submitted');
});

test('Reject malformed resumePath in official redirect',async()=>{
 const {http:baseline,trace}=fakeTransport();
 const http=async(url,method='GET',headers={},body)=>{
  if(url.startsWith(ID+'/as/authorization.oauth2?'))
   return {status:302,headers:{
    Location:'https://www.polestar.com/sign-in?resumePath=..%2F..%2Ftest',
    'Set-Cookie':'PF=dummy-cookie'
   }};
  return baseline(url,method,headers,body);
 };
 await assert.rejects(
  authenticatePolestar('nobody@example.invalid','fake-test-password',http,webcrypto),
  /outside identity service/
 );
 assert.equal(trace.length,1);
});
