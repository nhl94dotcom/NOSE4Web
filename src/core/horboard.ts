// The side-on scoreboard screen's picture (IceRinkHorMap, Genesis NHL 94): the rink seen from the side behind the
// pause menu, the intermission and a penalty's side-on view, where a league can put its own logo or ads on the boards
// and glass. As Match Viewer measured it (2026-11-27):
// - SetHor draws it with dobitmap: `movea.l #IceRinkHorMap,a1` ($12BBC, jim format at $BC05C: the palette's and the
//   map's offsets, the tile count and the tiles, 64 colours never loaded, a 32 x 28 map) and `movea.l
//   #IceRinkHorTiles,a2` ($12BC6, the header + 8), tiles from 0 (rinkvrcset) and no palette (d5 = 0): it is drawn in
//   the rink's own two palette lines. 212 tiles; room for 454 (the vertical rink's, reloaded by ClrHor after).
// - Shown whole: rows 0-1, 6-11 and 18-27 (the boards and glass about rows 17-21); rows 2-5 are under the team
//   blocks, scores and clock; the menu box (rows 12-17, columns 5-26), the intermission ticker (rows 23-27, columns
//   3-28) and a penalty's name bar (row 11) cover their parts while they show.
// - Nothing else uses it; NHL '95 has no such screen.
// A picture of the league's own goes in free room with both pointers changed; it can use every colour of the two
// lines (they are the rink's, so they stay as they are), and each square takes the line that draws it nearest.

import { colorRgb } from './color'
import type { Picture } from './graphics'
import type { RomProject } from './rom'
import { claimSpace, releaseSpace } from './space'
import { readImage } from './splash'

export const HOR_WIDTH = 256
export const HOR_HEIGHT = 224
const ACROSS = 32
const DOWN = 28
const CELLS = ACROSS * DOWN
const MAP_POINTER = 0x12bbc
const TILES_POINTER = 0x12bc6
const ORIGINAL = 0xbc05c
const ORIGINAL_TILES = 212
export const HOR_MOST_TILES = 454

const u16 = (rom: Uint8Array, at: number) => (rom[at] << 8) | rom[at + 1]
const u32 = (rom: Uint8Array, at: number) => ((rom[at] << 24) | (rom[at + 1] << 16) | (rom[at + 2] << 8) | rom[at + 3]) >>> 0
const put16 = (rom: Uint8Array, at: number, value: number) => rom.set([(value >> 8) & 0xff, value & 0xff], at)
const put32 = (rom: Uint8Array, at: number, value: number) => rom.set([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff], at)

// Where the picture is, if both pointers are as the original game has them and agree.
function header(project: Pick<RomProject, 'game' | 'bytes'>): number | null {
  const rom = project.bytes
  if (project.game.platform !== 'genesis' || project.game.edition === 95 || rom.length < TILES_POINTER + 6) return null
  if (u16(rom, MAP_POINTER) !== 0x227c || u16(rom, TILES_POINTER) !== 0x247c) return null
  const at = u32(rom, MAP_POINTER + 2)
  if (u32(rom, TILES_POINTER + 2) !== at + 8) return null
  const image = readImage(rom, at)
  return image && image.width === ACROSS && image.height === DOWN && (image.tiles & 0x8000) === 0 ? at : null
}

const length = (rom: Uint8Array, at: number) => u32(rom, at + 4) + 4 + CELLS * 2

export interface HorBoard {
  picture: Picture
  // The rink's two lines, then two of grey (the screen draws in lines 0 and 1 only).
  palette: number[]
  original: boolean
  tiles: number
}

const paletteOf = (project: Pick<RomProject, 'rinkPalette'>) => {
  const out = project.rinkPalette.slice(0, 32)
  while (out.length < 64) out.push(0x0888)
  return out
}

export function readHorBoard(project: Pick<RomProject, 'game' | 'bytes' | 'rinkPalette'>): HorBoard | null {
  const at = header(project)
  if (at === null) return null
  const rom = project.bytes
  const img = readImage(rom, at)!
  const picture: Picture = { width: HOR_WIDTH, height: HOR_HEIGHT, pixels: new Uint8Array(HOR_WIDTH * HOR_HEIGHT) }
  img.map.forEach((entry, cell) => {
    const tile = entry & 0x7ff
    if (tile >= img.tiles) return
    const line = (entry >> 13) & 3
    const tileAt = at + 10 + tile * 32
    const [left, top] = [(cell % ACROSS) * 8, Math.floor(cell / ACROSS) * 8]
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const [fx, fy] = [entry & 0x800 ? 7 - x : x, entry & 0x1000 ? 7 - y : y]
        const byte = rom[tileAt + fy * 4 + (fx >> 1)] ?? 0
        const colour = fx & 1 ? byte & 15 : byte >> 4
        if (colour !== 0) picture.pixels[(top + y) * HOR_WIDTH + left + x] = line * 16 + colour
      }
    }
  })
  return { picture, palette: paletteOf(project), original: at === ORIGINAL && img.tiles === ORIGINAL_TILES, tiles: img.tiles }
}

export class HorBoardError extends Error {}

