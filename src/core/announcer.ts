import { readU16, readU16LE, readU32, writeU16, writeU16LE, writeU32 } from './bytes'
import { HuffmanError, isHuffman, packHuffman, unpackHuffman } from './huffman'
import { LzError, packLz, unpackLz } from './lz'
import { findCodeAll, loRomAddress, loRomBank, loRomOffset } from './snes'
import { freeSpace, keptBanks, sameBank } from './snespictures'
import type { Picture } from './graphics'
import type { RomProject } from './rom'
import { claimSpace } from './space'
import { keyLevels, levelKey, medianCut, nearest, toLevels, word, type Rgb } from './splash'

// The announcer's picture on the pregame matchup screen, Ron Barr at the EA
// SPORTS desk (on the SNES), which a league can replace with a picture of its own.
//
// Genesis (Match Viewer's measurements, and abdulahmad/NHL94Genesis):
// ScoutingReport draws RonBarrMap with movea.l #RonBarrMap,a0 at $FCDEE and
// dobitmap at text cell (1, 1). The block is the logos' kind: the palette's
// and the map's offsets, then the tiles (a count, its top bit set where they
// are packed for DecompressBytecode), 64 colours and an 8 x 9 map of tile
// numbers counted from the first, each in palette row 3. Only row 3 is the
// picture's: the screen's text frames and boxes draw with its colours 1, 4, 5
// and 7, and the SPORTS background behind with 1, 2, 4 and 5. The picture has
// a bevelled frame of its own, three pixels wide (two at the bottom), in those
// and its colours 3 and 6. A new picture keeps the frame, and those colours,
// and fills the 58 x 67 inside it, with 8 to 15 as its own colours. Its tiles
// load at 467 with the hot and cold icons after them, well below the sprite
// table, so the 72 an 8 x 9 picture can have at most fit. A new picture goes
// in free room with its tiles unpacked, and the pointer is changed; the
// original stays where it is, for putting back.

export const ANNOUNCER_WIDTH = 64
export const ANNOUNCER_HEIGHT = 72
const POINTER_AT = 0xfcdee
// movea.l a0,a1; movea.l a0,a2; adda.l (a2)+,a0; adda.l (a2)+,a1
const AFTER = [0x2248, 0x2448, 0xd1da, 0xd3da]
const ACROSS = ANNOUNCER_WIDTH / 8
const DOWN = ANNOUNCER_HEIGHT / 8
const CELLS = ACROSS * DOWN
const ROW = 3
const COLOURS = 16
// Kept as they are: the screen's shared colours, and the frame's own two.
const SHARED = [1, 2, 3, 4, 5, 6, 7]
const OWN = [8, 9, 10, 11, 12, 13, 14, 15]
// The inside of the frame, which a new picture fills.
const INSIDE = { left: 3, top: 3, width: 58, height: 67 }
export const ANNOUNCER_INSIDE = { width: INSIDE.width, height: INSIDE.height }
export const ANNOUNCER_OWN_COLOURS = OWN.length
const TILE_NUMBER = 0x7ff
const FLIP_H = 0x800
const FLIP_V = 0x1000
const PACKED = 0x8000

// --------------------------------------------------------------- unpacking

