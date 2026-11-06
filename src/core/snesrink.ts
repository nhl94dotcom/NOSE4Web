import { readU16LE, writeU16LE } from './bytes'
import type { Picture } from './graphics'
import { isLz, LzError, unpackLz } from './lz'
import { findCode, loRomOffset } from './snes'

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
  if (centreIce) {
    const [logoWidth, logoHeight] = [centreIce.width / 8, centreIce.height / 8]
    const start = (LOGO_PLACE - MAP_HEADER - logoWidth - (logoHeight >= 6 ? MAP_ROW_BYTES : 0)) >> 1
    const [left, top] = [(start % rink.width) * 8, Math.floor(start / rink.width) * 8]
    for (let y = 0; y < centreIce.height && top + y < picture.height; y++) {
      for (let x = 0; x < centreIce.width && left + x < width; x++) {
        picture.pixels[(top + y) * width + left + x] = centreIce.pixels[y * centreIce.width + x]
      }
    }
  }
  return picture
}
