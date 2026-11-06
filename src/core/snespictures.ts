import { readU16LE, writeU16LE } from './bytes'
import { colorRgb, nearestColorWord, SNES_COLORS } from './color'
import type { Picture } from './graphics'
import { HuffmanError, isHuffman, packHuffman, unpackHuffman } from './huffman'
import { findCode, loRomAddress, loRomBank, loRomOffset } from './snes'

// The SNES game's team pictures: each team's logo, shown on the matchup,
// setup and player card screens, and its centre ice logo. What the editor
// knows of them comes from the SNES disassembly NHL94SNES
// (github.com/abdulahmad/NHL94SNES) and the TileViewer of NHL94SNESVault
// (github.com/Mhopkinsinc/NHL94SNESVault).
//
//   The logos are one set of sprite frames, a frame a team in team order,
//   then the NHL's and the NHLPA's, packed
//   together (see huffman.ts). The game unpacks the set into a buffer that
//   holds the original's size and no more. A frame is drawn from 16 x 16 and
//   8 x 8 pieces in the team's own 16 colours, colour 0 see-through, from a
//   table of a long address for each team.
//   A centre ice logo is a map of 8 x 8 tiles, its own packed tiles (four
//   bits a pixel) and the map, from a table of two long addresses for each
//   team. It is drawn in colours of the rink.
//
// ROMs rebuilt with more teams keep them otherwise, which the editor does not
// read yet.

export interface SnesPictureEdits {
  logos: Record<number, { picture: Picture; palette: number[] }>
  centreIce: Record<number, Picture>
}

export const NO_SNES_PICTURE_EDITS: SnesPictureEdits = { logos: {}, centreIce: {} }

// The code that loads each table; see findCode.
const LOGO_SET_LOADER = 'a9(..)00850ea9(....)850ca97f008512a90078851022'
const LOGO_PALETTE_LOADER = '0a0aaabf....9c850ebf(....)(..)850ca0..00a2100022'
const CENTRE_ICE_LOADER = 'ad981c0a0a0aaabf(....)(..)850cbf....9c850ea97f008512a900008510'
const RINK_PALETTE_LOADER = 'a2fe00bf(....)(..)9f'

const COLOURS = 16
const FRAME_HEADER = 0x16
const PIECE = 7
const TILE = 32
const BLOCK = 16
const MOST_TILES = 36
// A piece's attribute byte: drawn mirrored left to right, and upside down.
const FLIP_H = 0x40
const FLIP_V = 0x80
// A logo is drawn in a box of 6 x 6 tiles. Exported logos are pictures of
// this size, with the logo's own (0, 0) this far in: every original logo
// fits, with room around it.
export const LOGO_SIZE = 56
const LOGO_ORIGIN = 4
// Video memory takes the first part of a frame's tiles from tile 0, in rows
// of 16, and the rest from the row after; a 16 x 16 piece at tile t also
// uses t + 1, t + 16 and t + 17. See snesSpriteFrame.
const VRAM_ROW = 16

interface Tables {
  logoSet: number
  logoPalettes: number
  centreIce: number
  rinkPalette: number
}

const long = (rom: Uint8Array, at: number) => loRomOffset(rom[at + 2], readU16LE(rom, at))

function findTables(rom: Uint8Array): Tables | null {
  const set = findCode(rom, LOGO_SET_LOADER)
  const palettes = findCode(rom, LOGO_PALETTE_LOADER)
  const ice = findCode(rom, CENTRE_ICE_LOADER)
  const rink = findCode(rom, RINK_PALETTE_LOADER)
  if (!set || !palettes || !ice || !rink) return null
  const at = (bank: number, address: number) => (address >= 0x8000 ? loRomOffset(bank, address) : -1)
  const tables = {
    logoSet: at(set.groups[0], set.groups[1]),
    logoPalettes: at(palettes.groups[1], palettes.groups[0]),
    centreIce: at(ice.groups[1], ice.groups[0]),
    rinkPalette: at(rink.groups[1], rink.groups[0]),
  }
  return Object.values(tables).every((offset) => offset >= 0 && offset < rom.length) ? tables : null
}

