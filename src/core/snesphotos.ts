import { readU16LE, writeU16LE } from './bytes'
import { colorRgb, SNES_COLORS } from './color'
import type { Picture } from './graphics'
import { isHuffman, packHuffman, unpackHuffman } from './huffman'
import { isLz, packLz, unpackLz } from './lz'
import { PHOTO_SIZE } from './photos'
import type { RomProject } from './rom'
import { findCode, loRomAddress, loRomBank, loRomOffset } from './snes'
import { freeSpace, keptBanks, roomAt, sameBank } from './snespictures'

// Player photos in the SNES game, on the player cards and the matchup
// screens. (From the disassembly, abdulahmad/NHL94SNES: DrawPlayerPicture and
// LoadMatchupPhotos.)
//
// PlayerPhotoTable has 26 long addresses a team, one for each place on the
// roster, each of a packed photo (Huffman in the original game, LZ in the
// 2026 builds; see huffman.ts and lz.ts): 36 tiles of 8 by 8 pixels, four
// bits a pixel, two pixels a byte, the left one in the high half, laid out
// 6 by 6 in order. Colour 0 is see-through. Each team draws all its photos in
// its own 16 colours (PhotoPaletteTable, a long address a team). Players
// with no photo of their own share generic ones, a goalie and three skaters,
// which take the team's colours from those 16; the game shows them mirrored
// for some players.
//
// Changes are made to the ROM as it is in the editor, as the hacks are: a
// photo that is this place's alone is packed again where it is, if it fits
// there; otherwise in free space, and the place pointed at it.

export const SNES_PHOTO_SLOTS = 26
const TILES = 36
const TILE = 32
const COLOURS = 16

// DrawPlayerPicture: clc; adc d0; asl; asl; tax; lda.l PlayerPhotoTable,x; sta p0; lda.l PlayerPhotoTable+2,x; sta p0+2.
const PHOTO_TABLE_LOADER = '1865..0a0aaabf(....)(..)85..bf......85..'
// Its palette: lda HomeTeam,y; asl; asl; clc; adc #PhotoPaletteTable; sta a1; lda #bank.
const PHOTO_PALETTE_LOADER = 'b9....0a0a1869(....)85..a9(..)00'

interface Layout {
  table: number
  palettes: number
}

const layouts = new WeakMap<Uint8Array, Layout | null>()

function layoutOf(rom: Uint8Array, teamCount: number): Layout | null {
  if (layouts.has(rom)) return layouts.get(rom)!
  let found: Layout | null = null
  const photos = findCode(rom, PHOTO_TABLE_LOADER)
  const palettes = findCode(rom, PHOTO_PALETTE_LOADER)
  if (photos && palettes && photos.groups[0] >= 0x8000 && palettes.groups[0] >= 0x8000) {
    const table = loRomOffset(photos.groups[1], photos.groups[0])
    const palette = loRomOffset(palettes.groups[1], palettes.groups[0])
    const ok =
      table + teamCount * SNES_PHOTO_SLOTS * 4 <= rom.length &&
      palette + teamCount * 4 <= rom.length &&
      Array.from({ length: teamCount * SNES_PHOTO_SLOTS }, (_, i) => photoAt(rom, table, i)).every((at) => at >= 0 && photoData(rom, at) !== null) &&
      Array.from({ length: teamCount }, (_, t) => long(rom, palette + t * 4)).every((at) => at >= 0 && at + COLOURS * 2 <= rom.length)
    if (ok) found = { table, palettes: palette }
  }
  layouts.set(rom, found)
  return found
}

const long = (rom: Uint8Array, at: number) => {
  const address = readU16LE(rom, at)
  return address >= 0x8000 ? loRomOffset(rom[at + 2], address) : -1
}
const photoAt = (rom: Uint8Array, table: number, entry: number) => long(rom, table + entry * 4)

function photoData(rom: Uint8Array, at: number): { data: Uint8Array; packedSize: number } | null {
  try {
    const unpacked = isHuffman(rom, at) ? unpackHuffman(rom, at) : isLz(rom, at) ? unpackLz(rom, at) : null
    return unpacked && unpacked.data.length >= TILES * TILE ? unpacked : null
  } catch {
    return null
  }
}

export function snesPhotosSupported(project: RomProject): boolean {
  return project.game.platform === 'snes' && layoutOf(project.bytes, project.teams.length) !== null
}

function need(project: RomProject): Layout {
  const layout = project.game.platform === 'snes' ? layoutOf(project.bytes, project.teams.length) : null
  if (!layout) throw new Error('This ROM keeps its player photos in a way the editor cannot read.')
  return layout
}

// A team's 16 photo colours.
export function snesPhotoPalette(project: RomProject, team: number): number[] {
  const layout = need(project)
  const at = long(project.bytes, layout.palettes + team * 4)
  return Array.from({ length: COLOURS }, (_, i) => readU16LE(project.bytes, at + i * 2))
}

export interface SnesPhoto {
  picture: Picture
  // Shared with other places, here or on other teams: a generic picture.
  shared: number
}

