import { readU16, readU32, writeU16, writeU32 } from './bytes'
import type { RomProject } from './rom'
import { colorRgb } from './color'
import { bannerColors } from './graphics'
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
// Colour 5 is also the horizontal scoreboard's frame, clock box border, top trim and glass supports (pause,
// intermission, the penalty box view; Match Viewer 2026-11-27), so the rink's own two colours go back there: SetHor's
// bset #sfhor,(sflags).w and ClrHor's bclr (each the 6 bytes after its movem) become jsr to two more entries:
//   SetHor: (the bset); movea.l #Rinktilelist,a0; adda.l (a0),a0; move.w 10(a0),(palfadenew+10).w;
//           move.w 18(a0),(palfadenew+18).w; rts
//   ClrHor: (the bclr); bra.w (the team colours above)
// Only palfadenew changes: every SetHor and ClrHor comes after a fade to black and before the fade in that puts
// palfadenew on the screen. Both routines save every register first. The first build (60 bytes, no SetHor/ClrHor
// hooks) is still read, and choosing again puts in this one.

export const ARENA_SLOTS = [5, 9] as const
export const RINK_OWN = 0xffff
const TABLE_TEAMS = 32
const HOME_TEAM = 0xc330
const ROUTINE = '207c........d1d0700f327c....22d851c8fffc4e75'
// SetHor and ClrHor: movem.l d0-d7/a0-a6,-(sp); bset / bclr #sfhor,(sflags).w; then btst / move.w #1000,(Oldrow).w.
const SET_HOR = ['48e7fffe', '08f8........', '0838']
const CLR_HOR = ['48e7fffe', '08b8........', '31fc03e8']
const CODE_LENGTH = 98
const FIRST_CODE_LENGTH = 60
const SET_ENTRY = 60
const CLR_ENTRY = 88

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

// The code; `hor` the 6 bytes SetHor and ClrHor had (null: the first build, without them).
function code(rink: number, palfade: number, hor: { set: Uint8Array; clr: Uint8Array } | null, table: number[]): Uint8Array {
  const length = hor ? CODE_LENGTH : FIRST_CODE_LENGTH
  const out = new Uint8Array(length + table.length * 2)
  out.set(hex('207c'))
  writeU32(out, 2, rink)
  out.set(hex('d1d0700f327c' + word(palfade) + '22d851c8fffc' + '3038' + word(HOME_TEAM) + 'e548' + '41fa' + word(length - 28)), 6)
  out.set(hex('0c70ffff0000670631f00000' + word(palfade + 10) + '0c70ffff0002670631f00002' + word(palfade + 18) + '4e75'), 30)
  if (hor) {
    out.set(hor.set, SET_ENTRY)
    out.set(hex('207c'), SET_ENTRY + 6)
    writeU32(out, SET_ENTRY + 8, rink)
    out.set(hex('d1d031e8000a' + word(palfade + 10) + '31e80012' + word(palfade + 18) + '4e75'), SET_ENTRY + 12)
    out.set(hor.clr, CLR_ENTRY)
    // bra.w to the team colours at 20.
    out.set(hex('6000' + word((20 - (CLR_ENTRY + 8)) & 0xffff)), CLR_ENTRY + 6)
  }
  table.forEach((value, i) => writeU16(out, length + i * 2, value))
  return out
}
// SetHor's and ClrHor's 6 bytes after the movem: where they are, and whether jsr'd.
function horSites(rom: Uint8Array) {
  const find = ([movem, plain, next]: string[]) => {
    const at = only(rom, movem + plain + next)
    if (at >= 0) return { at: at + 4, hooked: false }
    const hooked = only(rom, movem + '4eb9........' + next)
    return hooked >= 0 ? { at: hooked + 4, hooked: true } : null
  }
  const set = find(SET_HOR)
  const clr = find(CLR_HOR)
  return set && clr && set.hooked === clr.hooked ? { set: set.at, clr: clr.at, hooked: set.hooked } : null
}