// DecompressBytecode (decompress94.asm): bytes through a 256-byte ring, each
// opcode's high nibble saying what to do; E with a distance of 0 ends it.
export function unpackGenesisTiles(rom: Uint8Array, at: number, size: number): Uint8Array {
  const ring = new Uint8Array(256)
  const out: number[] = []
  let d1 = 0
  let a0 = at
  const put = (byte: number) => {
    ring[d1] = byte
    out.push(byte)
    d1 = (d1 + 1) & 0xff
  }
  const copy = (count: number, distance: number, reverse: boolean) => {
    let from = (d1 - distance) & 0xff
    for (let i = 0; i < count; i++) {
      put(ring[from])
      from = (from + (reverse ? -1 : 1)) & 0xff
    }
  }
  while (out.length < size) {
    if (a0 >= rom.length) throw new Error('The packed picture runs past the end of the ROM.')
    const op = rom[a0++]
    const next = rom[a0]
    switch (op >> 4) {
      case 0:
      case 1:
        for (let i = 0, n = (op & 0x1f) + 1; i < n; i++) put(rom[a0++])
        break
      case 2:
        for (let i = 0, n = (op & 0xf) + 1; i < n; i++) put(0)
        break
      case 3: {
        const byte = rom[a0++]
        for (let i = 0, n = (op & 0xf) + 3; i < n; i++) put(byte)
        break
      }
      case 4:
      case 5:
      case 6:
      case 7:
        copy((op & 7) + 2, ((op >> 3) & 7) + 1, false)
        break
      case 8:
        a0++
        copy((op & 0xf) + 3, next, false)
        break
      case 9:
      case 15:
        a0++
        copy((((op & 0xf) << 1) | (next >> 7)) + 3, (next & 0x7f) + 1, op >> 4 === 15)
        break
      case 10:
        a0++
        copy(((((op << 8) | next) >> 6) & 0x3f) + 3, (next & 0x3f) + 1, false)
        break
      case 11:
        a0++
        copy(((((op << 8) | next) >> 5) & 0x7f) + 3, (next & 0x1f) + 1, false)
        break
      case 12:
      case 13:
        copy((op & 3) + 2, ((op >> 2) & 7) + 1, true)
        break
      case 14:
        a0++
        if (next === 0) return Uint8Array.from(out)
        copy((op & 0xf) + 3, next, true)
        break
    }
  }
  return Uint8Array.from(out.slice(0, size))
}

// --------------------------------------------------------------- reading

interface Block {
  at: number
  palette: number[]
  tiles: Uint8Array
  map: number[]
}

function header(rom: Uint8Array): number | null {
  if (rom.length < POINTER_AT + 14 || readU16(rom, POINTER_AT) !== 0x207c) return null
  if (!AFTER.every((w, i) => readU16(rom, POINTER_AT + 6 + i * 2) === w)) return null
  return readU32(rom, POINTER_AT + 2)
}

function block(rom: Uint8Array): Block | null {
  const at = header(rom)
  if (at === null || at + 10 > rom.length) return null
  try {
    const paletteAt = at + readU32(rom, at)
    const mapAt = at + readU32(rom, at + 4)
    const count = readU16(rom, at + 8)
    if (paletteAt + 128 > rom.length || mapAt + 4 + CELLS * 2 > rom.length) return null
    if (readU16(rom, mapAt) !== ACROSS || readU16(rom, mapAt + 2) !== DOWN) return null
    const tileCount = count & ~PACKED
    const tiles = count & PACKED ? unpackGenesisTiles(rom, at + 10, tileCount * 32) : rom.slice(at + 10, at + 10 + tileCount * 32)
    if (tiles.length !== tileCount * 32) return null
    const palette = Array.from({ length: 4 * COLOURS }, (_, i) => readU16(rom, paletteAt + i * 2))
    const map = Array.from({ length: CELLS }, (_, i) => readU16(rom, mapAt + 4 + i * 2))
    if (map.some((entry) => (entry & TILE_NUMBER) >= tileCount)) return null
    return { at, palette, tiles, map }
  } catch {
    return null
  }
}

export interface AnnouncerPicture {
  // Colour numbers of palette row 3, and that row's 16 colours.
  picture: Picture
  palette: number[]
  original: boolean
  tiles: number
}

const originals = new WeakMap<Uint8Array, number | null>()
// Where the original game's picture is: where the pointer is as the ROM was opened, if it was the original's.
function originalAt(source: Uint8Array): number | null {
  if (!originals.has(source)) originals.set(source, header(source))
  return originals.get(source)!
}

export function genesisAnnouncerSupported(project: RomProject): boolean {
  return project.game.platform === 'genesis' && block(project.bytes) !== null
}

// The picture as the matchup screen draws it, or null where the ROM's code or picture is not the original game's kind.
export function genesisAnnouncer(project: RomProject): AnnouncerPicture | null {
  const found = block(project.bytes)
  if (!found) return null
  const picture: Picture = { width: ANNOUNCER_WIDTH, height: ANNOUNCER_HEIGHT, pixels: new Uint8Array(ANNOUNCER_WIDTH * ANNOUNCER_HEIGHT) }
  found.map.forEach((entry, cell) => {
    const tile = (entry & TILE_NUMBER) * 32
    const left = (cell % ACROSS) * 8
    const top = Math.floor(cell / ACROSS) * 8
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const fx = entry & FLIP_H ? 7 - x : x
        const fy = entry & FLIP_V ? 7 - y : y
        const byte = found.tiles[tile + fy * 4 + (fx >> 1)]
        picture.pixels[(top + y) * ANNOUNCER_WIDTH + left + x] = fx & 1 ? byte & 15 : byte >> 4
      }
    }
  })
  return {
    picture,
    palette: found.palette.slice(ROW * COLOURS, (ROW + 1) * COLOURS),
    original: found.at === originalAt(project.source) && found.at !== null,
    tiles: found.tiles.length / 32,
  }
}