// What a ROM's pictures are, read once for each ROM.
interface Contents {
  tables: Tables
  set: Uint8Array
  // Where each team's palette is, and each team's centre ice tiles and map.
  palettes: number[]
  iceTiles: number[]
  iceMaps: number[]
}

// Read once for each ROM the project holds. A ROM being written to is read
// afresh, and not remembered, as what it holds is about to change.
const contents = new WeakMap<Uint8Array, Contents | null>()

function read(rom: Uint8Array, teamCount: number, remember = true): Contents | null {
  if (remember && contents.has(rom)) return contents.get(rom)!
  let found: Contents | null = null
  try {
    const tables = findTables(rom)
    if (tables && isHuffman(rom, tables.logoSet)) {
      const set = unpackHuffman(rom, tables.logoSet).data
      const palettes = Array.from({ length: teamCount }, (_, t) => long(rom, tables.logoPalettes + t * 4))
      const iceTiles = Array.from({ length: teamCount }, (_, t) => long(rom, tables.centreIce + t * 8))
      const iceMaps = Array.from({ length: teamCount }, (_, t) => long(rom, tables.centreIce + t * 8 + 4))
      const ok =
        frameCount(set) >= teamCount &&
        palettes.every((p) => p >= 0 && p + COLOURS * 2 <= rom.length) &&
        iceTiles.every((p) => isHuffman(rom, p)) &&
        iceMaps.every((p) => p >= 0 && p + 6 <= rom.length)
      if (ok) found = { tables, set, palettes, iceTiles, iceMaps }
    }
  } catch (e) {
    if (!(e instanceof HuffmanError)) throw e
  }
  if (remember) contents.set(rom, found)
  return found
}

export function snesPicturesSupported(rom: Uint8Array, teamCount: number): boolean {
  return read(rom, teamCount) !== null
}

function need(rom: Uint8Array, teamCount: number, remember = true): Contents {
  const found = read(rom, teamCount, remember)
  if (!found) throw new Error('This ROM keeps its pictures in a way the editor cannot read.')
  return found
}

// ------------------------------------------------------------------ logos

const frameCount = (set: Uint8Array) => readU16LE(set, 0) / 4
const frameAt = (set: Uint8Array, frame: number) => readU16LE(set, frame * 4) | (readU16LE(set, frame * 4 + 2) << 16)
const signed = (data: Uint8Array, at: number) => (readU16LE(data, at) ^ 0x8000) - 0x8000

function tilePixel(data: Uint8Array, tile: number, x: number, y: number): number {
  const bit = 7 - x
  const low = tile + y * 2
  const high = tile + 16 + y * 2
  return ((data[low] >> bit) & 1) | (((data[low + 1] >> bit) & 1) << 1) | (((data[high] >> bit) & 1) << 2) | (((data[high + 1] >> bit) & 1) << 3)
}

// Frame `frame` of the set as a picture of LOGO_SIZE, placed as the game places it.
function drawLogo(set: Uint8Array, frame: number): Picture {
  const picture = { width: LOGO_SIZE, height: LOGO_SIZE, pixels: new Uint8Array(LOGO_SIZE * LOGO_SIZE) }
  const p = frameAt(set, frame)
  const count = set[p]
  const firstPart = readU16LE(set, p + 0x0c) / TILE
  const secondPartAt = Math.max(1, Math.ceil(firstPart / VRAM_ROW)) * VRAM_ROW
  const tiles = p + readU16LE(set, p + 0x10)
  for (let s = 0; s < count; s++) {
    const q = p + FRAME_HEADER + s * PIECE
    const [left, top, first, flags] = [signed(set, q), signed(set, q + 2), set[q + 4], set[q + 5]]
    const size = set[q + 6] === 0xff ? BLOCK : 8
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const fx = flags & 0x40 ? size - 1 - x : x
        const fy = flags & 0x80 ? size - 1 - y : y
        const place = first + (fx >> 3) + (fy >> 3) * VRAM_ROW
        const tile = tiles + (place < secondPartAt ? place : firstPart + place - secondPartAt) * TILE
        const colour = tile + TILE <= set.length ? tilePixel(set, tile, fx & 7, fy & 7) : 0
        const [px, py] = [left + x + LOGO_ORIGIN, top + y + LOGO_ORIGIN]
        if (colour && px >= 0 && py >= 0 && px < LOGO_SIZE && py < LOGO_SIZE) picture.pixels[py * LOGO_SIZE + px] = colour
      }
    }
  }
  return picture
}

