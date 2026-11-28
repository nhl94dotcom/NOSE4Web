import { readU16LE, writeU16LE } from './bytes'
import { colorRgb, SNES_COLORS } from './color'
import type { Picture } from './graphics'
import { isLz, LzError, packLz, unpackLz } from './lz'
import { findCode, grownSnesRom, loRomAddress, loRomBank, loRomOffset, SNES_GROWN_SIZE } from './snes'
import { freeSpace, keptBanks, sameBank } from './snespictures'

// The SNES game's rink: 128 colours (background palettes 0 to 7), copied by
// setupice from RinkPalette, the rink's tiles (IceRinkTiles) and its map
// (IceRinkMap, 48 by 113 tiles), both packed as EA LZ. BuildRinkMap pastes
// the home team's centre ice logo into the middle of the map. All are found
// by the code that loads them.

export const RINK_COLOURS = 128
const COLOURS = 16
const TILE = 32
const MAP_HEADER = 6
const TILE_NUMBER = 0x03ff
const PALETTE_BITS = 0x1c00
const PALETTE_SHIFT = 10
const FLIP_H = 0x4000
const FLIP_V = 0x8000
// Where in the unpacked map (its header words included) BuildRinkMap puts a
// logo of width 0, as a byte offset.
const LOGO_PLACE = 0x10b6
const MAP_ROW_BYTES = 0x60

// setupice: copy RinkPalette (ldx #$FE; lda.l RinkPalette,x; sta.l ...), then unpack IceRinkTiles.
const RINK_LOADER =
  'a2fe00bf(....)(..)9f......9f......caca10f022......ad....d0fb22......a9(..)00850ea9(....)850ca97f008512a90000851022'
// BuildRinkMap: unpack IceRinkMap into rinkmapbuf ($7F:C800).
const MAP_LOADER = 'a9(..)00850ea9(....)850ca97f008512a900c8851022'

interface RinkPlaces {
  palette: number
  tiles: number
  map: number
}

function places(rom: Uint8Array): RinkPlaces | null {
  const loader = findCode(rom, RINK_LOADER)
  const map = findCode(rom, MAP_LOADER)
  if (!loader || !map) return null
  const [paletteAddress, paletteBank, tilesBank, tilesAddress] = loader.groups
  const found = {
    palette: loRomOffset(paletteBank, paletteAddress),
    tiles: loRomOffset(tilesBank, tilesAddress),
    map: loRomOffset(map.groups[0], map.groups[1]),
  }
  if (found.palette + RINK_COLOURS * 2 > rom.length || !isLz(rom, found.tiles) || !isLz(rom, found.map)) return null
  return found
}

// The rink's 128 colours, or none where they are not found.
export function readSnesRinkPalette(rom: Uint8Array): number[] {
  const at = places(rom)
  return at ? Array.from({ length: RINK_COLOURS }, (_, i) => readU16LE(rom, at.palette + i * 2)) : []
}

export function writeSnesRinkPalette(rom: Uint8Array, palette: number[]): void {
  const at = places(rom)
  if (!at || palette.length !== RINK_COLOURS) return
  palette.forEach((word, i) => writeU16LE(rom, at.palette + i * 2, word))
}

interface Rink {
  tiles: Uint8Array
  width: number
  height: number
  words: number[]
}

const rinks = new WeakMap<Uint8Array, Rink | null>()

function readRink(rom: Uint8Array): Rink | null {
  if (rinks.has(rom)) return rinks.get(rom)!
  let rink: Rink | null = null
  const at = places(rom)
  try {
    if (at) {
      const tiles = unpackLz(rom, at.tiles).data
      const map = unpackLz(rom, at.map).data
      const [width, height] = [readU16LE(map, 0), readU16LE(map, 2)]
      if (width > 0 && height > 0 && MAP_HEADER + width * height * 2 <= map.length) {
        const words = Array.from({ length: width * height }, (_, i) => readU16LE(map, MAP_HEADER + i * 2))
        rink = { tiles, width, height, words }
      }
    }
  } catch (e) {
    if (!(e instanceof LzError)) throw e
  }
  rinks.set(rom, rink)
  return rink
}

// The palette rows the rink's map draws in.
export function snesRinkRowsUsed(rom: Uint8Array): number[] {
  const rink = readRink(rom)
  if (!rink) return []
  return [...new Set(rink.words.map((word) => (word & PALETTE_BITS) >> PALETTE_SHIFT))].sort((a, b) => a - b)
}

