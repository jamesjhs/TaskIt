/**
 * PWA PNG asset generator.
 *
 * Uses public/RKlogo.png for install icons and public/android.png for the
 * Android notification badge. No external image dependencies are required.
 *
 * Usage: node scripts/generate-icons.js
 */
'use strict';

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// CRC-32 ---------------------------------------------------------------------
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.allocUnsafe(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.allocUnsafe(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

// PNG decode/encode -----------------------------------------------------------
function readPng(filePath) {
  const buf = fs.readFileSync(filePath);
  const signature = '89504e470d0a1a0a';
  if (buf.subarray(0, 8).toString('hex') !== signature) {
    throw new Error(`${filePath} is not a PNG file`);
  }

  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];

  while (pos < buf.length) {
    const length = buf.readUInt32BE(pos);
    const type = buf.subarray(pos + 4, pos + 8).toString('ascii');
    const data = buf.subarray(pos + 8, pos + 8 + length);
    pos += 12 + length;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (bitDepth !== 8 || colorType !== 6) {
        throw new Error(`${filePath} must be an 8-bit RGBA PNG. Found bitDepth=${bitDepth}, colorType=${colorType}`);
      }
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const inflated = zlib.inflateSync(Buffer.concat(idat));
  const pixels = new Uint8Array(width * height * bytesPerPixel);
  const prev = new Uint8Array(stride);
  const row = new Uint8Array(stride);
  let offset = 0;

  for (let y = 0; y < height; y++) {
    const filter = inflated[offset++];
    row.set(inflated.subarray(offset, offset + stride));
    offset += stride;

    for (let x = 0; x < stride; x++) {
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
      const up = prev[x];
      const upLeft = x >= bytesPerPixel ? prev[x - bytesPerPixel] : 0;
      let value = row[x];

      if (filter === 1) value = (value + left) & 255;
      else if (filter === 2) value = (value + up) & 255;
      else if (filter === 3) value = (value + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) value = (value + paeth(left, up, upLeft)) & 255;
      else if (filter !== 0) throw new Error(`Unsupported PNG filter type ${filter}`);

      row[x] = value;
    }

    pixels.set(row, y * stride);
    prev.set(row);
  }

  return { width, height, pixels };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function toPng(image) {
  const { width, height, pixels } = image;
  const rows = [];
  for (let y = 0; y < height; y++) {
    rows.push(Buffer.from([0]));
    rows.push(Buffer.from(pixels.buffer, pixels.byteOffset + y * width * 4, width * 4));
  }

  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = ihdr[11] = ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', zlib.deflateSync(Buffer.concat(rows), { level: 9 })),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

// Image transforms ------------------------------------------------------------
function resizeContain(src, size, options = {}) {
  const padding = options.padding ?? 0;
  const bg = options.background ?? [0, 0, 0, 0];
  const usable = size - padding * 2;
  const scale = Math.min(usable / src.width, usable / src.height);
  const drawW = Math.max(1, Math.round(src.width * scale));
  const drawH = Math.max(1, Math.round(src.height * scale));
  const offsetX = Math.floor((size - drawW) / 2);
  const offsetY = Math.floor((size - drawH) / 2);
  const out = new Uint8Array(size * size * 4);

  for (let i = 0; i < out.length; i += 4) {
    out[i] = bg[0];
    out[i + 1] = bg[1];
    out[i + 2] = bg[2];
    out[i + 3] = bg[3];
  }

  for (let y = 0; y < drawH; y++) {
    const sy = Math.min(src.height - 1, Math.floor(y / scale));
    for (let x = 0; x < drawW; x++) {
      const sx = Math.min(src.width - 1, Math.floor(x / scale));
      const srcI = (sy * src.width + sx) * 4;
      const dstI = ((offsetY + y) * size + offsetX + x) * 4;
      out[dstI] = src.pixels[srcI];
      out[dstI + 1] = src.pixels[srcI + 1];
      out[dstI + 2] = src.pixels[srcI + 2];
      out[dstI + 3] = src.pixels[srcI + 3];
    }
  }

  return { width: size, height: size, pixels: out };
}

function makeNotificationBadge(src, size) {
  const resized = resizeContain(src, size, { padding: Math.round(size * 0.1) });
  const pixels = resized.pixels;
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3];
    const luminance = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
    pixels[i] = 255;
    pixels[i + 1] = 255;
    pixels[i + 2] = 255;
    pixels[i + 3] = Math.round(alpha * (luminance / 255));
  }
  return resized;
}

// Output ----------------------------------------------------------------------
const repoRoot = path.resolve(__dirname, '..');
const publicDir = path.join(repoRoot, 'public');
const iconsDir = path.join(publicDir, 'icons');
fs.mkdirSync(iconsDir, { recursive: true });

const logo = readPng(path.join(publicDir, 'RKlogo.png'));
const androidBadge = readPng(path.join(publicDir, 'android.png'));

const installSizes = [72, 96, 128, 144, 152, 180, 192, 384, 512];
for (const size of installSizes) {
  fs.writeFileSync(path.join(iconsDir, `icon-${size}x${size}.png`), toPng(resizeContain(logo, size)));
  process.stdout.write(`  generated icon-${size}x${size}.png\n`);
}

for (const size of [192, 512]) {
  const padding = Math.round(size * 0.1);
  fs.writeFileSync(path.join(iconsDir, `maskable-icon-${size}x${size}.png`), toPng(resizeContain(logo, size, { padding })));
  process.stdout.write(`  generated maskable-icon-${size}x${size}.png\n`);
}

for (const size of [72, 96, 128]) {
  fs.writeFileSync(path.join(iconsDir, `notification-badge-${size}x${size}.png`), toPng(makeNotificationBadge(androidBadge, size)));
  process.stdout.write(`  generated notification-badge-${size}x${size}.png\n`);
}

fs.copyFileSync(path.join(iconsDir, 'icon-180x180.png'), path.join(publicDir, 'apple-touch-icon.png'));
process.stdout.write('  generated apple-touch-icon.png\n');
fs.writeFileSync(path.join(publicDir, 'favicon.png'), toPng(resizeContain(logo, 32)));
process.stdout.write('  generated favicon.png\n');
process.stdout.write('Done.\n');
