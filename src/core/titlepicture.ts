// The Genesis title screen's picture (TitleScreenImg), NHL 94 and NHL '95: the original's, or a picture of the
// league's own. TitleScreen (title94.asm / title95.asm) draws it with dobitmap from `movea.l #TitleScreenImg,a0`,
// twice: its rows 0-22 into the window, its rows 23-27 on plane B, where the credits roll over it. The same format as
// the Game Setup background (menupicture.ts): a 10-byte header (the palette's and the size's offsets, the tile count),
// the tiles, 64 colours, 32 x 28 and a word a cell, uncompressed. A picture of the league's own goes in free room with
// both pointers changed. The draw code takes the heights as numbers of its own (23 and 5 rows), so a picture is always
// 32 x 28 cells, 256 x 224 pixels.
//
// Read from the disassembly and checked in the ROMs (2026-11-27):
// - The picture's tiles load from tile 0; after them, NHL 94's NHL shield (40 tiles), NHLPA logo (39) and "NHL
//   Hockey" lettering (151), NHL '95's lettering (76), and the credits' font (94), all below plane B at tile $500.
//   So a picture has room for 956 tiles (NHL '95: 1110), more than its 896 cells: it never needs squares merged.
// - Palette: the picture loads rows 0 to 3, then the lettering loads row 3 over it, and colour 0 is black. The
//   shield, logo and lettering draw in row 1 with the picture's colours, and the credits in row 1's colours 1 and 13.
//   So a picture has all of rows 0 and 2, and of row 1 only the colours the screen's own pictures do not use (NHL 94:
//   11, 12 and 14; NHL '95: all but 1, 7 and 13); row 1's others keep the ROM's. Row 3 on the screen is the
//   lettering's (TitleImg, its pointer read too): a picture's squares may draw in it, with its colours as they are.
// - Nothing else uses the picture.

import { colorRgb } from './color'
import type { Picture } from './graphics'
import type { RomProject } from './rom'
import { claimSpace, claimSpace95, releaseSpace } from './space'
import { far, fitted, keyLevels, levelKey, medianCut, nearest, readImage, word, type Image } from './splash'

export const TITLE_WIDTH = 256
export const TITLE_HEIGHT = 224
const ACROSS = 32
const DOWN = 28
const CELLS = ACROSS * DOWN
const COLOURS = 16

interface Edition {
  pointers: [number, number]
  // The lettering's `movea.l #TitleImg,a0`, whose palette's row 3 is the screen's.
  lettering: number
  original: number
  originalTiles: number
  // Row 1's colours a picture may set; its others are the screen's own pictures'.
  row1Free: number[]
  claim: (rom: Uint8Array, size: number) => { rom: Uint8Array; at: number } | null
}
const EDITIONS: Record<94 | 95, Edition> = {
  94: { pointers: [0xff10c, 0xff13e], lettering: 0xff1d4, original: 0x4e45c, originalTiles: 526, row1Free: [11, 12, 14], claim: (rom, size) => claimSpace(rom, size) },
  95: { pointers: [0xa1374, 0xa13a6], lettering: 0xa13e4, original: 0x18daa8, originalTiles: 1013, row1Free: [2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 14, 15], claim: (rom, size) => claimSpace95(rom, size) },
}
const ALL = Array.from({ length: 15 }, (_, i) => i + 1)

const u16 = (rom: Uint8Array, at: number) => (rom[at] << 8) | rom[at + 1]
const u32 = (rom: Uint8Array, at: number) => ((rom[at] << 24) | (rom[at + 1] << 16) | (rom[at + 2] << 8) | rom[at + 3]) >>> 0
const put16 = (rom: Uint8Array, at: number, value: number) => rom.set([(value >> 8) & 0xff, value & 0xff], at)
const put32 = (rom: Uint8Array, at: number, value: number) => rom.set([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff], at)
const wordKey = (w: number) => levelKey([(w >> 1) & 7, (w >> 5) & 7, (w >> 9) & 7])

const editionOf = (project: Pick<RomProject, 'game'>): Edition | null =>
  project.game.platform !== 'genesis' ? null : EDITIONS[project.game.edition === 95 ? 95 : 94]

// Where both pointers point, if they are `movea.l #...,a0` and agree.
function header(rom: Uint8Array, edition: Edition): number | null {
  const [a, b] = edition.pointers
  if (rom.length < Math.max(a, b) + 6 || u16(rom, a) !== 0x207c || u16(rom, b) !== 0x207c) return null
  const at = u32(rom, a + 2)
  return at === u32(rom, b + 2) ? at : null
}