// ---------------------------------------------------------------- making

export interface AnnouncerImage {
  // Row 3's colours, the map words and the tiles (32 bytes each).
  row: number[]
  map: number[]
  tiles: Uint8Array[]
  colours: number
  kept: number
}

// The image scaled to cover the inside of the frame, centred and cropped, in the console's levels.
function covered(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): number[] {
  const scale = Math.max(INSIDE.width / width, INSIDE.height / height)
  const left = (width - INSIDE.width / scale) / 2
  const top = (height - INSIDE.height / scale) / 2
  const SAMPLES = 3
  const keys: number[] = []
  for (let y = 0; y < INSIDE.height; y++) {
    for (let x = 0; x < INSIDE.width; x++) {
      const sum = [0, 0, 0]
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const ix = Math.min(width - 1, Math.max(0, Math.floor(left + (x + (sx + 0.5) / SAMPLES) / scale)))
          const iy = Math.min(height - 1, Math.max(0, Math.floor(top + (y + (sy + 0.5) / SAMPLES) / scale)))
          const p = (iy * width + ix) * 4
          const alpha = rgba[p + 3] / 255
          for (let c = 0; c < 3; c++) sum[c] += rgba[p + c] * alpha
        }
      }
      keys.push(levelKey(toLevels(sum.map((v) => v / (SAMPLES * SAMPLES)) as Rgb)))
    }
  }
  return keys
}

const keyOf = (w: number) => levelKey([(w >> 1) & 7, (w >> 5) & 7, (w >> 9) & 7])

// The image made into the picture: scaled to cover the inside of the frame,
// its colours cut to the eight of row 3 that are the picture's own, with the
// ones kept there to use as they are. `now` is the picture as it is, whose
// frame and row 3 are kept.
export function genesisAnnouncerFromImage(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number, now: AnnouncerPicture): AnnouncerImage {
  const row = now.palette
  const inside = covered(rgba, width, height)
  const isInside = (x: number, y: number) => x >= INSIDE.left && x < INSIDE.left + INSIDE.width && y >= INSIDE.top && y < INSIDE.top + INSIDE.height
  const sharedKeys = SHARED.map((i) => keyOf(row[i]))
  const counts = new Map<number, number>()
  for (const key of inside) counts.set(key, (counts.get(key) ?? 0) + 1)
  const rest = new Map([...counts].filter(([key]) => !sharedKeys.includes(key)))
  const chosen = rest.size > OWN.length ? medianCut(rest, OWN.length) : [...rest.keys()]
  const colours = new Array<number>(COLOURS).fill(-1)
  SHARED.forEach((i, n) => (colours[i] = sharedKeys[n]))
  chosen.forEach((key, n) => (colours[OWN[n]] = key))
  const usable = colours.map((k, i) => (k >= 0 && i !== 0 ? i : -1)).filter((i) => i >= 0)
  const indexOf = new Map<number, number>()
  const index = (key: number) => {
    if (!indexOf.has(key)) indexOf.set(key, usable[nearest(key, usable.map((i) => colours[i]))])
    return indexOf.get(key)!
  }
  const known = new Map<string, number>()
  const tiles: Uint8Array[] = []
  const map: number[] = []
  for (let cell = 0; cell < CELLS; cell++) {
    const cx = (cell % ACROSS) * 8
    const cy = Math.floor(cell / ACROSS) * 8
    const tile = new Uint8Array(64)
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const [px, py] = [cx + x, cy + y]
        tile[y * 8 + x] = isInside(px, py)
          ? index(inside[(py - INSIDE.top) * INSIDE.width + px - INSIDE.left])
          : now.picture.pixels[py * ANNOUNCER_WIDTH + px]
      }
    }
    let entry = -1
    for (const [h, v] of [[false, false], [true, false], [false, true], [true, true]] as const) {
      const flippedTile = Array.from({ length: 64 }, (_, i) => tile[(v ? 7 - (i >> 3) : i >> 3) * 8 + (h ? 7 - (i & 7) : i & 7)])
      const found = known.get(flippedTile.join(','))
      if (found !== undefined) {
        entry = (ROW << 13) | (v ? FLIP_V : 0) | (h ? FLIP_H : 0) | found
        break
      }
    }
    if (entry < 0) {
      const packed = new Uint8Array(32)
      for (let i = 0; i < 64; i++) packed[i >> 1] |= i & 1 ? tile[i] : tile[i] << 4
      known.set(tile.join(','), tiles.length)
      entry = (ROW << 13) | tiles.length
      tiles.push(packed)
    }
    map.push(entry)
  }
  const rowWords = row.slice()
  chosen.forEach((key, n) => (rowWords[OWN[n]] = word(keyLevels(key))))
  const kept = new Set(inside.map((key) => colours[index(key)])).size
  return { row: rowWords, map, tiles, colours: counts.size, kept }
}