export function snesTeamPhotos(project: RomProject, team: number): SnesPhoto[] {
  const layout = need(project)
  const rom = project.bytes
  const all = Array.from({ length: project.teams.length * SNES_PHOTO_SLOTS }, (_, i) => photoAt(rom, layout.table, i))
  return Array.from({ length: SNES_PHOTO_SLOTS }, (_, slot) => {
    const at = all[team * SNES_PHOTO_SLOTS + slot]
    const data = photoData(rom, at)!.data
    const picture: Picture = { width: PHOTO_SIZE, height: PHOTO_SIZE, pixels: new Uint8Array(PHOTO_SIZE * PHOTO_SIZE) }
    for (let tile = 0; tile < TILES; tile++) {
      const [left, top] = [(tile % 6) * 8, Math.floor(tile / 6) * 8]
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const byte = data[tile * TILE + y * 4 + (x >> 1)]
          picture.pixels[(top + y) * PHOTO_SIZE + left + x] = x & 1 ? byte & 15 : byte >> 4
        }
      }
    }
    return { picture, shared: all.filter((other) => other === at).length - 1 }
  })
}

// The RGB of a team's photo colours, for matching an image to them.
export function snesPhotoRgbs(project: RomProject, team: number): number[][] {
  return snesPhotoPalette(project, team).map((word) => colorRgb(word, SNES_COLORS))
}

function photoBytes(picture: Picture): Uint8Array {
  const data = new Uint8Array(TILES * TILE)
  for (let tile = 0; tile < TILES; tile++) {
    const [left, top] = [(tile % 6) * 8, Math.floor(tile / 6) * 8]
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x += 2) {
        const pixel = (dx: number) => picture.pixels[(top + y) * PHOTO_SIZE + left + x + dx] & 15
        data[tile * TILE + y * 4 + (x >> 1)] = (pixel(0) << 4) | pixel(1)
      }
    }
  }
  return data
}

// The photo for `team`'s place `slot` replaced by `picture` (colours 0 to 15
// of the team's photo colours, 0 see-through). Packed as the ROM packs the
// photo it replaces.
export function withSnesPhoto(project: RomProject, team: number, slot: number, picture: Picture): RomProject {
  const layout = need(project)
  const rom = project.bytes.slice()
  const entry = layout.table + (team * SNES_PHOTO_SLOTS + slot) * 4
  const at = long(rom, entry)
  const old = photoData(rom, at)!
  const packed = isLz(rom, at) ? packLz(photoBytes(picture)) : packHuffman(photoBytes(picture))
  const users = Array.from({ length: project.teams.length * SNES_PHOTO_SLOTS }, (_, i) => photoAt(rom, layout.table, i)).filter((other) => other === at).length
  if (users === 1) rom.fill(0xff, at, at + old.packedSize)
  const to = users === 1 && packed.length <= roomAt(rom, at, 0) && sameBank(at, packed.length) ? at : freeSpace(rom, packed.length, keptBanks(rom))
  if (to < 0) {
    throw new Error('The ROM has no free space left for this photo. A photo with fewer colours and plainer areas packs smaller.')
  }
  rom.set(packed, to)
  writeU16LE(rom, entry, loRomAddress(to))
  rom[entry + 2] = loRomBank(to, rom[entry + 2])
  return { ...project, bytes: rom }
}

// A team's 16 photo colours set, where they are if no other team shares
// them, else in free space with the team pointed there.
export function withSnesPhotoPalette(project: RomProject, team: number, palette: number[]): RomProject {
  const layout = need(project)
  const rom = project.bytes.slice()
  const at = long(rom, layout.palettes + team * 4)
  const shared = project.teams.some((_, other) => other !== team && long(rom, layout.palettes + other * 4) === at)
  const to = shared ? freeSpace(rom, COLOURS * 2, keptBanks(rom)) : at
  if (to < 0) throw new Error('The ROM has no free space left for these photo colours.')
  palette.forEach((word, i) => writeU16LE(rom, to + i * 2, word))
  writeU16LE(rom, layout.palettes + team * 4, loRomAddress(to))
  rom[layout.palettes + team * 4 + 2] = loRomBank(to, rom[layout.palettes + team * 4 + 2])
  return { ...project, bytes: rom }
}

// The photo addresses of a team's 26 places, as they are in the table (3 bytes each).
export function snesPhotoRow(project: RomProject, team: number): Uint8Array[] {
  const layout = need(project)
  return Array.from({ length: SNES_PHOTO_SLOTS }, (_, slot) => {
    const at = layout.table + (team * SNES_PHOTO_SLOTS + slot) * 4
    return project.bytes.slice(at, at + 3)
  })
}

export function withSnesPhotoRow(project: RomProject, team: number, row: Uint8Array[]): RomProject {
  const layout = need(project)
  const rom = project.bytes.slice()
  row.forEach((address, slot) => rom.set(address, layout.table + (team * SNES_PHOTO_SLOTS + slot) * 4))
  return { ...project, bytes: rom }
}

// The photos of two places on a team swapped, for after moving players.
export function withSnesPhotosSwapped(project: RomProject, team: number, a: number, b: number): RomProject {
  const layout = need(project)
  const rom = project.bytes.slice()
  const [ea, eb] = [a, b].map((slot) => layout.table + (team * SNES_PHOTO_SLOTS + slot) * 4)
  const first = rom.slice(ea, ea + 3)
  rom.copyWithin(ea, eb, eb + 3)
  rom.set(first, eb)
  return { ...project, bytes: rom }
}