const readColours = (rom: Uint8Array, at: number) => Array.from({ length: COLOURS }, (_, i) => readU16LE(rom, at + i * 2))

// A team's logo and its 16 colours, as the user has it.
export function snesLogo(rom: Uint8Array, teamCount: number, edits: SnesPictureEdits, team: number): { picture: Picture; palette: number[] } {
  const edited = edits.logos[team]
  if (edited) return edited
  const c = need(rom, teamCount)
  return { picture: drawLogo(c.set, team), palette: readColours(rom, c.palettes[team]) }
}

// The other teams whose logo colours are kept in the same place as `team`'s.
export function snesLogoColoursSharedWith(rom: Uint8Array, teamCount: number, team: number): number[] {
  const c = need(rom, teamCount)
  return c.palettes.flatMap((p, other) => (other !== team && p === c.palettes[team] ? [other] : []))
}

// A frame's bytes for a logo, drawn from 8 x 8 pieces over where it is not
// see-through, and 16 x 16 pieces where four of those are all filled, which
// take fewer bytes and fewer of the console's sprites. A piece the same as
// one already placed, or its mirror image either way, is drawn from that
// one's tiles, as the original logos do. The grid is placed where the frame
// comes out smallest. It may use at most 36 tiles, as many as the largest of
// the original logos. `like` is the frame it replaces, whose last two header
// words, which the editor does not know the use of, are kept.
export function logoFrame(picture: Picture, like: Uint8Array): Uint8Array {
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < picture.width && y < picture.height ? picture.pixels[y * picture.width + x] : 0)
  const opaque: [number, number][] = []
  for (let y = 0; y < picture.height; y++) for (let x = 0; x < picture.width; x++) if (at(x, y)) opaque.push([x, y])
  if (opaque.length === 0) throw new Error('The logo is empty: every pixel of it is see-through.')
  const xs = opaque.map(([x]) => x)
  const ys = opaque.map(([, y]) => y)
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]

  let best: Layout | null = null
  for (let dy = 0; dy < 8; dy++) {
    for (let dx = 0; dx < 8; dx++) {
      const layout = layOut(at, opaque, minX - dx, minY - dy)
      if (layout && (!best || layout.bytes < best.bytes)) best = layout
    }
  }
  if (!best) throw new Error('The logo could not be laid out for the game.')
  const { pieces, first, second } = best
  const tiles = [...first, ...second]
  if (tiles.length > MOST_TILES) {
    throw new Error(`The logo needs ${tiles.length} different tiles of 8 by 8 pixels; it can have at most ${MOST_TILES}. Leave more of it see-through.`)
  }

  const frame = new Uint8Array(best.bytes)
  frame[0] = pieces.length
  frame[1] = 0x80
  writeU16LE(frame, 2, tiles.length)
  ;[minX, maxX, minY, maxY].forEach((value, i) => writeU16LE(frame, 4 + i * 2, (value - LOGO_ORIGIN) & 0xffff))
  writeU16LE(frame, 0x0c, first.length * TILE)
  writeU16LE(frame, 0x0e, second.length * TILE)
  writeU16LE(frame, 0x10, FRAME_HEADER + pieces.length * PIECE)
  frame.set(like.subarray(0x12, FRAME_HEADER), 0x12)
  pieces.forEach((piece, j) => {
    const q = FRAME_HEADER + j * PIECE
    writeU16LE(frame, q, (piece.x - LOGO_ORIGIN) & 0xffff)
    writeU16LE(frame, q + 2, (piece.y - LOGO_ORIGIN) & 0xffff)
    frame[q + 4] = piece.place
    frame[q + 5] = piece.flip
    frame[q + 6] = piece.big ? 0xff : 0
  })
  tiles.forEach((tile, i) => frame.set(tile, FRAME_HEADER + pieces.length * PIECE + i * TILE))
  return frame
}

