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
// In a team's menu palette, colours 1 and 2 (or 3 and 4, when the team is
// listed second) are the banner's two stripes. The logo uses 5 to 15.
const BANNER_COLOR_SLOTS = [1, 2]
const BANNER_COLOR_SLOTS_SECOND = [3, 4]
const LOGO_FIRST_COLOR = 5
export const LOGO_COLORS = 16 - LOGO_FIRST_COLOR

// A picture as rows of palette numbers, 0 to 15. Colour 0 is see-through.
export interface Picture {
  width: number
  height: number
  pixels: Uint8Array
}

export type BannerKind = 'menu' | 'game'

// Pictures the user has replaced, by team. Anything not listed is left
// exactly as it is in the ROM.
export interface GraphicsEdits {
  rinkLogos: Record<number, Picture>
  menuLogos: Record<number, Picture>
  // A team's 32 menu colours: the logo's and the banner stripes'.
  menuPalettes: Record<number, number[]>
  menuBanners: Record<number, Picture>
  gameBanners: Record<number, Picture>
}

export const NO_GRAPHICS_EDITS: GraphicsEdits = {
  rinkLogos: {},
  menuLogos: {},
  menuPalettes: {},
  menuBanners: {},
  gameBanners: {},
}

interface Block {
  at: number
  tileCount: number
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
    return { at, tileCount, paletteAt: 0, mapAt: 0, mapWidth: 0, mapHeight: 0, entries: [], end }
  }
  const mapAt = at + mapOffset
  if (mapOffset < HEADER_BYTES + tileCount * TILE_BYTES || mapAt + 4 > rom.length) throw new Error('bad picture block')
  const mapWidth = readU16(rom, mapAt)
  const mapHeight = readU16(rom, mapAt + 2)
  if (mapWidth === 0 || mapHeight === 0 || mapWidth > 64 || mapHeight > 256) throw new Error('bad picture map')
  const entries: number[] = []
  for (let i = 0; i < mapWidth * mapHeight; i++) entries.push(readU16(rom, mapAt + 4 + i * 2))
  if (entries.some((entry) => (entry & TILE_NUMBER) >= tileCount)) throw new Error('bad picture map')
  return { at, tileCount, paletteAt: at + paletteOffset, mapAt, mapWidth, mapHeight, entries, end: mapAt + 4 + entries.length * 2 }
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

