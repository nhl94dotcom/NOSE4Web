import { readU16, readU32, writeU16 } from './bytes'
import { colorRgb } from './color'
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

// The reverse angle replay's rink (RevRinkTilelist, NHL 94): its own palette, tiles and map, drawn from the other end
// (Match Viewer, 2026-11-27). Found from updatescroll: movea.l #Rinktilelist,a0; btst #4,(sflags4).w; beq.w .0;
// movea.l #RevRinkTilelist,a0.
const UPDATESCROLL = [0x20, 0x7c, -1, -1, -1, -1, 0x08, 0x38, 0x00, 0x04, -1, -1, 0x67, 0x00, 0x00, 0x08, 0x20, 0x7c]
export function findGenesisReverseRink(rom: Uint8Array): number | null {
  const rink = findGenesisRink(rom)
  if (rink === null) return null
  let found: number | null = null
  for (let at = rom.indexOf(0x20); at >= 0 && at + UPDATESCROLL.length + 4 <= rom.length; at = rom.indexOf(0x20, at + 1)) {
    if (at & 1 || !UPDATESCROLL.every((byte, i) => byte < 0 || rom[at + i] === byte) || readU32(rom, at + 2) !== rink) continue
    if (found !== null) return null
    found = readU32(rom, at + UPDATESCROLL.length)
  }
  return found
}

export type RinkView = 'play' | 'reverse'

export function readGenesisRink(rom: Uint8Array, view: RinkView = 'play'): GenesisRink | null {
  const at = view === 'play' ? findGenesisRink(rom) : findGenesisReverseRink(rom)
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
export function drawGenesisRink(rom: Uint8Array, home?: number[], away?: number[], view: RinkView = 'play'): { picture: Picture; palette: number[] } | null {
  const rink = readGenesisRink(rom, view)
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

// ------------------------------------------------------------- import
// An edited rink picture (as drawGenesisRink draws it, 384 pixels wide; the rows the game shows in play, 680, or all
// 904) put back into the rink's tiles and map, in place (Match Viewer's reading, 2026-11-27):
// - the tile count stays: the EA logo and the faceoff close-up follow the rink's tiles in video memory, two tiles past
//   its end at most; the reverse rink's must not pass the rink's;
// - the last 24 tiles are the home team's centre ice logo's, loaded over them as a game starts: the cells that show
//   them stay as they are;
// - the replay icon (columns 32-39, rows 85-88) and, on the rink in play, the three stars box (columns 13-18, rows
//   91-94) are read from the map's hidden rows: they stay as they are, and so do the rows the picture leaves out;
// - each cell keeps its palette line (the rink's, or a team's for the players on the benches) and its priority bit
//   (the boards and glass drawn in front of the players), so its pixels are matched to that line's colours;
// - a square that repeats another, turned or not, takes no tile of its own.

export class RinkImportError extends Error {
  // Set where the picture needs more different squares than there is room for: Make it fit can then put it in.
  over = 0
}

export interface RinkImport {
  rom: Uint8Array
  // Tiles the picture needs, and the room there is for it (the count less the centre ice logo's and those kept).
  used: number
  room: number
  // With Make it fit: the picture's squares swapped for the closest ones the rink keeps, the places (8 by 8) that show
  // one, and the pixels that differ from the picture.
  swapped: number
  places: number
  pixels: number
}

const CENTRE_TILES = 24
const SHOWN_ROWS = 85
const KEPT_AREAS: Record<RinkView, { col: [number, number]; row: [number, number] }[]> = {
  play: [
    { col: [32, 39], row: [85, 88] },
    { col: [13, 18], row: [91, 94] },
  ],
  reverse: [{ col: [32, 39], row: [85, 88] }],
}

// Where a picture's new squares are, as the largest groups of them that touch, in pixels: ", most of them at x 88 to 223, y 0 to
// 39 (70 squares) and ...".
function areasOf(cells: number[], width: number): string {
  const left = new Set(cells)
  const groups: number[][] = []
  for (const start of cells) {
    if (!left.has(start)) continue
    left.delete(start)
    const group = [start]
    for (let i = 0; i < group.length; i++) {
      const [col, row] = [group[i] % width, Math.floor(group[i] / width)]
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const [c, r] = [col + dx, row + dy]
          const next = r * width + c
          if (c >= 0 && c < width && left.has(next)) {
            left.delete(next)
            group.push(next)
          }
        }
      }
    }
    groups.push(group)
  }
  const largest = groups.sort((a, b) => b.length - a.length).slice(0, 3).filter((group) => group.length >= Math.max(2, cells.length / 20))
  if (largest.length === 0) return ''
  const describe = (group: number[]) => {
    const cols = group.map((cell) => cell % width)
    const rows = group.map((cell) => Math.floor(cell / width))
    const [x0, x1, y0, y1] = [Math.min(...cols) * 8, Math.max(...cols) * 8 + 7, Math.min(...rows) * 8, Math.max(...rows) * 8 + 7]
    return `x ${x0} to ${x1}, y ${y0} to ${y1} (${group.length} ${group.length === 1 ? 'square' : 'squares'})`
  }
  const texts = largest.map(describe)
  const listed = texts.length === 1 ? texts[0] : `${texts.slice(0, -1).join('; ')} and ${texts[texts.length - 1]}`
  return `, ${largest.reduce((n, group) => n + group.length, 0) === cells.length ? 'at' : 'most of them at'} ${listed}`
}

