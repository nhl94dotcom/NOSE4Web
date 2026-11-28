// The SNES game's Game Setup screen background (the picture behind the main menu): the original's goalie picture, or a
// picture of the league's own. As abdulahmad/NHL94SNES's SetupScreen and Match Viewer's measurements (2026-11-27) have
// it, on retail and the 32-team SA-1 builds alike:
// - BG2 (mode 1) is MenuBack, a pattern several screens share (MenuBackTiles from character 0, MenuBackMap with
//   palette 3 added, its words' palette bits giving rows 3 and 4), with the Game Setup picture over it: setoptions
//   unpacks SetupBackTiles straight after MenuBack's (character 104, `backchars`), and SetupBackMap (a 6-byte header,
//   32, 28 and $308, then 32 x 28 words), each non-zero word with `backchars` and palette 2 added; a zero word keeps
//   MenuBack. SetupBackPalette's first 16 colours are row 2, MenuBackPalette's first 32 rows 3 and 4.
// - The picture may use characters up to $1FF (VRAM $1680 to $2FFF): 408 tiles, tile 0 unused (a zero word is
//   MenuBack), so 407. The unpack buffer has room for them (Match Viewer).
// - Rows 2, 3 and 4 never change on the screen; nothing else uses row 2, so a picture has its 15 colours, and may use
//   rows 3 and 4's (MenuBack's, fixed) as they are. Colour 0 is see-through (the backdrop, $3568).
// - The logo boxes (columns 1-7 and 24-30 of rows 1-7) and the team name blocks (columns 1-9 and 22-30 of row 11)
//   always cover BG2, so a picture leaves those cells to MenuBack.
// The three parts are found by their loaders (lda #bank / sta / lda #address / sta, as the announcer's), packed as the
// original is, put in free space (the ROM grown to 2 MB where it has none left), and the loaders repointed; the
// original stays where it is.

import { HuffmanError, isHuffman, packHuffman, unpackHuffman } from './huffman'
import { LzError, packLz, unpackLz } from './lz'
import type { Picture } from './graphics'
import type { RomProject } from './rom'
import { findCodeAll, grownSnesRom, loRomAddress, loRomBank, loRomOffset, SNES_GROWN_SIZE } from './snes'
import { freeSpace, keptBanks, sameBank } from './snespictures'

export const SNES_SETUP_WIDTH = 256
export const SNES_SETUP_HEIGHT = 224
const ACROSS = 32
const DOWN = 28
const CELLS = ACROSS * DOWN
const HEADER = 6
const TILE = 32
// Tiles a picture may have, tile 0 (never named) among them.
const MOST_TILES = 408
export const SNES_SETUP_SQUARES = MOST_TILES - 1
const BACKDROP = 0x3568
// The palette rows a picture's squares can be drawn in: 2 its own, 3 and 4 MenuBack's.
const OWN_ROW = 2
const ROWS = [2, 3, 4]

const HIDDEN = new Set<number>([
  ...[1, 2, 3, 4, 5, 6, 7].flatMap((row) => [1, 2, 3, 4, 5, 6, 7, 24, 25, 26, 27, 28, 29, 30].map((col) => row * ACROSS + col)),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 22, 23, 24, 25, 26, 27, 28, 29, 30].map((col) => 11 * ACROSS + col),
])

// The loaders: lda #bank; sta dp; lda #address; sta dp; ... jsl Decompress, and what follows each.
const LOAD = 'a9(..)0085..a9(....)85..a9..0085..a9....85..22......'
// SetupBackTiles: after setoptions' check of setupvis (cmp #; bcs; jmp; sbc #; sta.l).
const SETUP_TILES = 'c9..00b0034c....e9..008f......' + LOAD + 'a9..0085..a9....85..a0ffff22'
const SETUP_MAP = LOAD + '8a38e90800'
const SETUP_PALETTE = LOAD + 'a9..0085..a9....85..a02000a2100022'
// MenuBackTiles (its tile count to backchars: txa; lsr x5; sta.l), MenuBackMap (the next load), MenuBackPalette (32
// colours from colour 48).
const MENU_TILES = LOAD + '8a4a4a4a4a4a8f'
const MENU_PALETTE = LOAD + 'a9..0085..a9....85..a03000a2200022'
const SETUP_TILES_SKIP = 15

