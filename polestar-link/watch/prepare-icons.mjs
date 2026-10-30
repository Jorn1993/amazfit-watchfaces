import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// Polestar geometric brandmark: two opposing angular elements.
// Geometry adapted from CC0 Polestar icon (thesvg.org/icon/polestar),
// originally sourced from Wikimedia Commons' Polestar logo.
const root = new URL('.', import.meta.url);
const p1=[[12.549,0],[12.092,.555],[12.092,11.746],[23.282,11.746],[23.836,11.289],[14.436,9.399]];
const p2=[[.719,12.26],[.164,12.717],[9.563,14.6],[11.449,24],[11.906,23.445],[11.906,12.26]];
function inside(x,y,vertices){
 let hit=false;
 for(let i=0,j=vertices.length-1;i<vertices.length;j=i++){
  const [xi,yi]=vertices[i], [xj,yj]=vertices[j];
  if((yi>y)!==(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi)hit=!hit;
 }
 return hit;
}
function crcChunk(name,bytes){
 const type=Buffer.from(name),payload=Buffer.concat([type,bytes]);let crc=0xffffffff;
 for(const b of payload){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
 const len=Buffer.alloc(4);len.writeUInt32BE(bytes.length,0);
 const sum=Buffer.alloc(4);sum.writeUInt32BE((crc^0xffffffff)>>>0,0);
 return Buffer.concat([len,payload,sum]);
}
function png(size,{dark=false,padding=2}={}){
 const raw=Buffer.alloc(size*(1+size*4));
 const scale=(size-2*padding)/24;
 for(let y=0;y<size;y++){
  raw[y*(size*4+1)]=0;
  for(let x=0;x<size;x++){
   let amount=0;
   for(let sy=0;sy<2;sy++)for(let sx=0;sx<2;sx++){
    const px=(x+(sx+.5)/2-padding)/scale;
    const py=(y+(sy+.5)/2-padding)/scale;
    if(inside(px,py,p1)||inside(px,py,p2))amount++;
   }
   const offset=y*(size*4+1)+1+x*4;
   const a=Math.round(amount*255/4);
   raw[offset]=238;raw[offset+1]=238;raw[offset+2]=231;raw[offset+3]=a;
   if(dark){
    raw[offset]=Math.round(12*(1-a/255)+238*a/255);
    raw[offset+1]=Math.round(14*(1-a/255)+238*a/255);
    raw[offset+2]=Math.round(16*(1-a/255)+231*a/255);
    raw[offset+3]=255;
   }
  }
 }
 const head=Buffer.alloc(13);
 head.writeUInt32BE(size,0);head.writeUInt32BE(size,4);
 head[8]=8;head[9]=6;
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),
  crcChunk('IHDR',head),crcChunk('IDAT',zlib.deflateSync(raw)),crcChunk('IEND',Buffer.alloc(0))]);
}
for(const folder of ['assets','assets/balance2']){
 const base=path.join(new URL(root).pathname,folder);
 fs.mkdirSync(base,{recursive:true});
 fs.writeFileSync(path.join(base,'icon.png'),png(256,{dark:true,padding:32}));
 fs.writeFileSync(path.join(base,'polestar-mark.png'),png(48,{padding:1}));
}
console.log('Generated Polestar geometric brand mark and Zepp app icon');
