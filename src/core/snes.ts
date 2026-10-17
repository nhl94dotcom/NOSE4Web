import { readAscii, readU16LE, writeU16LE } from './bytes'

// NHL '94 on the SNES. What the editor knows of it comes from the community's
// disassembly of the game, NHL94SNESVault (github.com/Mhopkinsinc/NHL94SNESVault).
//
// The ROM is "LoROM": the game sees it in 32 KB banks, bank $80 at its start,
// each at addresses $8000 to $FFFF. Some copies start with a 512-byte header
// added by old copier devices, which the editor keeps but leaves out of
// every place it names in the ROM.

const COPIER_HEADER = 512
// The game's own header, at the end of the first bank.
const HEADER_AT = 0x7fc0
const TITLE = "NHL '94"
const MAP_MODE_AT = HEADER_AT + 0x15
const LOROM_FAST = 0x30
const INVERSE_CHECKSUM_AT = HEADER_AT + 0x1c
const CHECKSUM_AT = HEADER_AT + 0x1e
const BANK_SIZE = 0x8000

function hasTitle(file: Uint8Array, start: number): boolean {
  return (
    file.length >= start + HEADER_AT + 0x20 &&
    readAscii(file, start + HEADER_AT, TITLE.length) === TITLE &&
    file[start + MAP_MODE_AT] === LOROM_FAST
  )
}

// The ROM without its copier header, and the header, if the file is the SNES
// game. Null for any other file.
export function splitSnesFile(file: Uint8Array): { rom: Uint8Array; copierHeader: Uint8Array | null } | null {
  if (hasTitle(file, 0)) return { rom: file.slice(), copierHeader: null }
  if (hasTitle(file, COPIER_HEADER)) return { rom: file.slice(COPIER_HEADER), copierHeader: file.slice(0, COPIER_HEADER) }
  return null
}

// Where in the ROM the game's address `bank:address` is.
export function loRomOffset(bank: number, address: number): number {
  return (bank & 0x7f) * BANK_SIZE + (address - 0x8000)
}

// The game's address for a place in the ROM, in the given bank's numbering.
export function loRomAddress(offset: number): number {
  return 0x8000 + (offset % BANK_SIZE)
}

export function loRomBank(offset: number, like: number): number {
  return (like & 0x80) | Math.floor(offset / BANK_SIZE)
}

// The game does not check its checksum, but emulators report a wrong one, so
// it is put right. It is the sum of every byte, with the checksum taken as
// 0 and its inverse as $FFFF. That is clear only for a ROM of a power-of-two
// size; any other is left as it is.
export function fixSnesChecksum(rom: Uint8Array): void {
  if (rom.length < BANK_SIZE || (rom.length & (rom.length - 1)) !== 0) return
  writeU16LE(rom, INVERSE_CHECKSUM_AT, 0xffff)
  writeU16LE(rom, CHECKSUM_AT, 0)
  let sum = 0
  for (const byte of rom) sum += byte
  writeU16LE(rom, CHECKSUM_AT, sum & 0xffff)
  writeU16LE(rom, INVERSE_CHECKSUM_AT, ~sum & 0xffff)
}

export function snesChecksum(rom: Uint8Array): number {
  return readU16LE(rom, CHECKSUM_AT)
}

// ------------------------------------------------------------ team colours
// Each team has two strips of 16 colours: the home team's, which is white,
// and the visitors', which is dark. They are kept in two tables of 32 bytes a
// team, in team order, apart from the team data. The game's code that loads
// them holds each table's address (ADC #address, then LDA #bank), so a ROM
// that has moved the tables is followed there; one whose loader has been
// changed some other way has its colours left alone.
const OP_ADC = 0x69
const OP_LDA = 0xa9
const STRIP_LOADERS = { home: { address: 0x9fb925, bank: 0x9fb92a }, away: { address: 0x9fb95a, bank: 0x9fb95f } }
export const STRIP_BYTES = 32

