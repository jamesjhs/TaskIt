/**
 * Minimal PNG icon generator – no external dependencies.
 * Produces Crystallise app icons at multiple sizes and places them in ../public/icons/.
 *
 * Usage: node scripts/generate-icons.js   (run from repo root or server/)
 */
'use strict';
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// ── CRC-32 ──────────────────────────────────────────────────────────────────
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
  const t   = Buffer.from(type, 'ascii');
  const len = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length, 0);
  const crc = Buffer.allocUnsafe(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

// ── PNG encoder ──────────────────────────────────────────────────────────────
function toPNG(pixels, size) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    rows.push(Buffer.from([0]));
    rows.push(Buffer.from(pixels.buffer, y * size * 4, size * 4));
  }
  const compressed = zlib.deflateSync(Buffer.concat(rows), { level: 9 });
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = ihdr[11] = ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Geometry helpers ─────────────────────────────────────────────────────────
function inRoundedRect(px, py, rx, ry, rw, rh, r) {
  if (px < rx || px >= rx + rw || py < ry || py >= ry + rh) return false;
  const cx = px - rx, cy = py - ry;
  if (cx <  r      && cy <  r     ) return (cx-r)**2      + (cy-r)**2      <= r*r;
  if (cx >= rw - r && cy <  r     ) return (cx-(rw-r))**2 + (cy-r)**2      <= r*r;
  if (cx <  r      && cy >= rh - r) return (cx-r)**2      + (cy-(rh-r))**2 <= r*r;
  if (cx >= rw - r && cy >= rh - r) return (cx-(rw-r))**2 + (cy-(rh-r))**2 <= r*r;
  return true;
}

function setPixel(pixels, x, y, size, r, g, b, a) {
  const i = (y * size + x) * 4;
  pixels[i] = r; pixels[i+1] = g; pixels[i+2] = b; pixels[i+3] = a;
}

// ── Icon renderer ────────────────────────────────────────────────────────────
function generateIcon(size) {
  const pixels = new Uint8Array(size * size * 4);
  const BG = [79, 70, 229];    // indigo-600  #4F46E5
  const FG = [255, 255, 255];  // white
  const cr = size * 0.2;

  const cbW  = size * 0.50, cbH = size * 0.55;
  const cbX  = (size - cbW) / 2, cbY = size * 0.27;
  const cbR  = size * 0.04;

  const clW  = cbW * 0.38, clH = cbH * 0.10;
  const clX  = cbX + (cbW - clW) / 2, clY = cbY - clH * 0.55;
  const clR  = clH * 0.5;

  const lX   = cbX + cbW * 0.16, lW = cbW * 0.68;
  const lH   = Math.max(2, Math.round(size * 0.028));
  const l1Y  = cbY + cbH * 0.29, l2Y = cbY + cbH * 0.49, l3Y = cbY + cbH * 0.69;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!inRoundedRect(x, y, 0, 0, size, size, cr)) continue;
      setPixel(pixels, x, y, size, BG[0], BG[1], BG[2], 255);
      if (inRoundedRect(x, y, cbX, cbY, cbW, cbH, cbR))
        setPixel(pixels, x, y, size, FG[0], FG[1], FG[2], 255);
      if (inRoundedRect(x, y, clX, clY, clW, clH, clR))
        setPixel(pixels, x, y, size, FG[0], FG[1], FG[2], 255);
      if (x >= lX && x < lX + lW &&
          ((y >= l1Y && y < l1Y + lH) || (y >= l2Y && y < l2Y + lH) || (y >= l3Y && y < l3Y + lH)))
        setPixel(pixels, x, y, size, BG[0], BG[1], BG[2], 255);
    }
  }
  return toPNG(pixels, size);
}

// ── Output ───────────────────────────────────────────────────────────────────
// Support running from repo root or from server/
const repoRoot = path.resolve(__dirname, '..');
const publicDir = path.join(repoRoot, 'public');
const iconsDir  = path.join(publicDir, 'icons');
fs.mkdirSync(iconsDir, { recursive: true });

const sizes = [72, 96, 128, 144, 152, 180, 192, 384, 512];
for (const s of sizes) {
  const buf = generateIcon(s);
  fs.writeFileSync(path.join(iconsDir, `icon-${s}x${s}.png`), buf);
  process.stdout.write(`  generated icon-${s}x${s}.png\n`);
}
fs.copyFileSync(path.join(iconsDir, 'icon-180x180.png'), path.join(publicDir, 'apple-touch-icon.png'));
process.stdout.write('  generated apple-touch-icon.png\n');
fs.writeFileSync(path.join(publicDir, 'favicon.png'), generateIcon(32));
process.stdout.write('  generated favicon.png\n');
process.stdout.write('Done.\n');
