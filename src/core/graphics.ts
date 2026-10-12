import { readU16, readU32, writeU16, writeU32 } from './bytes'
import { colorRgb, nearestColorWord } from './color'
import type { GameConfig } from './games'

// Team pictures: the logo at centre ice, the logo on the main menu, and the
// name banners shown on the menus and during play.
//
// The game stores a picture as a block:
//   +0  offset of the palette        (4 bytes, 0 if the block has none)
//   +4  offset of the tile map       (4 bytes, 0 if the block has none)
//   +8  number of tiles              (2 bytes)
//   +10 the tiles, 32 bytes each: 8x8 pixels, 4 bits per pixel
//   ... the palette, then the map: width and height in tiles, then one
//       word per position giving a tile number, with bits for mirroring
//       and for which of the screen's four palettes to use.
// Identical tiles are stored once and shared, which is why a picture's size
// in the ROM depends on what it shows.

const TILE_BYTES = 32
const HEADER_BYTES = 10
const TILE_NUMBER = 0x07ff
const FLIP_H = 0x0800
const FLIP_V = 0x1000

const RINK_LOGO = { tilesWide: 6, tilesHigh: 4 }
const BANNER_TILES_HIGH = 2
const LOGO_PALETTE_BYTES = 0x40
// A team's menu colours are kept in two tables. One holds the banner's two
// stripes, as colours 1 and 2 (or 3 and 4, when the team is listed second).
// The other holds the 16 colours its logo is drawn with: colours 5 and 6 are
// white and black for every team, which the banner's lettering uses too, so a
// logo may use them but must not redefine them; its own colours are 7 to 15.
// The first table has places for the logo's colours as well, kept in step
// here, though the game does not draw the logo from them.
const LOGO_COLOR_BYTES = 0x20
const BANNER_COLOR_SLOTS = [1, 2]
const BANNER_COLOR_SLOTS_SECOND = [3, 4]
const WHITE = 0x0eee
const BLACK = 0x0000
const LOGO_FIXED_COLORS = [
  { slot: 5, word: WHITE },
  { slot: 6, word: BLACK },
]
const LOGO_FIRST_COLOR = 7
// How many colours of its own a menu logo has, besides white and black.
export const LOGO_COLORS = 16 - LOGO_FIRST_COLOR

// A picture as rows of palette numbers, 0 to 15. Colour 0 is see-through.
export interface Picture {
  width: number
  height: number
  pixels: Uint8Array
}

export type BannerKind = 'menu' | 'visitor' | 'game'

// Pictures the user has replaced, by team. Anything not listed is left
// exactly as it is in the ROM.
export interface GraphicsEdits {
  rinkLogos: Record<number, Picture>
  menuLogos: Record<number, Picture>
  // A team's 32 menu colours: the logo's and the banner stripes'.
  menuPalettes: Record<number, number[]>
  menuBanners: Record<number, Picture>
  // Only for ROMs that keep a separate set of banners for the visiting team.
  visitorBanners: Record<number, Picture>
  gameBanners: Record<number, Picture>
}

const BANNER_EDITS = { menu: 'menuBanners', visitor: 'visitorBanners', game: 'gameBanners' } as const

export const NO_GRAPHICS_EDITS: GraphicsEdits = {
  rinkLogos: {},
  menuLogos: {},
  menuPalettes: {},
  menuBanners: {},
  visitorBanners: {},
  gameBanners: {},
}

interface Block {
  at: number
  tileCount: number
  // How many tiles there is room for before whatever follows them. A block
  // that has been given more room holds fewer tiles than this.
  capacity: number
  paletteAt: number
  mapAt: number
  mapWidth: number
  mapHeight: number
  entries: number[]
  end: number
}

