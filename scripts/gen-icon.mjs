// One-off generator for src-tauri/icon-source.png (512x512): rounded square,
// a "thread with nodes" glyph — spaces -> projects -> tasks metaphor.
import { deflateSync, crc32 } from "node:zlib";
import { writeFileSync } from "node:fs";

const SIZE = 512;
const SS = 2; // supersample factor per axis

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
function smooth(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const dx = Math.abs(px - cx) - (hw - r);
  const dy = Math.abs(py - cy) - (hh - r);
  const ax = Math.max(dx, 0), ay = Math.max(dy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(dx, dy), 0) - r;
}
function sdSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const t = clamp(((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby), 0, 1);
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}

const BG = [59, 111, 212];      // accent blue
const FG = [255, 255, 255];     // white thread
const nodes = [[150, 368], [256, 168], [368, 326]];
const half = 11;                // line half width
const nodeR = 36, holeR = 14;

function coverage(x, y) {
  let c = 0;
  for (let sy = 0; sy < SS; sy++) {
    for (let sx = 0; sx < SS; sx++) {
      const px = x + (sx + 0.5) / SS;
      const py = y + (sy + 0.5) / SS;
      // background rounded square with 12px inset
      let a = 1 - smooth(-0.75, 0.75, sdRoundRect(px, py, SIZE / 2, SIZE / 2, SIZE / 2 - 12, SIZE / 2 - 12, 88));
      if (a > 0) {
        // glyph coverage
        let g = 0;
        g = Math.max(g, 1 - smooth(half - 0.75, half + 0.75, sdSegment(px, py, nodes[0][0], nodes[0][1], nodes[1][0], nodes[1][1])));
        g = Math.max(g, 1 - smooth(half - 0.75, half + 0.75, sdSegment(px, py, nodes[1][0], nodes[1][1], nodes[2][0], nodes[2][1])));
        for (const [nx, ny] of nodes) {
          const d = Math.hypot(px - nx, py - ny);
          g = Math.max(g, 1 - smooth(nodeR - 0.75, nodeR + 0.75, d));
          g = Math.min(g, smooth(holeR - 0.75, holeR + 0.75, d)); // punch hole
        }
        a *= g > 0 ? 1 : 0; // binary for glyph (AA comes from segment smooth above)
      }
      c += a;
    }
  }
  return c / (SS * SS);
}

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
let o = 0;
for (let y = 0; y < SIZE; y++) {
  raw[o++] = 0; // filter none
  for (let x = 0; x < SIZE; x++) {
    const a = coverage(x, y);
    raw[o++] = BG[0];
    raw[o++] = BG[1];
    raw[o++] = BG[2];
    raw[o++] = Math.round(a * 255);
  }
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
writeFileSync(new URL("./icon-source.png", import.meta.url), png);
console.log("icon-source.png written:", png.length, "bytes");
