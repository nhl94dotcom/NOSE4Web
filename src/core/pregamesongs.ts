import { readU16, readU32, writeU16, writeU32 } from './bytes'
import type { RomProject } from './rom'
import { claimSpace, claimSpace95, releaseSpace } from './space'

// A pre-game song for each home team (Genesis NHL 94 and NHL '95, chosen 2026-11-27): the matchup screen, where Ron
// Barr talks the game up, plays the home team's song in place of its own music. As Match Viewer read the games:
// ScoutingReport starts its music with move.w #song,-(sp) / jsr (song).l (NHL 94: $7A, SngScouting, scout94.asm;
// NHL '95: song 3, scout95.asm, after the driver's restart), and song() pops the number itself, plays nothing for a
// negative one, and the game start's own music takes over when the screen ends. Those 10 bytes become jsr to NOSE4Web's
// code and two nops; the code looks up HomeTeam's song in a table after it and calls song() with it:
//   movem.l d0/a0,-(sp); move.w (HomeTeam).w,d0; add.w d0,d0; lea table(pc),a0; move.w (a0,d0.w),d0;
//   bpl.s +6; jsr (p_turnoff).l; move.w d0,-(sp); jsr (song).l; movem.l (sp)+,d0/a0; rts; table: a word a team.
// Silence ($FFFF) on NHL 94 calls p_turnoff ($1A264, all sound off, saving every register it uses) first, as Match
// Viewer found the Game Setup screen's title music otherwise plays on (2026-11-27); NHL '95's driver restart before
// the hook already stops it. NHL '95 has code of its own (ORGAN_95 below) that loads the organ's instruments first.
// Earlier builds' code is still read, and choosing again puts in the current one.

export const PREGAME_SILENCE = 0xffff
// Teams the table holds (HomeTeam is a team number; a league ROM has at most 32).
const TABLE_TEAMS = 32

