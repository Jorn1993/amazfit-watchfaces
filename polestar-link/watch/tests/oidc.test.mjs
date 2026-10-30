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
  /state mismatch/
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
