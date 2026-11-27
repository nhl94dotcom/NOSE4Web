// Each home team's crowd in its colours (NHL '95 on the Genesis, and the SNES, chosen 2026-11-27): the colours of the
// rink's own palette that nothing else on the screen uses are, on these games, the crowd's shirts in the stands
// (Match Viewer, 2026-11-27: on NHL '95 line 1's colours 6, 8, 9, 10 and 14, 10 being faces; on the SNES row 1's,
// the blue and green shirts 24 and 25, 26 and 27 free on retail and the 32-team build alike). A team has two colours,
// each with a darker shade for the shirts' second colour: the first on the green and brown shirts, the second on the
// gold and grey (NHL '95), or the first on the blue pair and the second on the green (SNES). $FFFF keeps the crowd's
// own.
//
// NHL '95: setupIceRinkPal ($7D6F0, the routine NHL 94 has, the only one that copies the rink's palette: setupice and
// RestoreGameScreen after a pause, a replay or the stats) becomes jmp to a copy of itself that then sets the four
// colours in palfadenew by HomeTeam ($BF54), from a table (4 words a team):
//   (the routine to its dbf); move.w (HomeTeam).w,d0; lsl.w #3,d0; lea table(pc),a0;
//   4 x (cmpi.w #$FFFF,k(a0,d0.w); beq.s +6; move.w k(a0,d0.w),(palfadenew+2*slot).w); rts
// NHL '95 has no horizontal scoreboard reload and no highlights to see to (Match Viewer).
//
// SNES: setplayercolors (jsl SetTeamColors, then the whole palbuffer to CGRAM; called by setupice, ExitStatsScreen and
// StartHL2 for highlights, with HomeTeam the highlighted game's) has its jsl SetTeamColors pointed at code that calls
// it and then puts the four colours in both palette buffers ($7E35F4 and $7E36F4, where setupice copies the rink's):
//   jsl SetTeamColors; phx; lda HomeTeam; asl x3; tax;
//   4 x (lda.l table+k,x; cmp #$FFFF; beq +8; sta.l $7E35F4+2*slot; sta.l $7E36F4+2*slot); plx; rtl

import { readU16, readU16LE, readU32, writeU16, writeU16LE, writeU32 } from './bytes'
import { colorRgb, GENESIS_COLORS, SNES_COLORS } from './color'
import { bannerColors } from './graphics'
import type { RomProject } from './rom'
import { findCode, loRomAddress, loRomBank, loRomOffset, snesHomeTeamAddress } from './snes'
import { snesBlockColours } from './snesblockcolours'
import { freeSpace, keptBanks } from './snespictures'
import { claimSpace95, releaseSpace } from './space'

export const CROWD_OWN = 0xffff
const TABLE_TEAMS = 32
const ENTRY = 8

// ------------------------------------------------------------------ NHL '95
const G_ROUTINE = '207c........d1d0700f327c....22d851c8fffc4e75'
const G_HOME_TEAM = 0xbf54
// Line 1's colours, in the order of a team's four words: its first colour, darker, its second, darker.
const G_SLOTS = [14, 9, 8, 6]
// Each colour's code is 14 bytes: cmpi.w #$FFFF,k(a0,d0.w) (6), beq.s (2), move.w k(a0,d0.w),(palfadenew+2*slot).w (6).
const G_SLOT = 14
const G_CODE = 30 + 4 * G_SLOT + 2

const hex = (text: string) => Uint8Array.from(text.match(/../g)!, (pair) => parseInt(pair, 16))
const word = (n: number) => n.toString(16).padStart(4, '0')

function only(rom: Uint8Array, pattern: string): number {
  const bytes = pattern.match(/../g)!.map((pair) => (pair === '..' ? -1 : parseInt(pair, 16)))
  let found = -1
  for (let at = rom.indexOf(bytes[0]); at >= 0 && at + bytes.length <= rom.length; at = rom.indexOf(bytes[0], at + 1)) {
    if (!bytes.every((byte, i) => byte < 0 || rom[at + i] === byte)) continue
    if (found >= 0) return -1
    found = at
  }
  return found
}

function genesisCode(rink: number, palfade: number, table: number[]): Uint8Array {
  const out = new Uint8Array(G_CODE + table.length * 2)
  out.set(hex('207c'))
  writeU32(out, 2, rink)
  out.set(hex('d1d0700f327c' + word(palfade) + '22d851c8fffc' + '3038' + word(G_HOME_TEAM) + 'e748' + '41fa' + word(G_CODE - 28)), 6)
  G_SLOTS.forEach((slot, k) => out.set(hex('0c70ffff' + word(k * 2) + '6706' + '31f0' + word(k * 2) + word(palfade + (16 + slot) * 2)), 30 + k * G_SLOT))
  out.set(hex('4e75'), 30 + 4 * G_SLOT)
  table.forEach((value, i) => writeU16(out, G_CODE + i * 2, value))
  return out
}

