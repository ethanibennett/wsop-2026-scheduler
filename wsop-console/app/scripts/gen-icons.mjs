// Dependency-free PNG icon generator (pure Node zlib). Draws the console mark:
// dark rounded square, chip-gold ring + crosshair, felt-green center dot.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')
mkdirSync(OUT, { recursive: true })

const INK = [0x14, 0x17, 0x1c]
const GOLD = [0xc8, 0xa0, 0x4e]
const FELT = [0x3c, 0xa3, 0x74]

function lerp(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t))
}

function px(size) {
  const c = size / 2
  const ringR = size * 0.30
  const ringW = size * 0.045
  const dotR = size * 0.095
  const armOuter = size * 0.40
  const armInner = size * 0.34
  const armHalf = size * 0.022
  const corner = size * 0.22

  const buf = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      // rounded-rect mask (transparent corners)
      const dx = Math.max(corner - x, x - (size - corner), 0)
      const dy = Math.max(corner - y, y - (size - corner), 0)
      const cornerDist = Math.hypot(dx, dy)
      let a = 255
      if (cornerDist > corner) a = 0

      let col = INK
      const d = Math.hypot(x - c, y - c)
      // ring
      if (Math.abs(d - ringR) < ringW) col = GOLD
      // center dot
      if (d < dotR) col = FELT
      // crosshair arms (4 directions)
      const ax = Math.abs(x - c)
      const ay = Math.abs(y - c)
      const onV = ax < armHalf && ay > armInner && ay < armOuter
      const onH = ay < armHalf && ax > armInner && ax < armOuter
      if (onV || onH) col = GOLD

      buf[i] = col[0]
      buf[i + 1] = col[1]
      buf[i + 2] = col[2]
      buf[i + 3] = a
    }
  }
  return buf
}

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crc])
}

function png(size) {
  const raw = px(size)
  // add filter byte (0) at the start of each scanline
  const stride = size * 4
  const filtered = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    filtered[y * (stride + 1)] = 0
    raw.copy(filtered, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(filtered)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const size of [192, 512]) {
  writeFileSync(join(OUT, `icon-${size}.png`), png(size))
  console.log(`wrote icon-${size}.png`)
}
lerp // referenced to satisfy lint if unused