function readBlock(rom: Uint8Array, at: number): Block {
  const paletteOffset = readU32(rom, at)
  const mapOffset = readU32(rom, at + 4)
  const tileCount = readU16(rom, at + 8)
  if (mapOffset === 0) {
    const end = at + HEADER_BYTES + tileCount * TILE_BYTES
    return { at, tileCount, capacity: tileCount, paletteAt: 0, mapAt: 0, mapWidth: 0, mapHeight: 0, entries: [], end }
  }
  const mapAt = at + mapOffset
  if (mapOffset < HEADER_BYTES + tileCount * TILE_BYTES || mapAt + 4 > rom.length) throw new Error('bad picture block')
  const mapWidth = readU16(rom, mapAt)
  const mapHeight = readU16(rom, mapAt + 2)
  if (mapWidth === 0 || mapHeight === 0 || mapWidth > 64 || mapHeight > 256) throw new Error('bad picture map')
  const entries: number[] = []
  for (let i = 0; i < mapWidth * mapHeight; i++) entries.push(readU16(rom, mapAt + 4 + i * 2))
  if (entries.some((entry) => (entry & TILE_NUMBER) >= tileCount)) throw new Error('bad picture map')
  const capacity = Math.floor((Math.min(paletteOffset || mapOffset, mapOffset) - HEADER_BYTES) / TILE_BYTES)
  return { at, tileCount, capacity, paletteAt: at + paletteOffset, mapAt, mapWidth, mapHeight, entries, end: mapAt + 4 + entries.length * 2 }
}

function drawTile(rom: Uint8Array, tileAt: number, flags: number, picture: Picture, left: number, top: number): void {
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const sx = flags & FLIP_H ? 7 - x : x
      const sy = flags & FLIP_V ? 7 - y : y
      const byte = rom[tileAt + sy * 4 + (sx >> 1)]
      picture.pixels[(top + y) * picture.width + left + x] = sx & 1 ? byte & 0x0f : byte >> 4
    }
  }
}

function newPicture(tilesWide: number, tilesHigh: number): Picture {
  return { width: tilesWide * 8, height: tilesHigh * 8, pixels: new Uint8Array(tilesWide * tilesHigh * 64) }
}

// A picture from a block's tiles, laid out by its own map or by another's.
function decodeMapped(rom: Uint8Array, block: Block, map: Block = block): Picture {
  const picture = newPicture(map.mapWidth, map.mapHeight)
  map.entries.forEach((entry, i) => {
    const tileAt = block.at + HEADER_BYTES + (entry & TILE_NUMBER) * TILE_BYTES
    drawTile(rom, tileAt, entry, picture, (i % map.mapWidth) * 8, Math.floor(i / map.mapWidth) * 8)
  })
  return picture
}

function tileBytes(picture: Picture, left: number, top: number, flipH: boolean, flipV: boolean): string {
  let bytes = ''
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x += 2) {
      const sy = top + (flipV ? 7 - y : y)
      const a = picture.pixels[sy * picture.width + left + (flipH ? 7 - x : x)]
      const b = picture.pixels[sy * picture.width + left + (flipH ? 6 - x : x + 1)]
      bytes += String.fromCharCode((a << 4) | b)
    }
  }
  return bytes
}

// Turns pictures of one size into tiles and a single map that lays out every
// one of them, storing each distinct tile once and reusing it mirrored where
// that works. With more than one picture, a tile number means the tile in
// that place of each picture's own set, so two places share a number only
// where every picture is the same there.
function encodeTogether(pictures: Picture[], flags: number): { tiles: string[][]; entries: number[] } {
  const tiles: string[][] = pictures.map(() => [])
  const known = new Map<string, number>()
  const entries: number[] = []
  const [first] = pictures
  const at = (left: number, top: number, h: boolean, v: boolean) => pictures.map((picture) => tileBytes(picture, left, top, h, v))
  for (let top = 0; top < first.height; top += 8) {
    for (let left = 0; left < first.width; left += 8) {
      const plain = at(left, top, false, false)
      let entry = known.get(plain.join('|'))
      if (entry === undefined) {
        entry = tiles[0].length
        plain.forEach((tile, i) => tiles[i].push(tile))
        known.set(plain.join('|'), entry)
        // Seen mirrored, this tile can stand in for its mirror images too.
        const mirrors: [boolean, boolean, number][] = [[true, false, FLIP_H], [false, true, FLIP_V], [true, true, FLIP_H | FLIP_V]]
        for (const [h, v, bits] of mirrors) {
          const mirrored = at(left, top, h, v).join('|')
          if (!known.has(mirrored)) known.set(mirrored, entry | bits)
        }
      }
      entries.push(entry | flags)
    }
  }
  return { tiles, entries }
}

function encodeMapped(picture: Picture, flags: number): { tiles: string[]; entries: number[] } {
  const { tiles, entries } = encodeTogether([picture], flags)
  return { tiles: tiles[0], entries }
}

