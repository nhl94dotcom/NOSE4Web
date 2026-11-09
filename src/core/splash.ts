// The Genesis game's second splash screen, "High Score Productions" over
// "Mark Lesser Presents" (kingraph's forum reference). Each of the two pictures
// is drawn by code at $FEDCE and $FEDFC: a tile position, x then y, after an
// $BE byte, then movea.l #header,a2. A header is 10 bytes: the palette's offset
// from it, the size's offset, and the number of tiles, which follow it; the
// palette is 64 colours (four rows of 16), the size two words (tiles across
// and down), and the tile map follows the size, a word a tile: the palette row
// in bits 13-14, the flips in 11 and 12, the tile in the low 11 bits.
//
// A picture of the league's own takes the screen as wboy's 30-team ROMs do:
// the first picture loads one tile, both are placed at the top left, and the
// second points at a full-screen picture of 40 x 28 tiles in free room.

import { colorRgb, GENESIS_COLORS } from './color'
import type { Picture } from './graphics'
import type { RomProject } from './rom'
import { claimSpace } from './space'

const FIRST_AT = 0xfedce
const SECOND_AT = 0xfedfc
// The original game's positions and headers, to put back.
const ORIGINAL = {
  first: { x: 0x0e, y: 0x03, header: 0xf4378, tiles: 0x6f },
  second: { x: 0x10, y: 0x10, header: 0xf5338 },
}
export const SPLASH_WIDTH = 320
export const SPLASH_HEIGHT = 224
const TILES_ACROSS = SPLASH_WIDTH / 8
const TILES_DOWN = SPLASH_HEIGHT / 8
const COLOURS = 16
const ROWS = 4
// The index the preview draws the backdrop (black) with, after the colours.
const BACKDROP = 2 * ROWS * COLOURS

const u16 = (rom: Uint8Array, at: number) => (rom[at] << 8) | rom[at + 1]
const u32 = (rom: Uint8Array, at: number) => ((rom[at] << 24) | (rom[at + 1] << 16) | (rom[at + 2] << 8) | rom[at + 3]) >>> 0
const put16 = (rom: Uint8Array, at: number, value: number) => rom.set([(value >> 8) & 0xff, value & 0xff], at)
const put32 = (rom: Uint8Array, at: number, value: number) => rom.set([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff], at)

interface Placed {
  x: number
  y: number
  header: number
}

function placed(rom: Uint8Array, at: number): Placed | null {
  if (rom[at] !== 0xbe || rom[at + 4] !== 0x24 || rom[at + 5] !== 0x7c) return null
  const header = u32(rom, at + 6)
  if (header < 0x200 || header + 10 > rom.length) return null
  return { x: rom[at + 1], y: rom[at + 2], header }
}

interface Image {
  tiles: number
  palette: number[]
  width: number
  height: number
  map: number[]
}

function readImage(rom: Uint8Array, header: number): Image | null {
  const paletteAt = header + u32(rom, header)
  const sizeAt = header + u32(rom, header + 4)
  const tiles = u16(rom, header + 8)
  if (paletteAt + ROWS * COLOURS * 2 > rom.length || sizeAt + 4 > rom.length) return null
  const width = u16(rom, sizeAt)
  const height = u16(rom, sizeAt + 2)
  if (width === 0 || height === 0 || width > 64 || height > 64 || sizeAt + 4 + width * height * 2 > rom.length) return null
  const palette = Array.from({ length: ROWS * COLOURS }, (_, i) => u16(rom, paletteAt + i * 2))
  const map = Array.from({ length: width * height }, (_, i) => u16(rom, sizeAt + 4 + i * 2))
  return { tiles, palette, width, height, map }
}

export interface Splash {
  // As the screen shows it: the first picture's colours 0-63, the second's 64-127, the backdrop 128.
  picture: Picture
  palette: number[]
  // Whether it is the original game's two pictures.
  original: boolean
}