function imageBytes(made: AnnouncerImage, palette: number[]): Uint8Array {
  const paletteAt = 10 + made.tiles.length * 32
  const mapAt = paletteAt + 128
  const bytes = new Uint8Array(mapAt + 4 + CELLS * 2)
  writeU32(bytes, 0, paletteAt)
  writeU32(bytes, 4, mapAt)
  writeU16(bytes, 8, made.tiles.length)
  made.tiles.forEach((tile, i) => bytes.set(tile, 10 + i * 32))
  palette.forEach((colour, i) => writeU16(bytes, paletteAt + i * 2, ROW * COLOURS <= i && i < (ROW + 1) * COLOURS ? made.row[i - ROW * COLOURS] : colour))
  writeU16(bytes, mapAt, ACROSS)
  writeU16(bytes, mapAt + 2, DOWN)
  made.map.forEach((entry, i) => writeU16(bytes, mapAt + 4 + i * 2, entry))
  return bytes
}

// The project with the announcer's picture `made`: in the room of a picture of
// the league's own already there if it fits, else in free room.
export function withGenesisAnnouncer(project: RomProject, made: AnnouncerImage): RomProject {
  const found = block(project.bytes)
  if (!found) throw new Error("This ROM's matchup screen is not as the original game has it, so its announcer cannot be changed.")
  return withGenesisAnnouncerBytes(project, imageBytes(made, found.palette))
}

const blockLength = (rom: Uint8Array, at: number) => readU32(rom, at + 4) + 4 + CELLS * 2

// The league's own picture as its bytes, for a project file; null for the original's.
export function genesisAnnouncerBytes(project: RomProject): Uint8Array | null {
  const at = header(project.bytes)
  if (at === null || at === originalAt(project.source)) return null
  return project.bytes.slice(at, at + blockLength(project.bytes, at))
}

// The project with the picture given as its bytes.
export function withGenesisAnnouncerBytes(project: RomProject, bytes: Uint8Array): RomProject {
  const old = header(project.bytes)
  if (old === null) throw new Error("This ROM's matchup screen is not as the original game has it, so its announcer cannot be changed.")
  let next: Uint8Array = project.bytes.slice()
  let at: number
  if (old !== originalAt(project.source) && blockLength(next, old) >= bytes.length) at = old
  else {
    const claimed = claimSpace(next, bytes.length)
    if (!claimed) throw new Error('There is no room left in this ROM for the picture.')
    next = claimed.rom
    at = claimed.at
  }
  next.set(bytes, at)
  writeU32(next, POINTER_AT + 2, at)
  return { ...project, bytes: next }
}

// The project with the picture the ROM had when opened back.
export function withOriginalGenesisAnnouncer(project: RomProject): RomProject {
  const at = originalAt(project.source)
  if (at === null || header(project.bytes) === null) throw new Error('The picture this ROM was opened with cannot be found, so it cannot be put back.')
  const next = project.bytes.slice()
  writeU32(next, POINTER_AT + 2, at)
  return { ...project, bytes: next }
}

