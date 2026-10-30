// C3 invocation request models from kildahldev/unofficial-polestar-api:
// src/polestar_api/models/{invocation,locks,climatization,window,honkflash}.py
// Wire format only. A byte-correct request does not make Zepp Fetch gRPC-capable.
// Commands require authenticated HTTP/2 gRPC streaming and state verification.
const C3='/invocation.InvocationService/';
const ACTIONS=Object.freeze({
 lock:{method:'Lock',enumValue:0},
 unlock:{method:'Unlock',enumValue:0},
 trunk_unlock:{method:'Unlock',enumValue:1},
 flash:{method:'HonkFlash',enumValue:2},
 honk:{method:'HonkFlash',enumValue:1},
 honk_flash:{method:'HonkFlash',enumValue:0},
 windows_open:{method:'WindowControl',enumValue:1},
 windows_close:{method:'WindowControl',enumValue:2},
 climate_start:{method:'ClimatizationStart'},
 climate_stop:{method:'ClimatizationStop'}
});
function v(n){
 if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid C3 varint');
 const result=[];
 do{let b=n%128;n=Math.floor(n/128);if(n)b|=128;result.push(b);}while(n);
 return result;
}
function field(number,data){
 if(!Number.isInteger(number)||number<1||number>15||data.length>8192)throw Error('Invalid C3 field');
 return [(number<<3)|2,...v(data.length),...data];
}
function utf8(str){
 // VIN and request fields in these C3 models are strictly ASCII.
 return Array.from(str,ch=>ch.charCodeAt(0));
}
function int(number,n){return [(number<<3),...v(n)];}
function float32(number,n){
 if(!Number.isFinite(n)||n<15||n>30)throw Error('Invalid climate temperature');
 const bytes=new Uint8Array(4);
 new DataView(bytes.buffer).setFloat32(0,n,true);
 return [(number<<3)|5,...bytes];
}
export function c3ControlActions(){return Object.keys(ACTIONS);}
export function encodeC3Action(vin,action,options={}){
 if(typeof vin!=='string'||!/^[A-HJ-NPR-Z0-9]{17}$/i.test(vin))throw Error('Invalid C3 VIN');
 if(!Object.prototype.hasOwnProperty.call(ACTIONS,action))throw Error('Unsupported C3 command');
 const spec=ACTIONS[action];
 const request=field(1,utf8(vin)); // InvocationRequest field 1: vin
 const body=[...field(1,request)]; // action request field 1: InvocationRequest
 if(spec.enumValue!==undefined && spec.enumValue!==0)body.push(...int(2,spec.enumValue));
 if(action==='climate_start'){
  body.push(...int(2,1)); // start: true
  if(options.temperature!==undefined)body.push(...float32(3,Number(options.temperature)));
 }
 return {path:C3+spec.method,mode:'server-stream',method:spec.method,payload:Uint8Array.from(body)};
}
