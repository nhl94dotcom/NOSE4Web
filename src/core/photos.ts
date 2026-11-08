import { readU16, readU32, writeU16, writeU32 } from './bytes'
import { colorRgb } from './color'
import type { Picture } from './graphics'
import type { RomProject } from './rom'
import { claimSpace } from './space'

// Player photos on the Genesis: the pictures on the player cards of the game
// setup screen and on the matchup screens. (From the disassembly,
// abdulahmad/NHL94Genesis: cards94.asm, scout94.asm and ui94.asm.)
//
// Each team has a list of featured players (FeaturedPictures), entries of a
// picture's address and a roster slot, ended by 0. The setup screen shows the
// first six in turn, and never looks for the end of the list, so a list must
// keep at least six. The matchup screen shows the photo of any player in the
// list (DrawPlayerPicture), and for anyone else a generic one: a goalie or a
// skater, of two kinds each.
//
// A picture is a block like the logos' (see graphics.ts): offsets of a palette
// and of a map, a count of tiles, then the tiles, here 3 bits a pixel, 3 bytes
// to each row of 8. The game draws them all in the same eight greys, colours 5
// to 12 of the photo palette (PicturePalette), white to black. A block with no
// map of its own is laid out by PicturePalette's map: 6 by 6 tiles in order.
// Some of the original game's have a map of their own, storing a repeated
// tile once.
//
// Changes are made to the ROM as it is in the editor, as the hacks are: a
// picture is rewritten where it is if it is this player's alone and fits, or
// else added at the end of the ROM; a list that grows past its room is moved
// there too.

export const PHOTO_SIZE = 48
const TILES_WIDE = PHOTO_SIZE / 8
const TILES = TILES_WIDE * TILES_WIDE
const ROW_BYTES = 3
const TILE_BYTES = 8 * ROW_BYTES
const HEADER_BYTES = 10
const ENTRY_BYTES = 6
// The first colour of the eight, in a picture and in the palette's row.
export const FIRST_SHADE = 5
export const SHADES = 8
// The palette row the photos are drawn with (the map's tiles name row 1).
const PALETTE_ROW = 1
// The fewest entries a list may have: the setup screen shows the first six.
export const FEWEST_PHOTOS = 6
const TILE_NUMBER = 0x07ff
const FLIP_H = 0x0800
const FLIP_V = 0x1000
const MAP_FLAGS = 0x2000

export interface PhotoEntry {
  // Where the picture's block is.
  at: number
  // The roster slot of the player it is for.
  slot: number
}

export interface PhotoLayout {
  // Where the game's table of team lists is.
  tableAt: number
  lists: { at: number; entries: PhotoEntry[] }[]
  // The generic pictures, for players with none of their own: goalie 1,
  // goalie 2, skater 2, skater 1, as DrawPlayerPicture has them.
  generic: number[]
  // The photo palette: its 16 colours in the row the photos are drawn in.
  palette: number[]
  // PicturePalette's own block, whose map lays out blocks with none.
  baseAt: number
}

// DrawPlayerPicture: movea.l #FeaturedPictures,a0; move.w d1,d2; asl.w #2,d2;
// movea.l 0(a0,d2.w),a0; move.w #$FFFF,d2.
const LISTS_CODE = [0x3401, 0xe542, 0x2070, 0x2000, 0x343c, 0xffff]
// DrawMatchupPicture: movea.l a0,a1; movea.l a0,a2; adda.l (a2)+,a0; movea.l #PicturePalette,a0.
const PALETTE_CODE = [0x2248, 0x2448, 0xd1da, 0x207c]

function findCode(rom: Uint8Array, words: number[]): number[] {
  const found: number[] = []
  for (let at = 0; at + words.length * 2 <= rom.length; at += 2) {
    if (rom[at] !== words[0] >> 8 || rom[at + 1] !== (words[0] & 0xff)) continue
    if (words.every((word, i) => readU16(rom, at + i * 2) === word)) found.push(at)
  }
  return found
}

