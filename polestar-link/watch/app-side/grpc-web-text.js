// Minimal gRPC-Web text framing for a read-only compatibility check.
// Native gRPC requires HTTP/2 and byte-perfect payloads; Zepp Fetch does not
// document binary response support. This alternative only works when the
// Polestar C3 endpoint itself supports gRPC-Web and its Base64 text response.
const abc='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function toBase64(data){
 const bytes=data instanceof Uint8Array?data:new Uint8Array(data);
 let result='';
 for(let p=0;p<bytes.length;p+=3){
  const a=bytes[p],b=p+1<bytes.length?bytes[p+1]:0,c=p+2<bytes.length?bytes[p+2]:0;
  result+=abc[a>>>2]+abc[((a&3)<<4)|(b>>>4)]+
   (p+1<bytes.length?abc[((b&15)<<2)|(c>>>6)]:'=')+
   (p+2<bytes.length?abc[c&63]:'=');
 }
 return result;
}
export function fromBase64(value){
 if(typeof value!=='string'||value.length>800000)
  throw Error('Invalid gRPC-Web text payload');
 const compact=value.replace(/\s/g,'');
 if(!compact||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(compact))
  throw Error('gRPC-Web response is not Base64');
 const out=[];
 for(let i=0;i<compact.length;i+=4){
  const x=abc.indexOf(compact[i]),y=abc.indexOf(compact[i+1]);
  const z=compact[i+2]==='='?0:abc.indexOf(compact[i+2]);
  const w=compact[i+3]==='='?0:abc.indexOf(compact[i+3]);
  out.push((x<<2)|(y>>4));
  if(compact[i+2]!=='=')out.push(((y&15)<<4)|(z>>2));
  if(compact[i+3]!=='=')out.push(((z&3)<<6)|w);
 }
 return new Uint8Array(out);
}
export function grpcWebMessages(data){
 const body=fromBase64(data),messages=[];let p=0;
 let status=null;
 while(p<body.length){
  if(p+5>body.length)throw Error('Truncated gRPC-Web frame');
  const flag=body[p],size=((((body[p+1]*256+body[p+2])*256+body[p+3])*256)+body[p+4])>>>0;
  p+=5;
  if(size>1048576||p+size>body.length)throw Error('Invalid gRPC-Web frame size');
  const chunk=body.slice(p,p+size);p+=size;
  if(flag===0)messages.push(chunk);
  else if(flag===128){
   const trailers=Array.from(chunk,b=>String.fromCharCode(b)).join('');
   const match=/(?:^|\r\n)grpc-status:\s*(\d+)/i.exec(trailers);
   status=match?match[1]:null;
  }else throw Error('Unsupported gRPC-Web frame flag');
  if(messages.length>64)throw Error('Too many gRPC-Web messages');
 }
 if(!messages.length)throw Error('No gRPC-Web data frames');
 if(status!==null&&status!=='0')throw Error('gRPC-Web returned status '+status);
 return {messages,status};
}