interface Loader {
  // Where its lda #bank is, and where the part is.
  at: number
  offset: number
}
interface Loaders {
  tiles: Loader
  map: Loader
  palette: Loader
  menuTiles: Loader
  menuMap: Loader
  menuPalette: Loader
}

const loaderOf = (at: number, bank: number, address: number): Loader => ({ at, offset: address >= 0x8000 ? loRomOffset(bank, address) : -1 })

function findLoaders(rom: Uint8Array): Loaders | null {
  const tiles = findCodeAll(rom, SETUP_TILES)
  if (tiles.length !== 1) return null
  const t = tiles[0]
  const tilesAt = t.at + SETUP_TILES_SKIP
  const after = (pattern: string, from: number, within: number) => findCodeAll(rom, pattern).find((m) => m.at > from && m.at - from < within)
  const before = (pattern: string, from: number, within: number) => findCodeAll(rom, pattern).filter((m) => m.at < from && from - m.at < within).pop()
  const map = after(SETUP_MAP, tilesAt, 0x80)
  const palette = map && after(SETUP_PALETTE, map.at, 0x100)
  const menuTiles = before(MENU_TILES, tilesAt, 0x200)
  const menuMap = menuTiles && after(LOAD, menuTiles.at, 0x60)
  const menuPalette = palette && after(MENU_PALETTE, palette.at, 0x100)
  if (!map || !palette || !menuTiles || !menuMap || !menuPalette) return null
  const found: Loaders = {
    tiles: loaderOf(tilesAt, t.groups[0], t.groups[1]),
    map: loaderOf(map.at, map.groups[0], map.groups[1]),
    palette: loaderOf(palette.at, palette.groups[0], palette.groups[1]),
    menuTiles: loaderOf(menuTiles.at, menuTiles.groups[0], menuTiles.groups[1]),
    menuMap: loaderOf(menuMap.at, menuMap.groups[0], menuMap.groups[1]),
    menuPalette: loaderOf(menuPalette.at, menuPalette.groups[0], menuPalette.groups[1]),
  }
  return Object.values(found).every((l) => l.offset >= 0 && l.offset < rom.length) ? found : null
}

const unpackAny = (rom: Uint8Array, at: number) => (isHuffman(rom, at) ? unpackHuffman(rom, at) : unpackLz(rom, at))
const u16 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8)
const put16 = (b: Uint8Array, at: number, value: number) => b.set([value & 0xff, (value >> 8) & 0xff], at)

interface Parts {
  tiles: Uint8Array
  map: Uint8Array
  palette: Uint8Array
  menuTiles: Uint8Array
  menuMap: Uint8Array
  menuPalette: Uint8Array
}

function readParts(rom: Uint8Array, loaders: Loaders): Parts | null {
  try {
    const [tiles, map, palette, menuTiles, menuMap, menuPalette] = [loaders.tiles, loaders.map, loaders.palette, loaders.menuTiles, loaders.menuMap, loaders.menuPalette].map(
      (l) => unpackAny(rom, l.offset).data,
    )
    const fullMap = (m: Uint8Array) => m.length >= HEADER + CELLS * 2 && u16(m, 0) === ACROSS && u16(m, 2) === DOWN
    if (!fullMap(map) || !fullMap(menuMap) || palette.length < 32 || menuPalette.length < 64 || tiles.length % TILE || menuTiles.length % TILE) return null
    return { tiles, map, palette, menuTiles, menuMap, menuPalette }
  } catch (e) {
    if (e instanceof HuffmanError || e instanceof LzError) return null
    throw e
  }
}

const pixelOf = (tiles: Uint8Array, tile: number, x: number, y: number) => {
  const at = tile * TILE
  const bit = 7 - x
  return ((tiles[at + y * 2] >> bit) & 1) | (((tiles[at + y * 2 + 1] >> bit) & 1) << 1) | (((tiles[at + 16 + y * 2] >> bit) & 1) << 2) | (((tiles[at + 16 + y * 2 + 1] >> bit) & 1) << 3)
}

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

