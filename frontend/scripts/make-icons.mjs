/**
 * Generates the PWA PNG icons from simple shapes - no image library needed.
 * Run with:  node scripts/make-icons.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
fs.mkdirSync(dir, { recursive: true });

const BG = [29, 78, 216, 255];
const WHITE = [255, 255, 255, 255];
const LIGHT = [219, 234, 254, 255];
const CLEAR = [0, 0, 0, 0];

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

function writePng(file, size, pixels) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x += 1) {
      const px = pixels(y, x);
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      raw[offset] = px[0];
      raw[offset + 1] = px[1];
      raw[offset + 2] = px[2];
      raw[offset + 3] = px[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(file, png);
  console.log('wrote', path.relative(process.cwd(), file), png.length, 'bytes');
}

const inside = (x, y, l, t, r, b) => x >= l && x <= r && y >= t && y <= b;

/** Phone outline with a tick - reads clearly even at 48px. */
function icon(size, maskable) {
  const s = size / 64;
  const pad = maskable ? 0.14 : 0;
  const scale = 1 - pad * 2;
  const map = (v) => pad * 64 + v * scale;
  return (y, x) => {
    const radius = maskable ? size : size * 0.22;
    if (!maskable) {
      const cx = Math.min(Math.max(x, radius), size - radius);
      const cy = Math.min(Math.max(y, radius), size - radius);
      if ((x - cx) ** 2 + (y - cy) ** 2 > radius ** 2) return CLEAR;
    } else if (Math.hypot(x - size / 2, y - size / 2) > size / 2) return CLEAR;

    const px = map(x) / s;
    const py = map(y) / s;

    // screen
    if (inside(px, py, 20, 11, 44, 53)) {
      const r = 5;
      const nearCorner =
        (px < 20 + r && py < 11 + r && (px - (20 + r)) ** 2 + (py - (11 + r)) ** 2 > r ** 2) ||
        (px > 44 - r && py < 11 + r && (px - (44 - r)) ** 2 + (py - (11 + r)) ** 2 > r ** 2) ||
        (px < 20 + r && py > 53 - r && (px - (20 + r)) ** 2 + (py - (53 - r)) ** 2 > r ** 2) ||
        (px > 44 - r && py > 53 - r && (px - (44 - r)) ** 2 + (py - (53 - r)) ** 2 > r ** 2);
      if (!nearCorner) {
        // inner screen
        if (inside(px, py, 23, 15, 41, 41)) return LIGHT;
        // tick
        if (inside(px, py, 25, 25, 30, 33) || inside(px, py, 28, 30, 39, 22)) return BG;
        // speaker
        if (inside(px, py, 28, 45, 36, 48)) return BG;
        return WHITE;
      }
    }
    return BG;
  };
}

writePng(path.join(dir, 'icon-192.png'), 192, icon(192, false));
writePng(path.join(dir, 'icon-512.png'), 512, icon(512, false));
writePng(path.join(dir, 'icon-maskable-512.png'), 512, icon(512, true));