// The screen as it is in this ROM, or null where its code is not as the original game has it.
export function readSplash(rom: Uint8Array): Splash | null {
  const first = placed(rom, FIRST_AT)
  const second = placed(rom, SECOND_AT)
  if (!first || !second) return null
  const images = [readImage(rom, first.header), readImage(rom, second.header)]
  if (!images[0] || !images[1]) return null
  const picture: Picture = { width: SPLASH_WIDTH, height: SPLASH_HEIGHT, pixels: new Uint8Array(SPLASH_WIDTH * SPLASH_HEIGHT).fill(BACKDROP) }
  ;[first, second].forEach((at, n) => {
    const image = images[n]!
    // The first picture draws as many of its map's tiles as it loads; the rest stay black.
    image.map.forEach((word, cell) => {
      const tile = word & 0x7ff
      if (tile >= image.tiles) return
      const left = (at.x + (cell % image.width)) * 8
      const top = (at.y + Math.floor(cell / image.width)) * 8
      const row = (word >> 13) & 3
      const tileAt = at.header + 10 + tile * 32
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const fx = word & 0x800 ? 7 - x : x
          const fy = word & 0x1000 ? 7 - y : y
          const byte = rom[tileAt + fy * 4 + (fx >> 1)] ?? 0
          const colour = fx & 1 ? byte & 15 : byte >> 4
          const px = left + x
          const py = top + y
          if (colour === 0 || px >= SPLASH_WIDTH || py >= SPLASH_HEIGHT) continue
          picture.pixels[py * SPLASH_WIDTH + px] = n * ROWS * COLOURS + row * COLOURS + colour
        }
      }
    })
  })
  const original =
    first.x === ORIGINAL.first.x && first.y === ORIGINAL.first.y && first.header === ORIGINAL.first.header && images[0].tiles === ORIGINAL.first.tiles &&
    second.x === ORIGINAL.second.x && second.y === ORIGINAL.second.y && second.header === ORIGINAL.second.header
  return { picture, palette: [...images[0].palette, ...images[1].palette, 0], original }
}

// ----------------------------------------------------------------- making

type Rgb = [number, number, number]
const toLevels = ([r, g, b]: Rgb): Rgb => [Math.round((r * 7) / 255), Math.round((g * 7) / 255), Math.round((b * 7) / 255)]
const levelKey = ([r, g, b]: Rgb) => (r << 6) | (g << 3) | b
const keyLevels = (key: number): Rgb => [(key >> 6) & 7, (key >> 3) & 7, key & 7]
const word = ([r, g, b]: Rgb) => GENESIS_COLORS.word([r, g, b])
const far = (a: Rgb, b: Rgb) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
const BLACK = 0

// The image fitted inside the screen, centred, on black, in the console's levels (one key a pixel).
function fitted(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): Uint16Array {
  const scale = Math.min(SPLASH_WIDTH / width, SPLASH_HEIGHT / height)
  const w = Math.round(width * scale)
  const h = Math.round(height * scale)
  const left = Math.floor((SPLASH_WIDTH - w) / 2)
  const top = Math.floor((SPLASH_HEIGHT - h) / 2)
  const keys = new Uint16Array(SPLASH_WIDTH * SPLASH_HEIGHT)
  const SAMPLES = 3
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // A few samples a pixel, so a shrunk picture is averaged rather than speckled.
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
      const rgb = sum.map((v) => v / (SAMPLES * SAMPLES)) as Rgb
      keys[(top + y) * SPLASH_WIDTH + left + x] = levelKey(toLevels(rgb))
    }
  }
  return keys
}

// Up to `most` colours standing for the given ones, by median cut.
function medianCut(counts: Map<number, number>, most: number): number[] {
  type Box = { keys: number[] }
  const boxes: Box[] = [{ keys: [...counts.keys()] }]
  const spread = (box: Box, c: number) => {
    const values = box.keys.map((k) => keyLevels(k)[c])
    return Math.max(...values) - Math.min(...values)
  }
  while (boxes.length < most) {
    let best = -1
    let channel = 0
    let widest = 0
    boxes.forEach((box, i) => {
      if (box.keys.length < 2) return
      for (let c = 0; c < 3; c++) {
        const s = spread(box, c)
        if (s > widest) [widest, best, channel] = [s, i, c]
      }
    })
    if (best < 0) break
    const box = boxes[best]
    box.keys.sort((a, b) => keyLevels(a)[channel] - keyLevels(b)[channel])
    const total = box.keys.reduce((sum, k) => sum + counts.get(k)!, 0)
    let half = 0
    let cut = 1
    for (; cut < box.keys.length - 1; cut++) {
      half += counts.get(box.keys[cut - 1])!
      if (half * 2 >= total) break
    }
    boxes.splice(best, 1, { keys: box.keys.slice(0, cut) }, { keys: box.keys.slice(cut) })
  }
  // Each box's colour: its weighted average, rounded to a level.
  return boxes.map((box) => {
    const weight = box.keys.reduce((sum, k) => sum + counts.get(k)!, 0)
    const avg = [0, 1, 2].map((c) => Math.round(box.keys.reduce((sum, k) => sum + keyLevels(k)[c] * counts.get(k)!, 0) / weight)) as Rgb
    return levelKey(avg)
  })
}

