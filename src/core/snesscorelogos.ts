import { readU16LE, writeU16LE } from './bytes'
import { colorRgb, nearestColorWord, SNES_COLORS } from './color'
import type { Picture } from './graphics'
import type { RomProject } from './rom'
import { findCode, loRomAddress, loRomBank, loRomOffset } from './snes'
import { freeSpace, keptBanks } from './snespictures'

// The score box's team logos of the 32-team SNES builds (NHL94SNES-SA1's
// ScoreLogo.asm and src/data/teamart/README.md): where the original game
// prints a team's three letters, these builds draw a small logo, 3 x 2 tiles,
// 24 by 16 pixels, the logo 13 high at the top. ScoreLogoTable has, for each
// team, long addresses of its 6 tiles (four bits a pixel, the SNES's planar
// way, not packed, in rows) and its 16 colours, or 0 and 0 for a team shown
// by its letters. The game loads colours 4 to 15: 4 is the box's black, 5 its
// white ring, 6 to 15 the logo's own. The original game has no such logos.
//
// Changes are made to the ROM as it is in the editor, as the hacks are.

export const SCORE_LOGO = { width: 24, height: 16 }
// The rows the logo has; those under it stay clear, a gap above the score.
export const SCORE_LOGO_ROWS = 13
export const SCORE_BLACK = 4
export const SCORE_RING = 5
export const SCORE_FIRST_OWN = 6
const TILES = 6
const TILE = 32
const COLOURS = 16
const ENTRY = 8

// ScoreLogoTiles' .team: asl; asl; asl; tax; lda.l ScoreLogoTable+2,x; beq; sta p0+2; lda.l ScoreLogoTable,x; sta p0.
const TABLE_LOADER = '0a0a0aaabf(....)(..)f0..85..bf......85..'

const tables = new WeakMap<Uint8Array, number | null>()

function tableOf(rom: Uint8Array, teamCount: number): number | null {
  if (tables.has(rom)) return tables.get(rom)!
  const code = findCode(rom, TABLE_LOADER)
  let table: number | null = null
  if (code && code.groups[0] >= 0x8002) {
    const at = loRomOffset(code.groups[1], code.groups[0] - 2)
    const ok =
      at + teamCount * ENTRY <= rom.length &&
      Array.from({ length: teamCount }, (_, team) => entry(rom, at, team)).every(
        (e) => e === null || (e.tiles >= 0 && e.tiles + TILES * TILE <= rom.length && e.colours >= 0 && e.colours + COLOURS * 2 <= rom.length),
      )
    if (ok) table = at
  }
  tables.set(rom, table)
  return table
}

const long = (rom: Uint8Array, at: number) => {
  const address = readU16LE(rom, at)
  return address >= 0x8000 ? loRomOffset(rom[at + 2], address) : -1
}

// A team's tiles and colours, or null for one shown by its letters.
function entry(rom: Uint8Array, table: number, team: number): { tiles: number; colours: number } | null {
  const at = table + team * ENTRY
  if (readU16LE(rom, at) === 0 && readU16LE(rom, at + 2) === 0) return null
  return { tiles: long(rom, at), colours: long(rom, at + 4) }
}

export function snesScoreLogosSupported(project: RomProject): boolean {
  return project.game.platform === 'snes' && tableOf(project.bytes, project.teams.length) !== null
}

function need(project: RomProject): number {
  const table = project.game.platform === 'snes' ? tableOf(project.bytes, project.teams.length) : null
  if (table === null) throw new Error('This ROM has no score logos.')
  return table
}

export interface ScoreLogo {
  picture: Picture
  palette: number[]
  // Other teams with the same tiles or colours, which a change changes too.
  sharedWith: number[]
}

// A team's score logo, or null for one shown by its letters.
export function snesScoreLogo(project: RomProject, team: number): ScoreLogo | null {
  const table = need(project)
  const rom = project.bytes
  const own = entry(rom, table, team)
  if (!own) return null
  const picture: Picture = { width: SCORE_LOGO.width, height: SCORE_LOGO.height, pixels: new Uint8Array(SCORE_LOGO.width * SCORE_LOGO.height) }
  for (let tile = 0; tile < TILES; tile++) {
    const at = own.tiles + tile * TILE
    const [left, top] = [(tile % 3) * 8, Math.floor(tile / 3) * 8]
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const bit = 7 - x
        const value =
          ((rom[at + y * 2] >> bit) & 1) |
          (((rom[at + y * 2 + 1] >> bit) & 1) << 1) |
          (((rom[at + 16 + y * 2] >> bit) & 1) << 2) |
          (((rom[at + 16 + y * 2 + 1] >> bit) & 1) << 3)
        picture.pixels[(top + y) * SCORE_LOGO.width + left + x] = value
      }
    }
  }
  const palette = Array.from({ length: COLOURS }, (_, i) => readU16LE(rom, own.colours + i * 2))
  const sharedWith = project.teams
    .map((_, other) => other)
    .filter((other) => {
      const theirs = other === team ? null : entry(rom, table, other)
      return theirs !== null && (theirs.tiles === own.tiles || theirs.colours === own.colours)
    })
  return { picture, palette, sharedWith }
}

