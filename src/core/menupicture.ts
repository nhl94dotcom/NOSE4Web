// The Genesis game's Game Setup screen background (GameSetUpMap), the picture
// behind the main menu. setoptions draws it with movea.l #GameSetUpMap,a0 at
// $F823A, so a picture of the league's own goes in free room with that
// pointer changed, as Drezz's forum guide has it (25611). The picture is the
// splash screen's format: a 10-byte header (the palette's and the size's
// offsets, the tile count), the tiles, 64 colours, 40 x 28 and a word a tile.
//
// Match Viewer's measurements of the screen in retail:
// - Its tiles load from tile $3E3, and the screen's own pictures after them
//   (the team pictures, the top strip, the menu box, the logo boxes), which
//   must end below the sprite table at tile $5A0: so the background can have
//   up to 323 tiles (retail's has 240). Drezz's guide loads $480, which runs
//   over the sprite table and the planes, and league ROMs' pictures made with
//   it showed marks on the player cards.
// - The screen loads palette rows 0, 2 and 3 from it (d5 = $D), but row 2 is
//   then the visitors' logo's, and row 1 the team banners'. Row 0 is shared
//   with the fonts and frames, which draw with its colours 1 and 3 to 7; its
//   colour 0 is the backdrop. So a picture has row 0's colours 0, 2 and 8 to
//   15, and all of row 3's.
// - The map words go in as they are (retail's use row 0 and the flips).

import { colorRgb } from './color'
import type { Picture } from './graphics'
import type { RomProject } from './rom'
import { claimSpace } from './space'
import { far, fitted, keyLevels, levelKey, medianCut, nearest, readImage, SPLASH_HEIGHT, SPLASH_WIDTH, word, type Image } from './splash'

const POINTER_AT = 0xf823a
const ORIGINAL_HEADER = 0x4b7a0
const ORIGINAL_TILES = 0xf0
export const MENU_PICTURE_TILES = 323
const ACROSS = 40
const DOWN = 28
const CELLS = ACROSS * DOWN
const COLOURS = 16
// The colours of row 0 the screen's fonts and frames draw with.
const FIXED = [1, 3, 4, 5, 6, 7]
const ROW0_FREE = [2, 8, 9, 10, 11, 12, 13, 14, 15]
const ROW3_FREE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
export const MENU_PICTURE_COLOURS = 1 + ROW0_FREE.length + ROW3_FREE.length

const u16 = (rom: Uint8Array, at: number) => (rom[at] << 8) | rom[at + 1]
const u32 = (rom: Uint8Array, at: number) => ((rom[at] << 24) | (rom[at + 1] << 16) | (rom[at + 2] << 8) | rom[at + 3]) >>> 0
const put16 = (rom: Uint8Array, at: number, value: number) => rom.set([(value >> 8) & 0xff, value & 0xff], at)
const put32 = (rom: Uint8Array, at: number, value: number) => rom.set([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff], at)
const wordKey = (w: number) => levelKey([(w >> 1) & 7, (w >> 5) & 7, (w >> 9) & 7])

function header(rom: Uint8Array): number | null {
  if (rom.length < POINTER_AT + 6 || u16(rom, POINTER_AT) !== 0x207c) return null
  return u32(rom, POINTER_AT + 2)
}

function image(rom: Uint8Array): { at: number; image: Image } | null {
  const at = header(rom)
  if (at === null || at + 10 > rom.length) return null
  const found = readImage(rom, at)
  if (!found || found.width !== ACROSS || found.height !== DOWN || (found.tiles & 0x8000) !== 0) return null
  return { at, image: found }
}

export interface MenuPicture {
  // As the background draws: the picture's 64 colours, the backdrop row 0's first.
  picture: Picture
  palette: number[]
  original: boolean
  tiles: number
}

// The background as it is in this ROM, or null where the code or the picture is not as the original game has them.
export function readMenuPicture(rom: Uint8Array): MenuPicture | null {
  const found = image(rom)
  if (!found) return null
  const { at, image: img } = found
  const picture: Picture = { width: SPLASH_WIDTH, height: SPLASH_HEIGHT, pixels: new Uint8Array(SPLASH_WIDTH * SPLASH_HEIGHT) }
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
        if (colour !== 0) picture.pixels[(top + y) * SPLASH_WIDTH + left + x] = row * COLOURS + colour
      }
    }
  })
  return { picture, palette: img.palette, original: at === ORIGINAL_HEADER && img.tiles === ORIGINAL_TILES, tiles: img.tiles }
}