const nearest = (key: number, among: number[]) => {
  const levels = keyLevels(key)
  let best = 0
  among.forEach((other, i) => {
    if (far(keyLevels(other), levels) < far(keyLevels(among[best]), levels)) best = i
  })
  return best
}

export interface SplashImage {
  // Four rows of 16 colours, each row's first black, the backdrop.
  palette: number[]
  // A word a tile, 40 x 28, and the tiles they name, 32 bytes each.
  map: number[]
  tiles: Uint8Array[]
  // How many colours the picture had in the console's levels, and how many it was given.
  colours: number
  kept: number
}

// The picture made for the screen: fitted inside it on black, its colours cut
// to four rows of 15, each 8 x 8 tile drawn in the row that suits it best, and
// tiles that come out the same kept once.
export function splashFromImage(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): SplashImage {
  const keys = fitted(rgba, width, height)
  const counts = new Map<number, number>()
  for (const key of keys) if (key !== BLACK) counts.set(key, (counts.get(key) ?? 0) + 1)
  const colours = counts.size
  // At most 60 colours for the picture, so that four rows of 15 can hold them.
  const reduced = counts.size > ROWS * (COLOURS - 1) ? medianCut(counts, ROWS * (COLOURS - 1)) : [...counts.keys()]
  const reduce = new Map<number, number>()
  for (const key of counts.keys()) reduce.set(key, reduced[nearest(key, reduced)])

  // Each tile's colours and how much of each.
  const cells = TILES_ACROSS * TILES_DOWN
  const cellCounts: Map<number, number>[] = Array.from({ length: cells }, () => new Map())
  keys.forEach((key, i) => {
    if (key === BLACK) return
    const cell = Math.floor(i / SPLASH_WIDTH / 8) * TILES_ACROSS + Math.floor((i % SPLASH_WIDTH) / 8)
    const k = reduce.get(key)!
    cellCounts[cell].set(k, (cellCounts[cell].get(k) ?? 0) + 1)
  })

  // Rows of up to 15 colours: the busiest tiles first, each into the row it adds fewest colours to.
  const rows: Set<number>[] = Array.from({ length: ROWS }, () => new Set())
  const order = cellCounts.map((_, i) => i).sort((a, b) => cellCounts[b].size - cellCounts[a].size)
  for (const cell of order) {
    const wanted = [...cellCounts[cell].keys()]
    if (wanted.length === 0) continue
    let best = -1
    let added = Infinity
    rows.forEach((row, r) => {
      const extra = wanted.filter((k) => !row.has(k)).length
      if (row.size + extra <= COLOURS - 1 && extra < added) [best, added] = [r, extra]
    })
    if (best >= 0) for (const k of wanted) rows[best].add(k)
    else {
      // No row has room for them all: fill the emptiest with the tile's commonest colours.
      const emptiest = rows.reduce((a, row, r) => (row.size < rows[a].size ? r : a), 0)
      for (const [k] of [...cellCounts[cell]].sort((a, b) => b[1] - a[1])) if (rows[emptiest].size < COLOURS - 1) rows[emptiest].add(k)
    }
  }
  const rowKeys = rows.map((row) => [...row])
  const palette = rowKeys.flatMap((row) => [0, ...Array.from({ length: COLOURS - 1 }, (_, i) => (i < row.length ? word(keyLevels(row[i])) : 0))])

  // Each tile in the row that draws it nearest.
  const tiles: Uint8Array[] = []
  const known = new Map<string, number>()
  const map: number[] = []
  for (let cell = 0; cell < cells; cell++) {
    const cx = (cell % TILES_ACROSS) * 8
    const cy = Math.floor(cell / TILES_ACROSS) * 8
    let bestRow = 0
    let bestError = Infinity
    rowKeys.forEach((row, r) => {
      if (row.length === 0 && cellCounts[cell].size > 0) return
      let error = 0
      for (const [k, n] of cellCounts[cell]) error += row.length ? far(keyLevels(k), keyLevels(row[nearest(k, row)])) * n : 0
      if (error < bestError) [bestRow, bestError] = [r, error]
    })
    const row = rowKeys[bestRow]
    const tile = new Uint8Array(32)
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const key = keys[(cy + y) * SPLASH_WIDTH + cx + x]
        const colour = key === BLACK || row.length === 0 ? 0 : nearest(reduce.get(key)!, row) + 1
        tile[y * 4 + (x >> 1)] |= x & 1 ? colour : colour << 4
      }
    }
    const text = tile.join(',')
    let index = known.get(text)
    if (index === undefined) {
      index = tiles.push(tile) - 1
      known.set(text, index)
    }
    map.push((bestRow << 13) | index)
  }
  return { palette, map, tiles, colours, kept: rowKeys.reduce((n, row) => n + row.length, 0) }
}