function image(rom: Uint8Array, edition: Edition): { at: number; image: Image } | null {
  const at = header(rom, edition)
  if (at === null || at + 10 > rom.length) return null
  const found = readImage(rom, at)
  if (!found || found.width !== ACROSS || found.height !== DOWN || (found.tiles & 0x8000) !== 0) return null
  return { at, image: found }
}

const length = (rom: Uint8Array, at: number) => u32(rom, at + 4) + 4 + CELLS * 2

// The screen's palette: the picture's, with row 3 the lettering's and colour 0 black.
function screenPalette(rom: Uint8Array, edition: Edition, own: number[]): number[] {
  const palette = own.slice(0, 64)
  while (palette.length < 64) palette.push(0)
  const at = edition.lettering
  const lettering = rom.length >= at + 6 && u16(rom, at) === 0x207c ? readImage(rom, u32(rom, at + 2)) : null
  if (lettering && lettering.palette.length >= 64) for (let i = 48; i < 64; i++) palette[i] = lettering.palette[i]
  palette[0] = 0
  return palette
}

export interface TitlePicture {
  picture: Picture
  palette: number[]
  original: boolean
  tiles: number
}

// The picture as it is in this ROM, or null where the code or the picture is not as the original game has them.
export function readTitlePicture(project: Pick<RomProject, 'game' | 'bytes'>): TitlePicture | null {
  const edition = editionOf(project)
  const found = edition && image(project.bytes, edition)
  if (!edition || !found) return null
  const rom = project.bytes
  const { at, image: img } = found
  const picture: Picture = { width: TITLE_WIDTH, height: TITLE_HEIGHT, pixels: new Uint8Array(TITLE_WIDTH * TITLE_HEIGHT) }
  img.map.forEach((entry, cell) => {
    const tile = entry & 0x7ff
    if (tile >= img.tiles) return
    const row = (entry >> 13) & 3
    const tileAt = at + 10 + tile * 32
    const left = (cell % ACROSS) * 8
    const top = Math.floor(cell / ACROSS) * 8
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const fx = entry & 0x800 ? 7 - x : x
        const fy = entry & 0x1000 ? 7 - y : y
        const byte = rom[tileAt + fy * 4 + (fx >> 1)] ?? 0
        const colour = fx & 1 ? byte & 15 : byte >> 4
        if (colour !== 0) picture.pixels[(top + y) * TITLE_WIDTH + left + x] = row * COLOURS + colour
      }
    }
  })
  return { picture, palette: screenPalette(rom, edition, img.palette), original: at === edition.original && img.tiles === edition.originalTiles, tiles: img.tiles }
}

// How many colours of its own a picture can have (black is always there).
export const titlePictureColours = (project: Pick<RomProject, 'game'>) => {
  const edition = editionOf(project)
  return edition ? 30 + edition.row1Free.length : 0
}

// ----------------------------------------------------------------- making

export interface TitleImage {
  palette: number[]
  map: number[]
  tiles: Uint8Array[]
  // How many colours the picture had in the console's levels, and how many it was given.
  colours: number
  kept: number
}

type Tile = Uint8Array

const flipped = (tile: Tile, h: boolean, v: boolean): Tile => {
  const out = new Uint8Array(64)
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) out[y * 8 + x] = tile[(v ? 7 - y : y) * 8 + (h ? 7 - x : x)]
  return out
}

function packed(tile: Tile): Uint8Array {
  const out = new Uint8Array(32)
  for (let i = 0; i < 64; i++) out[i >> 1] |= i & 1 ? tile[i] : tile[i] << 4
  return out
}