// ----------------------------------------------------------------- making

export interface MenuImage {
  palette: number[]
  map: number[]
  tiles: Uint8Array[]
  // How many colours the picture had in the console's levels, how many it was
  // given, and how many tiles before any were merged to fit.
  colours: number
  kept: number
  distinct: number
}

type Tile = Uint8Array // 64 colour indices, row by row

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

// The tiles kept once each, flips included: the map words (row and flips) and the tiles they name.
function shared(cells: { row: number; tile: Tile }[]): { map: number[]; tiles: Tile[] } {
  const known = new Map<string, number>()
  const tiles: Tile[] = []
  const map = cells.map(({ row, tile }) => {
    for (const [h, v] of [[false, false], [true, false], [false, true], [true, true]] as const) {
      const index = known.get(`${row}:${flipped(tile, h, v).join(',')}`)
      if (index !== undefined) return (row << 13) | (v ? 0x1000 : 0) | (h ? 0x800 : 0) | index
    }
    const index = tiles.push(tile) - 1
    known.set(`${row}:${tile.join(',')}`, index)
    return (row << 13) | index
  })
  return { map, tiles }
}

// The picture made for the background: fitted inside the screen on the
// backdrop, its colours cut to the screen's free ones (with the fonts' fixed
// colours of row 0 there to use as well), each 8 x 8 tile in row 0 or row 3,
// and, where more than 323 different tiles come out, the most alike merged.
// `fixed` is the ROM's background palette: row 0's colours 1 and 3 to 7 are
// kept, and rows 1 and 2, which other pictures on the screen take over.
export function menuPictureFromImage(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number, fixed: number[]): MenuImage {
  const keys = fitted(rgba, width, height)
  const fixedKeys = FIXED.map((i) => wordKey(fixed[i]))
  const counts = new Map<number, number>()
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1)
  const colours = counts.size
  // Colours the fonts' own match exactly need no room of their own.
  const rest = new Map([...counts].filter(([key]) => !fixedKeys.includes(key)))
  const chosen = rest.size > MENU_PICTURE_COLOURS ? medianCut(rest, MENU_PICTURE_COLOURS) : [...rest.keys()]
  const every = [...new Set([...chosen, ...fixedKeys])]
  const reduce = new Map<number, number>()
  for (const key of counts.keys()) reduce.set(key, every[nearest(key, every)])
  // The backdrop is the commonest colour of the picture's own.
  const used = new Map<number, number>()
  for (const key of keys) {
    const k = reduce.get(key)!
    if (!fixedKeys.includes(k)) used.set(k, (used.get(k) ?? 0) + 1)
  }
  const backdrop = used.size ? [...used].sort((a, b) => b[1] - a[1])[0][0] : 0

  // Each tile's colours, then rows of them: the busiest tiles first, each into the row it adds fewest colours to.
  const cellCounts: Map<number, number>[] = Array.from({ length: CELLS }, () => new Map())
  keys.forEach((key, i) => {
    const cell = Math.floor(i / SPLASH_WIDTH / 8) * ACROSS + Math.floor((i % SPLASH_WIDTH) / 8)
    const k = reduce.get(key)!
    cellCounts[cell].set(k, (cellCounts[cell].get(k) ?? 0) + 1)
  })
  const free = [new Set<number>(), new Set<number>()]
  const room = [ROW0_FREE.length, ROW3_FREE.length]
  const has = (r: number, k: number) => k === backdrop || free[r].has(k) || (r === 0 && fixedKeys.includes(k))
  const order = cellCounts.map((_, i) => i).sort((a, b) => cellCounts[b].size - cellCounts[a].size)
  for (const cell of order) {
    let best = -1
    let added = Infinity
    for (const r of [0, 1]) {
      const extra = [...cellCounts[cell].keys()].filter((k) => !has(r, k))
      if (free[r].size + extra.length <= room[r] && extra.length < added) [best, added] = [r, extra.length]
    }
    if (best >= 0) {
      for (const k of cellCounts[cell].keys()) if (!has(best, k)) free[best].add(k)
    } else {
      const r = room[1] - free[1].size >= room[0] - free[0].size ? 1 : 0
      for (const [k] of [...cellCounts[cell]].sort((a, b) => b[1] - a[1])) if (!has(r, k) && free[r].size < room[r]) free[r].add(k)
    }
  }
  // Each row's colours by index: row 0 with the fonts' colours kept, row 3 all its own.
  const row0 = new Array<number>(COLOURS).fill(-1)
  row0[0] = backdrop
  FIXED.forEach((i, n) => (row0[i] = fixedKeys[n]))
  ;[...free[0]].forEach((k, n) => (row0[ROW0_FREE[n]] = k))
  const row3 = new Array<number>(COLOURS).fill(-1)
  row3[0] = backdrop
  ;[...free[1]].forEach((k, n) => (row3[ROW3_FREE[n]] = k))
  const rows = [row0, row3]
  const rowNumber = [0, 3]
  const indices = (row: number[]) => row.map((k, i) => (k >= 0 ? i : -1)).filter((i) => i >= 0)
  const closest = (row: number[], key: number) => {
    const at = indices(row)
    return at[nearest(key, at.map((i) => row[i]))]
  }

  // Each tile in the row that draws it nearest.
  const cells = Array.from({ length: CELLS }, (_, cell) => {
    let bestRow = 0
    let bestError = Infinity
    rows.forEach((row, r) => {
      let error = 0
      for (const [k, n] of cellCounts[cell]) error += far(keyLevels(k), keyLevels(row[closest(row, k)])) * n
      if (error < bestError) [bestRow, bestError] = [r, error]
    })
    const row = rows[bestRow]
    const tile = new Uint8Array(64)
    const cx = (cell % ACROSS) * 8
    const cy = Math.floor(cell / ACROSS) * 8
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) tile[y * 8 + x] = closest(row, reduce.get(keys[(cy + y) * SPLASH_WIDTH + cx + x])!)
    return { row: bestRow, tile }
  })
  let made = shared(cells)
  const distinct = made.tiles.length
  if (distinct > MENU_PICTURE_TILES) made = shared(merged(cells, rows, MENU_PICTURE_TILES))

  const palette = new Array<number>(64).fill(0)
  rows.forEach((row, r) => row.forEach((k, i) => (palette[rowNumber[r] * COLOURS + i] = k >= 0 ? word(keyLevels(k)) : 0)))
  // Rows 1 and 2 are other pictures' on this screen; they keep what the ROM's background has.
  for (let i = COLOURS; i < 3 * COLOURS; i++) palette[i] = fixed[i] ?? 0
  const map = made.map.map((entry) => (entry & ~0x6000) | (rowNumber[(entry >> 13) & 1] << 13))
  const kept = new Set([...rows.flat().filter((k) => k >= 0)]).size
  return { palette, map, tiles: made.tiles.map(packed), colours, kept, distinct }
}