const layouts = new WeakMap<Uint8Array, PhotoLayout | null>()

// Where a Genesis ROM keeps its photos, or null where the editor cannot follow them.
export function photoLayout(rom: Uint8Array, teamCount: number): PhotoLayout | null {
  if (layouts.has(rom)) return layouts.get(rom)!
  let found: PhotoLayout | null = null
  try {
    found = readLayout(rom, teamCount)
  } catch {
    found = null
  }
  layouts.set(rom, found)
  return found
}

function readLayout(rom: Uint8Array, teamCount: number): PhotoLayout | null {
  const lists = findCode(rom, LISTS_CODE)
  if (lists.length !== 1 || readU16(rom, lists[0] - 6) !== 0x207c) return null
  const code = lists[0]
  const tableAt = readU32(rom, code - 4)
  const inRom = (at: number, size: number) => at >= 0x200 && at + size <= rom.length
  // The generic pictures, as DrawPlayerPicture picks them after the search:
  // movea.l #picture,a0 for goalie 1, goalie 2, skater 2 and skater 1. The
  // movea.l #TeamList,a0 among them is followed by asl.w #2,d1.
  const generic: number[] = []
  for (let at = code + LISTS_CODE.length * 2; at < code + 0xa0 && generic.length < 4; at += 2) {
    if (readU16(rom, at) === 0x207c && readU16(rom, at + 6) !== 0xe541) generic.push(readU32(rom, at + 2))
  }
  const palettes = findCode(rom, PALETTE_CODE).map((at) => readU32(rom, at + 8))
  if (palettes.length === 0 || palettes.some((at) => at !== palettes[0]) || generic.length !== 4) return null
  const baseAt = palettes[0]
  const paletteAt = baseAt + readU32(rom, baseAt)
  if (!inRom(paletteAt, 0x80) || !inRom(tableAt, teamCount * 4)) return null
  const palette = Array.from({ length: 16 }, (_, i) => readU16(rom, paletteAt + PALETTE_ROW * 32 + i * 2))
  const base = readBlock(rom, baseAt, null)
  if (!base.map) return null

  const out: PhotoLayout['lists'] = []
  for (let team = 0; team < teamCount; team++) {
    const at = readU32(rom, tableAt + team * 4)
    if (!inRom(at, 4)) return null
    const entries: PhotoEntry[] = []
    for (let i = at; readU32(rom, i) !== 0; i += ENTRY_BYTES) {
      if (!inRom(i, ENTRY_BYTES + 4) || entries.length > 64) return null
      entries.push({ at: readU32(rom, i), slot: readU16(rom, i + 4) })
    }
    for (const entry of entries) readBlock(rom, entry.at, base.map)
    out.push({ at, entries })
  }
  for (const at of generic) readBlock(rom, at, base.map)
  return { tableAt, lists: out, generic, palette, baseAt }
}

interface Block {
  at: number
  tiles: number
  // Its own map's 36 words, or null.
  map: number[] | null
  // How many tiles there is room for: up to its palette or map, or its count.
  room: number
}

function readBlock(rom: Uint8Array, at: number, baseMap: number[] | null): Block {
  const paletteOffset = readU32(rom, at)
  const mapOffset = readU32(rom, at + 4)
  const tiles = readU16(rom, at + 8)
  if (tiles === 0 || tiles > TILES || at + HEADER_BYTES + tiles * TILE_BYTES > rom.length) throw new Error('bad photo')
  let map: number[] | null = null
  if (mapOffset !== 0) {
    const mapAt = at + mapOffset
    if (readU16(rom, mapAt) !== TILES_WIDE || readU16(rom, mapAt + 2) !== TILES_WIDE) throw new Error('bad photo map')
    map = Array.from({ length: TILES }, (_, i) => readU16(rom, mapAt + 4 + i * 2))
    if (map.some((word) => (word & TILE_NUMBER) >= tiles)) throw new Error('bad photo map')
  } else if (baseMap === null ? false : tiles !== TILES) {
    throw new Error('bad photo')
  }
  const firstAfter = [paletteOffset, mapOffset].filter((offset) => offset !== 0)
  const room = firstAfter.length ? Math.floor((Math.min(...firstAfter) - HEADER_BYTES) / TILE_BYTES) : tiles
  return { at, tiles, map, room }
}