// SNES 4 bits a pixel tiles: two planes interleaved by row, then the other two.
function tilePixel(tiles: Uint8Array, tile: number, x: number, y: number): number {
  const bit = 7 - x
  const low = tile + y * 2
  const high = tile + 16 + y * 2
  return ((tiles[low] >> bit) & 1) | (((tiles[low + 1] >> bit) & 1) << 1) | (((tiles[high] >> bit) & 1) << 2) | (((tiles[high + 1] >> bit) & 1) << 3)
}

// The whole rink as the game draws it, each pixel the number of its colour in
// the 128 (0 where the screen's backdrop, colour 0, shows), with a centre ice
// logo, given as the editor holds them, pasted in as BuildRinkMap does: the
// logo's map takes the place of the rink's there, its blank tiles too.
export function drawSnesRink(rom: Uint8Array, centreIce: Picture | null): Picture | null {
  const rink = readRink(rom)
  if (!rink) return null
  const width = rink.width * 8
  const picture: Picture = { width, height: rink.height * 8, pixels: new Uint8Array(width * rink.height * 8) }
  rink.words.forEach((word, cell) => {
    const tile = (word & TILE_NUMBER) * TILE
    if (tile + TILE > rink.tiles.length) return
    const row = (word & PALETTE_BITS) >> PALETTE_SHIFT
    const [cx, cy] = [(cell % rink.width) * 8, Math.floor(cell / rink.width) * 8]
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const colour = tilePixel(rink.tiles, tile, word & FLIP_H ? 7 - x : x, word & FLIP_V ? 7 - y : y)
        picture.pixels[(cy + y) * width + cx + x] = colour ? row * COLOURS + colour : 0
      }
    }
  })
  return centreIce ? withSnesCentreIce(picture, centreIce) : picture
}

// Where on the rink a centre ice logo goes, in pixels from its top left.
export function snesCentreIcePlace(rink: Picture, centreIce: Picture): { left: number; top: number } {
  const [logoWidth, logoHeight] = [centreIce.width / 8, centreIce.height / 8]
  const start = (LOGO_PLACE - MAP_HEADER - logoWidth - (logoHeight >= 6 ? MAP_ROW_BYTES : 0)) >> 1
  return { left: (start % (rink.width / 8)) * 8, top: Math.floor(start / (rink.width / 8)) * 8 }
}

// The rink drawn by drawSnesRink, with a centre ice logo pasted in. Quicker
// than drawing it afresh, for a logo that changes as it is drawn.
export function withSnesCentreIce(rink: Picture, centreIce: Picture): Picture {
  const { width } = rink
  const picture = { ...rink, pixels: rink.pixels.slice() }
  const { left, top } = snesCentreIcePlace(rink, centreIce)
  for (let y = 0; y < centreIce.height && top + y < picture.height; y++) {
    for (let x = 0; x < centreIce.width && left + x < width; x++) {
      picture.pixels[(top + y) * width + left + x] = centreIce.pixels[y * centreIce.width + x]
    }
  }
  return picture
}

// ------------------------------------------------------------- import
// An edited rink picture (as drawSnesRink draws it without a centre ice logo, 384 pixels wide; the 680 rows the game
// shows in play, or all 904) put back into IceRinkTiles and IceRinkMap (Match Viewer's measurements, 2026-11-27, on
// retail and the 32-team build alike):
// - the rows below the rink (85-112) are the pause scoreboard's rink (SetHor_rink shows their columns 0-31): a
//   picture of all 904 rows may change them, ads on its boards and glass; the replay icon there (rows 85-92, columns
//   32-39, tiles 435-530, which must stay at 256 or above) is kept, and with a picture of only the 680 rows in play,
//   all of them (Match Viewer, 2026-11-27);
// - kept as they are: the centre ice logo's cells (BuildRinkMap pastes it at rows 44-47, columns 20-27, or
//   on the 32-team build 6 x 6 at rows 43-48, columns 21-26: both kept), the crowd's animation tiles 1 to 65
//   (showcrowd rewrites them in play) and every cell that shows one, and tile 0;
// - each cell keeps its palette row (the rink's, or the teams' on the benches), its priority and its place;
// - the tiles may grow by up to 85: Match Viewer measured room for 95 more below the sprites with the largest logo on
//   the 32-team build (102 on retail), but 95 would end exactly at $5FFF there, so 10 are kept spare (and 68 more were
//   tested in the game, 27 tiles still free at the tightest moment);
// - a square that repeats another, turned or not, takes no tile of its own.
// Both are packed as the ROM packs them (EA LZ) into free space (the ROM grown to 2 MB where it has none left) and
// every loader of each (lda #bank / sta / lda #address / sta: setupice's and the reload's for the tiles,
// BuildRinkMap's for the map) pointed there.