// ------------------------------------------------------------------- SNES
//
// SNES (Match Viewer's measurements, and abdulahmad/NHL94SNES's
// LoadScoutingScreen): the scouting screen unpacks RonBarrTiles after the
// frame's tiles (tiles 104 on, up to 255 before the text's), RonBarrMap (32
// x 28 words after a 6-byte header) and RonBarrPalette, of which the first 16
// colours go to colour row 2, which nothing else on the screen uses; colour 0
// is see-through. The map's empty words keep the screen's frame; each other
// word is a tile number counted from the first tile (0 is blank) with the row
// and the tile base added. Ron Barr is drawn at his desk in the bottom right.
// Nothing else is ever in columns 23 to 31 of rows 12 to 27, so a new picture
// fills that rectangle, 72 x 128 pixels, and leaves the rest of the map empty.
// It is packed as the original is, put in free space, and the three loaders
// repointed; the original stays where it is.

export const SNES_ANNOUNCER_WIDTH = 72
export const SNES_ANNOUNCER_HEIGHT = 128
// What the editor shows: the bottom right, where the original is.
const S_VIEW = { col: 6, row: 12, across: 26, down: 16 }
const S_RECT = { col: 23, row: 12, across: 9, down: 16 }
const S_ACROSS = 32
const S_DOWN = 28
const S_HEADER = 6
const S_MOST_TILES = 152
const S_COLOURS = 16
const S_TILE = 32
export const SNES_ANNOUNCER_VIEW = { width: S_VIEW.across * 8, height: S_VIEW.down * 8, left: (S_RECT.col - S_VIEW.col) * 8 }

const S_TILES = 'a9(..)0085..a9(....)85..a9..0085..a9....85..22......a9..0085..a9....85..a0ffff22'
const S_MAP = 'a9(..)0085..a9(....)85..a9..0085..a9....85..22......8a38e90800'
const S_PALETTE = 'a9(..)0085..a9(....)85..a9..0085..a9....85..22......a9..0085..a9....85..a02000a2100022'
// lda HomeTeam; cmp #special; bcs: only the scouting screen's tiles are followed by it before the map.
const S_SPECIAL = [0xad, -1, -1, 0xc9, -1, 0x00, 0xb0]

interface Loader {
  at: number
  offset: number
}

function snesLoaders(rom: Uint8Array): { tiles: Loader; map: Loader; palette: Loader } | null {
  const of = (match: { at: number; groups: number[] }): Loader => ({ at: match.at, offset: match.groups[1] >= 0x8000 ? loRomOffset(match.groups[0], match.groups[1]) : -1 })
  const maps = findCodeAll(rom, S_MAP)
  const palettes = findCodeAll(rom, S_PALETTE)
  const special = (from: number, to: number) => {
    for (let at = from; at + S_SPECIAL.length <= to; at++) if (S_SPECIAL.every((b, i) => b < 0 || rom[at + i] === b)) return true
    return false
  }
  for (const tiles of findCodeAll(rom, S_TILES)) {
    const map = maps.find((m) => m.at > tiles.at && m.at - tiles.at < 0x80 && special(tiles.at, m.at))
    const palette = map && palettes.find((p) => p.at > map.at && p.at - map.at < 0x100)
    if (map && palette) {
      const found = { tiles: of(tiles), map: of(map), palette: of(palette) }
      return Object.values(found).every((l) => l.offset >= 0 && l.offset < rom.length) ? found : null
    }
  }
  return null
}

const unpackAny = (rom: Uint8Array, at: number) => (isHuffman(rom, at) ? unpackHuffman(rom, at) : unpackLz(rom, at))

interface SnesParts {
  tiles: Uint8Array
  map: Uint8Array
  palette: Uint8Array
}

function snesParts(rom: Uint8Array): SnesParts | null {
  const loaders = snesLoaders(rom)
  if (!loaders) return null
  try {
    const [tiles, map, palette] = [loaders.tiles, loaders.map, loaders.palette].map((l) => unpackAny(rom, l.offset).data)
    if (map.length < S_HEADER + S_ACROSS * S_DOWN * 2 || readU16LE(map, 0) !== S_ACROSS || readU16LE(map, 2) !== S_DOWN || palette.length < S_COLOURS * 2) return null
    return { tiles, map, palette }
  } catch (e) {
    if (e instanceof HuffmanError || e instanceof LzError) return null
    throw e
  }
}

const snesPixel = (tiles: Uint8Array, tile: number, x: number, y: number) => {
  const at = tile * S_TILE
  const bit = 7 - x
  return (
    ((tiles[at + y * 2] >> bit) & 1) |
    (((tiles[at + y * 2 + 1] >> bit) & 1) << 1) |
    (((tiles[at + 16 + y * 2] >> bit) & 1) << 2) |
    (((tiles[at + 16 + y * 2 + 1] >> bit) & 1) << 3)
  )
}