function writeTiles(rom: Uint8Array, at: number, tiles: string[]): void {
  tiles.forEach((tile, t) => {
    for (let i = 0; i < TILE_BYTES; i++) rom[at + t * TILE_BYTES + i] = tile.charCodeAt(i)
  })
}

// Thrown when a picture is fine but the ROM has no room left for it.
export class NoRoomError extends Error {}

// ---------------------------------------------------------- where things are

interface Layout {
  rinkLogos: number[]
  menuLogos: Block[]
  menuPalettesAt: number
  menuLogoColorsAt: number
  banners: Record<BannerKind, Block>
  // Whether the visiting team's menu banners are a set of their own.
  visitorBannersApart: boolean
}

function layout(rom: Uint8Array, game: GameConfig): Layout {
  const g = game.graphics
  const table = (pointerAt: number) => {
    const at = readU32(rom, pointerAt)
    return Array.from({ length: game.teamCount }, (_, team) => readU32(rom, at + team * 4))
  }
  const rinkLogos = table(g.rinkLogoTablePointer)
  for (const at of rinkLogos) {
    const block = readBlock(rom, at)
    // Each has room for all its tiles even where a hack has set the count
    // of them lower, so the count is not relied on.
    const tiles = RINK_LOGO.tilesWide * RINK_LOGO.tilesHigh
    if (block.mapAt !== 0 || block.tileCount > tiles || at + HEADER_BYTES + tiles * TILE_BYTES > rom.length) throw new Error('bad rink logo')
  }
  const menuLogos = table(g.menuLogoTablePointer).map((at) => readBlock(rom, at))
  const bannerBlock = (kind: BannerKind) => {
    const ref = g.bannerReferences[kind][0]
    return readBlock(rom, readU32(rom, ref.at) - ref.offset)
  }
  const banners = { menu: bannerBlock('menu'), visitor: bannerBlock('visitor'), game: bannerBlock('game') }
  for (const block of [...menuLogos, ...Object.values(banners)]) if (block.mapAt === 0) throw new Error('picture has no map')
  for (const block of Object.values(banners)) {
    if (block.mapHeight < game.teamCount * BANNER_TILES_HIGH) throw new Error('too few banners')
  }
  return {
    rinkLogos,
    menuLogos,
    menuPalettesAt: readU32(rom, g.menuLogoPalettePointer),
    menuLogoColorsAt: readU32(rom, g.menuLogoColorsPointer),
    banners,
    visitorBannersApart: banners.visitor.at !== banners.menu.at,
  }
}

// The places that hold the address of one set of banners. Where the visitors
// have no set of their own, theirs are the menu banners.
function bannerReferences(game: GameConfig, kind: BannerKind, where: Layout) {
  const refs = game.graphics.bannerReferences
  return kind === 'menu' && !where.visitorBannersApart ? [...refs.menu, ...refs.visitor] : refs[kind]
}

// Whether every place known to use a set of banners points at the one block
// the editor reads.
function bannersAsExpected(rom: Uint8Array, game: GameConfig, kind: BannerKind, where: Layout): boolean {
  return bannerReferences(game, kind, where).every((ref) => readU32(rom, ref.at) === where.banners[kind].at + ref.offset)
}

// Whether a ROM's banners of one kind can be replaced.
export function bannersEditable(project: Source, kind: BannerKind): boolean {
  return bannersAsExpected(project.bytes, project.game, kind, layout(project.bytes, project.game))
}

// Whether this ROM shows the visiting team a set of menu banners of its own.
export function visitorBannersApart(project: Source): boolean {
  return layout(project.bytes, project.game).visitorBannersApart
}

// Whether this ROM keeps its team pictures where and how the editor expects.
export function graphicsSupported(rom: Uint8Array, game: GameConfig): boolean {
  try {
    layout(rom, game)
    return true
  } catch {
    return false
  }
}

// ------------------------------------------------------------------ reading

interface Source {
  game: GameConfig
  bytes: Uint8Array
  graphics: GraphicsEdits
}

export function rinkLogo(project: Source, team: number): Picture {
  const edited = project.graphics.rinkLogos[team]
  if (edited) return edited
  const at = layout(project.bytes, project.game).rinkLogos[team]
  const picture = newPicture(RINK_LOGO.tilesWide, RINK_LOGO.tilesHigh)
  for (let t = 0; t < RINK_LOGO.tilesWide * RINK_LOGO.tilesHigh; t++) {
    const left = (t % RINK_LOGO.tilesWide) * 8
    drawTile(project.bytes, at + HEADER_BYTES + t * TILE_BYTES, 0, picture, left, Math.floor(t / RINK_LOGO.tilesWide) * 8)
  }
  return picture
}