interface Layout {
  pieces: { x: number; y: number; place: number; flip: number; big: boolean }[]
  first: Uint8Array[]
  second: Uint8Array[]
  bytes: number
}

// The pieces and tiles of a logo on a grid of 8 x 8 cells from (left, top).
function layOut(at: (x: number, y: number) => number, opaque: [number, number][], left: number, top: number): Layout | null {
  const filled = new Set<string>()
  for (const [x, y] of opaque) filled.add(`${Math.floor((x - left) / 8)},${Math.floor((y - top) / 8)}`)
  const cells = [...filled].map((key) => key.split(',').map(Number) as [number, number]).sort((a, b) => a[1] - b[1] || a[0] - b[0])

  // The colours of a square of cells from cell (cx, cy), `size` cells across, drawn with `flip`.
  const colours = (cx: number, cy: number, size: number, flip: number) => {
    const span = size * 8
    return Array.from({ length: span * span }, (_, i) => {
      const [x, y] = [flip & FLIP_H ? span - 1 - (i % span) : i % span, flip & FLIP_V ? span - 1 - Math.floor(i / span) : Math.floor(i / span)]
      return at(left + cx * 8 + x, top + cy * 8 + y)
    })
  }
  const tileBytes = (pixels: number[], span: number, ox: number, oy: number) => {
    const tile = new Uint8Array(TILE)
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const colour = pixels[(oy + y) * span + ox + x]
        const bit = 0x80 >> x
        if (colour & 1) tile[y * 2] |= bit
        if (colour & 2) tile[y * 2 + 1] |= bit
        if (colour & 4) tile[16 + y * 2] |= bit
        if (colour & 8) tile[16 + y * 2 + 1] |= bit
      }
    }
    return tile
  }
  const flips = [0, FLIP_H, FLIP_V, FLIP_H | FLIP_V]

  // Squares of four filled cells, none overlapping.
  const taken = new Set<string>()
  const blocks: [number, number][] = []
  for (const [cx, cy] of cells) {
    const square = [0, 1, 2, 3].map((q) => `${cx + (q & 1)},${cy + (q >> 1)}`)
    if (square.every((key) => filled.has(key) && !taken.has(key))) {
      blocks.push([cx, cy])
      square.forEach((key) => taken.add(key))
    }
  }
  const used = new Map<number, Uint8Array>()
  const pieces: Layout['pieces'] = []
  const bigAt = new Map<string, number>()
  const smallAt = new Map<string, number>()
  let distinctBlocks = 0
  const singles: [number, number][] = cells.filter(([cx, cy]) => !taken.has(`${cx},${cy}`))
  for (const [cx, cy] of blocks) {
    const flip = flips.find((f) => bigAt.has(colours(cx, cy, 2, f).join()))
    if (flip !== undefined) {
      pieces.push({ x: left + cx * 8, y: top + cy * 8, place: bigAt.get(colours(cx, cy, 2, flip).join())!, flip, big: true })
      continue
    }
    if (distinctBlocks === 8) {
      // No room in the first two rows for another: its cells go as single tiles.
      for (let q = 0; q < 4; q++) singles.push([cx + (q & 1), cy + (q >> 1)])
      continue
    }
    const place = 2 * distinctBlocks++
    const pixels = colours(cx, cy, 2, 0)
    bigAt.set(pixels.join(), place)
    for (let q = 0; q < 4; q++) {
      const where = place + (q & 1) + (q >> 1) * VRAM_ROW
      used.set(where, tileBytes(pixels, 16, (q & 1) * 8, (q >> 1) * 8))
      const quarter = colours(cx + (q & 1), cy + (q >> 1), 1, 0).join()
      if (!smallAt.has(quarter)) smallAt.set(quarter, where)
    }
    pieces.push({ x: left + cx * 8, y: top + cy * 8, place, flip: 0, big: true })
  }
  let next = 0
  for (const [cx, cy] of singles) {
    const flip = flips.find((f) => smallAt.has(colours(cx, cy, 1, f).join()))
    if (flip !== undefined) {
      pieces.push({ x: left + cx * 8, y: top + cy * 8, place: smallAt.get(colours(cx, cy, 1, flip).join())!, flip, big: false })
      continue
    }
    while (used.has(next)) next++
    const pixels = colours(cx, cy, 1, 0)
    used.set(next, tileBytes(pixels, 8, 0, 0))
    smallAt.set(pixels.join(), next)
    pieces.push({ x: left + cx * 8, y: top + cy * 8, place: next, flip: 0, big: false })
  }

  // The places from 0 that follow on are the first part; any others, which
  // can only be blocks' bottom halves, the second, from the next row.
  const places = [...used.keys()].sort((a, b) => a - b)
  let firstPart = 0
  while (used.has(firstPart)) firstPart++
  const secondAt = Math.max(1, Math.ceil(firstPart / VRAM_ROW)) * VRAM_ROW
  const second = places.filter((place) => place >= firstPart)
  if (second.some((place, i) => place !== secondAt + i)) return null
  return {
    pieces,
    first: places.filter((place) => place < firstPart).map((place) => used.get(place)!),
    second: second.map((place) => used.get(place)!),
    bytes: FRAME_HEADER + pieces.length * PIECE + places.length * TILE,
  }
}