const snesTile = (pixels: number[]): Uint8Array => {
  const out = new Uint8Array(S_TILE)
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const c = pixels[y * 8 + x]
      const bit = 1 << (7 - x)
      if (c & 1) out[y * 2] |= bit
      if (c & 2) out[y * 2 + 1] |= bit
      if (c & 4) out[16 + y * 2] |= bit
      if (c & 8) out[16 + y * 2 + 1] |= bit
    }
  }
  return out
}

const sourceLoaders = new WeakMap<Uint8Array, ReturnType<typeof snesLoaders>>()
function openedLoaders(source: Uint8Array): ReturnType<typeof snesLoaders> {
  if (!sourceLoaders.has(source)) {
    // An SNES file may start with a copier header.
    const rom = source.length % 0x8000 === 0x200 ? source.subarray(0x200) : source
    sourceLoaders.set(source, snesLoaders(rom))
  }
  return sourceLoaders.get(source)!
}

export function snesAnnouncerSupported(project: RomProject): boolean {
  return project.game.platform === 'snes' && snesParts(project.bytes) !== null
}

// The bottom right of the scouting screen as the picture draws it (colour
// numbers of row 2, 0 where the screen's frame shows), with row 2's colours.
export function snesAnnouncer(project: RomProject): AnnouncerPicture | null {
  if (project.game.platform !== 'snes') return null
  const parts = snesParts(project.bytes)
  const loaders = snesLoaders(project.bytes)
  if (!parts || !loaders) return null
  const { width, height } = SNES_ANNOUNCER_VIEW
  const picture: Picture = { width, height, pixels: new Uint8Array(width * height) }
  const tileCount = parts.tiles.length / S_TILE
  for (let row = 0; row < S_VIEW.down; row++) {
    for (let col = 0; col < S_VIEW.across; col++) {
      const entry = readU16LE(parts.map, S_HEADER + ((S_VIEW.row + row) * S_ACROSS + S_VIEW.col + col) * 2)
      const tile = entry & 0x3ff
      if (entry === 0 || tile >= tileCount) continue
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          picture.pixels[(row * 8 + y) * width + col * 8 + x] = snesPixel(parts.tiles, tile, entry & 0x4000 ? 7 - x : x, entry & 0x8000 ? 7 - y : y)
        }
      }
    }
  }
  const opened = openedLoaders(project.source)
  return {
    picture,
    palette: Array.from({ length: S_COLOURS }, (_, i) => readU16LE(parts.palette, i * 2)),
    original: opened !== null && opened.tiles.offset === loaders.tiles.offset && opened.map.offset === loaders.map.offset && opened.palette.offset === loaders.palette.offset,
    tiles: tileCount,
  }
}

const snesLevels = (w: number) => [w & 31, (w >> 5) & 31, (w >> 10) & 31]

// Up to `most` colours standing for the given ones, by median cut, in the SNES's levels.
function cut(counts: Map<number, number>, most: number): number[] {
  let boxes: number[][] = [[...counts.keys()]]
  while (boxes.length < most) {
    let pick = -1
    let span = 0
    let channel = 0
    boxes.forEach((box, i) => {
      if (box.length < 2) return
      for (let c = 0; c < 3; c++) {
        const values = box.map((w) => snesLevels(w)[c])
        const s = Math.max(...values) - Math.min(...values)
        if (s > span) [pick, span, channel] = [i, s, c]
      }
    })
    if (pick < 0) break
    const box = boxes[pick].slice().sort((a, b) => snesLevels(a)[channel] - snesLevels(b)[channel])
    const total = box.reduce((sum, w) => sum + counts.get(w)!, 0)
    let half = 0
    let split = 1
    for (; split < box.length - 1; split++) {
      half += counts.get(box[split - 1])!
      if (half >= total / 2) break
    }
    boxes = [...boxes.slice(0, pick), box.slice(0, split), box.slice(split), ...boxes.slice(pick + 1)]
  }
  return boxes.map((box) => {
    const weight = box.reduce((sum, w) => sum + counts.get(w)!, 0)
    const avg = [0, 1, 2].map((c) => Math.round(box.reduce((sum, w) => sum + snesLevels(w)[c] * counts.get(w)!, 0) / weight))
    return avg[0] | (avg[1] << 5) | (avg[2] << 10)
  })
}