// The picture made for the title screen: fitted inside the screen on black, its colours cut to the free ones (row 1's
// fixed colours there to use as well), each 8 x 8 square drawn in whichever of rows 0, 2 and 1 draws it nearest.
// Row 3's colours (the lettering's) are there to use as they are. `fixed` is the screen's palette as titlePicturePalette
// gives it: row 1's colours the screen's own pictures use, and row 3.
export function titlePictureFromImage(project: Pick<RomProject, 'game'>, rgba: Uint8Array | Uint8ClampedArray, width: number, height: number, fixed: number[]): TitleImage {
  const edition = editionOf(project)
  if (!edition) throw new Error('This is not a Genesis ROM.')
  const keys = fitted(rgba, width, height, TITLE_WIDTH, TITLE_HEIGHT)
  // The rows a picture can draw in: their palette row, the colours it may set, and the colours already there.
  const rowNumbers = [0, 2, 1, 3]
  const freeOf = [ALL, ALL, edition.row1Free, []]
  const fixedOf = [
    new Map<number, number>(),
    new Map<number, number>(),
    new Map(ALL.filter((i) => !edition.row1Free.includes(i)).map((i) => [i, wordKey(fixed[COLOURS + i])])),
    new Map(ALL.map((i) => [i, wordKey(fixed[3 * COLOURS + i])])),
  ]
  const fixedKeys = new Set([...fixedOf[2].values(), ...fixedOf[3].values()])
  const BLACK = 0
  const cellOf = (i: number) => Math.floor(i / TITLE_WIDTH / 8) * ACROSS + Math.floor((i % TITLE_WIDTH) / 8)
  const counts = new Map<number, number>()
  keys.forEach((key) => counts.set(key, (counts.get(key) ?? 0) + 1))
  const colours = counts.size
  const room = freeOf.reduce((n, free) => n + free.length, 0)
  const rest = new Map([...counts].filter(([key]) => key !== BLACK && !fixedKeys.has(key)))
  const chosen = rest.size > room ? medianCut(rest, room) : [...rest.keys()]
  const every = [...new Set([BLACK, ...chosen, ...fixedKeys])]
  const reduce = new Map<number, number>()
  for (const key of counts.keys()) reduce.set(key, every[nearest(key, every)])

  // Each square's colours; then rows of them, the busiest squares first, each into the row it adds fewest colours to.
  const cellCounts: Map<number, number>[] = Array.from({ length: CELLS }, () => new Map())
  keys.forEach((key, i) => {
    const k = reduce.get(key)!
    const cell = cellCounts[cellOf(i)]
    cell.set(k, (cell.get(k) ?? 0) + 1)
  })
  const free = rowNumbers.map(() => new Set<number>())
  const has = (r: number, k: number) => k === BLACK || free[r].has(k) || [...fixedOf[r].values()].includes(k)
  const order = cellCounts.map((_, i) => i).sort((a, b) => cellCounts[b].size - cellCounts[a].size)
  for (const cell of order) {
    let best = -1
    let added = Infinity
    rowNumbers.forEach((_, r) => {
      const extra = [...cellCounts[cell].keys()].filter((k) => !has(r, k))
      if (free[r].size + extra.length <= freeOf[r].length && extra.length < added) [best, added] = [r, extra.length]
      // (Row 3 sets no colours: it suits only a square all of whose colours it has, found when the squares are drawn.)
    })
    if (best >= 0) {
      for (const k of cellCounts[cell].keys()) if (!has(best, k)) free[best].add(k)
    } else {
      // No row has room for all of them: the commonest go to the row with most room left.
      const r = rowNumbers.map((_, n) => n).sort((a, b) => freeOf[b].length - free[b].size - (freeOf[a].length - free[a].size))[0]
      for (const [k] of [...cellCounts[cell]].sort((a, b) => b[1] - a[1])) if (!has(r, k) && free[r].size < freeOf[r].length) free[r].add(k)
    }
  }
  // Each row's colours by index (-1: none).
  const rows = rowNumbers.map((_, r) => {
    const row = new Array<number>(COLOURS).fill(-1)
    row[0] = BLACK
    for (const [i, k] of fixedOf[r]) row[i] = k
    ;[...free[r]].forEach((k, n) => (row[freeOf[r][n]] = k))
    return row
  })
  const indices = (row: number[]) => row.map((k, i) => (k >= 0 ? i : -1)).filter((i) => i >= 0)
  const closest = (row: number[], key: number) => {
    const at = indices(row)
    return at[nearest(key, at.map((i) => row[i]))]
  }

  // Each square in the row that draws it nearest, kept once each, flips included.
  const known = new Map<string, number>()
  const tiles: Tile[] = []
  const map = Array.from({ length: CELLS }, (_, cell) => {
    let bestRow = 0
    let bestError = Infinity
    rows.forEach((row, r) => {
      let error = 0
      for (const [k, n] of cellCounts[cell]) error += far(keyLevels(k), keyLevels(row[closest(row, k)])) * n
      if (error < bestError) [bestRow, bestError] = [r, error]
    })
    const row = rows[bestRow]
    const tile = new Uint8Array(64)
    const [cx, cy] = [(cell % ACROSS) * 8, Math.floor(cell / ACROSS) * 8]
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) tile[y * 8 + x] = closest(row, reduce.get(keys[(cy + y) * TITLE_WIDTH + cx + x])!)
    const palRow = rowNumbers[bestRow]
    for (const [h, v] of [[false, false], [true, false], [false, true], [true, true]] as const) {
      const index = known.get(`${palRow}:${flipped(tile, h, v).join(',')}`)
      if (index !== undefined) return (palRow << 13) | (v ? 0x1000 : 0) | (h ? 0x800 : 0) | index
    }
    const index = tiles.push(tile) - 1
    known.set(`${palRow}:${tile.join(',')}`, index)
    return (palRow << 13) | index
  })

  // Rows 0 and 2 the picture's; row 1 the picture's free colours and the ROM's others; row 3 the lettering's (which
  // loads its own over it anyway).
  const palette = fixed.slice(0, 64)
  while (palette.length < 64) palette.push(0)
  rows.forEach((row, r) =>
    row.forEach((k, i) => {
      if (rowNumbers[r] !== 1 || edition.row1Free.includes(i)) palette[rowNumbers[r] * COLOURS + i] = k >= 0 ? word(keyLevels(k)) : 0
    }),
  )
  palette[0] = 0
  const kept = new Set(rows.flat().filter((k) => k >= 0)).size
  return { palette, map, tiles: tiles.map(packed), colours, kept }
}