// The bytes of a full-screen picture: header, tiles, palette, size and map.
function imageBytes(image: SplashImage): Uint8Array {
  const tileBytes = image.tiles.length * 32
  const paletteAt = 10 + tileBytes
  const sizeAt = paletteAt + ROWS * COLOURS * 2
  const bytes = new Uint8Array(sizeAt + 4 + image.map.length * 2)
  put32(bytes, 0, paletteAt)
  put32(bytes, 4, sizeAt)
  put16(bytes, 8, image.tiles.length)
  image.tiles.forEach((tile, i) => bytes.set(tile, 10 + i * 32))
  image.palette.forEach((colour, i) => put16(bytes, paletteAt + i * 2, colour))
  put16(bytes, sizeAt, TILES_ACROSS)
  put16(bytes, sizeAt + 2, TILES_DOWN)
  image.map.forEach((entry, i) => put16(bytes, sizeAt + 4 + i * 2, entry))
  return bytes
}

const imageLength = (rom: Uint8Array, header: number) => {
  const image = readImage(rom, header)
  return image ? u32(rom, header + 4) + 4 + image.width * image.height * 2 : 0
}

// The project with the screen showing `image`: in the room of a picture of
// the league's own already there if it fits, else in free room at the end.
export function withSplashImage(project: RomProject, image: SplashImage): RomProject {
  const rom = project.bytes
  const first = placed(rom, FIRST_AT)
  const second = placed(rom, SECOND_AT)
  if (!first || !second) throw new Error("This ROM's splash screen code is not as the original game has it, so it cannot be changed.")
  const bytes = imageBytes(image)
  let next: Uint8Array = rom.slice()
  let at: number
  if (second.header !== ORIGINAL.second.header && imageLength(rom, second.header) >= bytes.length) at = second.header
  else {
    const claimed = claimSpace(next, bytes.length)
    if (!claimed) throw new Error('There is no room left in this ROM for the picture.')
    next = claimed.rom
    at = claimed.at
  }
  next.set(bytes, at)
  // The first picture loads one tile; both start at the top left.
  put16(next, first.header + 8, 1)
  next.set([0, 0], FIRST_AT + 1)
  next.set([0, 0], SECOND_AT + 1)
  put32(next, SECOND_AT + 6, at)
  return { ...project, bytes: next }
}

// The project with the original game's two pictures back, where they are still in the ROM.
export function withOriginalSplash(project: RomProject): RomProject {
  const rom = project.bytes
  const first = placed(rom, FIRST_AT)
  if (!first || first.header !== ORIGINAL.first.header || !readImage(rom, ORIGINAL.second.header)) {
    throw new Error("The original game's splash screen pictures are no longer in this ROM, so they cannot be put back.")
  }
  const next = rom.slice()
  put16(next, ORIGINAL.first.header + 8, ORIGINAL.first.tiles)
  next.set([ORIGINAL.first.x, ORIGINAL.first.y], FIRST_AT + 1)
  next.set([ORIGINAL.second.x, ORIGINAL.second.y], SECOND_AT + 1)
  put32(next, SECOND_AT + 6, ORIGINAL.second.header)
  return { ...project, bytes: next }
}

// The colours of a picture's palette as the preview draws them.
export const splashColour = (palette: number[], index: number) => colorRgb(palette[index])