// The photo at `at`, its pixels the colour numbers 5 to 12.
export function photoPicture(rom: Uint8Array, layout: PhotoLayout, at: number): Picture {
  const baseMap = readBlock(rom, layout.baseAt, null).map!
  const block = readBlock(rom, at, baseMap)
  const map = block.map ?? baseMap
  const picture: Picture = { width: PHOTO_SIZE, height: PHOTO_SIZE, pixels: new Uint8Array(PHOTO_SIZE * PHOTO_SIZE) }
  map.forEach((word, i) => {
    const tile = at + HEADER_BYTES + (word & TILE_NUMBER) * TILE_BYTES
    const [left, top] = [(i % TILES_WIDE) * 8, Math.floor(i / TILES_WIDE) * 8]
    for (let y = 0; y < 8; y++) {
      const row = tile + (word & FLIP_V ? 7 - y : y) * ROW_BYTES
      const bits = (rom[row] << 16) | (rom[row + 1] << 8) | rom[row + 2]
      for (let x = 0; x < 8; x++) {
        const sx = word & FLIP_H ? 7 - x : x
        picture.pixels[(top + y) * PHOTO_SIZE + left + x] = FIRST_SHADE + ((bits >> (21 - sx * 3)) & 7)
      }
    }
  })
  return picture
}

// A tile's 24 bytes, as a string to compare.
function tileOf(picture: Picture, left: number, top: number): string {
  let text = ''
  for (let y = 0; y < 8; y++) {
    let bits = 0
    for (let x = 0; x < 8; x++) {
      const shade = Math.min(SHADES - 1, Math.max(0, picture.pixels[(top + y) * PHOTO_SIZE + left + x] - FIRST_SHADE))
      bits |= shade << (21 - x * 3)
    }
    text += String.fromCharCode(bits >> 16, (bits >> 8) & 0xff, bits & 0xff)
  }
  return text
}

function tilesOf(picture: Picture): string[] {
  const tiles: string[] = []
  for (let top = 0; top < PHOTO_SIZE; top += 8) for (let left = 0; left < PHOTO_SIZE; left += 8) tiles.push(tileOf(picture, left, top))
  return tiles
}

const putTile = (rom: Uint8Array, at: number, tile: string) => {
  for (let i = 0; i < TILE_BYTES; i++) rom[at + i] = tile.charCodeAt(i)
}

// A new block: no palette or map of its own, the 36 tiles in order.
function newBlock(picture: Picture): Uint8Array {
  const block = new Uint8Array(HEADER_BYTES + TILES * TILE_BYTES)
  writeU16(block, 8, TILES)
  tilesOf(picture).forEach((tile, i) => putTile(block, HEADER_BYTES + i * TILE_BYTES, tile))
  return block
}

// Writes the picture into the block where it is, if it fits there: 36 tiles
// in a block with no map, or, in one with a map, each different tile once.
function rewriteBlock(rom: Uint8Array, layout: PhotoLayout, at: number, picture: Picture): boolean {
  const baseMap = readBlock(rom, layout.baseAt, null).map!
  const block = readBlock(rom, at, baseMap)
  const tiles = tilesOf(picture)
  if (!block.map) {
    if (block.tiles !== TILES) return false
    tiles.forEach((tile, i) => putTile(rom, at + HEADER_BYTES + i * TILE_BYTES, tile))
    return true
  }
  const distinct = [...new Set(tiles)]
  if (distinct.length > block.room) return false
  rom.fill(0, at + HEADER_BYTES, at + HEADER_BYTES + block.room * TILE_BYTES)
  distinct.forEach((tile, i) => putTile(rom, at + HEADER_BYTES + i * TILE_BYTES, tile))
  writeU16(rom, at + 8, Math.max(distinct.length, 1))
  const mapAt = at + readU32(rom, at + 4) + 4
  tiles.forEach((tile, i) => writeU16(rom, mapAt + i * 2, MAP_FLAGS | distinct.indexOf(tile)))
  return true
}