// Cells whose tiles are merged until at most `most` different ones are left:
// the tiles as colours, grouped round `most` centres by the cells they
// stand for, each group drawn as its average in the row that suits it.
function merged(cells: { row: number; tile: Tile }[], rows: number[][], most: number): { row: number; tile: Tile }[] {
  const { map, tiles } = shared(cells)
  const rowOf = tiles.map(() => 0)
  const weight = tiles.map(() => 0)
  map.forEach((entry) => {
    rowOf[entry & 0x7ff] = (entry >> 13) & 1
    weight[entry & 0x7ff]++
  })
  const rgb = tiles.map((tile, t) => {
    const out = new Float64Array(192)
    for (let i = 0; i < 64; i++) keyLevels(rows[rowOf[t]][tile[i]]).forEach((c, n) => (out[i * 3 + n] = c))
    return out
  })
  const distance = (a: Float64Array, b: Float64Array) => {
    let d = 0
    for (let i = 0; i < 192; i++) d += (a[i] - b[i]) ** 2
    return d
  }
  // Centres spread out from the most used tile, each the tile farthest from those chosen.
  const centres: Float64Array[] = [rgb[weight.indexOf(Math.max(...weight))].slice()]
  const nearestD = rgb.map((v) => distance(v, centres[0]))
  while (centres.length < most) {
    let pick = 0
    for (let t = 1; t < rgb.length; t++) if (nearestD[t] * weight[t] > nearestD[pick] * weight[pick]) pick = t
    if (nearestD[pick] === 0) break
    centres.push(rgb[pick].slice())
    rgb.forEach((v, t) => (nearestD[t] = Math.min(nearestD[t], distance(v, centres[centres.length - 1]))))
  }
  const group = new Int32Array(rgb.length)
  for (let round = 0; round < 6; round++) {
    rgb.forEach((v, t) => {
      let best = 0
      let bestD = Infinity
      centres.forEach((c, n) => {
        const d = distance(v, c)
        if (d < bestD) [best, bestD] = [n, d]
      })
      group[t] = best
    })
    const sums = centres.map(() => new Float64Array(192))
    const totals = centres.map(() => 0)
    rgb.forEach((v, t) => {
      for (let i = 0; i < 192; i++) sums[group[t]][i] += v[i] * weight[t]
      totals[group[t]] += weight[t]
    })
    sums.forEach((sum, n) => {
      if (totals[n]) for (let i = 0; i < 192; i++) centres[n][i] = sum[i] / totals[n]
    })
  }
  // Each group's tile: its centre in the row that draws it nearest.
  const drawn = centres.map((centre) => {
    let best = { row: 0, tile: new Uint8Array(64), error: Infinity }
    rows.forEach((row, r) => {
      const at = row.map((k, i) => (k >= 0 ? i : -1)).filter((i) => i >= 0)
      const tile = new Uint8Array(64)
      let error = 0
      for (let p = 0; p < 64; p++) {
        let pick = at[0]
        let pd = Infinity
        for (const i of at) {
          const [r0, g0, b0] = keyLevels(row[i])
          const d = (r0 - centre[p * 3]) ** 2 + (g0 - centre[p * 3 + 1]) ** 2 + (b0 - centre[p * 3 + 2]) ** 2
          if (d < pd) [pick, pd] = [i, d]
        }
        tile[p] = pick
        error += pd
      }
      if (error < best.error) best = { row: r, tile, error }
    })
    return best
  })
  return map.map((entry) => {
    const { row, tile } = drawn[group[entry & 0x7ff]]
    return { row, tile: flipped(tile, (entry & 0x800) !== 0, (entry & 0x1000) !== 0) }
  })
}