// The screen's colours: 0 the backdrop, rows 2 (the picture's), 3 and 4 (MenuBack's), 16 each.
function screenPalette(parts: Parts): number[] {
  const palette = new Array<number>(80).fill(0)
  for (let i = 0; i < 16; i++) palette[32 + i] = u16(parts.palette, i * 2)
  for (let i = 0; i < 32; i++) palette[48 + i] = u16(parts.menuPalette, i * 2)
  palette[0] = BACKDROP
  for (const row of ROWS) palette[row * 16] = BACKDROP
  return palette
}

// BG2 as it draws: each pixel the screen's colour number (0 the backdrop).
function drawBg2(parts: Parts): Picture {
  const picture: Picture = { width: SNES_SETUP_WIDTH, height: SNES_SETUP_HEIGHT, pixels: new Uint8Array(SNES_SETUP_WIDTH * SNES_SETUP_HEIGHT) }
  const ownTiles = parts.tiles.length / TILE
  const menuTiles = parts.menuTiles.length / TILE
  for (let cell = 0; cell < CELLS; cell++) {
    const own = u16(parts.map, HEADER + cell * 2)
    const menu = u16(parts.menuMap, HEADER + cell * 2)
    const [word, tiles, count, base] = own !== 0 ? [own, parts.tiles, ownTiles, OWN_ROW] : [menu, parts.menuTiles, menuTiles, 3]
    const tile = word & 0x3ff
    if (tile >= count) continue
    const row = base + ((word >> 10) & 7)
    const [cx, cy] = [(cell % ACROSS) * 8, Math.floor(cell / ACROSS) * 8]
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const c = pixelOf(tiles, tile, word & 0x4000 ? 7 - x : x, word & 0x8000 ? 7 - y : y)
        picture.pixels[(cy + y) * SNES_SETUP_WIDTH + cx + x] = c === 0 ? 0 : row * 16 + c
      }
    }
  }
  return picture
}

export interface SnesSetupPicture {
  picture: Picture
  // SNES colour words, by the picture's colour numbers.
  palette: number[]
  original: boolean
  tiles: number
}

const sourceLoaders = new WeakMap<Uint8Array, Loaders | null>()
function openedLoaders(source: Uint8Array): Loaders | null {
  if (!sourceLoaders.has(source)) {
    // An SNES file may start with a copier header.
    const rom = source.length % 0x8000 === 0x200 ? source.subarray(0x200) : source
    sourceLoaders.set(source, findLoaders(rom))
  }
  return sourceLoaders.get(source)!
}

const sameParts = (a: Loaders, b: Loaders) => a.tiles.offset === b.tiles.offset && a.map.offset === b.map.offset && a.palette.offset === b.palette.offset

export function readSnesSetupPicture(project: Pick<RomProject, 'game' | 'bytes' | 'source'>): SnesSetupPicture | null {
  if (project.game.platform !== 'snes') return null
  const loaders = findLoaders(project.bytes)
  const parts = loaders && readParts(project.bytes, loaders)
  if (!loaders || !parts) return null
  const opened = openedLoaders(project.source)
  return { picture: drawBg2(parts), palette: screenPalette(parts), original: opened !== null && sameParts(opened, loaders), tiles: parts.tiles.length / TILE }
}

// ----------------------------------------------------------------- making

const levels = (w: number) => [w & 31, (w >> 5) & 31, (w >> 10) & 31]
const apart = (a: number, b: number) => {
  const [x, y] = [levels(a), levels(b)]
  return (x[0] - y[0]) ** 2 + (x[1] - y[1]) ** 2 + (x[2] - y[2]) ** 2
}

// Up to `most` colours standing for the given ones, by median cut.
function cut(counts: Map<number, number>, most: number): number[] {
  let boxes: number[][] = [[...counts.keys()]]
  while (boxes.length < most) {
    let pick = -1
    let span = 0
    let channel = 0
    boxes.forEach((box, i) => {
      if (box.length < 2) return
      for (let c = 0; c < 3; c++) {
        const values = box.map((w) => levels(w)[c])
        const s = Math.max(...values) - Math.min(...values)
        if (s > span) [pick, span, channel] = [i, s, c]
      }
    })
    if (pick < 0) break
    const box = boxes[pick].slice().sort((a, b) => levels(a)[channel] - levels(b)[channel])
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
    const avg = [0, 1, 2].map((c) => Math.round(box.reduce((sum, w) => sum + levels(w)[c] * counts.get(w)!, 0) / weight))
    return avg[0] | (avg[1] << 5) | (avg[2] << 10)
  })
}