// ------------------------------------------------------------ the photos

export interface TeamPhoto {
  slot: number
  picture: Picture
  // Whether it is a generic picture, which other players share.
  generic: boolean
  // The other teams' players and this team's, by team and slot, shown the same picture.
  sharedWith: { team: number; slot: number }[]
}

export function photosSupported(project: RomProject): boolean {
  return project.game.platform !== 'snes' && photoLayout(project.bytes, project.teams.length) !== null
}

function layoutOf(project: RomProject): PhotoLayout {
  const layout = project.game.platform === 'snes' ? null : photoLayout(project.bytes, project.teams.length)
  if (!layout) throw new Error('This ROM keeps its player photos in a way the editor cannot read.')
  return layout
}

// The 16 colours a photo's pixel numbers stand for.
export function photoPalette(project: RomProject): number[] {
  return layoutOf(project).palette
}

export function teamPhotos(project: RomProject, team: number): TeamPhoto[] {
  const layout = layoutOf(project)
  return layout.lists[team].entries.map((entry) => ({
    slot: entry.slot,
    picture: photoPicture(project.bytes, layout, entry.at),
    generic: layout.generic.includes(entry.at),
    sharedWith: layout.lists.flatMap((list, t) =>
      list.entries.filter((other) => other.at === entry.at && other !== entry).map((other) => ({ team: t, slot: other.slot })),
    ),
  }))
}

// The project with the ROM's bytes changed, so the layout is read again.
const withBytes = (project: RomProject, bytes: Uint8Array): RomProject => ({ ...project, bytes })

// Writes `entries` as `team`'s list: where it is if it fits there, else at the end of the ROM.
function writeList(rom: Uint8Array, layout: PhotoLayout, team: number, entries: PhotoEntry[]): Uint8Array {
  if (entries.length < FEWEST_PHOTOS) throw new Error(`A team needs at least ${FEWEST_PHOTOS} featured players: the team setup screen shows six in turn.`)
  const list = layout.lists[team]
  const shared = layout.lists.some((other, t) => t !== team && other.at === list.at)
  const room = shared ? 0 : listRoom(rom, layout, team)
  const bytes = new Uint8Array(entries.length * ENTRY_BYTES + 4)
  entries.forEach((entry, i) => {
    writeU32(bytes, i * ENTRY_BYTES, entry.at)
    writeU16(bytes, i * ENTRY_BYTES + 4, entry.slot)
  })
  if (entries.length <= room) {
    rom.fill(0, list.at, list.at + list.entries.length * ENTRY_BYTES + 4)
    rom.set(bytes, list.at)
    return rom
  }
  const claimed = claimSpace(rom, bytes.length)
  if (!claimed) throw new Error('This ROM has no room left for a longer list of photos.')
  claimed.rom.set(bytes, claimed.at)
  writeU32(claimed.rom, layout.tableAt + team * 4, claimed.at)
  return claimed.rom
}

// How many entries a team's list has room for where it is: up to the next
// list that follows it in the ROM, or as many as it has.
function listRoom(rom: Uint8Array, layout: PhotoLayout, team: number): number {
  const { at, entries } = layout.lists[team]
  const after = layout.lists.map((list) => list.at).filter((other) => other > at)
  if (after.length === 0) return entries.length
  const next = Math.min(...after)
  // Only zeros between the end of this list and the next, as in the 30-team ROM's lists.
  const end = at + entries.length * ENTRY_BYTES + 4
  for (let i = end; i < next; i++) if (rom[i] !== 0) return entries.length
  return Math.floor((next - at - 4) / ENTRY_BYTES)
}