// Teams that show the same centre-ice logo as this one, such as the two All
// Stars teams in the original game. Changing it changes it for all of them.
export function rinkLogoSharedWith(project: Source, team: number): number[] {
  const logos = layout(project.bytes, project.game).rinkLogos
  return logos.flatMap((at, other) => (at === logos[team] ? [other] : []))
}

// The edits with one centre-ice logo replaced, for every team that shows it.
export function withRinkLogo(project: Source, team: number, picture: Picture): GraphicsEdits {
  const rinkLogos = { ...project.graphics.rinkLogos }
  for (const other of rinkLogoSharedWith(project, team)) rinkLogos[other] = picture
  return { ...project.graphics, rinkLogos }
}

export function menuLogo(project: Source, team: number): Picture {
  return project.graphics.menuLogos[team] ?? decodeMapped(project.bytes, layout(project.bytes, project.game).menuLogos[team])
}

export function menuPalette(project: Source, team: number): number[] {
  const edited = project.graphics.menuPalettes[team]
  if (edited) return edited
  const at = layout(project.bytes, project.game).menuPalettesAt + team * LOGO_PALETTE_BYTES
  return Array.from({ length: LOGO_PALETTE_BYTES / 2 }, (_, i) => readU16(project.bytes, at + i * 2))
}

// The two colours of a team's banner stripes on the menus.
export function bannerColors(project: Source, team: number): number[] {
  const palette = menuPalette(project, team)
  return BANNER_COLOR_SLOTS.map((slot) => palette[slot])
}

export function withBannerColors(palette: number[], colors: number[]): number[] {
  const next = palette.slice()
  colors.forEach((color, i) => {
    next[BANNER_COLOR_SLOTS[i]] = color
    next[16 + BANNER_COLOR_SLOTS_SECOND[i]] = color
  })
  return next
}

function bannerSlice(all: Picture, team: number): Picture {
  const height = BANNER_TILES_HIGH * 8
  const start = team * height * all.width
  return { width: all.width, height, pixels: all.pixels.slice(start, start + height * all.width) }
}

export function banner(project: Source, kind: BannerKind, team: number): Picture {
  const edited = project.graphics[BANNER_EDITS[kind]][team]
  if (edited) return edited
  const where = layout(project.bytes, project.game)
  return bannerSlice(decodeMapped(project.bytes, where.banners[kind], bannerMap(where, kind)), team)
}

// The 16 colours a banner is drawn with. On the menus, two of them are the
// team's own stripe colours; during play the colours are the same for all.
export function bannerPalette(project: Source, kind: BannerKind, team: number): number[] {
  const block = layout(project.bytes, project.game).banners[kind]
  const line = (block.entries[0] >> 13) & 3
  const palette = Array.from({ length: 16 }, (_, i) => readU16(project.bytes, block.paletteAt + (line * 16 + i) * 2))
  if (kind !== 'game') bannerColors(project, team).forEach((color, i) => (palette[BANNER_COLOR_SLOTS[i]] = color))
  return palette
}

// The block whose map lays out a set of banners. The game draws the visiting
// team's menu banner from tiles of its own but by the home banner's map, so
// where the visitors have their own tiles, they still have no map of their own.
const bannerMap = (where: Layout, kind: BannerKind) => (kind === 'visitor' ? where.banners.menu : where.banners[kind])

const bannerRows = (block: Block, team: number) =>
  block.entries.slice(team * BANNER_TILES_HIGH * block.mapWidth, (team + 1) * BANNER_TILES_HIGH * block.mapWidth).join()

// Teams that show the same banner as this one because the ROM has room for
// only one, as in hacks whose menu banners say just "Home" and "Visitor".
// Changing it changes it for all of them, until the banners are given room.
export function bannerSharedWith(project: Source, kind: BannerKind, team: number): number[] {
  const where = layout(project.bytes, project.game)
  const map = bannerMap(where, kind)
  const capacity = Math.min(where.banners[kind].capacity, map.capacity)
  if (capacity >= 2 * BANNER_TILES_HIGH * map.mapWidth) return [team]
  const rows = bannerRows(map, team)
  return Array.from({ length: project.game.teamCount }, (_, other) => other).filter((other) => bannerRows(map, other) === rows)
}