function genesisPlace(rom: Uint8Array): { at: number; rink: number; palfade: number; code: number | null } | null {
  const plain = only(rom, G_ROUTINE)
  const hooked = only(rom, '4ef9........' + G_ROUTINE.slice(12))
  if ((plain >= 0) === (hooked >= 0)) return null
  if (plain >= 0) return { at: plain, rink: readU32(rom, plain + 2), palfade: readU16(rom, plain + 12), code: null }
  const target = readU32(rom, hooked + 2)
  if (target + G_CODE > rom.length) return null
  const [rink, palfade] = [readU32(rom, target + 2), readU16(rom, hooked + 12)]
  return genesisCode(rink, palfade, []).every((byte, i) => rom[target + i] === byte) ? { at: hooked, rink, palfade, code: target } : null
}

// ------------------------------------------------------------------ SNES
// setplayercolors: jsl SetTeamColors; lda #; sta p0+2; lda #; sta p0; ldy #0; ldx #$100; jsl DMAToCGRAM; rtl.
const S_SITE = '22(......)a9..0085..a9....85..a00000a2000122......6b'
const S_SLOTS = [24, 25, 26, 27]
const S_BUFFERS = [0x35f4, 0x36f4]
const S_CODE = 82

const long = (rom: Uint8Array, at: number) => rom[at] | (rom[at + 1] << 8) | (rom[at + 2] << 16)
const offsetOfLong = (address: number) => loRomOffset((address >> 16) & 0xff, address & 0xffff)
const longOf = (offset: number) => (loRomBank(offset, 0x80) << 16) | loRomAddress(offset)
const longBytes = (address: number) => [address & 0xff, (address >> 8) & 0xff, (address >> 16) & 0xff]

function snesCode(setTeamColors: number, homeTeam: number, tableAddress: number, table: number[]): Uint8Array {
  const out: number[] = [0x22, ...longBytes(setTeamColors), 0xda, 0xad, homeTeam & 0xff, homeTeam >> 8, 0x0a, 0x0a, 0x0a, 0xaa]
  S_SLOTS.forEach((slot, k) => {
    out.push(0xbf, ...longBytes(tableAddress + k * 2), 0xc9, 0xff, 0xff, 0xf0, 0x08)
    for (const buffer of S_BUFFERS) out.push(0x8f, ...longBytes(0x7e0000 + buffer + slot * 2))
  })
  out.push(0xfa, 0x6b)
  const bytes = new Uint8Array(S_CODE + table.length * 2)
  bytes.set(out)
  table.forEach((value, i) => writeU16LE(bytes, S_CODE + i * 2, value))
  return bytes
}

function snesPlace(rom: Uint8Array): { at: number; setTeamColors: number; homeTeam: number; code: number | null } | null {
  const site = findCode(rom, S_SITE)
  const homeTeam = snesHomeTeamAddress(rom)
  if (!site || homeTeam === null) return null
  const target = long(rom, site.at + 1)
  const code = offsetOfLong(target)
  // Hooked: the jsl goes to our code, whose own first jsl is SetTeamColors.
  if (code >= 0 && code + S_CODE <= rom.length && rom[code] === 0x22) {
    const setTeamColors = long(rom, code + 1)
    if (snesCode(setTeamColors, homeTeam, target + S_CODE, []).every((byte, i) => rom[code + i] === byte)) return { at: site.at, setTeamColors, homeTeam, code }
  }
  return { at: site.at, setTeamColors: target, homeTeam, code: null }
}

// ------------------------------------------------------------------ both

type Edition = 'nhl95' | 'snes'
const editionOf = (project: Pick<RomProject, 'game'>): Edition | null =>
  project.game.platform === 'snes' ? 'snes' : project.game.platform === 'genesis' && project.game.edition === 95 ? 'nhl95' : null

export function crowdColoursSupported(project: Pick<RomProject, 'game' | 'bytes'>): boolean {
  const edition = editionOf(project)
  return edition === 'nhl95' ? genesisPlace(project.bytes) !== null : edition === 'snes' ? snesPlace(project.bytes) !== null : false
}

// Where the table is, if the ROM has one.
function tableAt(project: Pick<RomProject, 'game' | 'bytes'>): { at: number; read: (rom: Uint8Array, at: number) => number } | null {
  const edition = editionOf(project)
  if (edition === 'nhl95') {
    const found = genesisPlace(project.bytes)
    return found?.code != null ? { at: found.code + G_CODE, read: readU16 } : null
  }
  if (edition === 'snes') {
    const found = snesPlace(project.bytes)
    return found?.code != null ? { at: found.code + S_CODE, read: readU16LE } : null
  }
  return null
}

// Each team's two colours (CROWD_OWN: the crowd's own), or null where every team has the crowd's own.
export function readCrowdColours(project: Pick<RomProject, 'game' | 'bytes' | 'teams'>): [number, number][] | null {
  const table = tableAt(project)
  if (!table) return null
  return project.teams.map((_, team) => {
    const at = table.at + Math.min(team, TABLE_TEAMS - 1) * ENTRY
    return [table.read(project.bytes, at), table.read(project.bytes, at + 4)]
  })
}