// `team`'s photo `index` replaced by `picture` (pixels 5 to 12). A picture
// that is this player's alone is rewritten where it is if it fits; any other
// is given a new one at the end of the ROM, so the players who shared it keep theirs.
export function withPhoto(project: RomProject, team: number, index: number, picture: Picture): RomProject {
  const layout = layoutOf(project)
  const entry = layout.lists[team].entries[index]
  const users = layout.lists.flatMap((list) => list.entries).filter((other) => other.at === entry.at).length
  const rom = project.bytes.slice()
  if (users === 1 && !layout.generic.includes(entry.at) && entry.at !== layout.baseAt && rewriteBlock(rom, layout, entry.at, picture)) {
    return withBytes(project, rom)
  }
  const block = newBlock(picture)
  const claimed = claimSpace(rom, block.length)
  if (!claimed) throw new Error('This ROM has no room left for another photo.')
  claimed.rom.set(block, claimed.at)
  const entries = layout.lists[team].entries.map((other, i) => (i === index ? { ...other, at: claimed.at } : other))
  return withBytes(project, writeList(claimed.rom, layout, team, entries))
}

// `team`'s list with its entries rearranged: kept, moved, given other slots
// or removed, as `change` returns them; new ones take a generic picture.
function withEntries(project: RomProject, team: number, change: (entries: PhotoEntry[], layout: PhotoLayout) => PhotoEntry[]): RomProject {
  const layout = layoutOf(project)
  const entries = change(layout.lists[team].entries.slice(), layout)
  return withBytes(project, writeList(project.bytes.slice(), layout, team, entries))
}

export function withPhotoSlot(project: RomProject, team: number, index: number, slot: number): RomProject {
  return withEntries(project, team, (entries) => entries.map((entry, i) => (i === index ? { ...entry, slot } : entry)))
}

export function withPhotoMoved(project: RomProject, team: number, index: number, to: number): RomProject {
  return withEntries(project, team, (entries) => {
    const [moved] = entries.splice(index, 1)
    entries.splice(to, 0, moved)
    return entries
  })
}

export function withPhotoRemoved(project: RomProject, team: number, index: number): RomProject {
  return withEntries(project, team, (entries) => entries.filter((_, i) => i !== index))
}

// `team`'s list set to `entries` as they are.
export function withPhotoEntries(project: RomProject, team: number, entries: PhotoEntry[]): RomProject {
  return withEntries(project, team, () => entries)
}

// A new entry for the player in `slot`, with the generic picture the game
// gives a goalie or a skater with none.
export function withPhotoAdded(project: RomProject, team: number, slot: number, goalie: boolean): RomProject {
  return withEntries(project, team, (entries, layout) => [...entries, { at: layout.generic[goalie ? 1 : 3], slot }])
}

// ------------------------------------------------------------ images

// The largest square in the middle of an image, made 48 by 48: each pixel the
// average of those it covers, as red, green, blue and how solid (0 to 1).
export function squareImage(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): Float64Array {
  const side = Math.min(width, height)
  if (side === 0) throw new Error('The image is empty.')
  const [left, top] = [Math.floor((width - side) / 2), Math.floor((height - side) / 2)]
  const out = new Float64Array(PHOTO_SIZE * PHOTO_SIZE * 4)
  const scale = side / PHOTO_SIZE
  const span = (at: number, from: number) => [from + Math.floor(at * scale), from + Math.max(Math.floor(at * scale) + 1, Math.floor((at + 1) * scale))]
  for (let y = 0; y < PHOTO_SIZE; y++) {
    for (let x = 0; x < PHOTO_SIZE; x++) {
      const [x0, x1] = span(x, left)
      const [y0, y1] = span(y, top)
      const sum = [0, 0, 0, 0]
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * width + sx) * 4
          const alpha = rgba[i + 3] / 255
          for (let c = 0; c < 3; c++) sum[c] += rgba[i + c] * alpha
          sum[3] += alpha
        }
      }
      const count = (x1 - x0) * (y1 - y0)
      const o = (y * PHOTO_SIZE + x) * 4
      // Colour as seen where solid; how solid, on average.
      for (let c = 0; c < 3; c++) out[o + c] = sum[3] > 0 ? sum[c] / sum[3] : 255
      out[o + 3] = sum[3] / count
    }
  }
  return out
}