// The edits with one banner replaced, for every team that shows it.
export function withBanner(project: Source, kind: BannerKind, team: number, picture: Picture): GraphicsEdits {
  const banners = { ...project.graphics[BANNER_EDITS[kind]] }
  for (const other of bannerSharedWith(project, kind, team)) banners[other] = picture
  return { ...project.graphics, [BANNER_EDITS[kind]]: banners }
}

// The 16 colours a menu logo is drawn with.
export function menuLogoPalette(project: Source, team: number): number[] {
  const edited = project.graphics.menuPalettes[team]
  if (edited && project.graphics.menuLogos[team]) return edited.slice(0, 16)
  const at = layout(project.bytes, project.game).menuLogoColorsAt + team * LOGO_COLOR_BYTES
  return Array.from({ length: 16 }, (_, i) => readU16(project.bytes, at + i * 2))
}

// A team's menu colours as an imported logo should start from them.
export function menuLogoStart(project: Source, team: number): number[] {
  const palette = menuPalette(project, team).slice()
  menuLogoPalette(project, team).forEach((word, i) => {
    if (i >= LOGO_FIRST_COLOR) palette[i] = palette[16 + i] = word
  })
  return palette
}

// ------------------------------------------------------- pictures from files

const distance = (a: number[], b: number[]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2

// Matches each pixel of an image to the nearest of the allowed colours.
// `rgba` is four bytes per pixel. Mostly see-through pixels become colour 0.
// Where two allowed colours look the same, a pixel keeps the one it has in
// `like`, the picture being replaced, so that an untouched part of it still
// follows the same colour when the colours are changed later.
export function pictureFromImage(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  palette: number[],
  allowed: number[],
  like?: Picture,
): Picture {
  const colors = allowed.map((index) => ({ index, rgb: colorRgb(palette[index]) }))
  const pixels = new Uint8Array(width * height)
  for (let i = 0; i < pixels.length; i++) {
    if (rgba[i * 4 + 3] < 128) continue
    const rgb = [rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]]
    let best = colors[0]
    for (const color of colors) if (distance(color.rgb, rgb) < distance(best.rgb, rgb)) best = color
    const kept = like && colors.find((color) => color.index === like.pixels[i])
    pixels[i] = kept && distance(kept.rgb, rgb) === distance(best.rgb, rgb) ? kept.index : best.index
  }
  return { width, height, pixels }
}

// Builds a menu logo and its colours from an image. White and black are
// always available; the image's other most used colours become the logo's
// own, and the rest are matched to the nearest. Returns how many colours the
// image had besides white and black, after rounding to what the console can
// show, so the caller can say when some were merged.
export function menuLogoFromImage(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  palette: number[],
): { picture: Picture; palette: number[]; colorsFound: number } {
  const counts = new Map<number, number>()
  for (let i = 0; i < width * height; i++) {
    if (rgba[i * 4 + 3] < 128) continue
    const hexColor = '#' + [0, 1, 2].map((c) => rgba[i * 4 + c].toString(16).padStart(2, '0')).join('')
    const word = nearestColorWord(hexColor)
    if (word !== WHITE && word !== BLACK) counts.set(word, (counts.get(word) ?? 0) + 1)
  }
  const chosen = [...counts].sort((a, b) => b[1] - a[1]).slice(0, LOGO_COLORS).map(([word]) => word)
  const next = palette.slice()
  // Places the image has no colour for keep whatever they held.
  chosen.forEach((word, i) => {
    next[LOGO_FIRST_COLOR + i] = word
    next[16 + LOGO_FIRST_COLOR + i] = word
  })
  for (const { slot, word } of LOGO_FIXED_COLORS) {
    next[slot] = word
    next[16 + slot] = word
  }
  const allowed = [...LOGO_FIXED_COLORS.map((fixed) => fixed.slot), ...chosen.map((_, i) => LOGO_FIRST_COLOR + i)]
  const picture = pictureFromImage(rgba, width, height, next, allowed)
  return { picture, palette: next, colorsFound: counts.size }
}

// A picture as image data, four bytes per pixel, with colour 0 see-through.
export function pictureToImage(picture: Picture, palette: number[]): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(picture.pixels.length * 4)
  picture.pixels.forEach((index, i) => {
    if (index === 0) return
    rgba.set([...colorRgb(palette[index]), 255], i * 4)
  })
  return rgba
}