// The picture made for the screen: the image (256 x 224, as exported) in the rink's two lines, each square in the line
// that draws it nearest, colour 0 where it is see-through; squares kept once each, flips included.
export function withHorBoardImage(project: RomProject, rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): { project: RomProject; tiles: number } {
  const at = header(project)
  if (at === null) throw new HorBoardError("This ROM's side-on scoreboard screen is not as the original game has it, so its picture cannot be changed.")
  if (width !== HOR_WIDTH || height !== HOR_HEIGHT) throw new HorBoardError(`The picture must be ${HOR_WIDTH} by ${HOR_HEIGHT} pixels, as Export as PNG saves it; this one is ${width} by ${height}.`)
  const rgb = paletteOf(project).map((word) => colorRgb(word))
  const nearestIn = (line: number, r: number, g: number, b: number) => {
    let best = 1
    let bestD = Infinity
    for (let c = 1; c < 16; c++) {
      const [cr, cg, cb] = rgb[line * 16 + c]
      const d = (cr - r) ** 2 + (cg - g) ** 2 + (cb - b) ** 2
      if (d < bestD) [best, bestD] = [c, d]
    }
    return { colour: best, distance: bestD }
  }
  const known = new Map<string, number>()
  const tiles: Uint8Array[] = []
  const map = Array.from({ length: CELLS }, (_, cell) => {
    const [cx, cy] = [(cell % ACROSS) * 8, Math.floor(cell / ACROSS) * 8]
    let best = { line: 0, pixels: new Uint8Array(64), error: Infinity }
    for (const line of [0, 1]) {
      const pixels = new Uint8Array(64)
      let error = 0
      for (let i = 0; i < 64; i++) {
        const p = ((cy + (i >> 3)) * width + cx + (i & 7)) * 4
        if (rgba[p + 3] < 128) continue
        const found = nearestIn(line, rgba[p], rgba[p + 1], rgba[p + 2])
        pixels[i] = found.colour
        error += found.distance
      }
      if (error < best.error) best = { line, pixels, error }
    }
    for (const [h, v] of [[false, false], [true, false], [false, true], [true, true]] as const) {
      const turned = Uint8Array.from({ length: 64 }, (_, i) => best.pixels[(v ? 7 - (i >> 3) : i >> 3) * 8 + (h ? 7 - (i & 7) : i & 7)])
      const index = known.get(`${best.line}:${turned.join(',')}`)
      if (index !== undefined) return (best.line << 13) | (v ? 0x1000 : 0) | (h ? 0x800 : 0) | index
    }
    const index = tiles.push(best.pixels) - 1
    known.set(`${best.line}:${best.pixels.join(',')}`, index)
    return (best.line << 13) | index
  })
  if (tiles.length > HOR_MOST_TILES) {
    throw new HorBoardError(`This picture needs ${tiles.length} different squares of 8 by 8 pixels and the screen has room for ${HOR_MOST_TILES}. Repeat more of them, or use fewer colours and less fine detail.`)
  }
  // The jim format, as the original: the tiles, the 64 colours (the original's, never loaded), the size and the map.
  const old = readImage(project.bytes, at)!
  const paletteAt = 10 + tiles.length * 32
  const sizeAt = paletteAt + 128
  const bytes = new Uint8Array(sizeAt + 4 + CELLS * 2)
  put32(bytes, 0, paletteAt)
  put32(bytes, 4, sizeAt)
  put16(bytes, 8, tiles.length)
  tiles.forEach((pixels, t) => {
    for (let i = 0; i < 64; i++) bytes[10 + t * 32 + (i >> 1)] |= i & 1 ? pixels[i] : pixels[i] << 4
  })
  old.palette.forEach((colour, i) => put16(bytes, paletteAt + i * 2, colour))
  put16(bytes, sizeAt, ACROSS)
  put16(bytes, sizeAt + 2, DOWN)
  map.forEach((entry, i) => put16(bytes, sizeAt + 4 + i * 2, entry))
  return { project: withHorBoardBytes(project, bytes), tiles: tiles.length }
}

// The league's own picture, as its bytes, for a project file; null for the original's.
export function horBoardBytes(project: Pick<RomProject, 'game' | 'bytes'>): Uint8Array | null {
  const at = header(project)
  if (at === null || at === ORIGINAL) return null
  return project.bytes.slice(at, at + length(project.bytes, at))
}

// The picture given as its bytes: in the room of one of the league's own already there if it fits, else in free room.
export function withHorBoardBytes(project: RomProject, bytes: Uint8Array): RomProject {
  const at = header(project)
  if (at === null) throw new HorBoardError("This ROM's side-on scoreboard screen is not as the original game has it, so its picture cannot be changed.")
  let next: Uint8Array = project.bytes.slice()
  let to: number
  if (at !== ORIGINAL && length(next, at) >= bytes.length) to = at
  else {
    if (at !== ORIGINAL) releaseSpace(next, [{ start: at, end: at + length(next, at) }])
    const claimed = claimSpace(next, bytes.length)
    if (!claimed) throw new HorBoardError('There is no room left in this ROM for the picture.')
    next = claimed.rom
    to = claimed.at
  }
  next.set(bytes, to)
  put32(next, MAP_POINTER + 2, to)
  put32(next, TILES_POINTER + 2, to + 8)
  return { ...project, bytes: next }
}

export function withOriginalHorBoard(project: RomProject): RomProject {
  const at = header(project)
  const original = readImage(project.bytes, ORIGINAL)
  if (at === null || !original || original.tiles !== ORIGINAL_TILES) throw new HorBoardError("The original game's side-on scoreboard picture is no longer in this ROM, so it cannot be put back.")
  const next = project.bytes.slice()
  if (at !== ORIGINAL) releaseSpace(next, [{ start: at, end: at + length(next, at) }])
  put32(next, MAP_POINTER + 2, ORIGINAL)
  put32(next, TILES_POINTER + 2, ORIGINAL + 8)
  return { ...project, bytes: next }
}