export class SnesRinkImportError extends Error {}

export interface SnesRinkImport {
  rom: Uint8Array
  used: number
  room: number
}

const SHOWN_ROWS = 85
const MORE_TILES = 85
const CROWD_TILES = 65
const LOGO_CELLS = { rows: [43, 48], cols: [20, 27] }
const REPLAY_ICON = { rows: [85, 92], cols: [32, 39] }

function tileBytes(pixels: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(TILE)
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

// Every lda #bank / sta $0E / lda #address / sta $0C of the part at `offset`.
function loadersOf(rom: Uint8Array, offset: number): number[] {
  const [bank, address] = [loRomBank(offset, 0x80), loRomAddress(offset)]
  const pattern = [0xa9, bank, 0x00, 0x85, 0x0e, 0xa9, address & 0xff, address >> 8, 0x85, 0x0c]
  const found: number[] = []
  for (let at = rom.indexOf(0xa9); at >= 0 && at + pattern.length <= rom.length; at = rom.indexOf(0xa9, at + 1)) {
    if (pattern.every((byte, i) => rom[at + i] === byte)) found.push(at)
  }
  return found
}

export function snesRinkImportable(rom: Uint8Array): boolean {
  const rink = readRink(rom)
  return rink !== null && rink.width === 48 && rink.height >= SHOWN_ROWS
}

export function importSnesRink(rom0: Uint8Array, image: { rgba: Uint8Array | Uint8ClampedArray; width: number; height: number }, palette: number[]): SnesRinkImport {
  const at = places(rom0)
  const rink = readRink(rom0)
  if (!at || !rink || rink.width !== 48 || rink.height < SHOWN_ROWS) throw new SnesRinkImportError("This ROM's rink is not laid out as the original game's, so a picture cannot be put in.")
  const [fullHeight, shown] = [rink.height * 8, SHOWN_ROWS * 8]
  if (image.width !== rink.width * 8 || (image.height !== fullHeight && image.height !== shown)) {
    throw new SnesRinkImportError(`The picture must be ${rink.width * 8} pixels wide and ${shown} or ${fullHeight} tall, as Export as PNG saves it; this one is ${image.width} by ${image.height}.`)
  }
  const count = rink.tiles.length / TILE
  const rows = image.height / 8
  const kept = (cell: number) => {
    const [col, row] = [cell % rink.width, Math.floor(cell / rink.width)]
    const tile = rink.words[cell] & TILE_NUMBER
    return row >= rows || (row >= REPLAY_ICON.rows[0] && row <= REPLAY_ICON.rows[1] && col >= REPLAY_ICON.cols[0] && col <= REPLAY_ICON.cols[1]) || (row >= LOGO_CELLS.rows[0] && row <= LOGO_CELLS.rows[1] && col >= LOGO_CELLS.cols[0] && col <= LOGO_CELLS.cols[1]) || tile <= CROWD_TILES
  }
  const pinned = new Set<number>(Array.from({ length: CROWD_TILES + 1 }, (_, t) => t))
  rink.words.forEach((word, cell) => {
    if (kept(cell)) pinned.add(word & TILE_NUMBER)
  })
  const free = [...Array.from({ length: count }, (_, t) => t).filter((t) => !pinned.has(t)), ...Array.from({ length: MORE_TILES }, (_, k) => count + k)]

  const pixelsOf = (tiles: Uint8Array, tile: number, flip: number) =>
    Array.from({ length: 64 }, (_, i) => tilePixel(tiles, tile * TILE, flip & FLIP_H ? 7 - (i & 7) : i & 7, flip & FLIP_V ? 7 - (i >> 3) : i >> 3))
  const FLIPS = [0, FLIP_H, FLIP_V, FLIP_H | FLIP_V]
  const known = new Map<string, { tile: number; flip: number }>()
  const remember = (tile: number, tiles: Uint8Array) => {
    for (const flip of FLIPS) {
      const key = pixelsOf(tiles, tile, flip).join(',')
      if (!known.has(key)) known.set(key, { tile, flip })
    }
  }
  for (const t of pinned) if (t < count) remember(t, rink.tiles)

  // Each cell's square from the picture: each pixel to the nearest of its row's colours, or the backdrop (colour 0); a
  // tie keeps what was there.
  const rgb = palette.map((word) => colorRgb(word, SNES_COLORS))
  const original = drawSnesRink(rom0, null)!
  const squares = new Map<number, number[]>()
  for (let cell = 0; cell < rink.words.length; cell++) {
    if (kept(cell)) continue
    const row = (rink.words[cell] & PALETTE_BITS) >> PALETTE_SHIFT
    const [cx, cy] = [(cell % rink.width) * 8, Math.floor(cell / rink.width) * 8]
    squares.set(
      cell,
      Array.from({ length: 64 }, (_, i) => {
        const p = (cy + (i >> 3)) * image.width + cx + (i & 7)
        if (image.rgba[p * 4 + 3] < 128) return 0
        const [r, g, b] = [image.rgba[p * 4], image.rgba[p * 4 + 1], image.rgba[p * 4 + 2]]
        const was = original.pixels[p]
        let best = 0
        let bestD = (rgb[0][0] - r) ** 2 + (rgb[0][1] - g) ** 2 + (rgb[0][2] - b) ** 2
        for (let c = 1; c < 16; c++) {
          const [cr, cg, cb] = rgb[row * COLOURS + c] ?? [0, 0, 0]
          const d = (cr - r) ** 2 + (cg - g) ** 2 + (cb - b) ** 2
          if (d < bestD || (d === bestD && row * COLOURS + c === was)) [best, bestD] = [c, d]
        }
        return best
      }),
    )
  }
  // New squares, once each however turned, into the free tiles.
  const turnings = (pixels: number[]) => FLIPS.map((flip) => pixels.map((_, i) => pixels[(flip & FLIP_V ? 7 - (i >> 3) : i >> 3) * 8 + (flip & FLIP_H ? 7 - (i & 7) : i & 7)]).join(','))
  const fresh: number[][] = []
  const freshKeys = new Set<string>()
  for (const pixels of squares.values()) {
    const keys = turnings(pixels)
    if (known.has(keys[0]) || freshKeys.has(keys[0])) continue
    fresh.push(pixels)
    for (const key of keys) freshKeys.add(key)
  }
  if (fresh.length > free.length) {
    throw new SnesRinkImportError(
      `This picture needs ${fresh.length} different squares of 8 by 8 pixels and the rink has room for ${free.length}. A square that repeats another exactly, or another turned round, costs nothing: draw on a grid of 8 by 8 pixels from the top left corner, and copy whole squares where a pattern repeats.`,
    )
  }
  const last = fresh.length ? free[fresh.length - 1] : 0
  const tiles = new Uint8Array(Math.max(count, last + 1) * TILE)
  tiles.set(rink.tiles)
  fresh.forEach((pixels, k) => {
    tiles.set(tileBytes(pixels), free[k] * TILE)
    remember(free[k], tiles)
  })
  const map = unpackLz(rom0, at.map).data.slice()
  for (const [cell, pixels] of squares) {
    const place = known.get(pixels.join(','))!
    writeU16LE(map, MAP_HEADER + cell * 2, (rink.words[cell] & (PALETTE_BITS | 0x2000)) | place.flip | place.tile)
  }

  // Packed, put in free space, and every loader pointed there.
  let rom: Uint8Array = rom0.slice()
  for (const [part, data] of [
    [at.tiles, tiles],
    [at.map, map],
  ] as const) {
    const loaders = loadersOf(rom0, part)
    if (loaders.length === 0) throw new SnesRinkImportError("This ROM's rink is not loaded as the original game's, so a picture cannot be put in.")
    const packed = packLz(data)
    const kept2 = keptBanks(rom)
    let to = freeSpace(rom, packed.length, kept2)
    if ((to < 0 || !sameBank(to, packed.length)) && rom.length < SNES_GROWN_SIZE) {
      rom = grownSnesRom(rom)
      to = freeSpace(rom, packed.length, kept2)
    }
    if (to < 0 || !sameBank(to, packed.length)) throw new SnesRinkImportError('There is no room left in this ROM for the rink.')
    rom.set(packed, to)
    for (const loader of loaders) {
      rom[loader + 1] = loRomBank(to, rom[loader + 1])
      writeU16LE(rom, loader + 6, loRomAddress(to))
    }
  }
  return { rom, used: fresh.length, room: free.length }
}
