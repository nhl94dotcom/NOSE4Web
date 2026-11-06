import { readU16LE, writeU16LE } from './bytes'
import { colorRgb, nearestColorWord, SNES_COLORS } from './color'
import type { Picture } from './graphics'
import { HuffmanError, isHuffman, packHuffman, unpackHuffman } from './huffman'
import { isLz, LzError, packLz, unpackLz } from './lz'
import { findCode, findSnesTeamTable, loRomAddress, loRomBank, loRomOffset } from './snes'

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
// ROMs rebuilt with more teams (NHL94SNES-SA1's 2 MB build) keep the logo
// frames unpacked in the ROM, which the game draws from in place, through a
// table of 32-bit distances from the table; their own logos are in free banks
// and some teams share another's. Their centre ice logos may be packed in the
// game's LZ format instead (see lz.ts).

export interface SnesPictureEdits {
  logos: Record<number, { picture: Picture; palette: number[] }>
  centreIce: Record<number, Picture>
}

export const NO_SNES_PICTURE_EDITS: SnesPictureEdits = { logos: {}, centreIce: {} }

// The code that loads each table; see findCode. The logos are drawn from
// the set at LOGO_SOURCE: in the original game a buffer in work memory, which
// LOGO_SET_LOADER fills; in a rebuilt ROM the set in the ROM itself.
const LOGO_SOURCE = 'a9(..)008512a9(....)8510a90024'
const LOGO_SET_LOADER = 'a9(..)00850ea9(....)850ca97f008512a90078851022'
const LOGO_PALETTE_LOADER = '0a0aaabf......850ebf(....)(..)850ca0..00a2100022'
const CENTRE_ICE_LOADER = 'ad....0a0a0aaabf(....)(..)850cbf......850ea97f008512a900008510'
// The SA-1 build's: each team's own centre ice colours (IcePalettes) and
// whether it has them (IceTitleColours, 16 bytes a team, the first 0 for no).
const ICE_COLOUR_LOADER = 'ad....0a0a0a0aaabf(....)(..)29ff00f0..8a0aaaa9..00850ea9....850ca00200bf(....)(..)'
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
  // Where the game reads the set: in work memory, unpacked from logoSet, or
  // in the ROM at this address, the set being at logoSet.
  logoSetInRom: number | null
  logoPalettes: number
  centreIce: number
  rinkPalette: number
}

const long = (rom: Uint8Array, at: number) => loRomOffset(rom[at + 2], readU16LE(rom, at))

function findTables(rom: Uint8Array): Tables | null {
  const source = findCode(rom, LOGO_SOURCE)
  const inRom = source !== null && source.groups[0] !== 0x7e && source.groups[0] !== 0x7f && source.groups[1] >= 0x8000
  const set = inRom ? source : findCode(rom, LOGO_SET_LOADER)
  const palettes = findCode(rom, LOGO_PALETTE_LOADER)
  const ice = findCode(rom, CENTRE_ICE_LOADER)
  const rink = findCode(rom, RINK_PALETTE_LOADER)
  if (!set || !palettes || !ice || !rink) return null
  const at = (bank: number, address: number) => (address >= 0x8000 ? loRomOffset(bank, address) : -1)
  const tables = {
    logoSet: at(set.groups[0], set.groups[1]),
    logoSetInRom: inRom ? (set.groups[0] << 16) | set.groups[1] : null,
    logoPalettes: at(palettes.groups[1], palettes.groups[0]),
    centreIce: at(ice.groups[1], ice.groups[0]),
    rinkPalette: at(rink.groups[1], rink.groups[0]),
  }
  const places = [tables.logoSet, tables.logoPalettes, tables.centreIce, tables.rinkPalette]
  return places.every((offset) => offset >= 0 && offset < rom.length) ? tables : null
}