export function snesStripTables(rom: Uint8Array): { home: number; away: number } | null {
  const table = ({ address, bank }: { address: number; bank: number }) => {
    const [a, b] = [loRomOffset(0x9f, address & 0xffff), loRomOffset(0x9f, bank & 0xffff)]
    if (rom[a] !== OP_ADC || rom[b] !== OP_LDA) return null
    const at = loRomOffset(rom[b + 1], readU16LE(rom, a + 1))
    return at >= 0 && at + STRIP_BYTES <= rom.length ? at : null
  }
  const [home, away] = [table(STRIP_LOADERS.home), table(STRIP_LOADERS.away)]
  return home !== null && away !== null ? { home, away } : null
}

// ---------------------------------------------------------- player sprites
// The players are drawn from frames of sprites. A table at $82:8000 holds
// each frame's place, as a distance from the table; a frame is a 22-byte
// header, 7 bytes for each sprite (x, y, first tile, flags, size), and its
// tiles, 32 bytes each in the SNES's planar 4-bit form. The game puts the
// tiles in video memory in two rows of 16, which a sprite's tile numbers
// count in, from the header's size of the first row. From the disassembly's
// notes on sprite frames.
const FRAME_TABLE = 0x10000
const FRAME_COUNT = 976
const FRAME_HEADER = 0x16
const SPRITE_ENTRY = 7
const INLINE_TILES = 0x80

export interface SpriteImage {
  width: number
  height: number
  // Colour numbers, 0 for see-through.
  pixels: Uint8Array
}

function tilePixel(rom: Uint8Array, tile: number, x: number, y: number): number {
  const bit = 7 - x
  const low = tile + y * 2
  const high = tile + 16 + y * 2
  return ((rom[low] >> bit) & 1) | (((rom[low + 1] >> bit) & 1) << 1) | (((rom[high] >> bit) & 1) << 2) | (((rom[high + 1] >> bit) & 1) << 3)
}

// Frame `id` (counted from 1), or null where it cannot be drawn on its own.
export function snesSpriteFrame(rom: Uint8Array, id: number): SpriteImage | null {
  if (id < 1 || id > FRAME_COUNT) return null
  const entry = FRAME_TABLE + (id - 1) * 4
  const frame = (readU16LE(rom, entry + 2) + 2) * BANK_SIZE + readU16LE(rom, entry)
  if (frame + FRAME_HEADER > rom.length || !(rom[frame + 1] & INLINE_TILES)) return null
  const count = rom[frame]
  const firstRow = readU16LE(rom, frame + 0x0c) / 32
  const tiles = frame + FRAME_HEADER + count * SPRITE_ENTRY
  const signed = (o: number) => (readU16LE(rom, o) ^ 0x8000) - 0x8000

  const dots: [number, number, number][] = []
  for (let s = 0; s < count; s++) {
    const p = frame + FRAME_HEADER + s * SPRITE_ENTRY
    const [left, top, first, flags] = [signed(p), signed(p + 2), rom[p + 4], rom[p + 5]]
    const size = rom[p + 6] === 0xff ? 16 : 8
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const fx = flags & 0x40 ? size - 1 - x : x
        const fy = flags & 0x80 ? size - 1 - y : y
        const place = first + (fx >> 3) + (fy >> 3) * 16
        const tile = tiles + (place < 16 ? place : firstRow + place - 16) * 32
        if (tile + 32 > rom.length) return null
        const colour = tilePixel(rom, tile, fx & 7, fy & 7)
        if (colour) dots.push([left + x, top + y, colour])
      }
    }
  }
  if (dots.length === 0) return null
  const xs = dots.map((d) => d[0])
  const ys = dots.map((d) => d[1])
  const [minX, minY] = [Math.min(...xs), Math.min(...ys)]
  const width = Math.max(...xs) - minX + 1
  const height = Math.max(...ys) - minY + 1
  const pixels = new Uint8Array(width * height)
  for (const [x, y, colour] of dots) pixels[(y - minY) * width + (x - minX)] = colour
  return { width, height, pixels }
}

// A skater from the side and from behind, and a goalie facing out: what the
// team page shows a strip on.
const PREVIEW_FRAMES = [13, 1, 615]

export function snesPreviewSprites(rom: Uint8Array): SpriteImage[] {
  return PREVIEW_FRAMES.map((id) => snesSpriteFrame(rom, id)).filter((image): image is SpriteImage => image !== null)
}