export interface SnesAnnouncerImage {
  palette: number[]
  // The 9 x 16 cells' map words (tile numbers from 1, and flips) and the tiles they name, tile 0 blank first.
  words: number[]
  tiles: Uint8Array[]
  colours: number
  kept: number
}

// The image made into the picture: scaled to cover 72 x 128, centred and
// cropped, its colours cut to the 15 of row 2 (colour 0 being see-through).
export function snesAnnouncerFromImage(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): SnesAnnouncerImage {
  const scale = Math.max(SNES_ANNOUNCER_WIDTH / width, SNES_ANNOUNCER_HEIGHT / height)
  const left = (width - SNES_ANNOUNCER_WIDTH / scale) / 2
  const top = (height - SNES_ANNOUNCER_HEIGHT / scale) / 2
  const SAMPLES = 3
  const colours: number[] = []
  for (let y = 0; y < SNES_ANNOUNCER_HEIGHT; y++) {
    for (let x = 0; x < SNES_ANNOUNCER_WIDTH; x++) {
      const sum = [0, 0, 0]
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const ix = Math.min(width - 1, Math.max(0, Math.floor(left + (x + (sx + 0.5) / SAMPLES) / scale)))
          const iy = Math.min(height - 1, Math.max(0, Math.floor(top + (y + (sy + 0.5) / SAMPLES) / scale)))
          const p = (iy * width + ix) * 4
          for (let c = 0; c < 3; c++) sum[c] += rgba[p + c] * (rgba[p + 3] / 255)
        }
      }
      const [r, g, b] = sum.map((v) => Math.round((v / (SAMPLES * SAMPLES) / 255) * 31))
      colours.push(r | (g << 5) | (b << 10))
    }
  }
  const counts = new Map<number, number>()
  for (const w of colours) counts.set(w, (counts.get(w) ?? 0) + 1)
  const chosen = counts.size > S_COLOURS - 1 ? cut(counts, S_COLOURS - 1) : [...counts.keys()]
  const nearestOf = new Map<number, number>()
  const index = (w: number) => {
    if (!nearestOf.has(w)) {
      const [r, g, b] = snesLevels(w)
      let best = 0
      let bestD = Infinity
      chosen.forEach((c, i) => {
        const [cr, cg, cb] = snesLevels(c)
        const d = (cr - r) ** 2 + (cg - g) ** 2 + (cb - b) ** 2
        if (d < bestD) [best, bestD] = [i, d]
      })
      nearestOf.set(w, best + 1)
    }
    return nearestOf.get(w)!
  }
  const known = new Map<string, number>()
  const tiles: Uint8Array[] = [new Uint8Array(S_TILE)]
  const words: number[] = []
  for (let cell = 0; cell < S_RECT.across * S_RECT.down; cell++) {
    const cx = (cell % S_RECT.across) * 8
    const cy = Math.floor(cell / S_RECT.across) * 8
    const pixels = Array.from({ length: 64 }, (_, i) => index(colours[(cy + (i >> 3)) * SNES_ANNOUNCER_WIDTH + cx + (i & 7)]))
    let entry = -1
    for (const [h, v] of [[false, false], [true, false], [false, true], [true, true]] as const) {
      const flipped = pixels.map((_, i) => pixels[(v ? 7 - (i >> 3) : i >> 3) * 8 + (h ? 7 - (i & 7) : i & 7)])
      const found = known.get(flipped.join(','))
      if (found !== undefined) {
        entry = (v ? 0x8000 : 0) | (h ? 0x4000 : 0) | found
        break
      }
    }
    if (entry < 0) {
      known.set(pixels.join(','), tiles.length)
      entry = tiles.length
      tiles.push(snesTile(pixels))
    }
    words.push(entry)
  }
  const palette = [0, ...chosen]
  while (palette.length < S_COLOURS) palette.push(0)
  return { palette, words, tiles, colours: counts.size, kept: new Set(colours.map(index)).size }
}