function decodeMapped(rom: Uint8Array, block: Block): Picture {
  const picture = newPicture(block.mapWidth, block.mapHeight)
  block.entries.forEach((entry, i) => {
    const tileAt = block.at + HEADER_BYTES + (entry & TILE_NUMBER) * TILE_BYTES
    drawTile(rom, tileAt, entry, picture, (i % block.mapWidth) * 8, Math.floor(i / block.mapWidth) * 8)
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

// Turns a picture into tiles and a map, storing each distinct tile once and
// reusing it mirrored where that works.
function encodeMapped(picture: Picture, flags: number): { tiles: string[]; entries: number[] } {
  const tiles: string[] = []
  const known = new Map<string, number>()
  const entries: number[] = []
  for (let top = 0; top < picture.height; top += 8) {
    for (let left = 0; left < picture.width; left += 8) {
      const plain = tileBytes(picture, left, top, false, false)
      let entry = known.get(plain)
      if (entry === undefined) {
        entry = tiles.length
        tiles.push(plain)
        known.set(plain, entry)
        // Seen mirrored, this tile can stand in for its mirror images too.
        const mirrors: [boolean, boolean, number][] = [[true, false, FLIP_H], [false, true, FLIP_V], [true, true, FLIP_H | FLIP_V]]
        for (const [h, v, bits] of mirrors) {
          const mirrored = tileBytes(picture, left, top, h, v)
          if (!known.has(mirrored)) known.set(mirrored, entry | bits)
        }
      }
      entries.push(entry | flags)
    }
  }
  return { tiles, entries }
}

function writeTiles(rom: Uint8Array, at: number, tiles: string[]): void {
  tiles.forEach((tile, t) => {
    for (let i = 0; i < TILE_BYTES; i++) rom[at + t * TILE_BYTES + i] = tile.charCodeAt(i)
  })
}

// ---------------------------------------------------------- where things are

interface Layout {
  rinkLogos: number[]
  menuLogos: Block[]
  menuPalettesAt: number
  banners: Record<BannerKind, Block>
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
    if (block.mapAt !== 0 || block.tileCount !== RINK_LOGO.tilesWide * RINK_LOGO.tilesHigh) throw new Error('bad rink logo')
  }
  const menuLogos = table(g.menuLogoTablePointer).map((at) => readBlock(rom, at))
  const banners = { menu: readBlock(rom, readU32(rom, g.menuBannerPointer)), game: readBlock(rom, readU32(rom, g.gameBannerPointer)) }
  for (const block of [...menuLogos, banners.menu, banners.game]) if (block.mapAt === 0) throw new Error('picture has no map')
  for (const block of [banners.menu, banners.game]) {
    if (block.mapHeight < game.teamCount * BANNER_TILES_HIGH) throw new Error('too few banners')
  }
  return { rinkLogos, menuLogos, menuPalettesAt: readU32(rom, g.menuLogoPalettePointer), banners }
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
  const edited = (kind === 'menu' ? project.graphics.menuBanners : project.graphics.gameBanners)[team]
  if (edited) return edited
  return bannerSlice(decodeMapped(project.bytes, layout(project.bytes, project.game).banners[kind]), team)
}

// The 16 colours a banner is drawn with. On the menus, two of them are the
// team's own stripe colours; during play the colours are the same for all.
export function bannerPalette(project: Source, kind: BannerKind, team: number): number[] {
  const block = layout(project.bytes, project.game).banners[kind]
  const line = (block.entries[0] >> 13) & 3
  const palette = Array.from({ length: 16 }, (_, i) => readU16(project.bytes, block.paletteAt + (line * 16 + i) * 2))
  if (kind === 'menu') bannerColors(project, team).forEach((color, i) => (palette[BANNER_COLOR_SLOTS[i]] = color))
  return palette
}

// The colours a menu logo is drawn with: the logo's own, in a full set of 16.
export function menuLogoPalette(project: Source, team: number): number[] {
  return menuPalette(project, team).slice(0, 16)
}

// ------------------------------------------------------- pictures from files

const distance = (a: number[], b: number[]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2

// Matches each pixel of an image to the nearest of the allowed colours.
// `rgba` is four bytes per pixel. Mostly see-through pixels become colour 0.
export function pictureFromImage(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  palette: number[],
  allowed: number[],
): Picture {
  const colors = allowed.map((index) => ({ index, rgb: colorRgb(palette[index]) }))
  const pixels = new Uint8Array(width * height)
  for (let i = 0; i < pixels.length; i++) {
    if (rgba[i * 4 + 3] < 128) continue
    const rgb = [rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]]
    let best = colors[0]
    for (const color of colors) if (distance(color.rgb, rgb) < distance(best.rgb, rgb)) best = color
    pixels[i] = best.index
  }
  return { width, height, pixels }
}

// Builds a menu logo and its colours from an image. The image's most used
// colours become the logo's palette; the rest are matched to the nearest.
// Returns how many colours the image had after rounding to what the console
// can show, so the caller can say when some were merged.
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
    counts.set(word, (counts.get(word) ?? 0) + 1)
  }
  const chosen = [...counts].sort((a, b) => b[1] - a[1]).slice(0, LOGO_COLORS).map(([word]) => word)
  const next = palette.slice()
  for (let i = 0; i < LOGO_COLORS; i++) {
    const word = chosen[i] ?? 0
    next[LOGO_FIRST_COLOR + i] = word
    next[16 + LOGO_FIRST_COLOR + i] = word
  }
  const allowed = chosen.map((_, i) => LOGO_FIRST_COLOR + i)
  const picture = allowed.length > 0 ? pictureFromImage(rgba, width, height, next, allowed) : { width, height, pixels: new Uint8Array(width * height) }
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

  const contents = new Map<number, Uint8Array>()
  for (const block of distinct) contents.set(block.at, rom.slice(block.at, block.end))
  for (const team of teams) {
    const block = blocks[team]
    const { tiles, entries } = encodeMapped(edits[team], block.entries[0] & ~(TILE_NUMBER | FLIP_H | FLIP_V))
    const mapOffset = HEADER_BYTES + tiles.length * TILE_BYTES
    const bytes = new Uint8Array(mapOffset + 4 + entries.length * 2)
    writeU32(bytes, 0, mapOffset)
    writeU32(bytes, 4, mapOffset)
    writeU16(bytes, 8, tiles.length)
    writeTiles(bytes, HEADER_BYTES, tiles)
    writeU16(bytes, mapOffset, block.mapWidth)
    writeU16(bytes, mapOffset + 2, block.mapHeight)
    entries.forEach((entry, i) => writeU16(bytes, mapOffset + 4 + i * 2, entry))
    contents.set(block.at, bytes)
  }

  const needed = [...contents.values()].reduce((sum, bytes) => sum + bytes.length, 0)
  if (needed > end - start) {
    throw new Error(
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

function writeBanners(rom: Uint8Array, block: Block, edits: Record<number, Picture>, name: string): void {
  if (Object.keys(edits).length === 0) return
  const all = decodeMapped(rom, block)
  for (const [team, picture] of Object.entries(edits)) all.pixels.set(picture.pixels, Number(team) * picture.height * all.width)
  const { tiles, entries } = encodeMapped(all, block.entries[0] & ~(TILE_NUMBER | FLIP_H | FLIP_V))
  // The block keeps its size and layout, so nothing that points into it moves.
  if (tiles.length > block.tileCount) {
    throw new Error(
      `The ${name} banners need ${tiles.length - block.tileCount} more tiles than the ROM has room for. ` +
        'Lettering that repeats shapes, and banners that share them, take less room.',
    )
  }
  rom.fill(0, block.at + HEADER_BYTES, block.at + HEADER_BYTES + block.tileCount * TILE_BYTES)
  writeTiles(rom, block.at + HEADER_BYTES, tiles)
  entries.forEach((entry, i) => writeU16(rom, block.mapAt + 4 + i * 2, entry))
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
  }
  writeBanners(rom, where.banners.menu, edits.menuBanners, 'menu')
  writeBanners(rom, where.banners.game, edits.gameBanners, 'in-game')
  // Last, because it can move the logos and so change where things are.
  writeMenuLogos(rom, game, where.menuLogos, edits.menuLogos)
}

export const RINK_LOGO_SIZE = { width: RINK_LOGO.tilesWide * 8, height: RINK_LOGO.tilesHigh * 8 }
