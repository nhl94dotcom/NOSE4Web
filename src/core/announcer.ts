import { readU16, readU32, writeU16, writeU32 } from './bytes'
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