// ------------------------------------------------------------------ writing

const mapFlags = (block: Block) => block.entries[0] & ~(TILE_NUMBER | FLIP_H | FLIP_V)
const isFullSize = (block: Block) => block.tileCount === block.entries.length

// A menu logo as a block of its own. Sharing tiles makes it smaller; without
// sharing, every logo is the same size and can be replaced in place.
function logoBlock(picture: Picture, like: Block, shareTiles: boolean): Uint8Array {
  let { tiles, entries } = encodeMapped(picture, mapFlags(like))
  if (!shareTiles) {
    tiles = []
    for (let top = 0; top < picture.height; top += 8) {
      for (let left = 0; left < picture.width; left += 8) tiles.push(tileBytes(picture, left, top, false, false))
    }
    entries = tiles.map((_, i) => i | mapFlags(like))
  }
  const mapOffset = HEADER_BYTES + tiles.length * TILE_BYTES
  const bytes = new Uint8Array(mapOffset + 4 + entries.length * 2)
  writeU32(bytes, 0, mapOffset)
  writeU32(bytes, 4, mapOffset)
  writeU16(bytes, 8, tiles.length)
  writeTiles(bytes, HEADER_BYTES, tiles)
  writeU16(bytes, mapOffset, like.mapWidth)
  writeU16(bytes, mapOffset + 2, like.mapHeight)
  entries.forEach((entry, i) => writeU16(bytes, mapOffset + 4 + i * 2, entry))
  return bytes
}

function writeMenuLogos(rom: Uint8Array, game: GameConfig, blocks: Block[], edits: Record<number, Picture>): void {
  const teams = Object.keys(edits).map(Number)
  if (teams.length === 0) return
  // Logos sit one after another and share whatever room there is, so a
  // logo that needs more tiles can use room another gives up.
  const distinct = [...new Map(blocks.map((block) => [block.at, block])).values()].sort((a, b) => a.at - b.at)
  const start = distinct[0].at
  const end = distinct[distinct.length - 1].end
  // Space between two logos is fine as long as it is empty; anything else
  // there is something the editor does not know about and must not move over.
  const occupied = distinct.some((block, i) => {
    if (i === 0) return false
    const gap = rom.subarray(distinct[i - 1].end, block.at)
    return block.at < distinct[i - 1].end || !(gap.every((byte) => byte === 0) || gap.every((byte) => byte === 0xff))
  })
  if (occupied) throw new Error('The menu logos are not stored together in this ROM, so they cannot be replaced.')

  // Where every logo already has a tile for each position, as in ROMs given
  // more room, a logo is simply written in place at full size.
  if (distinct.every(isFullSize)) {
    for (const team of teams) rom.set(logoBlock(edits[team], blocks[team], false), blocks[team].at)
    return
  }

  const contents = new Map<number, Uint8Array>()
  for (const block of distinct) contents.set(block.at, rom.slice(block.at, block.end))
  for (const team of teams) contents.set(blocks[team].at, logoBlock(edits[team], blocks[team], true))

  const needed = [...contents.values()].reduce((sum, bytes) => sum + bytes.length, 0)
  if (needed > end - start) {
    throw new NoRoomError(
      `The menu logos need ${needed - (end - start)} more bytes than the ROM has for them. ` +
        'Logos with plainer areas and fewer fine details take less room.',
    )
  }
  const movedTo = new Map<number, number>()
  let at = start
  for (const block of distinct) {
    const bytes = contents.get(block.at)!
    rom.set(bytes, at)
    movedTo.set(block.at, at)
    at += bytes.length
  }
  rom.fill(0xff, at, end)
  const tableAt = readU32(rom, game.graphics.menuLogoTablePointer)
  blocks.forEach((block, team) => writeU32(rom, tableAt + team * 4, movedTo.get(block.at)!))
}

