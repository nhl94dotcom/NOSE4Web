import { readU16, readU32 } from './bytes'
import type { Picture } from './graphics'

// The ice rink of NHL 94 on the Genesis (graphics94.asm's Rinktilelist, IceRink94.map.jim): the whole rink the game
// scrolls over, boards, benches, penalty boxes and ice markings. Its header: a long, the palette's offset from it (two
// lines of 16 colours, the game's palettes 0 and 1: setupIceRinkPal), a long, the map's; then the tile count word (plain
// tiles, bit 15 clear) and the tiles, 32 bytes each; the palette; the map: a word of columns (48), one of rows (113),
// then a word a cell as the video chip has them (bit 15 priority, 13-14 palette line, 12 flipped up and down, 11 left
// and right, the low 11 the tile). updatescroll copies its rows to the screen as the rink scrolls.
//
// Palette lines 2 and 3 are the teams' at play (the home team's and the visitors'): the players on the benches are
// drawn in them (Match Viewer's bench map, 2026-11-20).
//
// Found from setupIceRinkPal: movea.l #Rinktilelist,a0; adda.l (a0),a0; moveq #$F,d0.

const SETUP_PAL = [0x20, 0x7c, -1, -1, -1, -1, 0xd1, 0xd0, 0x70, 0x0f]
const TILE = 32
export const GENESIS_RINK_COLOURS = 64

export interface GenesisRink {
  // Where Rinktilelist is, and its parts.
  at: number
  tilesAt: number
  tileCount: number
  paletteAt: number
  mapAt: number
  width: number
  height: number
  // The map's words, a row after another.
  words: number[]
  // The two lines of the rink's own palette (Genesis colour words).
  palette: number[]
}

export function findGenesisRink(rom: Uint8Array): number | null {
  let found: number | null = null
  for (let at = rom.indexOf(0x20); at >= 0 && at + SETUP_PAL.length <= rom.length; at = rom.indexOf(0x20, at + 1)) {
    if (at & 1 || !SETUP_PAL.every((byte, i) => byte < 0 || rom[at + i] === byte)) continue
    if (found !== null) return null
    found = readU32(rom, at + 2)
  }
  return found
}

export function readGenesisRink(rom: Uint8Array): GenesisRink | null {
  const at = findGenesisRink(rom)
  if (at === null || at + 10 > rom.length) return null
  const paletteAt = at + readU32(rom, at)
  const mapAt = at + readU32(rom, at + 4)
  const count = readU16(rom, at + 8)
  // Plain tiles only (the original game's and the league ROMs').
  if (count & 0x8000) return null
  const tilesAt = at + 10
  // The game sends the tiles from where they start, as many as the count says, even past the palette (CDL Season 12
  // counts 456, its last two read from the palette's bytes on).
  if (tilesAt + count * TILE > rom.length || paletteAt + 64 > mapAt || mapAt + 4 > rom.length) return null
  const width = readU16(rom, mapAt)
  const height = readU16(rom, mapAt + 2)
  if (width === 0 || height === 0 || mapAt + 4 + width * height * 2 > rom.length) return null
  const words = Array.from({ length: width * height }, (_, i) => readU16(rom, mapAt + 4 + i * 2))
  if (words.some((word) => (word & 0x7ff) >= count)) return null
  const palette = Array.from({ length: 32 }, (_, i) => readU16(rom, paletteAt + i * 2))
  return { at, tilesAt, tileCount: count, paletteAt, mapAt, width, height, words, palette }
}

// The whole rink as the game draws it, each pixel the number of its colour in the four palette lines (0 where the
// screen's backdrop shows), and the 64 colours: the rink's two lines, then the two teams' (`home` and `away`, 16
// each; grey where not given).
export function drawGenesisRink(rom: Uint8Array, home?: number[], away?: number[]): { picture: Picture; palette: number[] } | null {
  const rink = readGenesisRink(rom)
  if (!rink) return null
  const width = rink.width * 8
  const picture: Picture = { width, height: rink.height * 8, pixels: new Uint8Array(width * rink.height * 8) }
  rink.words.forEach((word, cell) => {
    const tile = rink.tilesAt + (word & 0x7ff) * TILE
    const line = (word >> 13) & 3
    const [cx, cy] = [(cell % rink.width) * 8, Math.floor(cell / rink.width) * 8]
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const [px, py] = [word & 0x800 ? 7 - x : x, word & 0x1000 ? 7 - y : y]
        const byte = rom[tile + py * 4 + (px >> 1)]
        const colour = px & 1 ? byte & 15 : byte >> 4
        picture.pixels[(cy + y) * width + cx + x] = colour ? line * 16 + colour : 0
      }
    }
  })
  const grey = Array.from({ length: 16 }, (_, i) => (Math.min(7, i >> 1) * 2) * 0x111)
  const palette = [...rink.palette, ...(home ?? grey).slice(0, 16), ...(away ?? grey).slice(0, 16)]
  return { picture, palette }
}