const framesOf = (set: Uint8Array): Uint8Array[] =>
  Array.from({ length: frameCount(set) }, (_, f) => set.slice(frameAt(set, f), f + 1 < frameCount(set) ? frameAt(set, f + 1) : set.length))

// A set from its frames.
function joinSet(frames: Uint8Array[]): Uint8Array {
  const count = frames.length
  const size = count * 4 + frames.reduce((sum, frame) => sum + frame.length, 0)
  const out = new Uint8Array(size)
  let at = count * 4
  frames.forEach((frame, f) => {
    writeU16LE(out, f * 4, at & 0xffff)
    writeU16LE(out, f * 4 + 2, at >> 16)
    out.set(frame, at)
    at += frame.length
  })
  return out
}

// A logo and its colours from an image: the image's most used colours, up to
// 15, become the logo's, and the rest are matched to the nearest. Returns how
// many colours the image had, so the caller can say when some were merged.
export function snesLogoFromImage(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): { picture: Picture; palette: number[]; colorsFound: number } {
  if (width !== LOGO_SIZE || height !== LOGO_SIZE) {
    throw new Error(`A logo is imported as a picture of ${LOGO_SIZE} by ${LOGO_SIZE}, as the editor exports it; this one is ${width} by ${height}.`)
  }
  const counts = new Map<number, number>()
  for (let i = 0; i < width * height; i++) {
    if (rgba[i * 4 + 3] < 128) continue
    const word = nearestColorWord('#' + [0, 1, 2].map((c) => rgba[i * 4 + c].toString(16).padStart(2, '0')).join(''), SNES_COLORS)
    counts.set(word, (counts.get(word) ?? 0) + 1)
  }
  const chosen = [...counts].sort((a, b) => b[1] - a[1]).slice(0, COLOURS - 1).map(([word]) => word)
  const palette = [0, ...chosen]
  while (palette.length < COLOURS) palette.push(0)
  const rgb = chosen.map((word) => colorRgb(word, SNES_COLORS))
  const pixels = new Uint8Array(width * height)
  for (let i = 0; i < pixels.length; i++) {
    if (rgba[i * 4 + 3] < 128) continue
    let best = 0
    let bestDistance = Infinity
    rgb.forEach((c, k) => {
      const d = (c[0] - rgba[i * 4]) ** 2 + (c[1] - rgba[i * 4 + 1]) ** 2 + (c[2] - rgba[i * 4 + 2]) ** 2
      if (d < bestDistance) [best, bestDistance] = [k, d]
    })
    pixels[i] = best + 1
  }
  return { picture: { width, height, pixels }, palette, colorsFound: counts.size }
}

// ------------------------------------------------------------- centre ice

// A centre ice logo's tiles keep a pixel to a nibble, its colour number, the
// left pixel in the high nibble. Each tile of its map is drawn in one of the
// rink's eight rows of colours, which every team shares; a picture of it
// holds the row and the colour of each pixel as row * 16 + colour, with
// colour 0, see-through, as 0 whatever its row. As NHL94SNESVault's
// TileViewer reads them.
const MAP_HEADER = 6
const TILE_NUMBER = 0x3ff
const PALETTE_SHIFT = 10
const PALETTE_BITS = 7 << PALETTE_SHIFT
const ROWS = 8