// setupIceRinkPal as the game has it, or hooked (jmp to the code); the code's place, Rinktilelist and palfadenew.
interface Place {
  at: number
  rink: number
  palfade: number
  code: number | null
  table: number
  hor: { set: number; clr: number; hooked: boolean }
}
function place(project: Pick<RomProject, 'game' | 'bytes'>): Place | null {
  if (project.game.platform !== 'genesis' || project.game.edition === 95) return null
  const rom = project.bytes
  const hor = horSites(rom)
  if (!hor) return null
  const plain = only(rom, ROUTINE)
  const hooked = only(rom, '4ef9........' + ROUTINE.slice(12))
  if ((plain >= 0) === (hooked >= 0)) return null
  if (plain >= 0) return hor.hooked ? null : { at: plain, rink: readU32(rom, plain + 2), palfade: readU16(rom, plain + 12), code: null, table: 0, hor }
  const target = readU32(rom, hooked + 2)
  if (target + CODE_LENGTH > rom.length) return null
  const [rink, palfade] = [readU32(rom, target + 2), readU16(rom, hooked + 12)]
  const matches = (template: Uint8Array) => template.every((byte, i) => rom[target + i] === byte)
  if (hor.hooked) {
    if (readU32(rom, hor.set + 2) !== target + SET_ENTRY || readU32(rom, hor.clr + 2) !== target + CLR_ENTRY) return null
    const kept = { set: rom.slice(target + SET_ENTRY, target + SET_ENTRY + 6), clr: rom.slice(target + CLR_ENTRY, target + CLR_ENTRY + 6) }
    return matches(code(rink, palfade, kept, [])) ? { at: hooked, rink, palfade, code: target, table: target + CODE_LENGTH, hor } : null
  }
  return matches(code(rink, palfade, null, [])) ? { at: hooked, rink, palfade, code: target, table: target + FIRST_CODE_LENGTH, hor } : null
}

export const arenaColoursSupported = (project: Pick<RomProject, 'game' | 'bytes'>) => place(project) !== null

// Each team's two colours (RINK_OWN: the rink's own), or null where every team has the rink's own.
export function readArenaColours(project: Pick<RomProject, 'game' | 'bytes' | 'teams'>): [number, number][] | null {
  const found = place(project)
  if (!found || found.code === null) return null
  const at = (team: number) => found.table + Math.min(team, TABLE_TEAMS - 1) * 4
  return project.teams.map((_, team) => [readU16(project.bytes, at(team)), readU16(project.bytes, at(team) + 2)])
}

export class ArenaColoursError extends Error {}

// How light a colour is, 0 (black) to 1 (white).
const lightness = (word: number) => {
  const [r, g, b] = colorRgb(word)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}
// Markings lighter than this would be hard to see on the white ice.
const MARKINGS_LIGHTEST = 0.7

// Each team's two colours from its banner's two stripes: the darker for the red markings (the rink's own where both
// are too light to show on the ice), the other for the boards trim.
export function arenaColoursFromBanners(project: Parameters<typeof bannerColors>[0] & Pick<RomProject, 'teams'>): [number, number][] {
  return project.teams.map((_, team) => {
    const [a, b] = bannerColors(project, team)
    const [darker, lighter] = lightness(a) <= lightness(b) ? [a, b] : [b, a]
    const markings = lightness(darker) <= MARKINGS_LIGHTEST ? darker : RINK_OWN
    const trim = markings === RINK_OWN ? darker : lighter
    return [trim, markings]
  })
}

export function withArenaColours(project: RomProject, colours: [number, number][] | null): RomProject {
  const found = place(project)
  if (!found) throw new ArenaColoursError("This ROM's rink colours are not loaded as the original game's, so they cannot be set by team.")
  let rom: Uint8Array = project.bytes.slice()
  if (found.code !== null) {
    if (found.hor.hooked) {
      rom.set(rom.slice(found.code + SET_ENTRY, found.code + SET_ENTRY + 6), found.hor.set)
      rom.set(rom.slice(found.code + CLR_ENTRY, found.code + CLR_ENTRY + 6), found.hor.clr)
    }
    releaseSpace(rom, [{ start: found.code, end: found.table + TABLE_TEAMS * 4 }])
    rom.set(hex('207c'), found.at)
    writeU32(rom, found.at + 2, found.rink)
  }
  if (colours === null || colours.every(([a, b]) => a === RINK_OWN && b === RINK_OWN)) return { ...project, bytes: rom }
  const table = Array.from({ length: TABLE_TEAMS }, (_, team) => colours[team] ?? [RINK_OWN, RINK_OWN]).flat()
  const hor = { set: rom.slice(found.hor.set, found.hor.set + 6), clr: rom.slice(found.hor.clr, found.hor.clr + 6) }
  const bytes = code(found.rink, found.palfade, hor, table)
  const claimed = claimSpace(rom, bytes.length)
  if (!claimed) throw new ArenaColoursError('There is no room left in this ROM for the teams’ rink colours.')
  rom = claimed.rom
  rom.set(bytes, claimed.at)
  rom.set(hex('4ef9'), found.at)
  writeU32(rom, found.at + 2, claimed.at)
  for (const [site, entry] of [[found.hor.set, SET_ENTRY], [found.hor.clr, CLR_ENTRY]]) {
    rom.set(hex('4eb9'), site)
    writeU32(rom, site + 2, claimed.at + entry)
  }
  return { ...project, bytes: rom }
}