// The crowd's own colours, by the two a team sets (its first, its second).
export function crowdOwnColours(project: RomProject): [number, number] | null {
  const edition = editionOf(project)
  if (edition === 'nhl95') return [project.rinkPalette[16 + G_SLOTS[0]], project.rinkPalette[16 + G_SLOTS[2]]]
  if (edition === 'snes') return [project.rinkPalette[S_SLOTS[0]], project.rinkPalette[S_SLOTS[2]]]
  return null
}

// A colour's darker shade, for the shirts' second colour.
function darker(colour: number, snes: boolean): number {
  const format = snes ? SNES_COLORS : GENESIS_COLORS
  const levels = format.levels(colour).map((v) => Math.round(v * 0.6)) as [number, number, number]
  return format.word(levels)
}

export class CrowdColoursError extends Error {}

export function withCrowdColours(project: RomProject, colours: [number, number][] | null): RomProject {
  const edition = editionOf(project)
  if (!edition) throw new CrowdColoursError('This ROM cannot have crowd colours by team.')
  const snes = edition === 'snes'
  // (An SNES colour has 15 bits; a word from elsewhere may carry the 16th, which the console ignores.)
  const clean = (w: number) => (w === CROWD_OWN ? w : snes ? w & 0x7fff : w)
  const entries = (colours ?? []).map(([a0, b0]) => {
    const [a, b] = [clean(a0), clean(b0)]
    return [a, a === CROWD_OWN ? CROWD_OWN : darker(a, snes), b, b === CROWD_OWN ? CROWD_OWN : darker(b, snes)]
  })
  const table = Array.from({ length: TABLE_TEAMS }, (_, team) => entries[team] ?? [CROWD_OWN, CROWD_OWN, CROWD_OWN, CROWD_OWN]).flat()
  const none = colours === null || colours.every(([a, b]) => a === CROWD_OWN && b === CROWD_OWN)

  if (edition === 'nhl95') {
    const found = genesisPlace(project.bytes)
    if (!found) throw new CrowdColoursError("This ROM's rink colours are not loaded as the original game's, so the crowd's cannot be set by team.")
    let rom: Uint8Array = project.bytes.slice()
    if (found.code !== null) {
      releaseSpace(rom, [{ start: found.code, end: found.code + G_CODE + TABLE_TEAMS * ENTRY }])
      rom.set(hex('207c'), found.at)
      writeU32(rom, found.at + 2, found.rink)
    }
    if (none) return { ...project, bytes: rom }
    const bytes = genesisCode(found.rink, found.palfade, table)
    const claimed = claimSpace95(rom, bytes.length)
    if (!claimed) throw new CrowdColoursError('There is no room left in this ROM for the crowd colours.')
    rom = claimed.rom
    rom.set(bytes, claimed.at)
    rom.set(hex('4ef9'), found.at)
    writeU32(rom, found.at + 2, claimed.at)
    return { ...project, bytes: rom }
  }

  const found = snesPlace(project.bytes)
  if (!found) throw new CrowdColoursError("This ROM's team colours are not set as the original game's, so the crowd's cannot be set by team.")
  const rom = project.bytes.slice()
  if (found.code !== null) {
    rom.fill(0xff, found.code, found.code + S_CODE + TABLE_TEAMS * ENTRY)
    rom.set(longBytes(found.setTeamColors), found.at + 1)
  }
  if (none) return { ...project, bytes: rom }
  const size = S_CODE + TABLE_TEAMS * ENTRY
  const at = freeSpace(rom, size, keptBanks(rom))
  if (at < 0 || Math.floor(at / 0x8000) !== Math.floor((at + size - 1) / 0x8000)) throw new CrowdColoursError('There is no room left in this ROM for the crowd colours.')
  const address = longOf(at)
  rom.set(snesCode(found.setTeamColors, found.homeTeam, address + S_CODE, table), at)
  rom.set(longBytes(address), found.at + 1)
  return { ...project, bytes: rom }
}

// Each team's two colours from its banner: NHL '95's two stripes, or the SNES block's two ramps (the lighter end of
// each).
export function crowdColoursFromBanners(project: RomProject): [number, number][] {
  const snes = editionOf(project) === 'snes'
  return project.teams.map((_, team) => {
    if (!snes) {
      const [a, b] = bannerColors(project, team)
      return [a, b]
    }
    const block = snesBlockColours(project, team)
    return block ? [block[7] & 0x7fff, block[8] & 0x7fff] : [CROWD_OWN, CROWD_OWN]
  })
}

export const crowdColourRgb = (project: Pick<RomProject, 'game'>, word: number) => colorRgb(word, editionOf(project) === 'snes' ? SNES_COLORS : GENESIS_COLORS)