function imageBytes(made: MenuImage): Uint8Array {
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

// The ROM's palette for the background, whose row 0 colours 1 and 3 to 7 a new picture keeps.
export function menuPicturePalette(rom: Uint8Array): number[] | null {
  return image(rom)?.image.palette ?? null
}

// The project with the background showing `made`: in the room of a picture of
// the league's own already there if it fits, else in free room at the end.
export function withMenuPicture(project: RomProject, made: MenuImage): RomProject {
  const found = image(project.bytes)
  if (!found) throw new Error("This ROM's Game Setup screen is not as the original game has it, so its background cannot be changed.")
  if (made.tiles.length > MENU_PICTURE_TILES) throw new Error(`The picture has ${made.tiles.length} tiles; the screen has room for ${MENU_PICTURE_TILES}.`)
  const bytes = imageBytes(made)
  const { at: old, image: was } = found
  let next: Uint8Array = project.bytes.slice()
  let at: number
  const oldLength = u32(next, old + 4) + 4 + was.width * was.height * 2
  if (old !== ORIGINAL_HEADER && oldLength >= bytes.length) at = old
  else {
    const claimed = claimSpace(next, bytes.length)
    if (!claimed) throw new Error('There is no room left in this ROM for the picture.')
    next = claimed.rom
    at = claimed.at
  }
  next.set(bytes, at)
  put32(next, POINTER_AT + 2, at)
  return { ...project, bytes: next }
}

// The project with the original game's background back, where it is still in the ROM.
export function withOriginalMenuPicture(project: RomProject): RomProject {
  const original = header(project.bytes) !== null && readImage(project.bytes, ORIGINAL_HEADER)
  if (!original || original.tiles !== ORIGINAL_TILES || original.width !== ACROSS || original.height !== DOWN) {
    throw new Error("The original game's Game Setup background is no longer in this ROM, so it cannot be put back.")
  }
  const next = project.bytes.slice()
  put32(next, POINTER_AT + 2, ORIGINAL_HEADER)
  return { ...project, bytes: next }
}

export const menuPictureColour = (palette: number[], index: number) => colorRgb(palette[index])
