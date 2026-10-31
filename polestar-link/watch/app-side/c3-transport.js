// Polestar C3 direct transport diagnostics. No control methods and no third-party
// services. Only record safe metadata; never store VIN, tokens, or raw replies.
export function summarizeC3Response(response){
 const body=response&&response.body,headers=response&&response.headers||{};
 let contentType='';
 if(typeof headers.get==='function')contentType=String(headers.get('content-type')||'');
 else for(const name of Object.keys(headers))
  if(name.toLowerCase()==='content-type')contentType=String(headers[name]||'');
 const shape=body instanceof ArrayBuffer?'arraybuffer':
  ArrayBuffer.isView(body)?'typed-array':
  typeof body==='string'?'string':
  body===null?'null':typeof body;
 let len=0,replacement=0,nonLatin1=0;
 if(typeof body==='string'){
  len=body.length;
  for(let i=0;i<body.length;i++){
   if(body.charCodeAt(i)===65533)replacement++;
   if(body.charCodeAt(i)>255)nonLatin1++;
  }
 }else if(body instanceof ArrayBuffer||ArrayBuffer.isView(body)){
  len=body.byteLength;
 }
 return {http:Number.isInteger(response&&response.status)?response.status:null,
  shape,content_type:contentType.split(';')[0].slice(0,48),
  length:len,utf8_replacement:replacement,non_latin1:nonLatin1};
}
export function summarizeC3Error(e){
 const m=String(e&&e.message||e||'');
 // Use fixed classifications to avoid persisting raw exceptions with URLs/tokens.
 if(/body|byte|buffer|array|typed|unsupported|invalid parameter/i.test(m))
  return 'binary_body_rejected';
 if(/network|timeout|connection|fetch/i.test(m))
  return 'transport_error';
 return 'request_failed';
}