// What a ROM's pictures are, read once for each ROM.
interface Contents {
  tables: Tables
  // Where the logo frames are: the set unpacked from the ROM, or the ROM
  // itself; and where in it each team's frame is.
  frames: Uint8Array
  frameAt: number[]
  // The unpacked set, for the original game's way.
  set: Uint8Array | null
  // Where each team's palette is, and each team's centre ice tiles and map.
  palettes: number[]
  iceTiles: number[]
  iceMaps: number[]
  // In the SA-1 build, where each team's own centre ice colours are, for a
  // team that has them; -1 for one drawn in the rink's.
  iceOwn: number[]
}

// Read once for each ROM the project holds. A ROM being written to is read
// afresh, and not remembered, as what it holds is about to change.
const contents = new WeakMap<Uint8Array, Contents | null>()

function read(rom: Uint8Array, teamCount: number, remember = true): Contents | null {
  if (remember && contents.has(rom)) return contents.get(rom)!
  let found: Contents | null = null
  try {
    const tables = findTables(rom)
    const set = tables && tables.logoSetInRom === null && isHuffman(rom, tables.logoSet) ? unpackHuffman(rom, tables.logoSet).data : null
    if (tables && (set || tables.logoSetInRom !== null)) {
      const frames = set ?? rom
      const frameAt = Array.from({ length: teamCount }, (_, t) => (set ? setFrameAt(set, t) : romFrameAt(rom, tables, t)))
      const palettes = Array.from({ length: teamCount }, (_, t) => long(rom, tables.logoPalettes + t * 4))
      const iceTiles = Array.from({ length: teamCount }, (_, t) => long(rom, tables.centreIce + t * 8))
      const iceMaps = Array.from({ length: teamCount }, (_, t) => long(rom, tables.centreIce + t * 8 + 4))
      const ok =
        (!set || frameCount(set) >= teamCount) &&
        frameAt.every((p) => p >= 0 && p + FRAME_HEADER <= frames.length && frames[p + 1] & 0x80 && p + frameLength(frames, p) <= frames.length) &&
        palettes.every((p) => p >= 0 && p + COLOURS * 2 <= rom.length) &&
        iceTiles.every((p) => p >= 0 && (isHuffman(rom, p) || isLz(rom, p))) &&
        iceMaps.every((p) => p >= 0 && p + 6 <= rom.length)
      const own = findCode(rom, ICE_COLOUR_LOADER)
      const iceOwn = Array.from({ length: teamCount }, (_, t) => {
        if (!own || own.groups[0] < 0x8000 || own.groups[2] < 0x8002) return -1
        const flag = loRomOffset(own.groups[1], own.groups[0]) + t * COLOURS
        return rom[flag] ? loRomOffset(own.groups[3], own.groups[2] - 2) + t * COLOURS * 2 : -1
      })
      if (ok) found = { tables, frames, frameAt, set, palettes, iceTiles, iceMaps, iceOwn }
    }
  } catch (e) {
    if (!(e instanceof HuffmanError || e instanceof LzError)) throw e
  }
  if (remember) contents.set(rom, found)
  return found
}

export function snesPicturesSupported(rom: Uint8Array, teamCount: number): boolean {
  return read(rom, teamCount) !== null
}

// Where a rebuilt ROM keeps its table of logo frames, which the game draws
// from in place; null for the original game's packed logos.
export function snesLogoTable(rom: Uint8Array, teamCount: number): number | null {
  const c = read(rom, teamCount)
  return c && !c.set ? c.tables.logoSet : null
}

function need(rom: Uint8Array, teamCount: number, remember = true): Contents {
  const found = read(rom, teamCount, remember)
  if (!found) throw new Error('This ROM keeps its pictures in a way the editor cannot read.')
  return found
}

// ------------------------------------------------------------------ logos

