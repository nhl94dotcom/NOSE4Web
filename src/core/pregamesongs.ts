import { readU16, readU32, writeU16, writeU32 } from './bytes'
import type { RomProject } from './rom'
import { claimSpace, claimSpace95, releaseSpace } from './space'

// A pre-game song for each home team (Genesis NHL 94 and NHL '95, chosen 2026-11-27): the matchup screen, where Ron
// Barr talks the game up, plays the home team's song in place of its own music. As Match Viewer read the games:
// ScoutingReport starts its music with move.w #song,-(sp) / jsr (song).l (NHL 94: $7A, SngScouting, scout94.asm;
// NHL '95: song 3, scout95.asm, after the driver's restart), and song() pops the number itself, plays nothing for a
// negative one, and the game start's own music takes over when the screen ends. Those 10 bytes become jsr to NOSE4Web's
// code and two nops; the code looks up HomeTeam's song in a table after it and calls song() with it:
//   movem.l d0/a0,-(sp); move.w (HomeTeam).w,d0; add.w d0,d0; lea table(pc),a0; move.w (a0,d0.w),-(sp);
//   jsr (song).l; movem.l (sp)+,d0/a0; rts; table: a word a team.

export const PREGAME_SILENCE = 0xffff
// Teams the table holds (HomeTeam is a team number; a league ROM has at most 32).
const TABLE_TEAMS = 32

interface Site {
  // The bytes before the push and after the jsr, which find the place, and the song the game plays there.
  before: string
  after: string
  song: number
  homeTeam: number
  claim: (rom: Uint8Array, size: number) => { rom: Uint8Array; at: number } | null
}
const SITES: Record<94 | 95, Site> = {
  // jsr BuildHotColdLists; clr.w (advframe).w; [move.w #$7A,-(sp); jsr (song).l]; move.l #vb2,(VBint).w
  94: { before: '4eb9........4278....', after: '21fc', song: 0x7a, homeTeam: 0xc330, claim: (rom, size) => claimSpace(rom, size) },
  // move.w #7,d0; move.w #0,d1; jsr (SoundCmd).l; [move.w #3,-(sp); jsr (song).l]; move.l #vb2,(VBint).w
  95: { before: '303c0007323c00004eb9........', after: '21fc', song: 3, homeTeam: 0xbf54, claim: (rom, size) => claimSpace95(rom, size) },
}

const hex = (text: string) => Uint8Array.from(text.match(/../g)!, (pair) => parseInt(pair, 16))
const editionOf = (project: Pick<RomProject, 'game'>): 94 | 95 | null => (project.game.platform !== 'genesis' ? null : project.game.edition === 95 ? 95 : 94)

// Where the pattern (hex, '..' any byte) is, if it is there exactly once.
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

const CODE_LENGTH = 30
function code(site: Site, song: number, table: number[]): Uint8Array {
  const out = new Uint8Array(CODE_LENGTH + table.length * 2)
  out.set(hex('48e78080' + '3038' + site.homeTeam.toString(16).padStart(4, '0') + 'd040' + '41fa0012' + '3f300000' + '4eb9'))
  writeU32(out, 20, song)
  out.set(hex('4cdf01014e75'), 24)
  table.forEach((value, i) => writeU16(out, CODE_LENGTH + i * 2, value))
  return out
}

// The place in the ROM: where the 10 bytes are, as the game has them (`plain`) or hooked, and for a hooked one the code.
function place(project: Pick<RomProject, 'game' | 'bytes'>): { site: Site; at: number; song: number; code: number | null } | null {
  const edition = editionOf(project)
  if (!edition) return null
  const site = SITES[edition]
  const rom = project.bytes
  const push = '3f3c' + site.song.toString(16).padStart(4, '0')
  const plain = only(rom, site.before + push + '4eb9........' + site.after)
  const hooked = only(rom, site.before + '4eb9........4e714e71' + site.after)
  if ((plain >= 0) === (hooked >= 0)) return null
  const at = (plain >= 0 ? plain : hooked) + site.before.length / 2
  if (plain >= 0) return { site, at, song: readU32(rom, at + 6), code: null }
  const target = readU32(rom, at + 2)
  if (target + CODE_LENGTH > rom.length) return null
  const template = code(site, readU32(rom, target + 20), [])
  if (!template.every((byte, i) => rom[target + i] === byte)) return null
  return { site, at, song: readU32(rom, target + 20), code: target }
}

export const pregameSongsSupported = (project: Pick<RomProject, 'game' | 'bytes'>) => place(project) !== null

// The game's own matchup song (each team's, where the ROM has no table of its own).
export const pregameOwnSong = (project: Pick<RomProject, 'game'>) => (editionOf(project) === 95 ? SITES[95].song : SITES[94].song)

// Each team's song, or null where the ROM plays the game's own for every team.
export function readPregameSongs(project: Pick<RomProject, 'game' | 'bytes' | 'teams'>): number[] | null {
  const found = place(project)
  if (!found || found.code === null) return null
  return project.teams.map((_, team) => readU16(project.bytes, found.code! + CODE_LENGTH + Math.min(team, TABLE_TEAMS - 1) * 2))
}

export class PregameSongError extends Error {}

// The ROM with each team's song (`songs`, by team; null puts the game's own back for all).
export function withPregameSongs(project: RomProject, songs: number[] | null): RomProject {
  const found = place(project)
  if (!found) throw new PregameSongError("This ROM's matchup screen is not as the original game's, so its music cannot be chosen by team.")
  let rom: Uint8Array = project.bytes.slice()
  const own = found.site.song
  // Out first: the game's own push and jsr back, the code's room given back.
  if (found.code !== null) {
    releaseSpace(rom, [{ start: found.code, end: found.code + CODE_LENGTH + TABLE_TEAMS * 2 }])
    rom.set(hex('3f3c' + own.toString(16).padStart(4, '0') + '4eb9'), found.at)
    writeU32(rom, found.at + 6, found.song)
  }
  if (songs === null || songs.every((song) => song === own)) return { ...project, bytes: rom }
  const table = Array.from({ length: TABLE_TEAMS }, (_, team) => songs[team] ?? own)
  const bytes = code(found.site, found.song, table)
  const claimed = found.site.claim(rom, bytes.length)
  if (!claimed) throw new PregameSongError('There is no room left in this ROM for the pre-game songs.')
  rom = claimed.rom
  rom.set(bytes, claimed.at)
  rom.set(hex('4eb9'), found.at)
  writeU32(rom, found.at + 2, claimed.at)
  rom.set(hex('4e714e71'), found.at + 6)
  return { ...project, bytes: rom }
}