// Writes sets of banners that are laid out by one map: a single set, or the
// home and visiting teams' menu banners together. The first block's map is
// the one the game reads; the others are given the same, to stay readable.
function writeBanners(rom: Uint8Array, blocks: Block[], edits: Record<number, Picture>[], name: string): void {
  if (edits.every((set) => Object.keys(set).length === 0)) return
  const pictures = blocks.map((block, i) => {
    const all = decodeMapped(rom, block, blocks[0])
    for (const [team, picture] of Object.entries(edits[i])) all.pixels.set(picture.pixels, Number(team) * picture.height * all.width)
    return all
  })
  const { tiles, entries } = encodeTogether(pictures, 0)
  // Each block keeps its size and layout, so nothing that points into it moves.
  const capacity = Math.min(...blocks.map((block) => block.capacity))
  if (tiles[0].length > capacity) {
    throw new NoRoomError(
      `The ${name} banners need ${tiles[0].length - capacity} more tiles than the ROM has room for. ` +
        'Lettering that repeats shapes, and banners that share them, take less room.',
    )
  }
  blocks.forEach((block, i) => {
    rom.fill(0, block.at + HEADER_BYTES, block.at + HEADER_BYTES + block.capacity * TILE_BYTES)
    writeTiles(rom, block.at + HEADER_BYTES, tiles[i])
    // The game is told about more tiles only when more are really in use.
    writeU16(rom, block.at + 8, Math.max(tiles[i].length, block.tileCount))
    entries.forEach((entry, e) => writeU16(rom, block.mapAt + 4 + e * 2, entry | mapFlags(block)))
  })
}

// Writes the replaced pictures into `rom`. With no edits it changes nothing.
export function writeGraphics(rom: Uint8Array, game: GameConfig, edits: GraphicsEdits): void {
  const hasEdits = Object.values(edits).some((group) => Object.keys(group).length > 0)
  if (!hasEdits) return
  const where = layout(rom, game)

  for (const [team, picture] of Object.entries(edits.rinkLogos)) {
    const tiles: string[] = []
    for (let top = 0; top < picture.height; top += 8) {
      for (let left = 0; left < picture.width; left += 8) tiles.push(tileBytes(picture, left, top, false, false))
    }
    writeTiles(rom, where.rinkLogos[Number(team)] + HEADER_BYTES, tiles)
  }
  for (const [team, palette] of Object.entries(edits.menuPalettes)) {
    palette.forEach((word, i) => writeU16(rom, where.menuPalettesAt + Number(team) * LOGO_PALETTE_BYTES + i * 2, word))
    // The colours the game really draws the logo with change only with the logo.
    if (!edits.menuLogos[Number(team)]) continue
    const at = where.menuLogoColorsAt + Number(team) * LOGO_COLOR_BYTES
    for (let i = LOGO_FIRST_COLOR; i < 16; i++) writeU16(rom, at + i * 2, palette[i])
    for (const { slot, word } of LOGO_FIXED_COLORS) writeU16(rom, at + slot * 2, word)
  }
  // Where the visiting team has menu banners of its own, they are written
  // together with the home team's, whose map the game draws both by.
  const visitors = where.visitorBannersApart ? edits.visitorBanners : {}
  const sets: { kinds: BannerKind[]; pictures: Record<number, Picture>[]; name: string }[] = [
    where.visitorBannersApart
      ? { kinds: ['menu', 'visitor'], pictures: [edits.menuBanners, visitors], name: 'menu' }
      : { kinds: ['menu'], pictures: [edits.menuBanners], name: 'menu' },
    { kinds: ['game'], pictures: [edits.gameBanners], name: 'in-game' },
  ]
  for (const { kinds, pictures, name } of sets) {
    if (pictures.every((set) => Object.keys(set).length === 0)) continue
    if (!kinds.every((kind) => bannersAsExpected(rom, game, kind, where))) {
      throw new Error(`This ROM keeps its ${name} banners in a way the editor cannot change.`)
    }
    writeBanners(rom, kinds.map((kind) => where.banners[kind]), pictures, name)
  }
  // Last, because it can move the logos and so change where things are.
  writeMenuLogos(rom, game, where.menuLogos, edits.menuLogos)
}

// ---------------------------------------------------------------- more room
// In the original game the menu logos and the banners are packed tight, so a
// replacement with more detail may not fit. This moves them to unused space
// at the end of the ROM, each with room for a tile in every position, and
// repoints the game at them. The ROM file grows if it has to.