const frameCount = (set: Uint8Array) => readU16LE(set, 0) / 4
const setFrameAt = (set: Uint8Array, frame: number) => readU16LE(set, frame * 4) | (readU16LE(set, frame * 4 + 2) << 16)
// In a rebuilt ROM: the table's address plus the team's distance, as a long address.
const distanceOf = (rom: Uint8Array, tables: Tables, team: number) => (readU16LE(rom, tables.logoSet + team * 4) | (readU16LE(rom, tables.logoSet + team * 4 + 2) << 16)) >>> 0
function romFrameAt(rom: Uint8Array, tables: Tables, team: number): number {
  const address = (tables.logoSetInRom! + distanceOf(rom, tables, team)) & 0xffffff
  return (address & 0xffff) >= 0x8000 ? loRomOffset(address >> 16, address & 0xffff) : -1
}
// A frame's header, pieces and tiles.
const frameLength = (data: Uint8Array, p: number) => readU16LE(data, p + 0x10) + readU16LE(data, p + 2) * TILE
const signed = (data: Uint8Array, at: number) => (readU16LE(data, at) ^ 0x8000) - 0x8000

function tilePixel(data: Uint8Array, tile: number, x: number, y: number): number {
  const bit = 7 - x
  const low = tile + y * 2
  const high = tile + 16 + y * 2
  return ((data[low] >> bit) & 1) | (((data[low + 1] >> bit) & 1) << 1) | (((data[high] >> bit) & 1) << 2) | (((data[high + 1] >> bit) & 1) << 3)
}