// The image fitted inside the screen, centred, on black, as SNES colour words.
function fittedWords(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): Uint16Array {
  const scale = Math.min(SNES_SETUP_WIDTH / width, SNES_SETUP_HEIGHT / height)
  const [w, h] = [Math.round(width * scale), Math.round(height * scale)]
  const [left, top] = [Math.floor((SNES_SETUP_WIDTH - w) / 2), Math.floor((SNES_SETUP_HEIGHT - h) / 2)]
  const out = new Uint16Array(SNES_SETUP_WIDTH * SNES_SETUP_HEIGHT)
  const SAMPLES = 3
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sum = [0, 0, 0]
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const ix = Math.min(width - 1, Math.floor(((x + (sx + 0.5) / SAMPLES) * width) / w))
          const iy = Math.min(height - 1, Math.floor(((y + (sy + 0.5) / SAMPLES) * height) / h))
          const p = (iy * width + ix) * 4
          const alpha = rgba[p + 3] / 255
          for (let c = 0; c < 3; c++) sum[c] += rgba[p + c] * alpha
        }
      }
      const [r, g, b] = sum.map((v) => Math.round((v / (SAMPLES * SAMPLES) / 255) * 31))
      out[(top + y) * SNES_SETUP_WIDTH + left + x] = r | (g << 5) | (b << 10)
    }
  }
  return out
}

export interface SnesSetupImage {
  // Row 2's 15 colours (colour 1 on), the map's 896 words and the tiles they name, tile 0 blank first.
  colours: number[]
  words: number[]
  tiles: Uint8Array[]
  // Colours the picture had, and kept; different squares before any were merged.
  had: number
  kept: number
  distinct: number
  // Squares left to MenuBack because they match it or the screen covers them.
  menuBack: number
}

type Square = { row: number; pixels: Uint8Array }

const flipped = (pixels: Uint8Array, h: boolean, v: boolean) => {
  const out = new Uint8Array(64)
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) out[y * 8 + x] = pixels[(v ? 7 - y : y) * 8 + (h ? 7 - x : x)]
  return out
}

// The tiles kept once each, flips included: the words (tile from 1, row, flips) and the tiles.
function shared(squares: (Square | null)[]): { words: number[]; tiles: Uint8Array[]; rowOf: number[] } {
  const known = new Map<string, number>()
  const tiles: Uint8Array[] = [new Uint8Array(64)]
  const rowOf = [OWN_ROW]
  const words = squares.map((square) => {
    if (!square) return 0
    for (const [h, v] of [[false, false], [true, false], [false, true], [true, true]] as const) {
      const index = known.get(`${square.row}:${flipped(square.pixels, h, v).join(',')}`)
      if (index !== undefined) return ((square.row - OWN_ROW) << 10) | (v ? 0x8000 : 0) | (h ? 0x4000 : 0) | index
    }
    const index = tiles.push(square.pixels) - 1
    rowOf.push(square.row)
    known.set(`${square.row}:${square.pixels.join(',')}`, index)
    return ((square.row - OWN_ROW) << 10) | index
  })
  return { words, tiles, rowOf }
}