// A guide for drawing on the rink (board ads and the like), not to be imported: the rows the game shows in play, an
// 8-pixel grid (each square of the grid is one the rink stores), the boards bright (every square within two of the
// ice: the boards all round, the benches, the penalty boxes and the glass at the ends), everything else dimmed, the ice
// (see-through in the export) its own pale blue, and the centre ice logo's block, which an import keeps, red.
// `palette` is the 64 colours the page draws the rink in.
export function genesisRinkGuide(rom: Uint8Array, view: RinkView, palette: number[]): { rgba: Uint8Array; width: number; height: number; boards: number } | null {
  const rink = readGenesisRink(rom, view)
  const drawn = drawGenesisRink(rom, palette.slice(32, 48), palette.slice(48, 64), view)
  if (!rink || !drawn) return null
  const across = rink.width
  const down = Math.min(SHOWN_ROWS, rink.height)
  const [width, height] = [across * 8, down * 8]
  const pixelAt = (x: number, y: number) => drawn.picture.pixels[y * drawn.picture.width + x]
  // The ice: squares mostly see-through or in the ice's own colours.
  const ICE = [0, 1, 2, 8, 9, 10, 11, 13, 15]
  const ice = new Set<number>()
  for (let cell = 0; cell < across * down; cell++) {
    const [cx, cy] = [(cell % across) * 8, Math.floor(cell / across) * 8]
    let n = 0
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (ICE.includes(pixelAt(cx + x, cy + y))) n++
    if (n >= 40) ice.add(cell)
  }
  const boards = new Set<number>()
  for (let cell = 0; cell < across * down; cell++) {
    if (ice.has(cell)) continue
    const [col, row] = [cell % across, Math.floor(cell / across)]
    for (let dr = -2; dr <= 2 && !boards.has(cell); dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        if (col + dc >= 0 && col + dc < across && ice.has((row + dr) * across + col + dc)) {
          boards.add(cell)
          break
        }
      }
    }
  }
  const centreFrom = rink.tileCount - CENTRE_TILES
  const rgba = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = Math.floor(y / 8) * across + Math.floor(x / 8)
      const c = pixelAt(x, y)
      let [r, g, b] = c === 0 ? [200, 235, 255] : colorRgb(palette[c])
      if ((rink.words[cell] & 0x7ff) >= centreFrom) [r, g, b] = [r * 0.4 + 150, g * 0.4, b * 0.4]
      else if (!boards.has(cell)) [r, g, b] = [r * 0.4, g * 0.4, b * 0.4]
      if (x % 8 === 0 || y % 8 === 0) [r, g, b] = [r * 0.6 + 90, g * 0.6 + 90, b * 0.6 + 90]
      rgba.set([Math.round(r), Math.round(g), Math.round(b), 255], (y * width + x) * 4)
    }
  }
  return { rgba, width, height, boards: boards.size }
}