// The frame at `p` as a picture of LOGO_SIZE, placed as the game places it.
function drawLogo(set: Uint8Array, p: number): Picture {
  const picture = { width: LOGO_SIZE, height: LOGO_SIZE, pixels: new Uint8Array(LOGO_SIZE * LOGO_SIZE) }
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
  return { picture: drawLogo(c.frames, c.frameAt[team]), palette: readColours(rom, c.palettes[team]) }
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
  Array.from({ length: frameCount(set) }, (_, f) => set.slice(setFrameAt(set, f), f + 1 < frameCount(set) ? setFrameAt(set, f + 1) : set.length))

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
// left pixel in the high nibble, as NHL94SNESVault's TileViewer reads them.
// Each tile of its map gives a row of the rink's colours, which every team
// shares; the game's BuildRinkMap adds $1400 to each map word as it puts the
// logo on the rink, so the tile is drawn five rows on: the logos use rows 0
// and 1 of their maps, drawn in rows 5 and 6, the colours seen through the
// ice. A picture of it holds the row drawn and the colour of each pixel as
// row * 16 + colour, with colour 0, see-through, as 0 whatever its row.
const unpackPicture = (rom: Uint8Array, at: number) => (isLz(rom, at) ? unpackLz(rom, at) : unpackHuffman(rom, at))

const MAP_HEADER = 6
const TILE_NUMBER = 0x3ff
const PALETTE_SHIFT = 10
const PALETTE_BITS = 7 << PALETTE_SHIFT
const ROWS = 8
const DRAWN_ROWS_ON = 5
const drawnRow = (mapRow: number) => (mapRow + DRAWN_ROWS_ON) % ROWS
const mapRow = (drawn: number) => (drawn - DRAWN_ROWS_ON + ROWS) % ROWS
// The rows a centre ice logo is drawn in, which an imported one may use.
const ICE_ROWS = [drawnRow(0), drawnRow(1)]

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

// A team's centre ice logo, the colours it is drawn in, and the rows of them
// an imported one may use: in the SA-1 build a team with centre ice colours of
// its own has them in row 5 and uses that row alone, as the title screen,
// which draws the logo too, expects.
export function snesCentreIce(
  rom: Uint8Array,
  teamCount: number,
  edits: SnesPictureEdits,
  team: number,
): { picture: Picture; palette: number[]; rows: number[]; ownColours: boolean } {
  const c = need(rom, teamCount)
  const palette = iceColours(rom, c)
  const own = c.iceOwn[team]
  if (own >= 0) for (let i = 1; i < COLOURS; i++) palette[ICE_ROWS[0] * COLOURS + i] = readU16LE(rom, own + i * 2)
  return { picture: edits.centreIce[team] ?? drawCentreIce(rom, c, team), palette, rows: own >= 0 ? [ICE_ROWS[0]] : ICE_ROWS, ownColours: own >= 0 }
}

function drawCentreIce(rom: Uint8Array, c: Contents, team: number): Picture {
  const map = readIceMap(rom, c.iceMaps[team])
  const tiles = unpackPicture(rom, c.iceTiles[team]).data
  const picture = { width: map.width * 8, height: map.height * 8, pixels: new Uint8Array(map.width * 8 * map.height * 8) }
  map.words.forEach((word, cell) => {
    const tile = (word & TILE_NUMBER) * TILE
    const row = drawnRow((word & PALETTE_BITS) >> PALETTE_SHIFT)
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
    let row = ICE_ROWS[0]
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
    return index | (mapRow(row) << PALETTE_SHIFT) | flags
  })
  const bytes = new Uint8Array(tiles.length * TILE)
  tiles.forEach((text, t) => {
    for (let i = 0; i < TILE; i++) bytes[t * TILE + i] = parseInt(text.slice(i * 2, i * 2 + 2), 16)
  })
  return { tiles: bytes, words }
}

// A centre ice logo from an image. Each 8 x 8 tile is drawn in whichever of
// the two rows of centre ice colours matches it best, and its pixels in the
// nearest of that row's colours.
export function snesCentreIceFromImage(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  like: { picture: Picture; palette: number[]; rows?: number[] },
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
      const rows = like.rows ?? ICE_ROWS
      let bestRow = rows[0]
      let bestTotal = Infinity
      for (const row of rows) {
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
    if (!c.set) {
      writeRomLogos(rom, c, edits, logoTeams)
      return writeIce(rom, c, edits, iceTeams)
    }
    const unpacked = c.set
    const original = framesOf(unpacked)
    const frames: Uint8Array[] = original.slice()
    // A logo the same as the ROM's keeps the ROM's frame.
    for (const team of logoTeams) {
      if (!samePixels(edits.logos[team].picture, drawLogo(unpacked, c.frameAt[team]))) frames[team] = logoFrame(edits.logos[team].picture, original[team])
    }
    // Where only colours changed, the set is left exactly as it was.
    if (frames.some((frame, f) => frame !== original[f])) {
      const { packedSize } = unpackHuffman(rom, c.tables.logoSet)
      const room = roomAt(rom, c.tables.logoSet, packedSize)
      let set = joinSet(frames)
      let packed = packHuffman(set)
      const fits = () => set.length <= unpacked.length && packed.length <= room && sameBank(c.tables.logoSet, packed.length)
      if (!fits()) {
        const smaller = original
          .map((frame, f) => ({ f, frame: frames[f] !== frame || f >= teamCount ? frame : logoFrame(drawLogo(unpacked, setFrameAt(unpacked, f)), frame) }))
          .filter(({ f, frame }) => frame.length < original[f].length)
          .sort((a, b) => original[b.f].length - b.frame.length - (original[a.f].length - a.frame.length))
        for (const { f, frame } of smaller) {
          frames[f] = frame
          set = joinSet(frames)
          packed = packHuffman(set)
          if (fits()) break
        }
      }
      if (set.length > unpacked.length) {
        throw new SnesPictureRoomError(
          `The logos need ${set.length - unpacked.length} more bytes than the game has room for when it unpacks them. ` +
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
    writeLogoColours(rom, c, edits, logoTeams)
  }
  writeIce(rom, c, edits, iceTeams)
}

// A team's logo colours, where they are, or, where another team shares them,
// in free space of its own.
function writeLogoColours(rom: Uint8Array, c: Contents, edits: SnesPictureEdits, teams: number[]): void {
  for (const team of teams) {
    const at = c.palettes[team]
    const colours = edits.logos[team].palette.map((word, i) => (i === 0 ? readU16LE(rom, at) : word))
    if (colours.every((word, i) => word === readU16LE(rom, at + i * 2))) continue
    const shared = c.palettes.some((other, t) => t !== team && other === at)
    const to = shared ? freeSpace(rom, COLOURS * 2, keptBanks(rom)) : at
    if (to < 0) throw new SnesPictureRoomError('The logo’s colours are shared with another team, and the ROM has no free space for colours of its own.')
    colours.forEach((word, i) => writeU16LE(rom, to + i * 2, word))
    if (shared) pointTo(rom, c.tables.logoPalettes + team * 4, to)
  }
}

// A long address in a table: its word and bank.
function pointTo(rom: Uint8Array, entry: number, to: number): void {
  writeU16LE(rom, entry, loRomAddress(to))
  rom[entry + 2] = loRomBank(to, rom[entry + 2] | 0x80)
}

// A rebuilt ROM's logos: each frame where it is if it fits there and no other
// team draws it; otherwise in free space, with the team's distance set to it.
function writeRomLogos(rom: Uint8Array, c: Contents, edits: SnesPictureEdits, teams: number[]): void {
  for (const team of teams) {
    const p = c.frameAt[team]
    const length = frameLength(rom, p)
    if (samePixels(edits.logos[team].picture, drawLogo(rom, p))) continue
    const frame = logoFrame(edits.logos[team].picture, rom.slice(p, p + length))
    const shared = c.frameAt.some((other, t) => t !== team && other === p)
    if (!shared) rom.fill(0xff, p, p + length)
    const to = !shared && frame.length <= length ? p : freeSpace(rom, frame.length, keptBanks(rom))
    if (to < 0) throw new SnesPictureRoomError('The ROM has no free space for the logo.')
    rom.set(frame, to)
    if (to !== p) {
      const address = (loRomBank(to, 0x80) << 16) | loRomAddress(to)
      const distance = (address - c.tables.logoSetInRom! + 0x1000000) & 0xffffff
      writeU16LE(rom, c.tables.logoSet + team * 4, distance & 0xffff)
      writeU16LE(rom, c.tables.logoSet + team * 4 + 2, distance >> 16)
    }
  }
  writeLogoColours(rom, c, edits, teams)
}

// The banks the editor keeps its pictures out of: those whose free space the
// SNES hacks use, and those of the team data, whose room is the rosters'.
function keptBanks(rom: Uint8Array): number[] {
  const table = findSnesTeamTable(rom)
  const teams = table ? [table.offset >> 15, rom[table.offset + 2] & 0x7f] : []
  return [...KEPT_BANKS, ...teams.map((bank) => bank | 0x80)]
}

// Each centre ice logo is packed on its own, in the way the ROM packs it,
// with no more tiles than the game has room for after the rink's.
function writeIce(rom: Uint8Array, c: Contents, edits: SnesPictureEdits, iceTeams: number[]): void {
  if (iceTeams.length === 0) return
  const most = Math.max(...c.iceTiles.map((p) => unpackPicture(rom, p).data.length / TILE))
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
    const packed = isLz(rom, at) ? packLz(tiles) : packHuffman(tiles)
    const { packedSize } = unpackPicture(rom, at)
    rom.fill(0xff, at, at + packedSize)
    // Where it was, if it fits there; otherwise in free space, with the
    // table pointed there for every team that has this logo.
    const to = packed.length <= roomAt(rom, at, 0) && sameBank(at, packed.length) ? at : freeSpace(rom, packed.length, keptBanks(rom))
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

function freeSpace(rom: Uint8Array, size: number, kept: number[]): number {
  let best: { start: number; end: number } | null = null
  for (let bank = 0; bank * 0x8000 < rom.length; bank++) {
    if (kept.includes(bank | 0x80)) continue
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

