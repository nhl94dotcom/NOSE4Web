import { readU16, readU32, writeU16, writeU32 } from './bytes'
import type { RomProject } from './rom'
import { claimSpace, claimSpace95, releaseSpace } from './space'

// A goal sound for each home team (Genesis NHL 94 and NHL '95, chosen 2026-11-28): the game plays its goal siren for
// every goal, in checkgoal (collide94.asm / goal95.asm), before it works out which team scored:
//   (wait for a vblank) move.w (sp)+,d0; [move.w #SFXsiren,-(sp); bsr.w sfx (NHL '95: jsr (sfx).l)];
//   jsr (freezewindow).l; addi.w #$1F4,(Crowdlevel).w; ...; tst.w Ypos(a3); bpl.w; exg; btst #gmdir,(gmode).w ...
// sfx pops its own number and plays nothing for a negative one; freezewindow only locks the scrolling. The push and
// call become jsr to NOSE4Web's code (and one nop; NHL '95 two), which works out the scorer as the game does just
// after (the home team scored when the puck's Ypos is not negative, unless gmdir has the home team going down) and
// plays the home team's sound from a table when it did, the visitors' sound otherwise:
//   movem.l d0/a0,-(sp); tst.w Ypos(a3); bpl.s .up; btst #1,(gmode).w; bne.s .home; bra.s .away
//   .up btst #1,(gmode).w; beq.s .home
//   .away move.w table+64(pc),d0; bra.s .play
//   .home move.w (HomeTeam).w,d0; add.w d0,d0; lea table(pc),a0; move.w (a0,d0.w),d0
//   .play move.w d0,-(sp); jsr (sfx).l; movem.l (sp)+,d0/a0; rts
//   table: a word for each of 32 home teams, then the visitors' word.
// A penalty shot or shootout goal comes through the same place. Match Viewer (2026-11-28, both games, 32 goals plus
// penalty shots and shootouts): every goal made the right team's sound, goal songs as before; the game also starts a
// crowd cheer of its own at every home goal, which this does not change, so a home goal's 'No siren' is the crowd
// only; the horn (with that cheer) is about 1.7 times as loud as the siren. The crowd boo was a choice for a day: the
// game already plays it at every visitors' goal, so chosen it only started the same boo again (Match Viewer);
// 'No siren' gives that boo alone.

// The game's own sound effects offered (sfx numbers, the same in both games; NHL '95 maps them through SfxTable).
export const GOAL_SIREN = 0
export const GOAL_SOUNDS = [
  { number: GOAL_SIREN, name: "The goal siren (the game's own)" },
  { number: 4, name: 'The end of period horn' },
  { number: 0xb, name: 'The crowd cheering' },
  { number: 0xffff, name: 'No siren' },
] as const

const TABLE_TEAMS = 32
const CODE_LENGTH = 62
const TABLE_WORDS = TABLE_TEAMS + 1

interface Site {
  homeTeam: number
  // The call to sfx as the game has it (bsr.w on NHL 94, jsr on NHL '95), and the nops after a jsr in its place.
  call: string
  nops: string
  claim: (rom: Uint8Array, size: number) => { rom: Uint8Array; at: number } | null
}
const SITES: Record<94 | 95, Site> = {
  94: { homeTeam: 0xc330, call: '6100....', nops: '4e71', claim: (rom, size) => claimSpace(rom, size) },
  95: { homeTeam: 0xbf54, call: '4eb9........', nops: '4e714e71', claim: (rom, size) => claimSpace95(rom, size) },
}
// cmp.w (Vcount).w,d0; beq.s .loop; move.w (sp)+,d0 before; jsr (freezewindow).l; addi.w #$1F4,(Crowdlevel).w after.
const BEFORE = 'b078....67fa301f'
const AFTER = '4eb9........067801f4'

const hex = (text: string) => Uint8Array.from(text.match(/../g)!, (pair) => parseInt(pair, 16))
const word = (value: number) => value.toString(16).padStart(4, '0')
const editionOf = (project: Pick<RomProject, 'game'>): 94 | 95 | null => (project.game.platform !== 'genesis' ? null : project.game.edition === 95 ? 95 : 94)

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

function code(site: Site, gmode: number, sfx: number): Uint8Array {
  const out = new Uint8Array(CODE_LENGTH)
  out.set(
    hex(
      '48e78080' +
        '4a6b0014' +
        '6a0a' +
        ('08380001' + word(gmode)) +
        '6610' +
        '6008' +
        ('08380001' + word(gmode)) +
        '6706' +
        ('303a' + word(CODE_LENGTH + TABLE_TEAMS * 2 - 30)) +
        '600e' +
        ('3038' + word(site.homeTeam)) +
        'd040' +
        ('41fa' + word(CODE_LENGTH - 42)) +
        '30300000' +
        '3f00' +
        '4eb900000000' +
        '4cdf0101' +
        '4e75',
    ),
  )
  writeU32(out, 52, sfx)
  return out
}