function tileBytes(picture: Picture): Uint8Array {
  const out = new Uint8Array(TILES * TILE)
  for (let tile = 0; tile < TILES; tile++) {
    const at = tile * TILE
    const [left, top] = [(tile % 3) * 8, Math.floor(tile / 3) * 8]
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const value = picture.pixels[(top + y) * SCORE_LOGO.width + left + x] & 15
        const bit = 1 << (7 - x)
        if (value & 1) out[at + y * 2] |= bit
        if (value & 2) out[at + y * 2 + 1] |= bit
        if (value & 4) out[at + 16 + y * 2] |= bit
        if (value & 8) out[at + 16 + y * 2 + 1] |= bit
      }
    }
  }
  return out
}

// `team`'s score logo made `picture` in `palette`. Written where its tiles
// and colours are, if no other team shares them; else, and for a team shown
// by its letters, into free space, with the team pointed there.
export function withSnesScoreLogo(project: RomProject, team: number, picture: Picture, palette: number[]): RomProject {
  const table = need(project)
  const rom = project.bytes.slice()
  const own = entry(rom, table, team)
  const shared = (part: 'tiles' | 'colours') =>
    own !== null && project.teams.some((_, other) => other !== team && entry(rom, table, other)?.[part] === own[part])
  const colours = new Uint8Array(COLOURS * 2)
  palette.forEach((word, i) => writeU16LE(colours, i * 2, word))
  const place = (part: 'tiles' | 'colours', bytes: Uint8Array, slot: number) => {
    let at = own && !shared(part) ? own[part] : -1
    if (at < 0) {
      at = freeSpace(rom, bytes.length, keptBanks(rom))
      if (at < 0) throw new Error('The ROM has no free space left for this score logo.')
    }
    rom.set(bytes, at)
    writeU16LE(rom, table + team * ENTRY + slot, loRomAddress(at))
    rom[table + team * ENTRY + slot + 2] = loRomBank(at, 0x80)
    rom[table + team * ENTRY + slot + 3] = 0
  }
  place('tiles', tileBytes(picture), 0)
  place('colours', colours, 4)
  return { ...project, bytes: rom }
}

// `team` shown by its letters, as in the original game. Its tiles and
// colours stay in the ROM, unused; Undo brings the logo back.
export function withoutSnesScoreLogo(project: RomProject, team: number): RomProject {
  const table = need(project)
  const rom = project.bytes.slice()
  rom.fill(0, table + team * ENTRY, table + (team + 1) * ENTRY)
  return { ...project, bytes: rom }
}

// A blank score logo for a team with none: the box's black and the white ring, no logo yet.
export function blankScoreLogo(): { picture: Picture; palette: number[] } {
  const palette = new Array(COLOURS).fill(0)
  palette[SCORE_RING] = 0x7fff
  return { picture: { ...SCORE_LOGO, pixels: new Uint8Array(SCORE_LOGO.width * SCORE_LOGO.height) }, palette }
}

// A score logo from an image 24 pixels wide and 13 or 16 high: its most used
// colours, up to ten, become the logo's own (6 to 15), black and the ring
// keep theirs, and every pixel is matched to the nearest of all twelve;
// see-through pixels stay see-through. Returns how many colours the image had.
export function scoreLogoFromImage(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  palette: number[],
): { picture: Picture; palette: number[]; colorsFound: number } {
  if (width !== SCORE_LOGO.width || (height !== SCORE_LOGO.height && height !== SCORE_LOGO_ROWS)) {
    throw new Error(
      `A score logo is imported as a picture ${SCORE_LOGO.width} pixels wide and ${SCORE_LOGO.height} high (or ${SCORE_LOGO_ROWS}, the logo without the gap under it), as the editor exports it; this one is ${width} by ${height}.`,
    )
  }
  const counts = new Map<number, number>()
  const fixed = [SCORE_BLACK, SCORE_RING].map((slot) => palette[slot] & 0x7fff)
  for (let i = 0; i < width * height; i++) {
    if (rgba[i * 4 + 3] < 128) continue
    const word = nearestColorWord('#' + [0, 1, 2].map((c) => rgba[i * 4 + c].toString(16).padStart(2, '0')).join(''), SNES_COLORS)
    if (!fixed.includes(word)) counts.set(word, (counts.get(word) ?? 0) + 1)
  }
  const own = COLOURS - SCORE_FIRST_OWN
  const chosen = [...counts].sort((a, b) => b[1] - a[1]).slice(0, own).map(([word]) => word)
  const next = palette.slice()
  chosen.forEach((word, i) => (next[SCORE_FIRST_OWN + i] = word))
  const slots = [SCORE_BLACK, SCORE_RING, ...chosen.map((_, i) => SCORE_FIRST_OWN + i)]
  const rgb = slots.map((slot) => colorRgb(next[slot], SNES_COLORS))
  const pixels = new Uint8Array(SCORE_LOGO.width * SCORE_LOGO.height)
  for (let i = 0; i < width * height; i++) {
    if (rgba[i * 4 + 3] < 128) continue
    let best = 0
    rgb.forEach((c, k) => {
      const d = (c[0] - rgba[i * 4]) ** 2 + (c[1] - rgba[i * 4 + 1]) ** 2 + (c[2] - rgba[i * 4 + 2]) ** 2
      const b = rgb[best]
      if (d < (b[0] - rgba[i * 4]) ** 2 + (b[1] - rgba[i * 4 + 1]) ** 2 + (b[2] - rgba[i * 4 + 2]) ** 2) best = k
    })
    pixels[i] = slots[best]
  }
  return { picture: { ...SCORE_LOGO, pixels }, palette: next, colorsFound: counts.size }
}