// The project with the scouting screen's picture `made`.
export function withSnesAnnouncer(project: RomProject, made: SnesAnnouncerImage): RomProject {
  const parts = snesParts(project.bytes)
  if (!parts) throw new Error("This ROM's scouting screen is not as the original game has it, so its announcer cannot be changed.")
  if (made.tiles.length > S_MOST_TILES) throw new Error(`The picture has ${made.tiles.length} squares; the screen has room for ${S_MOST_TILES}.`)
  const map = parts.map.slice()
  map.fill(0, S_HEADER, S_HEADER + S_ACROSS * S_DOWN * 2)
  made.words.forEach((entry, cell) => {
    const at = ((S_RECT.row + Math.floor(cell / S_RECT.across)) * S_ACROSS + S_RECT.col + (cell % S_RECT.across)) * 2
    writeU16LE(map, S_HEADER + at, entry)
  })
  const palette = parts.palette.slice()
  made.palette.forEach((w, i) => {
    if (i > 0) writeU16LE(palette, i * 2, w)
  })
  const tiles = new Uint8Array(made.tiles.length * S_TILE)
  made.tiles.forEach((tile, i) => tiles.set(tile, i * S_TILE))
  return withSnesAnnouncerParts(project, { tiles, map, palette })
}

// The parts packed as the ROM packs them, in free space, and the loaders pointed at them.
function withSnesAnnouncerParts(project: RomProject, parts: SnesParts): RomProject {
  const loaders = snesLoaders(project.bytes)
  if (!loaders) throw new Error("This ROM's scouting screen is not as the original game has it, so its announcer cannot be changed.")
  const rom = project.bytes.slice()
  const pieces: [Loader, Uint8Array][] = [
    [loaders.tiles, parts.tiles],
    [loaders.map, parts.map],
    [loaders.palette, parts.palette],
  ]
  for (const [loader, data] of pieces) {
    const packed = isHuffman(rom, loader.offset) ? packHuffman(data) : packLz(data)
    const at = freeSpace(rom, packed.length, keptBanks(rom))
    if (at < 0 || !sameBank(at, packed.length)) throw new Error('There is no room left in this ROM for the picture.')
    rom.set(packed, at)
    rom[loader.at + 1] = loRomBank(at, rom[loader.at + 1])
    writeU16LE(rom, loader.at + 6, loRomAddress(at))
  }
  return { ...project, bytes: rom }
}

// The league's own picture as its three unpacked parts, for a project file; null for the original's.
export function snesAnnouncerBytes(project: RomProject): Uint8Array | null {
  const shown = snesAnnouncer(project)
  const parts = snesParts(project.bytes)
  if (!shown || shown.original || !parts) return null
  const out = new Uint8Array(6 + parts.tiles.length + parts.map.length + parts.palette.length)
  writeU16LE(out, 0, parts.tiles.length)
  writeU16LE(out, 2, parts.map.length)
  writeU16LE(out, 4, parts.palette.length)
  out.set(parts.tiles, 6)
  out.set(parts.map, 6 + parts.tiles.length)
  out.set(parts.palette, 6 + parts.tiles.length + parts.map.length)
  return out
}

export function withSnesAnnouncerBytes(project: RomProject, bytes: Uint8Array): RomProject {
  const [t, m, p] = [readU16LE(bytes, 0), readU16LE(bytes, 2), readU16LE(bytes, 4)]
  if (6 + t + m + p !== bytes.length || t > S_MOST_TILES * S_TILE) throw new Error('The saved announcer picture cannot be read.')
  return withSnesAnnouncerParts(project, { tiles: bytes.slice(6, 6 + t), map: bytes.slice(6 + t, 6 + t + m), palette: bytes.slice(6 + t + m) })
}

// The project with the picture the ROM was opened with back: its loaders pointed where they were.
export function withOriginalSnesAnnouncer(project: RomProject): RomProject {
  const opened = openedLoaders(project.source)
  const loaders = snesLoaders(project.bytes)
  if (!opened || !loaders) throw new Error('The picture this ROM was opened with cannot be found, so it cannot be put back.')
  const rom = project.bytes.slice()
  const pairs: [Loader, Loader][] = [
    [loaders.tiles, opened.tiles],
    [loaders.map, opened.map],
    [loaders.palette, opened.palette],
  ]
  for (const [now, was] of pairs) {
    rom[now.at + 1] = loRomBank(was.offset, rom[now.at + 1])
    writeU16LE(rom, now.at + 6, loRomAddress(was.offset))
  }
  return { ...project, bytes: rom }
}