// The picture made for the screen. `fixed` is the screen's palette as readSnesSetupPicture gives it.
export function snesSetupPictureFromImage(project: Pick<RomProject, 'game' | 'bytes' | 'source'>, rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): SnesSetupImage {
  const loaders = findLoaders(project.bytes)
  const parts = loaders && readParts(project.bytes, loaders)
  if (!loaders || !parts) throw new Error("This ROM's Game Setup screen is not as the original game has it, so its background cannot be changed.")
  const words = fittedWords(rgba, width, height)
  // MenuBack alone, to leave the squares that match it to it.
  const blank = parts.map.slice()
  blank.fill(0, HEADER)
  const menuOnly = drawBg2({ ...parts, map: blank })
  const palette = screenPalette(parts)
  const cellPixels = (cell: number) => {
    const [cx, cy] = [(cell % ACROSS) * 8, Math.floor(cell / ACROSS) * 8]
    return Array.from({ length: 64 }, (_, i) => (cy + (i >> 3)) * SNES_SETUP_WIDTH + cx + (i & 7))
  }
  const leftToMenu = new Set<number>()
  for (let cell = 0; cell < CELLS; cell++) {
    if (HIDDEN.has(cell) || cellPixels(cell).every((i) => palette[menuOnly.pixels[i]] === words[i])) leftToMenu.add(cell)
  }

  // Colours: rows 3 and 4's as they are; the rest cut to row 2's 15.
  const fixedRows = [3, 4].map((row) => Array.from({ length: 15 }, (_, i) => palette[row * 16 + 1 + i]))
  // The backdrop shows through a square's colour 0, in any row: one colour more, as the original picture uses it.
  const fixed = new Set([...fixedRows.flat(), BACKDROP])
  const counts = new Map<number, number>()
  for (let cell = 0; cell < CELLS; cell++) if (!leftToMenu.has(cell)) for (const i of cellPixels(cell)) counts.set(words[i], (counts.get(words[i]) ?? 0) + 1)
  const had = counts.size
  // All of them in row 2 where they fit, so that a square can mix any of them; where not, those rows 3 and 4 have are
  // left to them, and the rest cut to 15.
  const all = new Map([...counts].filter(([w]) => w !== BACKDROP))
  const rest = all.size > 15 ? new Map([...all].filter(([w]) => !fixed.has(w))) : all
  const own = rest.size > 15 ? cut(rest, 15) : [...rest.keys()]
  while (own.length < 15) own.push(own[own.length - 1] ?? 0)
  const rows = [own, ...fixedRows]
  // A square's pixel in row r (0 the backdrop, 1 to 15 the row's) and its colour.
  const colourOf = (r: number, pixel: number) => (pixel === 0 ? BACKDROP : rows[r][pixel - 1])
  const nearestIn = new Map<string, number>()
  const nearest = (r: number, w: number) => {
    const key = `${r}:${w}`
    if (!nearestIn.has(key)) {
      let best = 0
      for (let pixel = 1; pixel <= 15; pixel++) if (apart(colourOf(r, pixel), w) < apart(colourOf(r, best), w)) best = pixel
      nearestIn.set(key, best)
    }
    return nearestIn.get(key)!
  }

  // Each square in the row that draws it nearest.
  const squares: (Square | null)[] = Array.from({ length: CELLS }, (_, cell) => {
    if (leftToMenu.has(cell)) return null
    const at = cellPixels(cell)
    let best = { row: 0, error: Infinity }
    rows.forEach((_, r) => {
      let error = 0
      for (const i of at) error += apart(colourOf(r, nearest(r, words[i])), words[i])
      if (error < best.error) best = { row: r, error }
    })
    return { row: ROWS[best.row], pixels: Uint8Array.from(at, (i) => nearest(best.row, words[i])) }
  })
  let made = shared(squares)
  const distinct = made.tiles.length - 1
  if (distinct > SNES_SETUP_SQUARES) made = shared(merged(squares, made, rows, SNES_SETUP_SQUARES))
  const used = new Set<number>()
  made.tiles.forEach((pixels, t) => {
    if (t > 0) for (const p of pixels) used.add(colourOf(ROWS.indexOf(made.rowOf[t]), p))
  })
  return { colours: own, words: made.words, tiles: made.tiles.map(tileBytes), had, kept: used.size, distinct, menuBack: leftToMenu.size }
}

