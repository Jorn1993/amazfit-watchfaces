import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// Recreate the local-only prototype icon; avoids requiring a binary asset upload.
const root = new URL('.', import.meta.url);
const size = 256;
const pixels = Buffer.alloc(size * (size * 4 + 1));
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const p = y * (size * 4 + 1) + 1 + x * 4;
    const dx = x - 128, dy = y - 128;
    const inside = dx * dx + dy * dy < 110 * 110;
    pixels[p] = inside ? 15 : 0;
    pixels[p + 1] = inside ? 96 : 0;
    pixels[p + 2] = inside ? 86 : 0;
    pixels[p + 3] = inside ? 255 : 0;
  }
}
function chunk(name, bytes) {
  const type = Buffer.from(name);
  const payload = Buffer.concat([type, bytes]);
  let crc = 0xffffffff;
  for (const byte of payload) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const header = Buffer.alloc(4);
  header.writeUInt32BE(bytes.length);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([header, payload, tail]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(size, 0);
ihdr.writeUInt32BE(size, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
for (const folder of ['assets','assets/balance2']) {
  const out = path.join(new URL(root).pathname, folder, 'icon.png');
  fs.mkdirSync(path.dirname(out), {recursive:true});
  fs.writeFileSync(out, png);
}
console.log('Generated Zepp preview icons');