// `fit`: where the picture needs more different squares than there is room for, swap those that differ least from
// another square (weighed by how many places show them) for the closest one, until it fits.
export function importGenesisRink(rom: Uint8Array, view: RinkView, image: { rgba: Uint8Array | Uint8ClampedArray; width: number; height: number }, palette: number[], fit = false): RinkImport {
  const rink = readGenesisRink(rom, view)
  if (!rink || rink.height < SHOWN_ROWS + 10) throw new RinkImportError("This ROM's rink is not laid out as the original game's, so a picture cannot be put in.")
  const fullHeight = rink.height * 8
  const shown = SHOWN_ROWS * 8
  if (image.width !== rink.width * 8 || (image.height !== fullHeight && image.height !== shown)) {
    throw new RinkImportError(`The picture must be ${rink.width * 8} pixels wide and ${shown} or ${fullHeight} tall, as Export as PNG saves it; this one is ${image.width} by ${image.height}.`)
  }
  const rows = image.height / 8
  const centreFrom = rink.tileCount - CENTRE_TILES
  const kept = (cell: number) => {
    const [col, row] = [cell % rink.width, Math.floor(cell / rink.width)]
    return row >= rows || (rink.words[cell] & 0x7ff) >= centreFrom || KEPT_AREAS[view].some((a) => col >= a.col[0] && col <= a.col[1] && row >= a.row[0] && row <= a.row[1])
  }
  // The tiles the kept cells show keep their place and their pixels.
  const pinned = new Set<number>()
  rink.words.forEach((word, cell) => {
    if (kept(cell)) pinned.add(word & 0x7ff)
  })
  for (let t = centreFrom; t < rink.tileCount; t++) pinned.add(t)
  const free = Array.from({ length: rink.tileCount }, (_, t) => t).filter((t) => !pinned.has(t))

  const rgb = palette.map((word) => colorRgb(word))
  const pixelOf = (bytes: Uint8Array, x: number, y: number) => (x & 1 ? bytes[y * 4 + (x >> 1)] & 15 : bytes[y * 4 + (x >> 1)] >> 4)
  // A tile's four turnings, as keys, with the flip bits that draw the stored tile so: none, left-right, up-down, both.
  const variants = (bytes: Uint8Array): [string, number][] =>
    [0, 0x800, 0x1000, 0x1800].map((flip) => {
      let key = ''
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) key += pixelOf(bytes, flip & 0x800 ? 7 - x : x, flip & 0x1000 ? 7 - y : y).toString(16)
      return [key, flip]
    })
  const known = new Map<string, { tile: number; flip: number }>()
  const remember = (tile: number, bytes: Uint8Array) => {
    for (const [key, flip] of variants(bytes)) if (!known.has(key)) known.set(key, { tile, flip })
  }
  for (const t of pinned) remember(t, rom.subarray(rink.tilesAt + t * TILE, rink.tilesAt + (t + 1) * TILE))
  // The squares the rink has now in the cells a picture replaces: how many of the room they take, and which squares of a
  // picture are new, for a picture that needs too many.
  const before = new Set<string>()
  let usedBefore = 0
  rink.words.forEach((word, cell) => {
    if (kept(cell)) return
    const t = word & 0x7ff
    const turnings = variants(rom.subarray(rink.tilesAt + t * TILE, rink.tilesAt + (t + 1) * TILE))
    if (turnings.some(([key]) => known.has(key) || before.has(key))) return
    usedBefore++
    for (const [key] of turnings) before.add(key)
  })

  // Each cell's square from the picture: each pixel to the nearest of the cell's line's colours, or the backdrop
  // (colour 0); a tie keeps what was there.
  const original = drawGenesisRink(rom, palette.slice(32, 48), palette.slice(48, 64), view)!.picture
  const squareOf = new Map<number, Uint8Array>()
  for (let cell = 0; cell < rink.words.length; cell++) {
    if (kept(cell)) continue
    const line = (rink.words[cell] >> 13) & 3
    const [cx, cy] = [(cell % rink.width) * 8, Math.floor(cell / rink.width) * 8]
    const choices = [0, ...Array.from({ length: 15 }, (_, i) => line * 16 + i + 1)]
    const bytes = new Uint8Array(TILE)
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const i = (cy + y) * image.width + cx + x
        const [r, g, b] = [image.rgba[i * 4], image.rgba[i * 4 + 1], image.rgba[i * 4 + 2]]
        const was = original.pixels[i]
        // A see-through pixel (as Export as PNG saves the backdrop) is the backdrop.
        if (image.rgba[i * 4 + 3] < 128) continue
        let best = choices[0]
        let bestDistance = Infinity
        for (const c of choices) {
          const d = (rgb[c][0] - r) ** 2 + (rgb[c][1] - g) ** 2 + (rgb[c][2] - b) ** 2
          if (d < bestDistance || (d === bestDistance && c === was)) [best, bestDistance] = [c, d]
        }
        const colour = best === 0 ? 0 : best - line * 16
        bytes[y * 4 + (x >> 1)] |= x & 1 ? colour : colour << 4
      }
    }
    squareOf.set(cell, bytes)
  }

  // The picture's different squares the rink does not keep, each once however turned: the first cell showing it, and
  // how many show it.
  const fresh = new Map<string, { bytes: Uint8Array; cells: number[] }>()
  const freshKey = new Map<string, string>()
  const added: number[] = []
  for (const [cell, bytes] of squareOf) {
    const turnings = variants(bytes)
    if (known.has(turnings[0][0])) continue
    const seen = freshKey.get(turnings[0][0])
    if (seen) {
      fresh.get(seen)!.cells.push(cell)
      continue
    }
    fresh.set(turnings[0][0], { bytes, cells: [cell] })
    for (const [key] of turnings) freshKey.set(key, turnings[0][0])
    if (!before.has(turnings[0][0])) added.push(cell)
  }
  const used = fresh.size
  if (used > free.length && !fit) {
    const spare = Math.max(0, free.length - usedBefore)
    const error = new RinkImportError(
      `This picture needs ${used - free.length} more different squares of 8 by 8 pixels than the rink has room for (${used} of ${free.length}). ` +
        `The rink as it is uses ${usedBefore}, so a picture can add only ${spare} new ${spare === 1 ? 'square' : 'squares'}, and this one adds ${added.length}` +
        `${areasOf(added, rink.width)}. A square that repeats another exactly, or another turned round, costs nothing: draw on a grid of 8 by 8 pixels from ` +
        `the top left corner, and copy whole squares where a pattern repeats (seats, crowd, walls).`,
    )
    error.over = used - free.length
    throw error
  }

  // Make it fit. A square's pixels in its four turnings, and how far two squares are apart drawn in one line's
  // colours (summed squared distance of their colours; the backdrop is colour 0's).
  const pixelsOf = (bytes: Uint8Array) => [0, 0x800, 0x1000, 0x1800].map((flip) => Uint8Array.from({ length: 64 }, (_, i) => pixelOf(bytes, flip & 0x800 ? 7 - (i % 8) : i % 8, flip & 0x1000 ? 7 - (i >> 3) : i >> 3)))
  const lineDistance = [0, 1, 2, 3].map((line) => {
    const colour = (c: number) => rgb[c === 0 ? 0 : line * 16 + c]
    return Array.from({ length: 256 }, (_, k) => {
      const [a, b] = [colour(k >> 4), colour(k & 15)]
      return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
    })
  })
  const apart = (a: Uint8Array, b: Uint8Array, line: number) => {
    const table = lineDistance[line]
    let d = 0
    for (let i = 0; i < 64; i++) d += table[(a[i] << 4) | b[i]]
    return d
  }
  // The tiles the rink keeps, as pixels, to swap a square for.
  const pinnedPixels = [...pinned].map((tile) => ({ tile, turnings: pixelsOf(rom.subarray(rink.tilesAt + tile * TILE, rink.tilesAt + (tile + 1) * TILE)) }))
  const keys = [...fresh.keys()]
  const freshPixels = new Map(keys.map((key) => [key, pixelsOf(fresh.get(key)!.bytes)[0]]))
  const freshTurnings = new Map(keys.map((key) => [key, pixelsOf(fresh.get(key)!.bytes)]))
  const lineOf = (key: string) => (rink.words[fresh.get(key)!.cells[0]] >> 13) & 3
  const keptKeys = new Set(keys)
  const swappedKeys = new Set<string>()
  if (used > free.length) {
    // The cost of swapping a square away: its distance to the nearest other square (kept by the rink, or one of the
    // picture's still in), times the places that show it. The cheapest goes first, until the rest fit.
    const nearest = (key: string) => {
      const [own, line] = [freshPixels.get(key)!, lineOf(key)]
      let best = Infinity
      for (const { turnings } of pinnedPixels) for (const t of turnings) best = Math.min(best, apart(own, t, line))
      for (const other of keptKeys) if (other !== key) for (const t of freshTurnings.get(other)!) best = Math.min(best, apart(own, t, line))
      return best * fresh.get(key)!.cells.length
    }
    const cost = new Map(keys.map((key) => [key, nearest(key)]))
    while (keptKeys.size > free.length) {
      let cheapest = ''
      for (const key of keptKeys) if (!cheapest || cost.get(key)! < cost.get(cheapest)!) cheapest = key
      // A cost only grows as squares are taken out, so the cheapest's is counted again: still the cheapest, it goes.
      const now = nearest(cheapest)
      if (now > cost.get(cheapest)!) {
        cost.set(cheapest, now)
        continue
      }
      keptKeys.delete(cheapest)
      swappedKeys.add(cheapest)
    }
  }

  // Put the kept squares in, then each cell to its square, or a swapped one's to the closest tile there is.
  const out = rom.slice()
  const words = rink.words.slice()
  let next = 0
  for (const key of keptKeys) {
    const tile = free[next++]
    out.set(fresh.get(key)!.bytes, rink.tilesAt + tile * TILE)
    remember(tile, fresh.get(key)!.bytes)
  }
  const stored = [...pinnedPixels, ...[...keptKeys].map((key, i) => ({ tile: free[i], turnings: freshTurnings.get(key)! }))]
  let places = 0
  let pixels = 0
  for (const [cell, bytes] of squareOf) {
    const word = rink.words[cell]
    let place = known.get(variants(bytes)[0][0])
    if (!place) {
      const own = pixelsOf(bytes)[0]
      const line = (word >> 13) & 3
      let best = { tile: 0, flip: 0, d: Infinity, turning: own }
      for (const { tile, turnings } of stored) {
        turnings.forEach((t, k) => {
          const d = apart(own, t, line)
          if (d < best.d) best = { tile, flip: [0, 0x800, 0x1000, 0x1800][k], d, turning: t }
        })
      }
      place = { tile: best.tile, flip: best.flip }
      places++
      for (let i = 0; i < 64; i++) if (own[i] !== best.turning[i]) pixels++
    }
    words[cell] = (word & 0xe000) | place.flip | place.tile
  }
  words.forEach((word, cell) => writeU16(out, rink.mapAt + 4 + cell * 2, word))
  return { rom: out, used: Math.min(used, free.length), room: free.length, swapped: swappedKeys.size, places, pixels }
}
