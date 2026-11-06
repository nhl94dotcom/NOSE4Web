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

// ------------------------------------------------------------ finding data
// Some ROMs are rebuilt from the disassembly with their code and data in new
// places (one with all 32 of today's teams, for example), so the editor finds
// the tables it edits by the game's code that loads them, wherever that is.
// The code is all in the first 32 banks. `pattern` is the code as hex, with
// a group for each part that varies, (..) for a byte and (....) for a word,
// low byte first; it must be found exactly once.
const CODE_BANKS = 0x20 * BANK_SIZE

function findCode(rom: Uint8Array, pattern: string): { at: number; groups: number[] } | null {
  // Each byte of the pattern, null where it varies, and where each group starts and how long it is.
  const bytes: (number | null)[] = []
  const groups: { at: number; size: number }[] = []
  for (const [, fixed, group] of pattern.matchAll(/([0-9a-f]{2})|\(((?:\.\.)+)\)/g)) {
    if (fixed) bytes.push(parseInt(fixed, 16))
    else {
      groups.push({ at: bytes.length, size: group.length / 2 })
      for (let i = 0; i < group.length / 2; i++) bytes.push(null)
    }
  }
  const end = Math.min(rom.length, CODE_BANKS) - bytes.length
  let found = -1
  for (let at = 0; at <= end; at++) {
    if (rom[at] !== bytes[0] || !bytes.every((byte, i) => byte === null || rom[at + i] === byte)) continue
    if (found >= 0) return null
    found = at
  }
  if (found < 0) return null
  return { at: found, groups: groups.map((group) => (group.size === 2 ? readU16LE(rom, found + group.at) : rom[found + group.at])) }
}

// ------------------------------------------------------------- team table
// The game finds a team's block from a table of its address, bank and a zero,
// one entry a team in team number order. Its code loads the table as LDA
// #bank, STA $8F, LDA #address, STA $8D, then reads the entry for team A * 4.
// The table ends where an entry stops looking like one; in the original game
// the first team block follows it. The original's is at $9C:A5E7, 28 teams.
const TEAM_TABLE_LOADER = '0a0aa8a9(..)00858fa9(....)858db78d858da0040018778d'
const MAX_TEAMS = 64

export function findSnesTeamTable(rom: Uint8Array): { offset: number; count: number } | null {
  const loader = findCode(rom, TEAM_TABLE_LOADER)
  if (!loader) return null
  const [bank, address] = loader.groups
  const offset = loRomOffset(bank, address)
  if (address < 0x8000 || offset >= rom.length) return null
  const entryBank = rom[offset + 2]
  let count = 0
  while (count < MAX_TEAMS) {
    const at = offset + count * 4
    if (at + 4 > rom.length || readU16LE(rom, at) < 0x8000 || rom[at + 2] !== entryBank || rom[at + 3] !== 0) break
    count++
  }
  return count > 0 ? { offset, count } : null
}

// ------------------------------------------------------------ team colours
// Each team has two strips of 16 colours: the home team's, which is white,
// and the visitors', which is dark. They are kept in two tables of 32 bytes a
// team, in team order, apart from the team data. The game's code that loads
// them takes the home or visiting team's number ($1C98 or $1C9A), times 32,
// and adds the table's address (ADC #address, then LDA #bank), so the tables
// are found wherever a ROM has them; one whose loader has been changed some
// other way has its colours left alone.
const STRIP_LOADERS = { home: 'ad981c0a0a0a0a0a1869(....)850ca9(..)00', away: 'ad9a1c0a0a0a0a0a1869(....)850ca9(..)00' }
export const STRIP_BYTES = 32
// Where the original game's code has the home loader, $9F:B91C. A ROM that
// has it there keeps its code where the original game does.
const ORIGINAL_HOME_LOADER = 0xfb91c

function stripLoader(rom: Uint8Array, side: keyof typeof STRIP_LOADERS): { at: number; table: number } | null {
  const loader = findCode(rom, STRIP_LOADERS[side])
  if (!loader) return null
  const [address, bank] = loader.groups
  const table = loRomOffset(bank, address)
  return address >= 0x8000 && table + STRIP_BYTES <= rom.length ? { at: loader.at, table } : null
}

export function snesStripTables(rom: Uint8Array): { home: number; away: number } | null {
  const [home, away] = [stripLoader(rom, 'home'), stripLoader(rom, 'away')]
  return home && away ? { home: home.table, away: away.table } : null
}

// Whether the game's code is where the original game has it, as it is in the
// original and in ROMs patched in place. The hacks are only put in where it is.
export function snesCodeInPlace(rom: Uint8Array): boolean {
  return stripLoader(rom, 'home')?.at === ORIGINAL_HOME_LOADER
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
// The first frame follows the table, so its place says how many there are:
// 976 in the original game.
export function snesSpriteFrame(rom: Uint8Array, id: number): SpriteImage | null {
  if (id < 1 || id > readU16LE(rom, FRAME_TABLE) / 4) return null
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