interface Site {
  // The bytes before the push and after the jsr, which find the place, and the song the game plays there.
  before: string
  after: string
  song: number
  homeTeam: number
  // NHL 94's p_turnoff, found by its first bytes (movem.l d0-d7/a0-a2,-(sp); bsr; move.b #$77,...; move.b #$77,...);
  // null on NHL '95, whose code calls SoundCmd, the jsr in `before`.
  turnoff: string | null
  claim: (rom: Uint8Array, size: number) => { rom: Uint8Array; at: number } | null
}
const SITES: Record<94 | 95, Site> = {
  // jsr BuildHotColdLists; clr.w (advframe).w; [move.w #$7A,-(sp); jsr (song).l]; move.l #vb2,(VBint).w
  94: { before: '4eb9........4278....', after: '21fc', song: 0x7a, homeTeam: 0xc330, turnoff: '48e7ffe06100....11fc0077....11fc0077', claim: (rom, size) => claimSpace(rom, size) },
  // move.w #7,d0; move.w #0,d1; jsr (SoundCmd).l; [move.w #3,-(sp); jsr (song).l]; move.l #vb2,(VBint).w
  95: { before: '303c0007323c00004eb9........', after: '21fc', song: 3, homeTeam: 0xbf54, turnoff: null, claim: (rom, size) => claimSpace95(rom, size) },
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

const word = (value: number) => value.toString(16).padStart(4, '0')

// The code, as each build put it in: its length (the table follows), where it holds song()'s address, and the bytes for
// a song() address and a helper (NHL 94: p_turnoff; NHL '95: SoundCmd) with an empty table. The last is the one put in.
interface Build {
  length: number
  songAt: number
  make: (site: Site, song: number, helper: number) => Uint8Array
}
const head = (site: Site, lea: number) => '3038' + word(site.homeTeam) + 'd040' + '41fa' + word(lea)
const withLong = (text: string, longs: [number, number][], length: number) => {
  const out = new Uint8Array(length)
  out.set(hex(text))
  for (const [at, value] of longs) writeU32(out, at, value)
  return out
}
// The first build (both games): move.w (a0,d0.w),-(sp); jsr (song).l.
const FIRST: Build = {
  length: 30,
  songAt: 20,
  make: (site, song) => withLong('48e78080' + head(site, 0x12) + '3f300000' + '4eb900000000' + '4cdf01014e75', [[20, song]], 30),
}
// The second: the song in d0; bpl.s past jsr (p_turnoff).l for silence on NHL 94, three nops in its place on NHL '95.
const SECOND = (turnoff: boolean): Build => ({
  length: 40,
  songAt: 30,
  make: (site, song, helper) =>
    withLong('48e78080' + head(site, 0x1c) + '30300000' + '6a06' + (turnoff ? '4eb900000000' : '4e714e714e71') + '3f00' + '4eb900000000' + '4cdf01014e75', turnoff ? [[22, helper], [30, song]] : [[30, song]], 40),
})
// NHL '95's third (Match Viewer's, 2026-11-27): the matchup screen's driver has only the front end's instruments (load
// list 0), and every organ song needs patch $19 (and $32 / $35 also $0C), only in list 1, so before an organ song
// ($32 and up; silence, $FFFF, is below as a signed number) it loads list 1 as StartGame does:
//   movem.l d0-d2/a0-a2,-(sp); move.w (HomeTeam).w,d0; add.w d0,d0; lea table(pc),a0; move.w (a0,d0.w),d0;
//   cmpi.w #$32,d0; blt.s .play; move.w d0,-(sp); move.w #7,d0; move.w #1,d1; jsr (SoundCmd).l; move.w (sp)+,d0;
//   .play move.w d0,-(sp); jsr (song).l; movem.l (sp)+,d0-d2/a0-a2; rts
// List 1 on top of list 0 leaves out patch $49 (an effect), which nothing on the matchup screen plays; StartGame loads
// list 1 again.
const ORGAN_95: Build = {
  length: 56,
  songAt: 46,
  make: (site, song, helper) =>
    withLong('48e7e0e0' + head(site, 0x2c) + '30300000' + '0c400032' + '6d12' + '3f00' + '303c0007' + '323c0001' + '4eb900000000' + '301f' + '3f00' + '4eb900000000' + '4cdf07074e75', [[36, helper], [46, song]], 56),
}
const BUILDS: Record<94 | 95, Build[]> = { 94: [FIRST, SECOND(true)], 95: [FIRST, SECOND(false), ORGAN_95] }
const current = (edition: 94 | 95) => BUILDS[edition][BUILDS[edition].length - 1]

// The place in the ROM: where the 10 bytes are, as the game has them (`plain`) or hooked, and for a hooked one the code
// and where its table starts; and the helper the code calls.
function place(project: Pick<RomProject, 'game' | 'bytes'>): { site: Site; edition: 94 | 95; at: number; song: number; code: number | null; table: number; helper: number } | null {
  const edition = editionOf(project)
  if (!edition) return null
  const site = SITES[edition]
  const rom = project.bytes
  const push = '3f3c' + site.song.toString(16).padStart(4, '0')
  const plain = only(rom, site.before + push + '4eb9........' + site.after)
  const hooked = only(rom, site.before + '4eb9........4e714e71' + site.after)
  if ((plain >= 0) === (hooked >= 0)) return null
  const at = (plain >= 0 ? plain : hooked) + site.before.length / 2
  // NHL 94: p_turnoff, found by its bytes; NHL '95: SoundCmd, the jsr just before the place.
  const helper = site.turnoff !== null ? only(rom, site.turnoff) : readU32(rom, at - 4)
  if (helper < 0) return null
  if (plain >= 0) return { site, edition, at, song: readU32(rom, at + 6), code: null, table: 0, helper }
  const target = readU32(rom, at + 2)
  for (const build of BUILDS[edition]) {
    if (target + build.length > rom.length) continue
    const song = readU32(rom, target + build.songAt)
    if (build.make(site, song, helper).every((byte, i) => rom[target + i] === byte)) return { site, edition, at, song, code: target, table: target + build.length, helper }
  }
  return null
}

export const pregameSongsSupported = (project: Pick<RomProject, 'game' | 'bytes'>) => place(project) !== null

// The game's own matchup song (each team's, where the ROM has no table of its own).
export const pregameOwnSong = (project: Pick<RomProject, 'game'>) => (editionOf(project) === 95 ? SITES[95].song : SITES[94].song)

// Each team's song, or null where the ROM plays the game's own for every team.
export function readPregameSongs(project: Pick<RomProject, 'game' | 'bytes' | 'teams'>): number[] | null {
  const found = place(project)
  if (!found || found.code === null) return null
  return project.teams.map((_, team) => readU16(project.bytes, found.table + Math.min(team, TABLE_TEAMS - 1) * 2))
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
    releaseSpace(rom, [{ start: found.code, end: found.table + TABLE_TEAMS * 2 }])
    rom.set(hex('3f3c' + own.toString(16).padStart(4, '0') + '4eb9'), found.at)
    writeU32(rom, found.at + 6, found.song)
  }
  if (songs === null || songs.every((song) => song === own)) return { ...project, bytes: rom }
  const table = Array.from({ length: TABLE_TEAMS }, (_, team) => songs[team] ?? own)
  const build = current(found.edition)
  const bytes = new Uint8Array(build.length + table.length * 2)
  bytes.set(build.make(found.site, found.song, found.helper))
  table.forEach((value, i) => writeU16(bytes, build.length + i * 2, value))
  const claimed = found.site.claim(rom, bytes.length)
  if (!claimed) throw new PregameSongError('There is no room left in this ROM for the pre-game songs.')
  rom = claimed.rom
  rom.set(bytes, claimed.at)
  rom.set(hex('4eb9'), found.at)
  writeU32(rom, found.at + 2, claimed.at)
  rom.set(hex('4e714e71'), found.at + 6)
  return { ...project, bytes: rom }
}