interface IceMap {
  width: number
  height: number
  words: number[]
}

function readIceMap(rom: Uint8Array, at: number): IceMap {
  const [width, height] = [readU16LE(rom, at), readU16LE(rom, at + 2)]
  return { width, height, words: Array.from({ length: width * height }, (_, i) => readU16LE(rom, at + MAP_HEADER + i * 2)) }
}

// The rink's colours, all eight rows.
const iceColours = (rom: Uint8Array, c: Contents) => Array.from({ length: ROWS * COLOURS }, (_, i) => readU16LE(rom, c.tables.rinkPalette + i * 2))

export function snesCentreIce(rom: Uint8Array, teamCount: number, edits: SnesPictureEdits, team: number): { picture: Picture; palette: number[] } {
  const c = need(rom, teamCount)
  return { picture: edits.centreIce[team] ?? drawCentreIce(rom, c, team), palette: iceColours(rom, c) }
}

function drawCentreIce(rom: Uint8Array, c: Contents, team: number): Picture {
  const map = readIceMap(rom, c.iceMaps[team])
  const tiles = unpackHuffman(rom, c.iceTiles[team]).data
  const picture = { width: map.width * 8, height: map.height * 8, pixels: new Uint8Array(map.width * 8 * map.height * 8) }
  map.words.forEach((word, cell) => {
    const tile = (word & TILE_NUMBER) * TILE
    const row = (word & PALETTE_BITS) >> PALETTE_SHIFT
    const [cx, cy] = [(cell % map.width) * 8, Math.floor(cell / map.width) * 8]
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const fx = word & 0x4000 ? 7 - x : x
        const fy = word & 0x8000 ? 7 - y : y
        const byte = tiles[tile + fy * 4 + (fx >> 1)] ?? 0
        const colour = fx & 1 ? byte & 15 : byte >> 4
        picture.pixels[(cy + y) * picture.width + cx + x] = colour ? row * COLOURS + colour : 0
      }
    }
  })
  return picture
}

const samePixels = (a: Picture, b: Picture) => a.width === b.width && a.height === b.height && a.pixels.every((pixel, i) => pixel === b.pixels[i])

// The other teams whose centre ice logo is the same one as `team`'s.
export function snesCentreIceSharedWith(rom: Uint8Array, teamCount: number, team: number): number[] {
  const c = need(rom, teamCount)
  return c.iceTiles.flatMap((p, other) => (other !== team && p === c.iceTiles[team] ? [other] : []))
}

// Tiles and map words for a centre ice logo: tile 0 blank, as in the game's,
// and each other different tile once, in whatever row of colours it uses.
// The map's other bits are kept as the game's logo has them.
function iceTilesFor(picture: Picture, map: IceMap): { tiles: Uint8Array; words: number[] } {
  const flags = (map.words.find((w) => w !== 0) ?? 0) & ~(TILE_NUMBER | PALETTE_BITS | 0xc000)
  const tiles: string[] = ['0'.repeat(64)]
  const words = map.words.map((_, cell) => {
    const [cx, cy] = [(cell % map.width) * 8, Math.floor(cell / map.width) * 8]
    let text = ''
    let row = 0
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const value = picture.pixels[(cy + y) * picture.width + cx + x]
        if (value) row = Math.floor(value / COLOURS)
        text += (value % COLOURS).toString(16)
      }
    }
    if (text === tiles[0]) return 0
    let index = tiles.indexOf(text)
    if (index < 0) index = tiles.push(text) - 1
    return index | (row << PALETTE_SHIFT) | flags
  })
  const bytes = new Uint8Array(tiles.length * TILE)
  tiles.forEach((text, t) => {
    for (let i = 0; i < TILE; i++) bytes[t * TILE + i] = parseInt(text.slice(i * 2, i * 2 + 2), 16)
  })
  return { tiles: bytes, words }
}