function imageBytes(made: TitleImage): Uint8Array {
  const paletteAt = 10 + made.tiles.length * 32
  const sizeAt = paletteAt + 128
  const bytes = new Uint8Array(sizeAt + 4 + CELLS * 2)
  put32(bytes, 0, paletteAt)
  put32(bytes, 4, sizeAt)
  put16(bytes, 8, made.tiles.length)
  made.tiles.forEach((tile, i) => bytes.set(tile, 10 + i * 32))
  made.palette.forEach((colour, i) => put16(bytes, paletteAt + i * 2, colour))
  put16(bytes, sizeAt, ACROSS)
  put16(bytes, sizeAt + 2, DOWN)
  made.map.forEach((entry, i) => put16(bytes, sizeAt + 4 + i * 2, entry))
  return bytes
}

// The title screen's palette as it shows, whose row 1 and 3 colours a new picture keeps.
export function titlePicturePalette(project: Pick<RomProject, 'game' | 'bytes'>): number[] | null {
  const edition = editionOf(project)
  const found = edition && image(project.bytes, edition)
  return edition && found ? screenPalette(project.bytes, edition, found.image.palette) : null
}

export function withTitlePicture(project: RomProject, made: TitleImage): RomProject {
  return withTitlePictureBytes(project, imageBytes(made))
}

// The picture of the league's own, as its bytes, for a project file; null for the original's.
export function titlePictureBytes(project: Pick<RomProject, 'game' | 'bytes'>): Uint8Array | null {
  const edition = editionOf(project)
  const found = edition && image(project.bytes, edition)
  if (!edition || !found || found.at === edition.original) return null
  return project.bytes.slice(found.at, found.at + length(project.bytes, found.at))
}

// The project with the title picture given as its bytes: in the room of a picture of the league's own already there
// if it fits, else in free room.
export function withTitlePictureBytes(project: RomProject, bytes: Uint8Array): RomProject {
  const edition = editionOf(project)
  const found = edition && image(project.bytes, edition)
  if (!edition || !found) throw new Error("This ROM's title screen is not as the original game has it, so its picture cannot be changed.")
  let next: Uint8Array = project.bytes.slice()
  let at: number
  if (found.at !== edition.original && length(next, found.at) >= bytes.length) at = found.at
  else {
    if (found.at !== edition.original) releaseSpace(next, [{ start: found.at, end: found.at + length(next, found.at) }])
    const claimed = edition.claim(next, bytes.length)
    if (!claimed) throw new Error('There is no room left in this ROM for the picture.')
    next = claimed.rom
    at = claimed.at
  }
  next.set(bytes, at)
  for (const pointer of edition.pointers) put32(next, pointer + 2, at)
  return { ...project, bytes: next }
}

// The project with the original game's title picture back, its room given back.
export function withOriginalTitlePicture(project: RomProject): RomProject {
  const edition = editionOf(project)
  const original = edition && header(project.bytes, edition) !== null && readImage(project.bytes, edition.original)
  if (!edition || !original || original.tiles !== edition.originalTiles || original.width !== ACROSS || original.height !== DOWN) {
    throw new Error("The original game's title picture is no longer in this ROM, so it cannot be put back.")
  }
  const next = project.bytes.slice()
  const found = image(next, edition)
  if (found && found.at !== edition.original) releaseSpace(next, [{ start: found.at, end: found.at + length(next, found.at) }])
  for (const pointer of edition.pointers) put32(next, pointer + 2, edition.original)
  return { ...project, bytes: next }
}

export const titlePictureColour = (palette: number[], index: number) => colorRgb(palette[index])
