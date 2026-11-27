import { readU16, readU32, writeU16, writeU32 } from './bytes'
import type { RomProject } from './rom'
import { claimSpace, releaseSpace } from './space'

// Each home team's own rink colours (Genesis NHL 94, chosen 2026-11-27): the two colours the rink alone uses, line 0's
// colours 5 and 9 (Match Viewer found every other colour of the rink's two lines shared with the score box's fonts,
// the box frames, the EA logo or the crowd): 5 the band along the foot of the boards and the bench and box edges, 9
// the red markings (goal lines, faceoff circles and dots, the centre line). setupIceRinkPal, the only routine that
// copies the rink's palette (game starts, periods, highlights, and ReloadRinkGraphics after pauses, stats screens and
// reverse angle replays), is:
//   movea.l #Rinktilelist,a0; adda.l (a0),a0; moveq #$F,d0; movea.w #palfadenew,a1; .ipal move.l (a0)+,(a1)+;
//   dbf d0,.ipal; rts
// Its first 6 bytes become jmp to NOSE4Web's copy of it, which then sets the two colours from a table by HomeTeam
// ($FFFF in the table: the rink's own):
//   (the routine as it was, to the dbf); move.w (HomeTeam).w,d0; lsl.w #2,d0; lea table(pc),a0;
//   cmpi.w #$FFFF,0(a0,d0.w); beq.s +6; move.w 0(a0,d0.w),(palfadenew+10).w;
//   cmpi.w #$FFFF,2(a0,d0.w); beq.s +6; move.w 2(a0,d0.w),(palfadenew+18).w; rts; table: two words a team.
// During an intermission highlight HomeTeam is that game's home team, so the highlight shows its colours; the next
// setupice puts this game's back (Match Viewer).

export const ARENA_SLOTS = [5, 9] as const
export const RINK_OWN = 0xffff
const TABLE_TEAMS = 32
const HOME_TEAM = 0xc330
const ROUTINE = '207c........d1d0700f327c....22d851c8fffc4e75'
const CODE_LENGTH = 60

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

function code(rink: number, palfade: number, table: number[]): Uint8Array {
  const out = new Uint8Array(CODE_LENGTH + table.length * 2)
  out.set(hex('207c'))
  writeU32(out, 2, rink)
  out.set(hex('d1d0700f327c' + word(palfade) + '22d851c8fffc' + '3038' + word(HOME_TEAM) + 'e548' + '41fa' + word(CODE_LENGTH - 28)), 6)
  out.set(hex('0c70ffff0000670631f00000' + word(palfade + 10) + '0c70ffff0002670631f00002' + word(palfade + 18) + '4e75'), 30)
  table.forEach((value, i) => writeU16(out, CODE_LENGTH + i * 2, value))
  return out
}

// setupIceRinkPal as the game has it, or hooked (jmp to the code); the code's place, Rinktilelist and palfadenew.
function place(project: Pick<RomProject, 'game' | 'bytes'>): { at: number; rink: number; palfade: number; code: number | null } | null {
  if (project.game.platform !== 'genesis' || project.game.edition === 95) return null
  const rom = project.bytes
  const plain = only(rom, ROUTINE)
  const hooked = only(rom, '4ef9........' + ROUTINE.slice(12))
  if ((plain >= 0) === (hooked >= 0)) return null
  if (plain >= 0) return { at: plain, rink: readU32(rom, plain + 2), palfade: readU16(rom, plain + 12), code: null }
  const target = readU32(rom, hooked + 2)
  if (target + CODE_LENGTH > rom.length) return null
  const template = code(readU32(rom, target + 2), readU16(rom, hooked + 12), [])
  if (!template.every((byte, i) => rom[target + i] === byte)) return null
  return { at: hooked, rink: readU32(rom, target + 2), palfade: readU16(rom, hooked + 12), code: target }
}

export const arenaColoursSupported = (project: Pick<RomProject, 'game' | 'bytes'>) => place(project) !== null

// Each team's two colours (RINK_OWN: the rink's own), or null where every team has the rink's own.
export function readArenaColours(project: Pick<RomProject, 'game' | 'bytes' | 'teams'>): [number, number][] | null {
  const found = place(project)
  if (!found || found.code === null) return null
  const at = (team: number) => found.code! + CODE_LENGTH + Math.min(team, TABLE_TEAMS - 1) * 4
  return project.teams.map((_, team) => [readU16(project.bytes, at(team)), readU16(project.bytes, at(team) + 2)])
}

export class ArenaColoursError extends Error {}

export function withArenaColours(project: RomProject, colours: [number, number][] | null): RomProject {
  const found = place(project)
  if (!found) throw new ArenaColoursError("This ROM's rink colours are not loaded as the original game's, so they cannot be set by team.")
  let rom: Uint8Array = project.bytes.slice()
  if (found.code !== null) {
    releaseSpace(rom, [{ start: found.code, end: found.code + CODE_LENGTH + TABLE_TEAMS * 4 }])
    rom.set(hex('207c'), found.at)
    writeU32(rom, found.at + 2, found.rink)
  }
  if (colours === null || colours.every(([a, b]) => a === RINK_OWN && b === RINK_OWN)) return { ...project, bytes: rom }
  const table = Array.from({ length: TABLE_TEAMS }, (_, team) => colours[team] ?? [RINK_OWN, RINK_OWN]).flat()
  const bytes = code(found.rink, found.palfade, table)
  const claimed = claimSpace(rom, bytes.length)
  if (!claimed) throw new ArenaColoursError('There is no room left in this ROM for the teams’ rink colours.')
  rom = claimed.rom
  rom.set(bytes, claimed.at)
  rom.set(hex('4ef9'), found.at)
  writeU32(rom, found.at + 2, claimed.at)
  return { ...project, bytes: rom }
}