// Squares whose tiles are merged until at most `most` are left: the tiles as colours, grouped round `most` centres
// by the squares they stand for, each group drawn as its average in the row that suits it.
function merged(squares: (Square | null)[], made: ReturnType<typeof shared>, rows: number[][], most: number): (Square | null)[] {
  const colourOf = (r: number, pixel: number) => (pixel === 0 ? BACKDROP : rows[r][pixel - 1])
  const count = made.tiles.length
  const weight = new Array<number>(count).fill(0)
  made.words.forEach((w) => {
    if (w) weight[w & 0x3ff]++
  })
  const rgb = made.tiles.map((pixels, t) => {
    const out = new Float64Array(192)
    const r = ROWS.indexOf(made.rowOf[t])
    for (let i = 0; i < 64; i++) levels(colourOf(r, pixels[i])).forEach((c, n) => (out[i * 3 + n] = c))
    return out
  })
  const distance = (a: Float64Array, b: Float64Array) => {
    let d = 0
    for (let i = 0; i < 192; i++) d += (a[i] - b[i]) ** 2
    return d
  }
  const ids = Array.from({ length: count - 1 }, (_, i) => i + 1)
  const first = ids.reduce((a, b) => (weight[b] > weight[a] ? b : a), ids[0])
  const centres: Float64Array[] = [rgb[first].slice()]
  const nearestD = rgb.map((v) => distance(v, centres[0]))
  while (centres.length < most) {
    let pick = ids[0]
    for (const t of ids) if (nearestD[t] * weight[t] > nearestD[pick] * weight[pick]) pick = t
    if (nearestD[pick] === 0) break
    centres.push(rgb[pick].slice())
    for (const t of ids) nearestD[t] = Math.min(nearestD[t], distance(rgb[t], centres[centres.length - 1]))
  }
  const group = new Int32Array(count)
  for (let round = 0; round < 4; round++) {
    for (const t of ids) {
      let best = 0
      let bestD = Infinity
      centres.forEach((c, n) => {
        const d = distance(rgb[t], c)
        if (d < bestD) [best, bestD] = [n, d]
      })
      group[t] = best
    }
    const sums = centres.map(() => new Float64Array(192))
    const totals = centres.map(() => 0)
    for (const t of ids) {
      for (let i = 0; i < 192; i++) sums[group[t]][i] += rgb[t][i] * weight[t]
      totals[group[t]] += weight[t]
    }
    sums.forEach((sum, n) => {
      if (totals[n]) for (let i = 0; i < 192; i++) centres[n][i] = sum[i] / totals[n]
    })
  }
  // Each centre as a square in the row that draws it nearest.
  const drawn = centres.map((centre) => {
    let best: Square & { error: number } = { row: OWN_ROW, pixels: new Uint8Array(64), error: Infinity }
    rows.forEach((_, r) => {
      const pixels = new Uint8Array(64)
      let error = 0
      for (let p = 0; p < 64; p++) {
        let pick = 0
        let pd = Infinity
        for (let pixel = 0; pixel <= 15; pixel++) {
          const [a, b, c] = levels(colourOf(r, pixel))
          const d = (a - centre[p * 3]) ** 2 + (b - centre[p * 3 + 1]) ** 2 + (c - centre[p * 3 + 2]) ** 2
          if (d < pd) [pick, pd] = [pixel, d]
        }
        pixels[p] = pick
        error += pd
      }
      if (error < best.error) best = { row: ROWS[r], pixels, error }
    })
    return best
  })
  return squares.map((square, cell) => {
    if (!square) return null
    const word = made.words[cell]
    const { row, pixels } = drawn[group[word & 0x3ff]]
    return { row, pixels: flipped(pixels, (word & 0x4000) !== 0, (word & 0x8000) !== 0) }
  })
}

// The project with the screen's picture `made`.
export function withSnesSetupPicture(project: RomProject, made: SnesSetupImage): RomProject {
  const loaders = findLoaders(project.bytes)
  const parts = loaders && readParts(project.bytes, loaders)
  if (!loaders || !parts) throw new Error("This ROM's Game Setup screen is not as the original game has it, so its background cannot be changed.")
  if (made.tiles.length > MOST_TILES) throw new Error(`The picture has ${made.tiles.length - 1} different squares; the screen has room for ${SNES_SETUP_SQUARES}.`)
  const map = parts.map.slice()
  made.words.forEach((word, cell) => put16(map, HEADER + cell * 2, word))
  const palette = parts.palette.slice()
  made.colours.forEach((w, i) => put16(palette, (i + 1) * 2, w))
  const tiles = new Uint8Array(made.tiles.length * TILE)
  made.tiles.forEach((tile, i) => tiles.set(tile, i * TILE))
  return withParts(project, loaders, { tiles, map, palette })
}