// Where the push and call are, as the game has them or hooked; sfx; gmode; and for a hooked one, its code's table.
function place(project: Pick<RomProject, 'game' | 'bytes'>): { site: Site; edition: 94 | 95; at: number; sfx: number; gmode: number; code: number | null; table: number } | null {
  const edition = editionOf(project)
  if (!edition) return null
  const site = SITES[edition]
  const rom = project.bytes
  const plain = only(rom, BEFORE + '3f3c0000' + site.call + AFTER)
  const hooked = only(rom, BEFORE + '4eb9........' + site.nops + AFTER)
  if ((plain >= 0) === (hooked >= 0)) return null
  const at = (plain >= 0 ? plain : hooked) + BEFORE.length / 2
  const callLength = 4 + site.call.length / 2
  // After the call: jsr (freezewindow).l, addi, movea.w, lea, then tst.w Ypos(a3) and, past bpl.w and exg,
  // btst #gmdir,(gmode).w.
  const after = at + callLength
  if (readU32(rom, after + 20) !== 0x4a6b0014 || readU32(rom, after + 30) !== 0x08380001) return null
  const gmode = readU16(rom, after + 34)
  if (plain >= 0) {
    const sfx = edition === 94 ? at + 6 + ((readU16(rom, at + 6) << 16) >> 16) : readU32(rom, at + 6)
    return { site, edition, at, sfx, gmode, code: null, table: 0 }
  }
  const target = readU32(rom, at + 2)
  if (target % 2 !== 0 || target + CODE_LENGTH + TABLE_WORDS * 2 > rom.length) return null
  const sfx = readU32(rom, target + 52)
  if (!code(site, gmode, sfx).every((byte, i) => rom[target + i] === byte)) return null
  return { site, edition, at, sfx, gmode, code: target, table: target + CODE_LENGTH }
}

export const goalSoundsSupported = (project: Pick<RomProject, 'game' | 'bytes'>) => place(project) !== null

export interface GoalSounds {
  // By team: the sound when that team scores at home.
  home: number[]
  // Any visiting team's goal.
  visitors: number
}

// The sounds, or null where the ROM plays the siren for every goal.
export function readGoalSounds(project: Pick<RomProject, 'game' | 'bytes' | 'teams'>): GoalSounds | null {
  const found = place(project)
  if (!found || found.code === null) return null
  return {
    home: project.teams.map((_, team) => readU16(project.bytes, found.table + Math.min(team, TABLE_TEAMS - 1) * 2)),
    visitors: readU16(project.bytes, found.table + TABLE_TEAMS * 2),
  }
}

export class GoalSoundError extends Error {}

// The ROM with these sounds (null, or the siren everywhere, puts the game's own back).
export function withGoalSounds(project: RomProject, sounds: GoalSounds | null): RomProject {
  const found = place(project)
  if (!found) throw new GoalSoundError("This ROM's goal is not as the original game's, so its sound cannot be chosen by team.")
  let rom: Uint8Array = project.bytes.slice()
  if (found.code !== null) {
    releaseSpace(rom, [{ start: found.code, end: found.table + TABLE_WORDS * 2 }])
    rom.set(hex('3f3c0000'), found.at)
    if (found.edition === 94) {
      rom.set(hex('6100'), found.at + 4)
      writeU16(rom, found.at + 6, (found.sfx - (found.at + 6)) & 0xffff)
    } else {
      rom.set(hex('4eb9'), found.at + 4)
      writeU32(rom, found.at + 6, found.sfx)
    }
  }
  if (sounds === null || (sounds.visitors === GOAL_SIREN && sounds.home.every((sound) => sound === GOAL_SIREN))) return { ...project, bytes: rom }
  const bytes = new Uint8Array(CODE_LENGTH + TABLE_WORDS * 2)
  bytes.set(code(found.site, found.gmode, found.sfx))
  for (let team = 0; team < TABLE_TEAMS; team++) writeU16(bytes, CODE_LENGTH + team * 2, sounds.home[team] ?? GOAL_SIREN)
  writeU16(bytes, CODE_LENGTH + TABLE_TEAMS * 2, sounds.visitors)
  const claimed = found.site.claim(rom, bytes.length)
  if (!claimed) throw new GoalSoundError('There is no room left in this ROM for the goal sounds.')
  rom = claimed.rom
  rom.set(bytes, claimed.at)
  rom.set(hex('4eb9'), found.at)
  writeU32(rom, found.at + 2, claimed.at)
  rom.set(hex(found.site.nops), found.at + 6)
  return { ...project, bytes: rom }
}