// A centre ice logo from an image. Each 8 x 8 tile is drawn in the row of the
// rink's colours that matches it best, and its pixels in the nearest of that
// row's colours.
export function snesCentreIceFromImage(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  like: { picture: Picture; palette: number[] },
): Picture {
  if (width !== like.picture.width || height !== like.picture.height) {
    throw new Error(`The centre ice logo is imported as a picture of ${like.picture.width} by ${like.picture.height}; this one is ${width} by ${height}.`)
  }
  const rgb = like.palette.map((word) => colorRgb(word, SNES_COLORS))
  const distance = (k: number, i: number) => (rgb[k][0] - rgba[i * 4]) ** 2 + (rgb[k][1] - rgba[i * 4 + 1]) ** 2 + (rgb[k][2] - rgba[i * 4 + 2]) ** 2
  const nearest = (row: number, i: number) => {
    let best = row * COLOURS + 1
    for (let k = row * COLOURS + 2; k < (row + 1) * COLOURS; k++) if (distance(k, i) < distance(best, i)) best = k
    return best
  }
  const pixels = new Uint8Array(width * height)
  for (let top = 0; top < height; top += 8) {
    for (let left = 0; left < width; left += 8) {
      const cell: number[] = []
      for (let y = top; y < top + 8; y++) for (let x = left; x < left + 8; x++) if (rgba[(y * width + x) * 4 + 3] >= 128) cell.push(y * width + x)
      if (cell.length === 0) continue
      let bestRow = 0
      let bestTotal = Infinity
      for (let row = 0; row < ROWS; row++) {
        const total = cell.reduce((sum, i) => sum + distance(nearest(row, i), i), 0)
        if (total < bestTotal) [bestRow, bestTotal] = [row, total]
      }
      for (const i of cell) pixels[i] = nearest(bestRow, i)
    }
  }
  return { width, height, pixels }
}

// ---------------------------------------------------------------- writing

export class SnesPictureRoomError extends Error {}

// The room a packed block has: its own bytes and any unused ($FF) bytes after it.
function roomAt(rom: Uint8Array, at: number, size: number): number {
  let end = at + size
  while (end < rom.length && rom[end] === 0xff && loRomAddress(end) !== 0x8000) end++
  return end - at
}

function sameBank(at: number, size: number): boolean {
  return Math.floor(at / 0x8000) === Math.floor((at + size - 1) / 0x8000)
}