// The parts packed as the ROM packs them, in free space (the ROM grown to 2 MB where it has none), and the loaders
// pointed at them.
function withParts(project: RomProject, loaders: Loaders, parts: { tiles: Uint8Array; map: Uint8Array; palette: Uint8Array }): RomProject {
  let rom: Uint8Array = project.bytes.slice()
  // A picture NOSE4Web put in before gives its room back (the opened ROM's own never does), so importing again and
  // again does not use free space up.
  const opened = openedLoaders(project.source)
  if (opened) {
    for (const [now, was] of [
      [loaders.tiles, opened.tiles],
      [loaders.map, opened.map],
      [loaders.palette, opened.palette],
    ]) {
      if (now.offset !== was.offset) rom.fill(0xff, now.offset, now.offset + unpackAny(project.bytes, now.offset).packedSize)
    }
  }
  const pieces: [Loader, Uint8Array][] = [
    [loaders.tiles, parts.tiles],
    [loaders.map, parts.map],
    [loaders.palette, parts.palette],
  ].map(([loader, data]) => [loader as Loader, isHuffman(rom, (loader as Loader).offset) ? packHuffman(data as Uint8Array) : packLz(data as Uint8Array)])
  for (const [loader, packed] of pieces) {
    const kept = keptBanks(rom)
    let at = freeSpace(rom, packed.length, kept)
    if ((at < 0 || !sameBank(at, packed.length)) && rom.length < SNES_GROWN_SIZE) {
      rom = grownSnesRom(rom)
      at = freeSpace(rom, packed.length, kept)
    }
    if (at < 0 || !sameBank(at, packed.length)) throw new Error('There is no room left in this ROM for the picture.')
    rom.set(packed, at)
    rom[loader.at + 1] = loRomBank(at, rom[loader.at + 1])
    put16(rom, loader.at + 6, loRomAddress(at))
  }
  return { ...project, bytes: rom }
}

// The league's own picture as its three unpacked parts, for a project file; null for the original's.
export function snesSetupPictureBytes(project: RomProject): Uint8Array | null {
  const shown = readSnesSetupPicture(project)
  const loaders = findLoaders(project.bytes)
  const parts = loaders && readParts(project.bytes, loaders)
  if (!shown || shown.original || !parts) return null
  const out = new Uint8Array(6 + parts.tiles.length + parts.map.length + parts.palette.length)
  put16(out, 0, parts.tiles.length)
  put16(out, 2, parts.map.length)
  put16(out, 4, parts.palette.length)
  out.set(parts.tiles, 6)
  out.set(parts.map, 6 + parts.tiles.length)
  out.set(parts.palette, 6 + parts.tiles.length + parts.map.length)
  return out
}

export function withSnesSetupPictureBytes(project: RomProject, bytes: Uint8Array): RomProject {
  const loaders = findLoaders(project.bytes)
  if (!loaders) throw new Error("This ROM's Game Setup screen is not as the original game has it, so its background cannot be changed.")
  const [t, m, p] = [u16(bytes, 0), u16(bytes, 2), u16(bytes, 4)]
  if (6 + t + m + p !== bytes.length || t > MOST_TILES * TILE) throw new Error('The saved Game Setup background cannot be read.')
  return withParts(project, loaders, { tiles: bytes.slice(6, 6 + t), map: bytes.slice(6 + t, 6 + t + m), palette: bytes.slice(6 + t + m) })
}

// The project with the picture the ROM was opened with back: its loaders pointed where they were.
export function withOriginalSnesSetupPicture(project: RomProject): RomProject {
  const opened = openedLoaders(project.source)
  const loaders = findLoaders(project.bytes)
  if (!opened || !loaders) throw new Error('The picture this ROM was opened with cannot be found, so it cannot be put back.')
  const rom = project.bytes.slice()
  for (const [now, was] of [
    [loaders.tiles, opened.tiles],
    [loaders.map, opened.map],
    [loaders.palette, opened.palette],
  ]) {
    // The league's own copy gives its room back.
    if (now.offset !== was.offset) rom.fill(0xff, now.offset, now.offset + unpackAny(project.bytes, now.offset).packedSize)
    rom[now.at + 1] = loRomBank(was.offset, rom[now.at + 1])
    put16(rom, now.at + 6, loRomAddress(was.offset))
  }
  return { ...project, bytes: rom }
}