function claimSpace(rom: Uint8Array, size: number): { rom: Uint8Array; at: number } | null {
  let last = rom.length - 1
  while (last >= 0 && rom[last] === 0xff) last--
  // NOSE marks the end of the used part of a ROM it has edited. Where that
  // mark is the last thing in the ROM, it is moved to follow the new data.
  const marked = last >= 1 && rom[last - 1] === 0x60 && rom[last] === 0xfe
  const at = marked ? last - 1 : last + 1 + ((last + 1) % 2)
  const needed = at + size + (marked ? 2 : 0)
  let length = rom.length
  if (needed > length) length = length === 0x80000 || length === 0x100000 ? length * 2 : length === 0x200000 ? 0x300000 : 0
  if (needed > length) return null
  const grown = new Uint8Array(length).fill(0xff)
  grown.set(rom)
  if (marked) grown.set([0x60, 0xfe], at + size)
  return { rom: grown, at }
}

interface SpacePlan {
  banners: BannerKind[]
  logos: boolean
  size: number
}

const roomyBannerSize = (block: Block) =>
  HEADER_BYTES + block.entries.length * TILE_BYTES + (block.mapAt - block.paletteAt) + 4 + block.entries.length * 2
const roomyLogoSize = (block: Block) => HEADER_BYTES + block.entries.length * TILE_BYTES + 4 + block.entries.length * 2
const distinctBlocks = (blocks: Block[]) => [...new Map(blocks.map((block) => [block.at, block])).values()].sort((a, b) => a.at - b.at)

function planSpace(rom: Uint8Array, game: GameConfig): SpacePlan | null {
  const where = layout(rom, game)
  const kinds: BannerKind[] = where.visitorBannersApart ? ['menu', 'visitor', 'game'] : ['menu', 'game']
  const banners = kinds.filter((kind) => {
    const block = where.banners[kind]
    return bannersAsExpected(rom, game, kind, where) && block.capacity < block.entries.length
  })
  const logoBlocks = distinctBlocks(where.menuLogos)
  const logos = !logoBlocks.every(isFullSize)
  if (banners.length === 0 && !logos) return null
  const size =
    banners.reduce((sum, kind) => sum + roomyBannerSize(where.banners[kind]), 0) +
    (logos ? logoBlocks.reduce((sum, block) => sum + roomyLogoSize(block), 0) : 0)
  return { banners, logos, size }
}

// What giving the pictures more room would do, or null if they have it already.
export function pictureSpace(project: Source): { romSize: number; grows: boolean } | null {
  const plan = planSpace(project.bytes, project.game)
  const claimed = plan && claimSpace(project.bytes, plan.size)
  return claimed ? { romSize: claimed.rom.length, grows: claimed.rom.length > project.bytes.length } : null
}

export function expandPictureSpace<P extends Source>(project: P): P {
  const { game } = project
  const plan = planSpace(project.bytes, game)
  const claimed = plan && claimSpace(project.bytes, plan.size)
  if (!plan || !claimed) return project
  const where = layout(project.bytes, game)
  const rom = claimed.rom
  let at = claimed.at

  for (const kind of plan.banners) {
    const block = where.banners[kind]
    const paletteOffset = HEADER_BYTES + block.entries.length * TILE_BYTES
    const mapOffset = paletteOffset + (block.mapAt - block.paletteAt)
    rom.fill(0, at, at + roomyBannerSize(block))
    writeU32(rom, at, paletteOffset)
    writeU32(rom, at + 4, mapOffset)
    writeU16(rom, at + 8, block.tileCount)
    rom.set(project.bytes.subarray(block.at + HEADER_BYTES, block.at + HEADER_BYTES + block.tileCount * TILE_BYTES), at + HEADER_BYTES)
    rom.set(project.bytes.subarray(block.paletteAt, block.mapAt), at + paletteOffset)
    rom.set(project.bytes.subarray(block.mapAt, block.end), at + mapOffset)
    for (const ref of bannerReferences(game, kind, where)) writeU32(rom, ref.at, at + ref.offset)
    at += roomyBannerSize(block)
  }

  if (plan.logos) {
    const movedTo = new Map<number, number>()
    for (const block of distinctBlocks(where.menuLogos)) {
      rom.set(logoBlock(decodeMapped(project.bytes, block), block, false), at)
      movedTo.set(block.at, at)
      at += roomyLogoSize(block)
    }
    const tableAt = readU32(rom, game.graphics.menuLogoTablePointer)
    where.menuLogos.forEach((block, team) => writeU32(rom, tableAt + team * 4, movedTo.get(block.at)!))
  }
  return { ...project, bytes: rom }
}

export const RINK_LOGO_SIZE = { width: RINK_LOGO.tilesWide * 8, height: RINK_LOGO.tilesHigh * 8 }