// Each pixel of a 48 by 48 image (as squareImage gives it) matched to the
// nearest of `choices`, with the difference spread to the pixels not yet
// matched (Floyd-Steinberg), so that shading stays smooth. `value` is what a
// pixel is compared by (one number or three); `alphaPixel` is what a mostly
// see-through pixel becomes, or null to treat it as its colour on white.
function dither(image: Float64Array, choices: { pixel: number; value: number[] }[], value: (rgb: number[]) => number[], alphaPixel: number | null): Picture {
  const size = choices[0].value.length
  const work = Array.from({ length: PHOTO_SIZE * PHOTO_SIZE }, (_, i) => {
    const alpha = image[i * 4 + 3]
    const rgb = [0, 1, 2].map((c) => (alphaPixel === null ? image[i * 4 + c] * alpha + 255 * (1 - alpha) : image[i * 4 + c]))
    return value(rgb)
  })
  const pixels = new Uint8Array(PHOTO_SIZE * PHOTO_SIZE)
  for (let y = 0; y < PHOTO_SIZE; y++) {
    for (let x = 0; x < PHOTO_SIZE; x++) {
      const i = y * PHOTO_SIZE + x
      if (alphaPixel !== null && image[i * 4 + 3] < 0.5) {
        pixels[i] = alphaPixel
        continue
      }
      const here = work[i]
      const distance = (choice: number[]) => choice.reduce((sum, v, k) => sum + (v - here[k]) ** 2, 0)
      let best = choices[0]
      for (const choice of choices) if (distance(choice.value) < distance(best.value)) best = choice
      pixels[i] = best.pixel
      const error = here.map((v, k) => v - best.value[k])
      const spread = (dx: number, dy: number, part: number) => {
        const [nx, ny] = [x + dx, y + dy]
        if (nx < 0 || nx >= PHOTO_SIZE || ny >= PHOTO_SIZE) return
        for (let k = 0; k < size; k++) work[ny * PHOTO_SIZE + nx][k] += (error[k] * part) / 16
      }
      spread(1, 0, 7)
      spread(-1, 1, 3)
      spread(0, 1, 5)
      spread(1, 1, 1)
    }
  }
  return { width: PHOTO_SIZE, height: PHOTO_SIZE, pixels }
}

const luma = ([r, g, b]: number[]) => [0.299 * r + 0.587 * g + 0.114 * b]

// A Genesis photo from an image of any size: its middle square, made 48 by 48
// and grey, in the eight shades. See-through pixels count as white.
export function photoFromImage(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number, palette: number[]): Picture {
  const choices = Array.from({ length: SHADES }, (_, k) => ({ pixel: FIRST_SHADE + k, value: luma(colorRgb(palette[FIRST_SHADE + k])) }))
  return dither(squareImage(rgba, width, height), choices, luma, null)
}

// An SNES photo the same way, in the colours 1 to 15 of the team's photo
// colours, as they look; see-through pixels stay see-through (colour 0).
export function colourPhotoFromImage(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number, rgbs: number[][]): Picture {
  const choices = rgbs.slice(1).map((rgb, k) => ({ pixel: k + 1, value: rgb }))
  return dither(squareImage(rgba, width, height), choices, (rgb) => rgb, 0)
}