// Writes the edited pictures into `rom`. With no edits it changes nothing.
export function writeSnesPictures(rom: Uint8Array, teamCount: number, edits: SnesPictureEdits): void {
  const logoTeams = Object.keys(edits.logos).map(Number)
  const iceTeams = Object.keys(edits.centreIce).map(Number)
  if (logoTeams.length === 0 && iceTeams.length === 0) return
  const c = need(rom, teamCount, false)

  if (logoTeams.length > 0) {
    // The game unpacks the set into a buffer as big as the original set, and
    // the packed set must fit where it is. A replaced logo is laid out by the
    // editor; where that does not fit, other logos the editor lays out in
    // fewer bytes than the original are laid out again too, looking the same,
    // until it does.
    const original = framesOf(c.set)
    const frames: Uint8Array[] = original.slice()
    // A logo the same as the ROM's keeps the ROM's frame.
    for (const team of logoTeams) {
      if (!samePixels(edits.logos[team].picture, drawLogo(c.set, team))) frames[team] = logoFrame(edits.logos[team].picture, original[team])
    }
    // Where only colours changed, the set is left exactly as it was.
    if (frames.some((frame, f) => frame !== original[f])) {
      const { packedSize } = unpackHuffman(rom, c.tables.logoSet)
      const room = roomAt(rom, c.tables.logoSet, packedSize)
      let set = joinSet(frames)
      let packed = packHuffman(set)
      const fits = () => set.length <= c.set.length && packed.length <= room && sameBank(c.tables.logoSet, packed.length)
      if (!fits()) {
        const smaller = original
          .map((frame, f) => ({ f, frame: frames[f] !== frame || f >= teamCount ? frame : logoFrame(drawLogo(c.set, f), frame) }))
          .filter(({ f, frame }) => frame.length < original[f].length)
          .sort((a, b) => original[b.f].length - b.frame.length - (original[a.f].length - a.frame.length))
        for (const { f, frame } of smaller) {
          frames[f] = frame
          set = joinSet(frames)
          packed = packHuffman(set)
          if (fits()) break
        }
      }
      if (set.length > c.set.length) {
        throw new SnesPictureRoomError(
          `The logos need ${set.length - c.set.length} more bytes than the game has room for when it unpacks them. ` +
            'A logo with more of it see-through, or with parts that repeat, takes less room.',
        )
      }
      if (!fits()) {
        throw new SnesPictureRoomError(
          `The logos need ${packed.length - room} more bytes than the ROM has for them. Logos with plainer areas and fewer colours take less room.`,
        )
      }
      rom.fill(0xff, c.tables.logoSet, c.tables.logoSet + packedSize)
      rom.set(packed, c.tables.logoSet)
    }
    for (const team of logoTeams) {
      edits.logos[team].palette.forEach((word, i) => writeU16LE(rom, c.palettes[team] + i * 2, i === 0 ? readU16LE(rom, c.palettes[team]) : word))
    }
  }

  // Each centre ice logo is packed on its own, and must fit where it is,
  // with no more tiles than the game has room for after the rink's.
  const most = Math.max(...c.iceTiles.map((p) => unpackHuffman(rom, p).data.length / TILE))
  const written = new Set<number>()
  for (const team of iceTeams) {
    const at = c.iceTiles[team]
    if (written.has(at) || samePixels(edits.centreIce[team], drawCentreIce(rom, c, team))) continue
    written.add(at)
    const map = readIceMap(rom, c.iceMaps[team])
    const { tiles, words } = iceTilesFor(edits.centreIce[team], map)
    if (tiles.length / TILE > most) {
      throw new SnesPictureRoomError(
        `The centre ice logo needs ${tiles.length / TILE} different tiles; the game has room for ${most}. A plainer logo, or one with repeated parts, needs fewer.`,
      )
    }
    const packed = packHuffman(tiles)
    const { packedSize } = unpackHuffman(rom, at)
    rom.fill(0xff, at, at + packedSize)
    // Where it was, if it fits there; otherwise in free space, with the
    // table pointed there for every team that has this logo.
    const to = packed.length <= roomAt(rom, at, 0) && sameBank(at, packed.length) ? at : freeSpace(rom, packed.length)
    if (to < 0) {
      throw new SnesPictureRoomError(
        `The centre ice logo needs ${packed.length - packedSize} more bytes than it had, and the ROM has no free space that big. A plainer logo takes less room.`,
      )
    }
    rom.set(packed, to)
    c.iceTiles.forEach((tilesAt, other) => {
      if (tilesAt !== at) return
      writeU16LE(rom, c.tables.centreIce + other * 8, loRomAddress(to))
      rom[c.tables.centreIce + other * 8 + 2] = loRomBank(to, rom[c.tables.centreIce + other * 8 + 2])
    })
    words.forEach((word, i) => writeU16LE(rom, c.iceMaps[team] + MAP_HEADER + i * 2, word))
  }
}

// Free space the editor may use: unused ($FF) bytes at least this many in a
// row, outside the banks whose free space the game's hacks and its team data
// use ($9B, $9C, $9E, $9F). Taken from the end of the longest run, so what is
// left stays in one piece.
const FREE_RUN = 0x100
const KEPT_BANKS = [0x9b, 0x9c, 0x9e, 0x9f]

function freeSpace(rom: Uint8Array, size: number): number {
  let best: { start: number; end: number } | null = null
  for (let bank = 0; bank * 0x8000 < rom.length; bank++) {
    if (KEPT_BANKS.includes(bank | 0x80)) continue
    const end = Math.min(rom.length, (bank + 1) * 0x8000)
    let start = -1
    for (let i = bank * 0x8000; i <= end; i++) {
      if (i < end && rom[i] === 0xff) {
        if (start < 0) start = i
        continue
      }
      if (start >= 0 && i - start >= FREE_RUN && (!best || i - start > best.end - best.start)) best = { start, end: i }
      start = -1
    }
  }
  // A byte of the run is left before it, so that whatever comes before keeps an $FF after it.
  return best && best.end - best.start - 1 >= size ? best.end - size : -1
}

