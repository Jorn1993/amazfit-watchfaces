// Minimal protobuf/gRPC-wire decoder for the Polestar C3 Digital Twin backend.
// No dependencies. Reject malformed frames and unknown command states.
export function bytes(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (Array.isArray(value)) return Uint8Array.from(value);
  if (typeof value === 'string') {
    const result = new Uint8Array(value.length);
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      if (code > 255) throw Error('Fetch corrupted binary gRPC payload; a native HTTP/2 transport is required');
      result[i] = code;
    }
    return result;
  }
  throw Error('Zepp Fetch did not return binary data');
}
export function varint(number) {
  if (!Number.isSafeInteger(number) || number < 0) throw Error('Invalid protobuf integer');
  const out = [];
  do { let b = number % 128; number = Math.floor(number / 128); if (number) b |= 128; out.push(b); } while (number);
  return out;
}
export function encodeVin(vin) {
  if (!/^[A-HJ-NPR-Z0-9]{17}$/i.test(vin)) throw Error('Vehicle VIN invalid');
  const data = Array.from(vin, char => char.charCodeAt(0));
  return Uint8Array.from([10, ...varint(data.length), ...data]);
}
export function requestFor(vin, command) {
  const inner = encodeVin(vin);
  return command ? Uint8Array.from([10, ...varint(inner.length), ...inner]) : inner;
}
export function grpcFrame(message) {
  const len=message.length;
  if(len>1048576) throw Error('gRPC request too large');
  return Uint8Array.from([0,(len>>>24)&255,(len>>>16)&255,(len>>>8)&255,len&255,...message]);
}
export function grpcPayload(data) {
  const raw=bytes(data);
  if(raw.length < 5) throw Error('Incomplete gRPC response');
  if(raw[0] !== 0) throw Error('Compressed gRPC response unsupported');
  const n=(raw[1]*16777216+raw[2]*65536+raw[3]*256+raw[4])>>>0;
  if(n>1048576 || n+5>raw.length) throw Error('Invalid gRPC response size');
  return raw.slice(5,5+n);
}
// Lock/unlock use server-streamed invocations: SENT -> DELIVERED -> SUCCESS.
export function grpcMessages(data) {
 const raw=bytes(data),messages=[];
 let p=0;
 while(p<raw.length){
  if(p+5>raw.length)throw Error('Truncated gRPC stream');
  if(raw[p]!==0)throw Error('Compressed gRPC response unsupported');
  const n=(raw[p+1]*16777216+raw[p+2]*65536+raw[p+3]*256+raw[p+4])>>>0;
  p+=5;
  if(n>1048576||p+n>raw.length)throw Error('Truncated gRPC frame');
  messages.push(raw.slice(p,p+n));p+=n;
  if(messages.length>64)throw Error('gRPC stream has too many messages');
 }
 if(!messages.length)throw Error('Empty gRPC stream');
 return messages;
}
function readVarint(data,index) {
  let result=0,mul=1;
  for(let count=0;count<10;count++){
    if(index>=data.length) throw Error('Truncated protobuf varint');
    const b=data[index++];
    result+=(b&127)*mul;
    if(!(b&128)) return [result,index];
    mul*=128;
  }
  throw Error('Malformed protobuf varint');
}
export function fields(data) {
  data=bytes(data);
  const result={};let p=0;
  while(p<data.length){
    let tag;[tag,p]=readVarint(data,p);
    const id=Math.floor(tag/8), wire=tag%8;
    if(!id)throw Error('Invalid protobuf field number');
    let value;
    if(wire===0){[value,p]=readVarint(data,p);}
    else if(wire===1){
      if(p+8>data.length)throw Error('Truncated protobuf double');
      value=new DataView(data.buffer,data.byteOffset+p,8).getFloat64(0,true);p+=8;
    }else if(wire===2){
      let len;[len,p]=readVarint(data,p);
      if(!Number.isSafeInteger(len)||len<0||p+len>data.length) throw Error('Invalid protobuf length');
      value=data.slice(p,p+len);p+=len;
    }else if(wire===5){
      if(p+4>data.length)throw Error('Truncated protobuf float');
      value=new DataView(data.buffer,data.byteOffset+p,4).getFloat32(0,true);p+=4;
    }else throw Error('Unsupported protobuf wire '+wire);
    result[id]=value;
  }
  return result;
}
function text(data) {
  if(!(data instanceof Uint8Array))return '';
  if(typeof TextDecoder!=='undefined')return new TextDecoder('utf-8').decode(data);
  return Array.from(data,b=>String.fromCharCode(b)).join('');
}
export function decodeBattery(payload){
  const outer=fields(payload),battery=outer[3]&&fields(outer[3]);
  if(!battery)throw Error('Polestar battery data missing');
  const charge=battery[2],range=battery[4];
  if(typeof charge!=='number'||!Number.isFinite(charge)||charge<0||charge>100)throw Error('Invalid battery level');
  if(typeof range!=='number'||!Number.isFinite(range)||range<0||range>2000)throw Error('Invalid estimated range');
  return {battery_percent:Math.round(charge),range_km:Math.round(range),charging:battery[7]===1};
}
export function decodeExterior(payload){
  const outer=fields(payload),exterior=outer[3]&&fields(outer[3]);
  if(!exterior)throw Error('Exterior state unavailable');
  let value=exterior[2]; // Polestar 4 Digital Twin central lock is flat field 2
  if(value instanceof Uint8Array)value=fields(value)[1]; // legacy nested field
  return {lock_state:value===2?'locked':value===1?'unlocked':'unknown'};
}
export function decodeInvocation(payload){
  const outer=fields(payload),response=outer[1] instanceof Uint8Array?fields(outer[1]):null;
  if(!response)throw Error('No Polestar command response');
  const status=response[3],message=text(response[4]),requestId=text(response[1]);
  const labels={0:'unknown error',1:'sent',2:'car offline',4:'delivered',5:'delivery timed out',6:'success',7:'response timed out',8:'car error',9:'privacy enabled',10:'wrong usage mode',11:'invocation error',12:'conflicting command'};
  return {status,status_label:labels[status]||'unknown',message:message.slice(0,100),requestId:requestId.slice(0,100),ok:status===6};
}
