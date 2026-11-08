// Changes to the game's own code: bug fixes, extra statistics, finer ratings.
//
// All but the last group are the work of Michael Capewell (smozoma), ported
// from his hack program smozROM with his permission. The places changed, the
// code put there and the table of weights by year are his.
//
//   smozROM  Copyright 2010 Michael Capewell (smozoma)
//   https://github.com/nhl94dotcom/smozROM
//   Released under the GNU General Public License, version 3 or later.
//
// The last group, how the game plays, comes from findings posted on the
// NHL94 forums by wboy, Tony H, clockwise, smozoma, Brodeur30, kingraph and
// AverageRangersFan: see "play" below. The Aggression and comeback bonus
// fixes are the editor's own, to bugs found by the NHL94 Match Viewer project
// in the disassembly at github.com/abdulahmad/NHL94Genesis: see "more fixes".
// So are the rocket pass fix, to a bug the Match Viewer project measured, the
// faceoff spot fix, to rules it set out from the NHL rulebook, and the
// runaway speed fix, to a bug it found.
//
// Each hack is looked for by the exact bytes it leaves, and a ROM whose code
// at a hack's places is neither the original game's nor the hack's is left
// alone there: the editor does not guess at code it does not know.

import { convertWeight } from './attributes'
import { readAscii, readU16, readU32, writeAscii, writeU16, writeU32 } from './bytes'
import { findGame, NHL94, type GameConfig } from './games'
import type { RomProject } from './rom'
import { discordPost } from './discord'
import { claimSpace } from './space'
import { goalieCount, type Player, type Team } from './team'
import type { FreeAgent } from './trade'

// 'simple' is an earlier fix some ROMs carry, which swaps the two players'
// weights and leaves checking ratings out of it. It is recognised and can be
// kept or replaced, but is not something to choose afresh.
export type WeightFix = 'off' | 'simple' | 'on'
// 'earlier' is either of two earlier versions of the hack that league ROMs
// carry. Like 'simple' it can be kept, replaced or removed, but not chosen
// for a ROM that does not have it; keeping it leaves its code untouched.
export type Bodychecks = 'off' | 'earlier' | 'on'
// What becomes of the bonuses that make a player hot or cold for a game.
export type Bonuses = 'original' | 'disabled' | 'hidden' | 'playersMatchLines' | 'linesMatchPlayers'
export type ThreeStars = 'original' | 'linesOff' | 'linesOn'
// How a check is judged. The original game starts from 240 when a person
// controls the checker at contact and from 120 when the computer does, and
// works the knockdown out in one byte, which overflows from 240 when the
// target is two or more weight steps heavier: the weight bug. 'all120' judges
// every check from 120, which never overflows, so it fixes both the weight
// bug and the C-then-B check (found by the NHL94 Match Viewer project).
// 'all240' is the editor's earlier C-then-B fix, which judges every check
// from 240 and so gives every checker the weight bug; it is recognised and
// can be kept, but is not offered afresh.
export type CheckFix = 'off' | 'all120' | 'all240'

export interface HackChoices {
  weightFix: WeightFix
  bodychecks: Bodychecks
  secondAssist: boolean
  plusMinus: boolean
  // Ratings from 0 to 15 in place of 0 to 6, with the overall rating formulas made for them.
  wideRatings: boolean
  bonuses: Bonuses
  threeStars: ThreeStars
  // The weight in pounds that a player's lowest weight value stands for.
  baseWeight: number

  // How the game plays. The numbers are the game's own, as its code holds them.
  // Makes a player's Aggression in play rise with his rating, where the
  // original game wraps it round.
  aggressionFix: boolean
  // Reads a team's power play and penalty kill ratings from the halves of
  // their byte that the original data was written for.
  ppPkFix: boolean
  // Gives the comeback bonus in the second half of the third period, where
  // the original game gives it in the first.
  comebackFix: boolean
  // Times a pass to a teammate in 64ths of a second, where the original game
  // rounds down to eighths and so sometimes sends it twice as fast.
  passFix: boolean
  // Holds every faceoff on one of the nine dots, as the NHL rules place them.
  faceoffFix: boolean
  // Stops a skater keeping the gliding a pass receiver or a fall gets.
  runawayFix: boolean
  // Gives each foul on a breakaway its own penalty shot, where the original reads the next one.
  penaltyShotTableFix: boolean
  // Ends a penalty shot cleanly after an outside whistle, and lets the puck hit things in one.
  penaltyShotFixes: boolean
  // The computer pulls its goalie late when one or two goals behind, not only when exactly two.
  goaliePullFix: boolean
  // Lets a goalie's body play a loose puck 8 to 14 units from his blade, where nothing touches it in the original.
  blindRingFix: boolean
  // A shot with the shooter's own goalie off the ice takes the normal accuracy roll, not always exact.
  snipingFix: boolean
  // Computer wingers and centres on offence time their decisions by Offensive Awareness, not Defensive.
  awarenessFix: boolean
  // The crowd's +2 Agility and Speed come only when the crowd meter is past its record, not always.
  crowdFix: boolean
  checkFix: CheckFix
  // Sixtieths of a second a goalie may hold the puck before the whistle; 0 for no whistle.
  goalieHold: number
  // How far a goalie a person controls may go without the puck to either side of the middle of the ice.
  goalieWidth: number
  // How near centre ice a goalie may come, as his distance from it: without the puck, then before
  // the whistle for one a person controls.
  goalieOut: number
  goalieLine: number
  // Players on the ice do not tire.
  stamina: boolean
  energyDrain: number
  energyRecovery: number
  // The push the C button gives; 0 for the original game's, which is 32 for a fresh player and less for a tired one.
  speedBurst: number
  turnRate: number
  // The game, penalty and penalty shot clocks count true seconds.
  realTime: boolean
}

// 'ratings' covers the rating scale and the bonuses, whose code is shared.
// 'goalieBox' covers both ways a goalie without the puck may roam.
export type HackPart =
  | 'weightFix'
  | 'bodychecks'
  | 'secondAssist'
  | 'plusMinus'
  | 'ratings'
  | 'threeStars'
  | 'baseWeight'
  | 'checkFix'
  | 'aggressionFix'
  | 'ppPkFix'
  | 'comebackFix'
  | 'passFix'
  | 'faceoffFix'
  | 'runawayFix'
  | 'penaltyShotTableFix'
  | 'penaltyShotFixes'
  | 'goaliePullFix'
  | 'blindRingFix'
  | 'snipingFix'
  | 'awarenessFix'
  | 'crowdFix'
  | 'goalieHold'
  | 'goalieBox'
  | 'goalieLine'
  | 'stamina'
  | 'energyDrain'
  | 'energyRecovery'
  | 'speedBurst'
  | 'turnRate'
  | 'clock'

export interface HackState {
  choices: HackChoices
  // Parts whose code in this ROM is not recognised. Their choices mean
  // nothing, and they are never changed.
  unknown: HackPart[]
}

export const NO_HACKS: HackChoices = {
  weightFix: 'off',
  bodychecks: 'off',
  secondAssist: false,
  plusMinus: false,
  wideRatings: false,
  bonuses: 'original',
  threeStars: 'original',
  baseWeight: 140,
  checkFix: 'off',
  aggressionFix: false,
  ppPkFix: false,
  comebackFix: false,
  passFix: false,
  faceoffFix: false,
  runawayFix: false,
  penaltyShotTableFix: false,
  penaltyShotFixes: false,
  goaliePullFix: false,
  blindRingFix: false,
  snipingFix: false,
  awarenessFix: false,
  crowdFix: false,
  goalieHold: 140,
  goalieWidth: 36,
  goalieOut: 231,
  goalieLine: 170,
  stamina: false,
  energyDrain: 33,
  energyRecovery: 9,
  speedBurst: 0,
  turnRate: 150,
  realTime: false,
}

// The least and most each number can be.
export const HACK_RANGES = {
  goalieHold: [0, 3600],
  goalieWidth: [0, 124],
  goalieOut: [0, 255],
  goalieLine: [0, 255],
  energyDrain: [0, 999],
  energyRecovery: [0, 999],
  speedBurst: [0, 95],
  turnRate: [1, 999],
} satisfies Partial<Record<keyof HackChoices, [number, number]>>

export class HackError extends Error {}

// ------------------------------------------------------------------ bytes

const bytes = (text: string) => Uint8Array.from(text.replace(/\s+/g, '').match(/../g) ?? [], (pair) => parseInt(pair, 16))
const ascii = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0))
const is = (rom: Uint8Array, at: number, wanted: Uint8Array) => at + wanted.length <= rom.length && wanted.every((byte, i) => rom[at + i] === byte)

const OP_JSR = 0x4eb9
const OP_NOP = 0x4e71
const UNUSED = 0xff

// The ROM being changed. Adding code can make it larger, so it is held here.
interface Work {
  rom: Uint8Array
}

// A place where the game's own instructions are replaced by a call to code
// added at the end of the ROM, padded out with instructions that do nothing.
interface Hook {
  at: number
  original: Uint8Array
}

// Where a hook calls, if it is there and what it calls is `code`.
function hooked(rom: Uint8Array, hook: Hook, code: Uint8Array): number | null {
  if (readU16(rom, hook.at) !== OP_JSR) return null
  for (let o = 6; o < hook.original.length; o += 2) if (readU16(rom, hook.at + o) !== OP_NOP) return null
  const target = readU32(rom, hook.at + 2)
  return is(rom, target, code) ? target : null
}

function writeHook(rom: Uint8Array, hook: Hook, target: number): void {
  writeU16(rom, hook.at, OP_JSR)
  writeU32(rom, hook.at + 2, target)
  for (let o = 6; o < hook.original.length; o += 2) writeU16(rom, hook.at + o, OP_NOP)
}

// Puts code in unused room at the end of the ROM and says where. Like
// smozROM, it leaves four unused bytes before it, so hacks are easy to tell
// apart, and does not move NOSE's end mark.
function place(work: Work, code: Uint8Array): number {
  const claimed = claimSpace(work.rom, code.length, true)
  if (!claimed) throw new HackError('There is no room left in this ROM for the code this needs.')
  work.rom = claimed.rom
  work.rom.set(code, claimed.at)
  return claimed.at
}

// Adds code and points a hook at it. The code goes in first, since adding it
// can replace the ROM with a larger one.
function hook(work: Work, from: Hook, code: Uint8Array): void {
  const target = place(work, code)
  writeHook(work.rom, from, target)
}

const erase = (rom: Uint8Array, at: number, length: number) => rom.fill(UNUSED, at, at + length)

// A part of the game that can be hacked: how to tell what state it is in
// (undefined if the code is not recognised), how to put the original game's
// code back, and how to put a state in. `apply` is only ever called on the
// original code.
interface Part<T> {
  detect(rom: Uint8Array): T | undefined
  remove(rom: Uint8Array): void
  apply(work: Work, value: T): void
}

// ----------------------------------------------------------- weight bug fix
// For a checker a person controls, the original game works out the
// knockdown in a single byte that overflows when the other player is two or
// more weight steps heavier, so that light players check well and heavy ones
// fall over. The fix works it out afresh, the right way round, and brings
// both players' checking ratings into it.

const WEIGHT_HOOK: Hook = { at: 0x13d72, original: bytes('902B 0067 D02A 0067') }
const WEIGHT_SIMPLE = bytes('902A 0067 D02B 0067')
const WEIGHT_CODE = bytes('3F01 902A 0067 122B 0067 E201 D001 E201 D001 122B 0075 E301 D001 0400 000E 321F 4E75')

const weightFix: Part<WeightFix> = {
  detect(rom) {
    if (is(rom, WEIGHT_HOOK.at, WEIGHT_HOOK.original)) return 'off'
    if (is(rom, WEIGHT_HOOK.at, WEIGHT_SIMPLE)) return 'simple'
    return hooked(rom, WEIGHT_HOOK, WEIGHT_CODE) === null ? undefined : 'on'
  },
  remove(rom) {
    const target = hooked(rom, WEIGHT_HOOK, WEIGHT_CODE)
    if (target !== null) erase(rom, target, WEIGHT_CODE.length)
    rom.set(WEIGHT_HOOK.original, WEIGHT_HOOK.at)
  },
  apply(work, value) {
    if (value === 'simple') work.rom.set(WEIGHT_SIMPLE, WEIGHT_HOOK.at)
    if (value === 'on') hook(work, WEIGHT_HOOK, WEIGHT_CODE)
  },
}

// ------------------------------------------------------ bodycheck statistics
// Counts each player's successful checks, and shows them in Player Stats
// where penalty minutes were.

const CHECK_HOOK: Hook = { at: 0x14130, original: bytes('5268 0010 4240 102B 0066 D0C0 5228 011C') }
const CHECK_CODE = bytes(
  '5268 0010 0839 0000 00FF C2EA 6600 002A 4240 102B 0066 D0C0 5228 0102 90C0 90FC 0364 B7CA 6E00 0006 D0FC 06C8 4240 102A 0066 D0C0 5228 011C 4E75',
)
// Earlier versions, which count a check for the team only while play is on.
// In the first the branch that skips the count lands four bytes short.
const EARLIER_CHECK_CODES = ['002A', '002E'].map((branch) =>
  bytes(
    `0839 0000 00FF C2EA 6600 ${branch} 5268 0010 4240 102B 0066 D0C0 5228 0102 90C0 90FC 0364 B7CA 6E00 0006 D0FC 06C8 4240 102A 0066 D0C0 5228 011C 4E75`,
  ),
)
const ALL_CHECK_CODES = [CHECK_CODE, ...EARLIER_CHECK_CODES]
// Where the game adds to a player's penalty minutes, which the count takes the place of.
const PENALTY_AT = 0x12302
const PENALTY = { original: bytes('D532 0000'), hacked: bytes('4E71 4E71') }
const STAT_TEXTS = [
  { at: 0x993f, original: ascii('PIM'), hacked: ascii('Chk') },
  { at: 0x99b4, original: ascii('Penalty Minutes'), hacked: ascii('   Checks For  ') },
]

const bodychecks: Part<Bodychecks> = {
  detect(rom) {
    if (is(rom, CHECK_HOOK.at, CHECK_HOOK.original) && is(rom, PENALTY_AT, PENALTY.original)) return 'off'
    if (!is(rom, PENALTY_AT, PENALTY.hacked)) return undefined
    if (hooked(rom, CHECK_HOOK, CHECK_CODE) !== null) return 'on'
    return EARLIER_CHECK_CODES.some((code) => hooked(rom, CHECK_HOOK, code) !== null) ? 'earlier' : undefined
  },
  remove(rom) {
    const code = ALL_CHECK_CODES.find((version) => hooked(rom, CHECK_HOOK, version) !== null)
    const target = code ? hooked(rom, CHECK_HOOK, code) : null
    if (!code || target === null) return
    erase(rom, target, code.length)
    rom.set(CHECK_HOOK.original, CHECK_HOOK.at)
    rom.set(PENALTY.original, PENALTY_AT)
    // The headings go back only if they are still the hack's own wording.
    for (const text of STAT_TEXTS) if (is(rom, text.at, text.hacked)) rom.set(text.original, text.at)
  },
  apply(work, value) {
    if (value !== 'on') return
    for (const text of STAT_TEXTS) work.rom.set(text.hacked, text.at)
    hook(work, CHECK_HOOK, CHECK_CODE)
    work.rom.set(PENALTY.hacked, PENALTY_AT)
  },
}

// ----------------------------------------------------- second-assist bug fix
// When two players pass back and forth and one scores, the original game
// gives no assist to the player who passed to them. Two places call one fix.

const ASSIST_HOOKS: Hook[] = [0x10188, 0xf6ce4].map((at) => ({ at, original: bytes('3168 001A 001C') }))
const ASSIST_CODE = bytes('B068 001A 6700 0008 3168 001A 001C 4E75')

const secondAssist: Part<boolean> = {
  detect(rom) {
    if (ASSIST_HOOKS.every((hook) => is(rom, hook.at, hook.original))) return false
    const targets = ASSIST_HOOKS.map((hook) => hooked(rom, hook, ASSIST_CODE))
    return targets[0] !== null && targets[0] === targets[1] ? true : undefined
  },
  remove(rom) {
    const target = hooked(rom, ASSIST_HOOKS[0], ASSIST_CODE)
    if (target === null) return
    erase(rom, target, ASSIST_CODE.length)
    for (const hook of ASSIST_HOOKS) rom.set(hook.original, hook.at)
  },
  apply(work, value) {
    if (!value) return
    const target = place(work, ASSIST_CODE)
    for (const hook of ASSIST_HOOKS) writeHook(work.rom, hook, target)
  },
}

// ------------------------------------------------------ plus-minus statistic
// Keeps each player's plus-minus where a save state can be read for it. The
// game shows nothing of it. The memory it uses is cleared before each game.

const PLUS_MINUS_HOOK: Hook = { at: 0x1494a, original: bytes('0678 001E B8A2') }
const PLUS_MINUS_CODE = bytes(
  '0678 001E B8A2 48E7 E0C0 0838 0005 C2F4 6700 0010 0838 0000 C2FA 6600 0006 08C0 0006 B4FC C6CE 6700 0006 08C0 0007 307C DEF6 3210 D0F8 DEF4 5E78 DEF4 5E78 DEF4 3210 10C0 5248 700B 327C B04A 323C 0080 343C FF10 B451 6600 000A 10FC 00FF 6000 0006 10E9 0066 D2C1 51C8 FFEA 4CDF 0307 4E75',
)
const CLEAR_AT = 0x17132
const CLEAR = {
  original: bytes('4CDF 0E00 203C 0000 0363 307C C6CE 4218 51C8 FFFC 307C CA32 303C 0363 4218 51C8 FFFC 48E7 0070'),
  hacked: bytes('4CDF 0E00 203C 0000 06C7 307C C6CE 4218 51C8 FFFC 307C DEF4 3010 5440 4218 51C8 FFFC 48E7 0070'),
}

const plusMinus: Part<boolean> = {
  detect(rom) {
    if (is(rom, PLUS_MINUS_HOOK.at, PLUS_MINUS_HOOK.original) && is(rom, CLEAR_AT, CLEAR.original)) return false
    return hooked(rom, PLUS_MINUS_HOOK, PLUS_MINUS_CODE) !== null && is(rom, CLEAR_AT, CLEAR.hacked) ? true : undefined
  },
  remove(rom) {
    const target = hooked(rom, PLUS_MINUS_HOOK, PLUS_MINUS_CODE)
    if (target === null) return
    erase(rom, target, PLUS_MINUS_CODE.length)
    rom.set(PLUS_MINUS_HOOK.original, PLUS_MINUS_HOOK.at)
    rom.set(CLEAR.original, CLEAR_AT)
  },
  apply(work, value) {
    if (!value) return
    hook(work, PLUS_MINUS_HOOK, PLUS_MINUS_CODE)
    work.rom.set(CLEAR.hacked, CLEAR_AT)
  },
}

// ------------------------------------------------- rating scale and bonuses
// One routine works out the ratings shown in Edit Lines and on rosters, and
// the overall ratings. It is replaced whole for 0 to 15 ratings, and the
// bonus choices change instructions inside whichever version is there, so
// the two are handled together.

interface Ratings {
  wide: boolean
  bonuses: Bonuses
}

// How much a stored rating counts for on the ice: five times for 0 to 6, twice for 0 to 15.
const MULTIPLIER_AT = 0xf711c
const MULTIPLIER = { narrow: bytes('3F03 E543 D65F'), wide: bytes('4E71 E343 4E71') }

const ROUTINE_AT = 0xfa9f8
const ROUTINE = {
  narrow: bytes(
    '2F0E 4278 D6CE 4278 D6D0 2C7C 000F AB3C B8B9 0001 9420 6600 0008 2C7C 000F AB1C B8B9 0001 9582 6600 0008 2C7C 000F AB2C 206A 001E 49EA 01A2 4281 3200 E941 D9C1 D9FC 0000 0010 D0D0 D0D0 5048 51C8 FFFA 4240 4241 740F 4844 0504 6700 0092 3602 E24B 4443 1630 30FF 0802 0000 6700 0004 E84B 0243 000F B47C 000D 6600 0006 6000 0068 B47C 0006 6700 0060 48E7 0700 1A36 2000 4885 BA7C 0002 6700 0010 3F03 5545 D657 51CD FFFC E243 4A5F 4CDF 00E0 BDFC 000F AB3C 6700 001C 4442 3F07 1E34 20FF 4887 DF78 D6CE 5278 D6D0 3E1F 4442 6000 0018 3F03 E943 D657 D65F 4442 D634 20FF 6A00 0004 4203 4442 D043 0641 0064 51CA FF68 BDFC 000F AB3C 6700 001C 323C 0064 48E7 0300 3C38 D6CE 48C6 3E38 D6D0 8DC7 D046 4CDF 00C0 B041 6D00 0006 3200 5340 2C5F 4E75',
  ),
  wide: bytes(
    '48E7 0702 4278 D6CE 4278 D6D0 2C7C 000F AB3C B8B9 0001 9420 6600 0008 2C7C 000F AB1C B8B9 0001 9582 6600 0008 2C7C 000F AB2C 206A 001E 49EA 01A2 4281 3200 E941 D9C1 D9FC 0000 0010 D0D0 D0D0 5048 51C8 FFFA 4240 4241 740F 4844 0504 6700 0084 3602 E24B 4443 1630 30FF 0802 0000 6700 0004 E84B 0243 000F BDFC 000F AB3C 6600 0016 B47C 000D 6700 007C B47C 0006 6700 0074 6000 0034 1A36 2000 4885 3F03 5545 D657 51CD FFFC 4A5F BDFC 000F AB3C 6700 0018 4442 1E34 20FF 4887 DF78 D6CE 5278 D6D0 4442 6000 0016 3F03 E743 965F 4442 D634 20FF 6A00 0004 4203 4442 D043 0641 0064 51CA FF76 BDFC 000F AB3C 6700 001C E640 3C38 D6CE 48C6 3E38 D6D0 8DC7 D046 6000 0004 D043 323C 0064 B041 6D00 0006 3200 5340 4CDF 40E0 4E75 FFFF FFFF FFFF FFFF FFFF',
  ),
}
// How much each attribute counts towards a skater's overall rating, then a goalie's.
const FORMULA_AT = 0xfab1c
const FORMULA = {
  narrow: bytes('0202 0202 0406 0204 0204 0606 0402 0202 0202 0202 0202 0202 0909 0202 0902 0202 0202 0202 0202 0202 0202 0202 0202 0202'),
  wide: bytes('0206 0202 0606 0204 0806 060A 0804 0202 0808 0707 0202 0202 0A04 0202 0C02 0202 0202 0202 0202 0202 0202 0202 0202 0202'),
}
// Which attributes go into those: the 0 to 15 formulas add weight for skaters and speed for goalies.
const INCLUDED = [
  { at: 0x19420, narrow: bytes('1FBA'), wide: bytes('3FBA') },
  { at: 0x19582, narrow: bytes('130F'), wide: bytes('1B0F') },
]

// Where the game adds a player's bonus to his rating on the ice.
const ON_ICE_HOOK: Hook = { at: 0xf710a, original: bytes('D3FC 0000 01A2 1231 1000') }
const ON_ICE_DISABLED = bytes('4201 4E71 4E71 4E71 4E71')
// Takes the bonus for each attribute from where Edit Lines shows it.
const ON_ICE_CODE = bytes('D3FC 0000 01B2 3F02 3438 BF14 0442 0010 D441 1231 2000 341F 4E75')

// Instructions inside the routine that the bonus choices replace. The first
// picks which set of bonuses Edit Lines reads; the other two add a bonus to
// a rating shown, and sit in different places in the two versions.
const BONUS_SET_AT = 0xfaa38
const SHOWN_AT = { narrow: [0xfaab4, 0xfaad4], wide: [0xfaaac, 0xfaac8] }
const NO_BONUS_SHOWN = [bytes('4207 4E71'), bytes('4E71 4A43')]
const PLAYERS_BONUS_SHOWN = { narrow: [bytes('1E14 4E71'), bytes('D634 0000')], wide: [bytes('1E2C 0000'), bytes('D62C 0000')] }

// The routine as it stands for a choice of scale and bonuses.
function routineFor({ wide, bonuses }: Ratings): Uint8Array {
  const scale = wide ? 'wide' : 'narrow'
  const routine = ROUTINE[scale].slice()
  const put = (at: number, code: Uint8Array) => routine.set(code, at - ROUTINE_AT)
  if (bonuses === 'disabled' || bonuses === 'hidden') SHOWN_AT[scale].forEach((at, i) => put(at, NO_BONUS_SHOWN[i]))
  if (bonuses === 'linesMatchPlayers') {
    // As smozROM writes it. In the 0 to 15 routine the instruction this is
    // meant to remove starts two bytes later, so the result there looks
    // wrong; the editor recognises it but does not offer to make it.
    put(BONUS_SET_AT, bytes('4E71 4E71 4E71'))
    SHOWN_AT[scale].forEach((at, i) => put(at, PLAYERS_BONUS_SHOWN[scale][i]))
  }
  return routine
}

const BONUS_CHOICES: Bonuses[] = ['original', 'disabled', 'hidden', 'playersMatchLines', 'linesMatchPlayers']

const ratings: Part<Ratings> = {
  detect(rom) {
    for (const wide of [false, true]) {
      const scale = wide ? 'wide' : 'narrow'
      if (!is(rom, MULTIPLIER_AT, MULTIPLIER[scale]) || !is(rom, FORMULA_AT, FORMULA[scale])) continue
      if (!INCLUDED.every((mask) => is(rom, mask.at, mask[scale]))) continue
      for (const bonuses of BONUS_CHOICES) {
        if (!is(rom, ROUTINE_AT, routineFor({ wide, bonuses }))) continue
        const onIce =
          bonuses === 'disabled'
            ? is(rom, ON_ICE_HOOK.at, ON_ICE_DISABLED)
            : bonuses === 'playersMatchLines'
              ? hooked(rom, ON_ICE_HOOK, ON_ICE_CODE) !== null
              : is(rom, ON_ICE_HOOK.at, ON_ICE_HOOK.original)
        // 'original' and 'playersMatchLines' leave the routine alike, as do 'disabled' and 'hidden'.
        if (onIce) return { wide, bonuses }
      }
    }
    return undefined
  },
  remove(rom) {
    const target = hooked(rom, ON_ICE_HOOK, ON_ICE_CODE)
    if (target !== null) erase(rom, target, ON_ICE_CODE.length)
    rom.set(ON_ICE_HOOK.original, ON_ICE_HOOK.at)
    rom.set(MULTIPLIER.narrow, MULTIPLIER_AT)
    rom.set(ROUTINE.narrow, ROUTINE_AT)
    rom.set(FORMULA.narrow, FORMULA_AT)
    for (const mask of INCLUDED) rom.set(mask.narrow, mask.at)
  },
  apply(work, value) {
    const scale = value.wide ? 'wide' : 'narrow'
    work.rom.set(MULTIPLIER[scale], MULTIPLIER_AT)
    work.rom.set(routineFor(value), ROUTINE_AT)
    work.rom.set(FORMULA[scale], FORMULA_AT)
    for (const mask of INCLUDED) work.rom.set(mask[scale], mask.at)
    if (value.bonuses === 'disabled') work.rom.set(ON_ICE_DISABLED, ON_ICE_HOOK.at)
    if (value.bonuses === 'playersMatchLines') hook(work, ON_ICE_HOOK, ON_ICE_CODE)
  },
}

// --------------------------------------------------------------- three stars
// A fuller way of choosing the three stars of a game: goals, assists, shots
// and checks for skaters; goals against, shots faced and shutouts for
// goalies. Skaters are given more with line changes on, when they play less.

const STARS_AT = 0x1867e
const STARS_ORIGINAL = bytes(
  '324A 362A 000C 966B 000C 48C3 7819 4EB9 0000 9F40 4440 D044 2883 B840 6200 003C 4241 122A 00B4 C2FC 2AF8 D394 4241 122A 00CE C2FC 2774 D394 4241 122A 00E8 C2FC 000A 4A43 6600 000E C2FC 0064 D394 4281 D269 0136 D394 6000 003A BA69 0136 6200 0032 4241 122A 00B4 C2FC 0064 4242 142A 00E8 6700 001E 82C2 B27C 0004 6200 0014 0694 0000 7D00 4A41 6600 0008 0694 0001 24F8 5449 524A 584C 51CC FF7E 4E75',
)
interface StarValues {
  goal: number
  assist: number
  shotFor: number
  check: number
  goalsAgainst: number
  shotsAgainst: number
  shutout: number
}
const word = (value: number) => (value & 0xffff).toString(16).padStart(4, '0')
const starsCode = (v: StarValues) =>
  bytes(
    `324A 362A 000C 966B 000C 48C3 7819 4EB9 0000 9F40 4440 D044 2883 4241 122A 00CE C2FC ${word(v.assist)} 4242 142A 00E8 B840 6200 0026 D394 C4FC ${word(v.shotFor)} D594 4241 122A 00B4 C2FC ${word(v.goal)} D394 4241 122A 0102 C2FC ${word(v.check)} D394 6000 003A BA69 0136 6200 0032 4A42 6700 002C E281 D394 4241 122A 00B4 4A41 6600 0008 0694 0000 ${word(v.shutout)} C3FC ${word(v.goalsAgainst)} D394 4A43 6A00 0004 5382 C4FC ${word(v.shotsAgainst)} D594 5449 524A 584C 51CC FF84 4E75 FFFF FFFF FFFF`,
  )
const STARS: Record<ThreeStars, Uint8Array> = {
  original: STARS_ORIGINAL,
  linesOff: starsCode({ goal: 11000, assist: 7000, shotFor: 500, check: 500, goalsAgainst: -11000, shotsAgainst: 4000, shutout: 16000 }),
  linesOn: starsCode({ goal: 14300, assist: 9100, shotFor: 650, check: 650, goalsAgainst: -11000, shotsAgainst: 4500, shutout: 20800 }),
}
const STAR_CHOICES = Object.keys(STARS) as ThreeStars[]

const threeStars: Part<ThreeStars> = {
  detect: (rom) => STAR_CHOICES.find((choice) => is(rom, STARS_AT, STARS[choice])),
  remove: (rom) => rom.set(STARS_ORIGINAL, STARS_AT),
  apply: (work, value) => work.rom.set(STARS[value], STARS_AT),
}

// --------------------------------------------------------------- base weight
// A player's weight is one of sixteen values, eight pounds apart, counted up
// from this. Players have grown heavier over the years, so a ROM for another
// era starts the count somewhere else.

const BASE_WEIGHT_AT = 0x8e92
const ORIGINAL_BASE_WEIGHT = 140
const validBase = (base: number) => Number.isInteger(base) && base >= 102 && base <= 152 && base % 2 === 0

const baseWeight: Part<number> = {
  detect(rom) {
    const base = readU16(rom, BASE_WEIGHT_AT)
    return validBase(base) ? base : undefined
  },
  remove: (rom) => writeU16(rom, BASE_WEIGHT_AT, ORIGINAL_BASE_WEIGHT),
  apply: (work, value) => writeU16(work.rom, BASE_WEIGHT_AT, value),
}

// smozROM's table of the base weight that suits each season, as the year
// each value starts. It was worked out from the average weight of each
// season's leading forwards, less 58 pounds.
const WEIGHT_BY_YEAR: [number, number][] = [
  [1918, 112], [1922, 110], [1929, 108], [1934, 110], [1937, 112], [1939, 114], [1942, 112], [1944, 110], [1947, 112],
  [1952, 114], [1955, 116], [1958, 118], [1959, 120], [1963, 122], [1966, 124], [1971, 126], [1974, 128], [1978, 130],
  [1983, 132], [1986, 134], [1987, 136], [1990, 138], [1993, 140], [1996, 142], [2000, 144],
]

// The base weight smozROM suggests for a season. Years before the table
// starts use its first value, and years after it ends its last.
export function baseWeightForYear(year: number): number {
  let base = WEIGHT_BY_YEAR[0][1]
  for (const [from, weight] of WEIGHT_BY_YEAR) if (year >= from) base = weight
  return base
}

// ---------------------------------------------------------------- more fixes
// Two bugs in setplayer, which works out a player's ratings in play each time
// he comes on the ice. In play a rating counts five times its value, give or
// take a little for being hot or cold, so 0 to 30.

// Aggression is then cut to 0 to 15 by keeping only its last four bits, so
// it wraps round: a 4 plays like a 1, and a 6 or a 3 is the most penalised. The fix
// keeps it in bounds with the game's own ClampNibble, which the code is
// followed by, and halves it, so it runs from 0 to 15 with the rating. For
// goalies the same place holds the glove rating GvL, which lets him make the
// reaching glove save at 11 and over: with the fix that takes about 5.
//   move.b d3,$73(a3) / andi.b #$F,$73(a3)
//   becomes  bsr.w ClampNibble / lsr.b #1,d3 / move.b d3,$73(a3)
const aggressionFix = switchPart(0x15d78, bytes('1743 0073 022B 000F 0073'), bytes('6100 000A E20B 1743 0073'))

// A team tied or behind in the third period is meant to get a small boost
// late on, but the test of the clock is the wrong way round (bgt for blt),
// so the boost comes while more than half the period is left and goes for
// the rest. Overtime is not affected: both teams have it throughout.
const comebackFix = switchPart(0x15b70, bytes('6E00 0026'), bytes('6D00 0026'))

// The rocket pass. passtoa0 aims a pass at where the receiver will be: it
// solves for the time the puck meets him, in eighths of a second (1 to 24),
// and sets the puck's speed to cover the distance in that time. The division
// rounds toward zero, so a meeting due in 1.9 eighths is made in 1, at nearly
// twice the pass's speed; and a time just below 0, the wrong one of the two
// the sum has, rounds to 0 and is taken, so a pass to a skater going away
// close by is made in an eighth instead of five. The fix works the time out
// in 64ths of a second, from the same division's remainder, and takes a time
// as below 0 when it is, so it tries the other. What uses the time is changed
// to match: the receiver's wait and the puck's no-touch time (eighths x 8
// - 10, now 64ths - 10), where he will be (x t / 2, now / 16) and the speed
// (/ 120 t, now / 15 t). The lift stays in whole eighths, and the time keeps
// the game's limits of an eighth and 3 seconds. Replaying the 2,535 targeted
// passes of 29 recorded games, none then goes more than 1.23 times its pass
// speed, where the original sends 345 over 1.3 times and 69 over 27,000.
const PASS_HOOK: Hook = {
  at: 0xbf40,
  original: bytes('3400 4440 9444 48C2 85C5 5ACB FFF4 6600 0004 5242 B47C 0018 6300 0004 7418 11C2 B776 B47C 000C 6D00 0008 11FC 000C B776'),
}
export const PASS_CODE = bytes('3400 4440 9444 48C2 85C5 4A42 6B0E 6612 2202 4841 4A41 670A BB41 6A06 51CB FFE2 6022 B47C 0018 641C 2002 4840 48C0 E780 81C5 6A02 7000 E742 D440 B47C 0008 6408 7408 6004 343C 00C0 3002 E648 B07C 000C 6302 700C 11C0 B776 4E75')
const PASS_EDITS = [
  { at: 0xbf70, original: bytes('3002 E740 0440 000A'), hacked: bytes('3002 4E71 0440 000A') },
  { at: 0xbf88, original: bytes('E280'), hacked: bytes('E880') },
  { at: 0xbf98, original: bytes('E281'), hacked: bytes('E881') },
  { at: 0xbfa6, original: bytes('C4FC 0078'), hacked: bytes('C4FC 000F') },
]

const passFix: Part<boolean> = {
  detect(rom) {
    if (is(rom, PASS_HOOK.at, PASS_HOOK.original) && PASS_EDITS.every((edit) => is(rom, edit.at, edit.original))) return false
    if (hooked(rom, PASS_HOOK, PASS_CODE) !== null && PASS_EDITS.every((edit) => is(rom, edit.at, edit.hacked))) return true
    return undefined
  },
  remove(rom) {
    const target = hooked(rom, PASS_HOOK, PASS_CODE)
    if (target === null) return
    erase(rom, target, PASS_CODE.length)
    rom.set(PASS_HOOK.original, PASS_HOOK.at)
    for (const edit of PASS_EDITS) rom.set(edit.original, edit.at)
  },
  apply(work, value) {
    if (!value) return
    hook(work, PASS_HOOK, PASS_CODE)
    for (const edit of PASS_EDITS) work.rom.set(edit.hacked, edit.at)
  },
}

// Faceoffs off the dots. Every stoppage goes through Stop4Pen, which takes a
// raw spot (centre for a goal, where the last player to touch the puck stood
// for a puck out of play, the icing team's end for icing, the puck for the
// rest) and then only puts it on a dot when it is past the hash marks; short
// of them it is held where it is, so a whistle in the neutral zone or the
// near part of an end zone, and most penalties, are faced off off the dots (27
// of 222 faceoffs in the recorded games, 20 of them after penalties). The fix
// replaces that step, as the NHL rules have it (Match Viewer's
// FACEOFF_PLACEMENT.md): a goal at centre; a penalty (codes $12 to $2A, but
// not $14, an injury from a hit with no penalty, which FallDown enters) in
// the offending team's own end, on the side the puck was; anything else past a
// blue line at that end's dot on the puck's side, and in the neutral zone at
// the nearest neutral dot. limitfo then runs as before. The team's own end is
// the one its pfgoal flag says, as the icing rule reads it. The stoppage is
// the newest entry in PenBuf (at $FFC3A4, filled from the start and emptied
// from the end), not the one a0 points after: a roughing call from a hit
// (FallDown) adds its entry and goes straight into Stop4Pen without pointing
// a0 at it, as the Match Viewer project found. A goal's centre is set here,
// not taken from the raw spot, which a0 decides.
const FACEOFF_HOOK: Hook = {
  at: 0x12504,
  original: bytes(
    '48A7 C000 B07C 0046 6D00 0006 303C 0046 B07C FFBA 6E00 0006 303C FFBA B27C 00A6 6D00 0012 323C 00CE 303C 0046 4A57 6A00 0004 4440 B27C FF5A 6E00 0012 323C FF32 303C 0046 4A57 6A00 0004 4440 31C0 BF94 31C1 BF96 584F',
  ),
}
export const FACEOFF_CODE = bytes('2F09 327CC3A4 4A51 6740 4A59 66FC 5949 0C11000E 6762 0C110012 652E 0C11002B 6428 0C110014 6722 4241 12290001 0241007F EF41 327CB04A 083100071062 6606 323C00CE 6004 323CFF32 4A40 6B04 7046 6002 70BA B27C0058 6E12 B27CFFA8 6D12 4A41 6B04 7241 6014 72BF 6010 323C00CE 600A 323CFF32 6004 7000 7200 31C0BF94 31C1BF96 225F 4E75')

const faceoffFix: Part<boolean> = {
  detect(rom) {
    if (is(rom, FACEOFF_HOOK.at, FACEOFF_HOOK.original)) return false
    return hooked(rom, FACEOFF_HOOK, FACEOFF_CODE) === null ? undefined : true
  },
  remove(rom) {
    const target = hooked(rom, FACEOFF_HOOK, FACEOFF_CODE)
    if (target === null) return
    erase(rom, target, FACEOFF_CODE.length)
    rom.set(FACEOFF_HOOK.original, FACEOFF_HOOK.at)
  },
  apply(work, value) {
    if (value) hook(work, FACEOFF_HOOK, FACEOFF_CODE)
  },
}

// Runaway speed. A skater's pfdoff flag (pflags bit 0) makes him slow by
// 1/512 of his speed a frame instead of 1/64, nearly as little as the puck:
// the game sets it for a computer skater about to take a pass, so he glides
// onto it, and for one knocked into the boards or the bench, so he slides. It
// is meant to be cleared when he touches the puck or is given other work, but
// three ways leave it on (Match Viewer's GENESIS_MECHANICS 3.4 and its
// recorded runaways): asspassrec ends for a skater a person has taken over
// through a branch straight to assexit, past its own exit that clears the
// flag; getting up from a fall never clears it; and a one-timer that misses
// the puck never reaches puckstick, which is what clears it for one that
// hits. A person's skater then barely slows, each speed burst stacks on the
// last, and he can shoot off at twice top speed. The fix points that branch
// at asspassrec's own exit; makes the end of a fall animation (where the game
// clears pf3fall) clear pfdoff too, only when a fall is ending; and makes
// EndOneTimer, which ends every one-timer after the shot or the miss, clear
// it with the one-timer's own flag. During a one-timer the skater still
// glides, as before.
const RUNAWAY_EXIT = { at: 0xeba0, original: bytes('1AA6'), hacked: bytes('00C8') }
const RUNAWAY_FALL_HOOK: Hook = { at: 0xaf76, original: bytes('08AB 0005 0064') }
// bclr #pf3fall,pflags3(a3); beq.s done; bclr #pfdoff,pflags(a3); done: rts
export const RUNAWAY_CODE = bytes('08AB 0005 0064 6706 08AB 0000 0062 4E75')
// EndOneTimer's first: bclr #pf3onetimer,pflags3(a3), and then bclr #pfdoff,pflags(a3).
const RUNAWAY_ONETIMER_HOOK: Hook = { at: 0xfeff4, original: bytes('08AB 0003 0064') }
export const RUNAWAY_ONETIMER_CODE = bytes('08AB 0003 0064 08AB 0000 0062 4E75')
const runawayHooks: [Hook, Uint8Array][] = [
  [RUNAWAY_FALL_HOOK, RUNAWAY_CODE],
  [RUNAWAY_ONETIMER_HOOK, RUNAWAY_ONETIMER_CODE],
]

const runawayFix: Part<boolean> = {
  detect(rom) {
    if (is(rom, RUNAWAY_EXIT.at, RUNAWAY_EXIT.original) && runawayHooks.every(([h]) => is(rom, h.at, h.original))) return false
    if (is(rom, RUNAWAY_EXIT.at, RUNAWAY_EXIT.hacked) && runawayHooks.every(([h, code]) => hooked(rom, h, code) !== null)) return true
    return undefined
  },
  remove(rom) {
    const targets = runawayHooks.map(([h, code]) => hooked(rom, h, code))
    if (targets.some((target) => target === null) || !is(rom, RUNAWAY_EXIT.at, RUNAWAY_EXIT.hacked)) return
    runawayHooks.forEach(([h, code], i) => {
      erase(rom, targets[i]!, code.length)
      rom.set(h.original, h.at)
    })
    rom.set(RUNAWAY_EXIT.original, RUNAWAY_EXIT.at)
  },
  apply(work, value) {
    if (!value) return
    for (const [h, code] of runawayHooks) hook(work, h, code)
    work.rom.set(RUNAWAY_EXIT.hacked, RUNAWAY_EXIT.at)
  },
}

// The penalty shot table. A foul on a breakaway becomes a penalty shot
// through PenShotPenalties, a word for each penalty number giving its
// penalty shot form, but the entries sit one word early: charging is given
// slashing's penalty shot, slashing roughing's, roughing cross-checking's,
// cross-checking hooking's, hooking tripping's, tripping interference's, and
// interference and holding none. The fix moves them to their own penalties,
// so each penalty shot is named for its foul. Which fouls give one does not
// change: holding has no penalty shot form, and interference never goes
// through PenShotChk (it is called on a player without the puck).
// (Match Viewer's reading of PenShotChk and its callers agrees.)
const penaltyShotTableFix = switchPart(
  0x1914e,
  bytes('0038 003C 0036 003A 002E 0030 0034 FFFF'),
  bytes('FFFF 0038 003C 0036 003A 002E 0030 0034'),
)

// Two penalty shot bugs (Match Viewer's GENESIS_MECHANICS 10 and its reading
// of the code). A penalty shot stopped by a whistle that is not one of its own
// endings (the puck over the glass, the net knocked off) is taken again:
// BA_PS_flags bit 3, "penalty shot pending", is cleared only by a goal, by the
// shot's own end (EndPenaltyShotPlay) or when none can be set up, so after
// that whistle InProgress finds it still set and starts another. puckshootout
// clears bits 2, 4, 5 and 6 as each attempt starts; the fix clears bit 3 there
// too, with one andi.b #$83 in place of the four bclr (the rest no-ops). Only
// PenShotChk and InProgress read bit 3. And a puck that went over the glass
// after the award whistle keeps its no-collision mode (pfnc, puck pflags at
// $B7AC), which only a faceoff drop turns off, so the shot floats through the
// net and the boards: the ghost puck. SetupPenaltyShot now turns it off,
// through a call in place of its first two instructions after the movem.
const PS_FLAGS_CLEAR = {
  at: 0xed0e,
  original: bytes('08B8 0002 C2F2 08B8 0004 C2F2 08B8 0005 C2F2 08B8 0006 C2F2'),
  hacked: bytes('0238 0083 C2F2 4E71 4E71 4E71 4E71 4E71 4E71 4E71 4E71 4E71'),
}
const PS_SETUP_HOOK: Hook = { at: 0x15930, original: bytes('366A 0022 7805') }
// movea.w tmsort(a2),a3; moveq #5,d4; bclr #pfnc,(puck pflags).w; rts
export const PS_SETUP_CODE = bytes('366A 0022 7805 08B8 0002 B7AC 4E75')

const penaltyShotFixes: Part<boolean> = {
  detect(rom) {
    if (is(rom, PS_FLAGS_CLEAR.at, PS_FLAGS_CLEAR.original) && is(rom, PS_SETUP_HOOK.at, PS_SETUP_HOOK.original)) return false
    if (is(rom, PS_FLAGS_CLEAR.at, PS_FLAGS_CLEAR.hacked) && hooked(rom, PS_SETUP_HOOK, PS_SETUP_CODE) !== null) return true
    return undefined
  },
  remove(rom) {
    const target = hooked(rom, PS_SETUP_HOOK, PS_SETUP_CODE)
    if (target === null || !is(rom, PS_FLAGS_CLEAR.at, PS_FLAGS_CLEAR.hacked)) return
    erase(rom, target, PS_SETUP_CODE.length)
    rom.set(PS_SETUP_HOOK.original, PS_SETUP_HOOK.at)
    rom.set(PS_FLAGS_CLEAR.original, PS_FLAGS_CLEAR.at)
  },
  apply(work, value) {
    if (!value) return
    hook(work, PS_SETUP_HOOK, PS_SETUP_CODE)
    work.rom.set(PS_FLAGS_CLEAR.hacked, PS_FLAGS_CLEAR.at)
  },
}

// The computer's goalie pull. CPgoalie pulls the computer's goalie in the
// last minute of the third period, for a faceoff out of its own end, when it
// is behind: d0 = the other team's score less its own; bmi leaves if it
// leads, then cmp #2 / bne leaves unless it is exactly two behind, though the
// comment says "exit if behind by more than 2". So it never pulls him when one
// goal down (found by the Match Viewer project). bgt alone would let a tie
// through (0 passes the bmi), so both change: ble leaves if leading or tied,
// and bgt if more than two behind.
const goaliePullFix = switchPart(0xf758, bytes('6B00 5D0A B07C 0002 6600 5D02'), bytes('6F00 5D0A B07C 0002 6E00 5D02'))

// The goalie's blind ring (Match Viewer's GENESIS_SHOOTING). checkpuckcoll
// hands a puck within a stick's reach (14 units) to puckstick and then skips
// the body test, but for a goalie and a loose puck puckstick does nothing past
// 8 units from his blade. So between 8 and 14 nothing touches the puck, and
// the butterfly and some kick saves put his blade 10 to 13 to the side, his
// middle in that ring: five-hole goals. The option sends that case on to the
// body test (puckgoalie) instead; everything else calls puckstick as before,
// the "goalie lets it in" mode (gmhl) included. bsr.w puckstick / bra.w .exit
// become a call to the code below and bne.s .exit: it returns Z set for the
// body test, clear for the exit. Over 928 recorded shots it changes expected
// goals by about -0.3%; 3 of 218 recorded goals were five-hole goals.
const RING_AT = 0x14ec8
const RING_ORIGINAL = bytes('6100 021A 6000 0054')
// tst.w position(a2); bne .stick; tst.w (puckc).w; bpl .stick; btst #gmhl,(gmode).w; bne .stick;
// cmpi.l #$40,d0; bls .stick; ori #4,ccr; rts; .stick: jsr puckstick; andi #$FB,ccr; rts
export const RING_CODE = bytes('4A6A 0034 661C 4A78 B7AA 6A16 0838 0004 C2EA 660E 0C80 0000 0040 6306 003C 0004 4E75 4EB9 0001 50E4 023C 00FB 4E75')
const ringTarget = (rom: Uint8Array) =>
  readU16(rom, RING_AT) === OP_JSR && readU16(rom, RING_AT + 6) === 0x6652 && is(rom, readU32(rom, RING_AT + 2), RING_CODE) ? readU32(rom, RING_AT + 2) : null

const blindRingFix: Part<boolean> = {
  detect(rom) {
    if (is(rom, RING_AT, RING_ORIGINAL)) return false
    return ringTarget(rom) === null ? undefined : true
  },
  remove(rom) {
    const target = ringTarget(rom)
    if (target === null) return
    erase(rom, target, RING_CODE.length)
    rom.set(RING_ORIGINAL, RING_AT)
  },
  apply(work, value) {
    if (!value) return
    const target = place(work, RING_CODE)
    writeU16(work.rom, RING_AT, OP_JSR)
    writeU32(work.rom, RING_AT + 2, target)
    writeU16(work.rom, RING_AT + 6, 0x6652)
  },
}

// Pulled-goalie sniping (bug 13 in the known bugs list). doshot makes a shot
// from within 200 exact, where it is aimed, whenever ReadGoaliePulled finds
// the shooting team's own goalie off the ice: on a delayed penalty, or a
// late pull by a person or by the computer. The fix takes out that bmi.w
// .perf, so such a shot takes the normal accuracy roll (exact within 200 with
// chance (ShA + 1) / (ShA + 16)). An empty net at the other end already takes
// the roll; ReadGoaliePulled's other callers, which only make the computer's
// skaters think again sooner, are left. (Match Viewer's reading of doshot.)
// An option: some leagues like the pulled goalie's sniping, so it is not
// among the recommended fixes.
const snipingFix = switchPart(0xc422, bytes('6B00 0084'), bytes('4E71 4E71'))

// Two parts that are in or out together.
function bothParts(a: Part<boolean>, b: Part<boolean>): Part<boolean> {
  return {
    detect: (rom) => {
      const [x, y] = [a.detect(rom), b.detect(rom)]
      return x === y ? x : undefined
    },
    remove: (rom) => {
      a.remove(rom)
      b.remove(rom)
    },
    apply: (work, value) => {
      a.apply(work, value)
      b.apply(work, value)
    },
  }
}

// The awareness slip (bug 20). Each job that steers a computer skater
// reloads the timer for his next decision from his awareness: the offence
// jobs from Offensive Awareness (aioff, $6A), the defence jobs from Defensive
// (aidef, $6B), but the winger's and the centre's offence jobs (asswingo,
// asscentero) load aidef. The option makes them load aioff. A small change:
// the timer runs 7 to 15 frames, and over the original rosters it moves by a
// frame at most for most skaters. (Match Viewer's reading of the eight reloads.)
const awarenessFix = bothParts(switchPart(0xd0e1, bytes('6B'), bytes('6A')), switchPart(0xd2d9, bytes('6B'), bytes('6A')))

// The crowd bonus (bug 21). When the crowd meter is past its record
// (sflags7 bit 6) skaters get +2 Agility and +2 Speed in skating, a
// boost for the chaser of the puck, more reach for the goalie's body and a
// person's poke trip with penalties off; but every test checks sflags8 bit 1
// first, which SetSflags8Bit1 always sets (it starts with a bra.w past its
// own bclr), so the bonus is on all the time. Two nops in place of that bra
// make it follow the meter, which in the recordings is past its record about
// 73% of live play. (Match Viewer's reading.)
const crowdFix = switchPart(0xfef66, bytes('6000 000C'), bytes('4E71 4E71'))

// A team's power play and penalty kill ratings share a byte. The original
// data, and the community, have the power play in the high half, but the game
// adds the low half on the power play and takes the high half off on the
// penalty kill (the Genesis disassembly calls it a bug). The fix reads them
// the other way round, in the same room:
//   move.b 1(a0),(PPBonus).w / andi.b #$F,(PPBonus).w
//   becomes  move.b 1(a0),d0 / lsr.b #4,d0 / move.b d0,(PPBonus).w / nop
//   move.b 1(a0),d0 / lsr.b #4,d0 / neg.b d0 / move.b d0,(PKBonus).w
//   becomes  moveq #$F,d0 / and.b 1(a0),d0 / neg.b d0 / move.b d0,(PKBonus).w
// d0 is loaded afresh straight after either, so using it changes nothing else.
const ppPkFix = switchPart(
  0x15b1e,
  bytes('11E8 0001 CF2E 0238 000F CF2E 6000 000E 1028 0001 E808 4400 11C0 CF2F'),
  bytes('1028 0001 E808 11C0 CF2E 4E71 6000 000E 700F C028 0001 4400 11C0 CF2F'),
)

// ---------------------------------------------------------------------- play
// How the game plays. Each of these is a number or an instruction changed
// where it stands in the game's code; none adds code of its own. They were
// found and posted on the NHL94 forums:
//   the C-then-B check bug, and how far a goalie roams        smozoma
//   how long a goalie holds the puck                clockwise and smozoma
//   energy, the speed burst, stopping and turning    wboy, with Tony H
//   the clocks      Brodeur30, smozoma, kingraph and AverageRangersFan

// A number in the game's code, known by the instruction just before it. Some
// are kept as the negative of what they mean, for the other end of the ice.
interface NumberSite {
  at: number
  lead: Uint8Array
  negative?: boolean
}
const site = (at: number, lead: string, negative = false): NumberSite => ({ at, lead: bytes(lead), negative })

function readSite(rom: Uint8Array, { at, lead, negative }: NumberSite): number | undefined {
  if (!is(rom, at - lead.length, lead)) return undefined
  const value = readU16(rom, at)
  if (!negative) return value
  const signed = value >= 0x8000 ? value - 0x10000 : value
  return signed <= 0 ? -signed : undefined
}
const writeSite = (rom: Uint8Array, { at, negative }: NumberSite, value: number) => writeU16(rom, at, (negative ? -value : value) & 0xffff)

// One number kept in one or more places, which have to agree.
function numberPart(sites: NumberSite[], original: number): Part<number> {
  return {
    detect(rom) {
      const values = sites.map((each) => readSite(rom, each))
      return values.every((value) => value === values[0]) ? values[0] : undefined
    },
    remove: (rom) => sites.forEach((each) => writeSite(rom, each, original)),
    apply: (work, value) => sites.forEach((each) => writeSite(work.rom, each, value)),
  }
}

// An instruction that is either the original game's or its replacement.
function switchPart(at: number, original: Uint8Array, hacked: Uint8Array): Part<boolean> {
  return {
    detect: (rom) => (is(rom, at, original) ? false : is(rom, at, hacked) ? true : undefined),
    remove: (rom) => rom.set(original, at),
    apply: (work, value) => void (value && work.rom.set(hacked, at)),
  }
}

// See CheckFix.
const CHECK_BASE_AT = 0x13d6c
const CHECK_BASES: Record<CheckFix, Uint8Array> = {
  off: bytes('6700 0004 E340'),
  all120: bytes('6700 0004 4E71'),
  all240: bytes('4E71 4E71 E340'),
}
const checkFix: Part<CheckFix> = {
  detect: (rom) => (Object.keys(CHECK_BASES) as CheckFix[]).find((value) => is(rom, CHECK_BASE_AT, CHECK_BASES[value])),
  remove: (rom) => rom.set(CHECK_BASES.off, CHECK_BASE_AT),
  apply: (work, value) => work.rom.set(CHECK_BASES[value], CHECK_BASE_AT),
}

// A goalie holding the puck is whistled when a count of sixtieths of a second
// runs out. The count can be made longer, or never be counted down.
const holdFrames = numberPart([site(0x1530e, '357C')], NO_HACKS.goalieHold)
const holdCounted = switchPart(0xd4c6, bytes('9F6B'), bytes('6002'))
const goalieHold: Part<number> = {
  detect(rom) {
    const [frames, never] = [holdFrames.detect(rom), holdCounted.detect(rom)]
    if (frames === undefined || never === undefined || frames === 0) return undefined
    return never ? 0 : frames
  },
  remove(rom) {
    holdFrames.remove(rom)
    holdCounted.remove(rom)
  },
  apply(work, value) {
    if (value === 0) holdCounted.apply(work, true)
    else holdFrames.apply(work, value)
  },
}

// Where a goalie may go. Without the puck he is kept in a box in front of his
// net; play is whistled if a goalie a person controls crosses a line, with
// the puck or without it.
const goalieWidth = numberPart([site(0xb632, '0C53'), site(0xb650, '0C53', true)], NO_HACKS.goalieWidth)
const goalieOut = numberPart([site(0xb66a, '0C6B'), site(0xb674, '0C6B', true)], NO_HACKS.goalieOut)
const goalieLine = numberPart([site(0xd3ea, 'B27C'), site(0xd3f2, 'B27C', true)], NO_HACKS.goalieLine)

// With line changes on, a player loses energy each moment on the ice and
// gains it on the bench. The first switch stops the loss being kept.
const stamina = switchPart(0x15782, bytes('3580'), bytes('6002'))
const energyDrain = numberPart([site(0x10d42, '0440')], NO_HACKS.energyDrain)
const energyRecovery = numberPart([site(0x7a1a, '0672')], NO_HACKS.energyRecovery)

// The C button's push. The original game works it out from the player's
// energy, 32 at the most; the hack makes it one number for everybody.
const BURST_AT = 0xbb88
const BURST_ORIGINAL = bytes('EE48')
const OP_MOVEQ_D0 = 0x70
const speedBurst: Part<number> = {
  detect(rom) {
    if (is(rom, BURST_AT, BURST_ORIGINAL)) return 0
    const value = rom[BURST_AT + 1]
    return rom[BURST_AT] === OP_MOVEQ_D0 && value >= 1 && value <= 0x7f ? value : undefined
  },
  remove: (rom) => rom.set(BURST_ORIGINAL, BURST_AT),
  apply: (work, value) => void (value > 0 && work.rom.set([OP_MOVEQ_D0, value], BURST_AT)),
}

// How fast a skater loses speed when he reverses, one place for each direction.
const turnRate = numberPart([site(0x10e24, '066B'), site(0x10e32, '046B'), site(0x10e48, '066B'), site(0x10e56, '046B')], NO_HACKS.turnRate)

// The game clock and the penalty shot clock each take a number from a count
// every sixtieth of a second and tick when it runs out; the penalty clock
// ticks every so many sixtieths. The original game's run two and a half
// times as fast as a real clock.
const CLOCK_SITES = [site(0x15dec, '0478'), site(0x128cc, '0678'), site(0x15e32, '0478')]
const CLOCK_VALUES = { original: [0x0aaa, 0x0018, 0x0aaa], realTime: [0x0444, 0x003c, 0x0444] }
const clock: Part<boolean> = {
  detect(rom) {
    const values = CLOCK_SITES.map((each) => readSite(rom, each))
    if (values.every((value, i) => value === CLOCK_VALUES.original[i])) return false
    return values.every((value, i) => value === CLOCK_VALUES.realTime[i]) ? true : undefined
  },
  remove: (rom) => CLOCK_SITES.forEach((each, i) => writeSite(rom, each, CLOCK_VALUES.original[i])),
  apply: (work, value) => void (value && CLOCK_SITES.forEach((each, i) => writeSite(work.rom, each, CLOCK_VALUES.realTime[i]))),
}

// ------------------------------------------------------------ the whole ROM

// What is in a ROM now.
export function detectHacks(rom: Uint8Array): HackState {
  const unknown: HackPart[] = []
  const found = <T>(part: HackPart, value: T | undefined, otherwise: T): T => {
    if (value === undefined) unknown.push(part)
    return value ?? otherwise
  }
  const scale = found('ratings', ratings.detect(rom), { wide: NO_HACKS.wideRatings, bonuses: NO_HACKS.bonuses })
  const choices: HackChoices = {
    weightFix: found('weightFix', weightFix.detect(rom), NO_HACKS.weightFix),
    bodychecks: found('bodychecks', bodychecks.detect(rom), NO_HACKS.bodychecks),
    secondAssist: found('secondAssist', secondAssist.detect(rom), NO_HACKS.secondAssist),
    plusMinus: found('plusMinus', plusMinus.detect(rom), NO_HACKS.plusMinus),
    wideRatings: scale.wide,
    bonuses: scale.bonuses,
    threeStars: found('threeStars', threeStars.detect(rom), NO_HACKS.threeStars),
    baseWeight: found('baseWeight', baseWeight.detect(rom), NO_HACKS.baseWeight),
    checkFix: found('checkFix', checkFix.detect(rom), NO_HACKS.checkFix),
    aggressionFix: found('aggressionFix', aggressionFix.detect(rom), NO_HACKS.aggressionFix),
    ppPkFix: found('ppPkFix', ppPkFix.detect(rom), NO_HACKS.ppPkFix),
    comebackFix: found('comebackFix', comebackFix.detect(rom), NO_HACKS.comebackFix),
    passFix: found('passFix', passFix.detect(rom), NO_HACKS.passFix),
    faceoffFix: found('faceoffFix', faceoffFix.detect(rom), NO_HACKS.faceoffFix),
    runawayFix: found('runawayFix', runawayFix.detect(rom), NO_HACKS.runawayFix),
    penaltyShotTableFix: found('penaltyShotTableFix', penaltyShotTableFix.detect(rom), NO_HACKS.penaltyShotTableFix),
    penaltyShotFixes: found('penaltyShotFixes', penaltyShotFixes.detect(rom), NO_HACKS.penaltyShotFixes),
    goaliePullFix: found('goaliePullFix', goaliePullFix.detect(rom), NO_HACKS.goaliePullFix),
    blindRingFix: found('blindRingFix', blindRingFix.detect(rom), NO_HACKS.blindRingFix),
    snipingFix: found('snipingFix', snipingFix.detect(rom), NO_HACKS.snipingFix),
    awarenessFix: found('awarenessFix', awarenessFix.detect(rom), NO_HACKS.awarenessFix),
    crowdFix: found('crowdFix', crowdFix.detect(rom), NO_HACKS.crowdFix),
    goalieHold: found('goalieHold', goalieHold.detect(rom), NO_HACKS.goalieHold),
    goalieWidth: NO_HACKS.goalieWidth,
    goalieOut: NO_HACKS.goalieOut,
    goalieLine: found('goalieLine', goalieLine.detect(rom), NO_HACKS.goalieLine),
    stamina: found('stamina', stamina.detect(rom), NO_HACKS.stamina),
    energyDrain: found('energyDrain', energyDrain.detect(rom), NO_HACKS.energyDrain),
    energyRecovery: found('energyRecovery', energyRecovery.detect(rom), NO_HACKS.energyRecovery),
    speedBurst: found('speedBurst', speedBurst.detect(rom), NO_HACKS.speedBurst),
    turnRate: found('turnRate', turnRate.detect(rom), NO_HACKS.turnRate),
    realTime: found('clock', clock.detect(rom), NO_HACKS.realTime),
  }
  const [width, out] = [goalieWidth.detect(rom), goalieOut.detect(rom)]
  if (width === undefined || out === undefined) unknown.push('goalieBox')
  else Object.assign(choices, { goalieWidth: width, goalieOut: out })
  return { choices, unknown }
}

// A ROM with the wanted hacks, which may be larger than the one given. Parts
// whose code is not recognised are left exactly as they are. Like smozROM,
// it takes out every hack it knows and puts the wanted ones in afresh, in
// smozROM's order, so that the same choices always give the same ROM.
export function hackRom(rom: Uint8Array, wanted: HackChoices): Uint8Array {
  if (!validBase(wanted.baseWeight)) throw new HackError('A base weight has to be an even number from 102 to 152.')
  for (const key of Object.keys(HACK_RANGES) as (keyof typeof HACK_RANGES)[]) {
    const [least, most] = HACK_RANGES[key]
    if (!Number.isInteger(wanted[key]) || wanted[key] < least || wanted[key] > most) throw new HackError(`${HACK_TITLES[key]} has to be a whole number from ${least} to ${most}.`)
  }
  const { unknown, choices } = detectHacks(rom)
  const work: Work = { rom: rom.slice() }
  const steps: [HackPart, () => void, () => void][] = [
    ['weightFix', () => weightFix.remove(work.rom), () => weightFix.apply(work, wanted.weightFix)],
    ['bodychecks', () => bodychecks.remove(work.rom), () => bodychecks.apply(work, wanted.bodychecks)],
    ['baseWeight', () => baseWeight.remove(work.rom), () => baseWeight.apply(work, wanted.baseWeight)],
    ['secondAssist', () => secondAssist.remove(work.rom), () => secondAssist.apply(work, wanted.secondAssist)],
    ['ratings', () => ratings.remove(work.rom), () => ratings.apply(work, { wide: wanted.wideRatings, bonuses: wanted.bonuses })],
    ['plusMinus', () => plusMinus.remove(work.rom), () => plusMinus.apply(work, wanted.plusMinus)],
    ['threeStars', () => threeStars.remove(work.rom), () => threeStars.apply(work, wanted.threeStars)],
    ['checkFix', () => checkFix.remove(work.rom), () => checkFix.apply(work, wanted.checkFix)],
    ['aggressionFix', () => aggressionFix.remove(work.rom), () => aggressionFix.apply(work, wanted.aggressionFix)],
    ['ppPkFix', () => ppPkFix.remove(work.rom), () => ppPkFix.apply(work, wanted.ppPkFix)],
    ['comebackFix', () => comebackFix.remove(work.rom), () => comebackFix.apply(work, wanted.comebackFix)],
    ['goalieHold', () => goalieHold.remove(work.rom), () => goalieHold.apply(work, wanted.goalieHold)],
    ['goalieBox', () => goalieWidth.remove(work.rom), () => goalieWidth.apply(work, wanted.goalieWidth)],
    ['goalieBox', () => goalieOut.remove(work.rom), () => goalieOut.apply(work, wanted.goalieOut)],
    ['goalieLine', () => goalieLine.remove(work.rom), () => goalieLine.apply(work, wanted.goalieLine)],
    ['stamina', () => stamina.remove(work.rom), () => stamina.apply(work, wanted.stamina)],
    ['energyDrain', () => energyDrain.remove(work.rom), () => energyDrain.apply(work, wanted.energyDrain)],
    ['energyRecovery', () => energyRecovery.remove(work.rom), () => energyRecovery.apply(work, wanted.energyRecovery)],
    ['speedBurst', () => speedBurst.remove(work.rom), () => speedBurst.apply(work, wanted.speedBurst)],
    ['turnRate', () => turnRate.remove(work.rom), () => turnRate.apply(work, wanted.turnRate)],
    ['clock', () => clock.remove(work.rom), () => clock.apply(work, wanted.realTime)],
    ['passFix', () => passFix.remove(work.rom), () => passFix.apply(work, wanted.passFix)],
    ['faceoffFix', () => faceoffFix.remove(work.rom), () => faceoffFix.apply(work, wanted.faceoffFix)],
    ['runawayFix', () => runawayFix.remove(work.rom), () => runawayFix.apply(work, wanted.runawayFix)],
    ['penaltyShotTableFix', () => penaltyShotTableFix.remove(work.rom), () => penaltyShotTableFix.apply(work, wanted.penaltyShotTableFix)],
    ['penaltyShotFixes', () => penaltyShotFixes.remove(work.rom), () => penaltyShotFixes.apply(work, wanted.penaltyShotFixes)],
    ['goaliePullFix', () => goaliePullFix.remove(work.rom), () => goaliePullFix.apply(work, wanted.goaliePullFix)],
    ['blindRingFix', () => blindRingFix.remove(work.rom), () => blindRingFix.apply(work, wanted.blindRingFix)],
    ['snipingFix', () => snipingFix.remove(work.rom), () => snipingFix.apply(work, wanted.snipingFix)],
    ['awarenessFix', () => awarenessFix.remove(work.rom), () => awarenessFix.apply(work, wanted.awarenessFix)],
    ['crowdFix', () => crowdFix.remove(work.rom), () => crowdFix.apply(work, wanted.crowdFix)],
  ]
  // An earlier version of a hack that is being kept is not touched either.
  if (wanted.bodychecks === 'earlier' && choices.bodychecks !== 'earlier') throw new HackError('This ROM does not have the earlier bodycheck statistics to keep.')
  const kept: HackPart[] = wanted.bodychecks === 'earlier' ? ['bodychecks'] : []
  const known = steps.filter(([part]) => !unknown.includes(part) && !kept.includes(part))
  for (const [, remove] of known) remove()
  for (const [, , apply] of known) apply()
  return work.rom
}

// ------------------------------------------------------------ in the editor

// smozROM marks the product code to say how a ROM is set up: see games.ts.
const PRODUCT_CODE_AT = 0x180
const SMOZROM_CODE = /^GM T-50656( -|-F)([03])([0A-Z])$/

// Whether hacks can be looked for in a ROM of this kind. They are made for
// the original game and the 30-team ROM built on it.
export function hacksSupported(game: GameConfig): boolean {
  return SMOZROM_CODE.test(game.productCode) && game.headerName === undefined
}

export function hackState(project: RomProject): HackState | null {
  return hacksSupported(project.game) ? detectHacks(project.bytes) : null
}

export function sameHacks(a: HackChoices, b: HackChoices): boolean {
  return (Object.keys(NO_HACKS) as (keyof HackChoices)[]).every((key) => a[key] === b[key])
}

// The fixes a league can take without choosing anything: each is a bug fix
// tested in the game. The faceoff spot fix (a choice between eras) and the
// options are left as they are, and smozoma's legacy weight bug fix is taken
// out, since it does not go with the weight bug and C-then-B fix.
export const RECOMMENDED_FIXES: Partial<HackChoices> = {
  checkFix: 'all120',
  weightFix: 'off',
  secondAssist: true,
  aggressionFix: true,
  ppPkFix: true,
  comebackFix: true,
  passFix: true,
  runawayFix: true,
  penaltyShotTableFix: true,
  penaltyShotFixes: true,
}

// `choices` with the recommended fixes, except where this ROM's code is not known.
export function withRecommendedFixes(choices: HackChoices, unknown: HackPart[]): HackChoices {
  const next = { ...choices }
  for (const [key, value] of Object.entries(RECOMMENDED_FIXES) as [keyof HackChoices, never][]) {
    if (!unknown.includes(HACK_PARTS[key])) next[key] = value
  }
  return next
}

// The order the Hacks page has them in, smozoma's legacy fix last.
const PAGE_ORDER: (keyof HackChoices)[] = [
  'checkFix', 'secondAssist', 'aggressionFix', 'ppPkFix', 'comebackFix', 'passFix', 'faceoffFix', 'runawayFix',
  'penaltyShotTableFix', 'penaltyShotFixes', 'snipingFix', 'goaliePullFix', 'blindRingFix', 'awarenessFix', 'crowdFix', 'bodychecks', 'plusMinus', 'threeStars',
  'wideRatings', 'bonuses', 'baseWeight', 'goalieHold', 'goalieWidth', 'goalieOut', 'goalieLine', 'stamina',
  'energyDrain', 'energyRecovery', 'speedBurst', 'turnRate', 'realTime', 'weightFix',
]

// What this ROM has, as a Discord post for a league's owners: each hack that
// differs from the original game, and what the editor cannot read.
export function hacksForDiscord(state: HackState, name: string): string {
  const lines: string[] = []
  const unread: string[] = []
  for (const key of PAGE_ORDER) {
    if (state.unknown.includes(HACK_PARTS[key])) {
      if (!unread.includes(HACK_TITLES[key])) unread.push(HACK_TITLES[key])
      continue
    }
    const value = state.choices[key]
    if (value === NO_HACKS[key]) continue
    if ((value === true && key !== 'wideRatings') || value === 'on' || (key === 'checkFix' && value === 'all120')) lines.push(`- **${HACK_TITLES[key]}**`)
    // The original speed burst depends on how tired the player is, so there is no one number to give for it.
    else if (typeof value === 'number' && key !== 'speedBurst') lines.push(`- **${HACK_TITLES[key]}**: ${hackValueText(key, state.choices)} (the original game has ${hackValueText(key, NO_HACKS)})`)
    else lines.push(`- **${HACK_TITLES[key]}**: ${hackValueText(key, state.choices)}`)
  }
  return discordPost(name, lines, unread)
}

// This ROM's choices set to another ROM's hacks, for a league that wants
// the same in every ROM. A part either ROM's code is not recognised in keeps
// this ROM's choice, as does an earlier version of a hack (the simpler weight
// fix, the earlier bodycheck statistics, the all-240 checking fix) that this
// ROM does not have, since those can be kept but not made afresh. Each part
// left so, where the other ROM has something different, is named.
export function hacksCopiedFrom(current: HackState, other: HackState): { choices: HackChoices; notCopied: string[] } {
  const choices = { ...current.choices }
  const notCopied: string[] = []
  const earlier = (key: keyof HackChoices, value: unknown) =>
    (key === 'weightFix' && value === 'simple') || (key === 'bodychecks' && value === 'earlier') || (key === 'checkFix' && value === 'all240')
  for (const key of Object.keys(NO_HACKS) as (keyof HackChoices)[]) {
    const value = other.choices[key]
    if (value === current.choices[key]) continue
    const part = HACK_PARTS[key]
    if (other.unknown.includes(part) || current.unknown.includes(part)) {
      notCopied.push(`${HACK_TITLES[key]}: one of the two ROMs has code here the editor does not know.`)
    } else if (earlier(key, value)) {
      notCopied.push(`${HACK_TITLES[key]}: the other ROM has ${hackValueText(key, other.choices)}, which can be kept but not put into another ROM.`)
    } else {
      ;(choices as Record<string, unknown>)[key] = value
    }
  }
  return { choices, notCopied }
}

// A rating on one scale as the nearest on the other. Six is to fifteen as the
// game counts them: a rating is worth five times itself on the ice on the
// old scale and twice itself on the new.
export const widenRating = (value: number) => Math.min(15, Math.round(value * 2.5))
export const narrowRating = (value: number) => Math.min(6, Math.round(value / 2.5))

// The project with its ROM hacked as wanted. Where the rating scale or the
// base weight changes, every player's ratings or weight are restated in the
// new terms, so that each stays as near as can be to what he was.
export function applyHacks(project: RomProject, wanted: HackChoices): RomProject {
  if (!hacksSupported(project.game)) throw new HackError('Hacks cannot be applied to this kind of ROM.')
  const before = detectHacks(project.bytes)
  const rom = hackRom(project.bytes, wanted)
  const after = detectHacks(rom).choices

  // The marks say what the ROM now is, which for a part left alone is what it was.
  const code = readAscii(rom, PRODUCT_CODE_AT, 14)
  const letter = after.baseWeight === ORIGINAL_BASE_WEIGHT ? '0' : String.fromCharCode(64 + (after.baseWeight - 100) / 2)
  const baseKnown = !before.unknown.includes('baseWeight')
  const ratingsKnown = !before.unknown.includes('ratings')
  writeAscii(rom, PRODUCT_CODE_AT + 10, (ratingsKnown ? (after.wideRatings ? '-F' : ' -') : code.slice(10, 12)) + code[12] + (baseKnown ? letter : code[13]))
  const game = findGame(readAscii(rom, PRODUCT_CODE_AT, 14).trimEnd(), rom)
  if (!game) throw new HackError('The hacked ROM would not be one the editor can open.')

  const rescale = !ratingsKnown || before.choices.wideRatings === after.wideRatings ? null : after.wideRatings ? widenRating : narrowRating
  const reweigh = baseKnown && before.choices.baseWeight !== after.baseWeight
  if (!rescale && !reweigh) return { ...project, bytes: rom, game }

  const restate = (player: Player, isGoalie: boolean): Player => {
    const kinds = isGoalie ? NHL94.goalieAttributeKinds : NHL94.playerAttributeKinds
    const attributes = player.attributes.map((value, i) =>
      kinds[i] === 'rating' && rescale ? rescale(value) : kinds[i] === 'weight' && reweigh ? convertWeight(value, before.choices.baseWeight, after.baseWeight) : value,
    )
    return { ...player, attributes }
  }
  const restateTeam = (team: Team): Team => ({ ...team, players: team.players.map((player, i) => restate(player, i < goalieCount(team))) })
  const restateAgent = (agent: FreeAgent): FreeAgent => ({ ...agent, player: restate(agent.player, agent.role === 'G') })
  return {
    ...project,
    bytes: rom,
    game,
    teams: project.teams.map(restateTeam),
    freeAgents: project.freeAgents.map(restateAgent),
    baseline: project.baseline && { ...project.baseline, teams: project.baseline.teams.map(restateTeam), freeAgents: project.baseline.freeAgents.map(restateAgent) },
  }
}

// The project a ROM was opened as, brought to the hacks `project` now has,
// so that the two can be compared and one reset to the other.
export function withHacksOf(opened: RomProject, project: RomProject): RomProject {
  const [was, now] = [hackState(opened), hackState(project)]
  if (!was || !now) return opened
  if (sameHacks(was.choices, now.choices) && opened.game.productCode === project.game.productCode) return opened
  return applyHacks(opened, now.choices)
}

// ------------------------------------------------------------------ wording

export const HACK_TITLES: Record<keyof HackChoices, string> = {
  weightFix: "smozoma's weight bug fix (legacy)",
  bodychecks: 'Bodycheck statistics',
  secondAssist: 'Second-assist bug fix',
  plusMinus: 'Plus-minus statistic',
  wideRatings: 'Rating scale',
  bonuses: 'Hot and cold bonuses',
  threeStars: 'Three stars',
  baseWeight: 'Base weight',
  checkFix: 'Weight bug and C-then-B fix',
  aggressionFix: 'Aggression bug fix',
  ppPkFix: 'Power play and penalty kill fix',
  comebackFix: 'Comeback bonus fix',
  passFix: 'Rocket pass fix',
  faceoffFix: 'Faceoff spot fix',
  runawayFix: 'Runaway speed fix',
  penaltyShotTableFix: 'Penalty shot table fix',
  penaltyShotFixes: 'Penalty shot fixes',
  goaliePullFix: 'Computer goalie pull fix',
  blindRingFix: 'Close the five-hole blind ring',
  snipingFix: 'Pulled-goalie sniping fix',
  awarenessFix: "Computer forwards' awareness fix",
  crowdFix: 'Crowd bonus fix',
  goalieHold: 'Goalie hold time',
  goalieWidth: 'Goalie range to each side',
  goalieOut: 'Goalie range up the ice',
  goalieLine: 'Goalie whistle line',
  stamina: 'Unlimited stamina',
  energyDrain: 'Energy lost on the ice',
  energyRecovery: 'Energy gained on the bench',
  speedBurst: 'Speed burst',
  turnRate: 'Stopping and turning',
  realTime: 'Real-time clock',
}

// Which part's code each choice is kept in.
export const HACK_PARTS: Record<keyof HackChoices, HackPart> = {
  weightFix: 'weightFix',
  bodychecks: 'bodychecks',
  secondAssist: 'secondAssist',
  plusMinus: 'plusMinus',
  wideRatings: 'ratings',
  bonuses: 'ratings',
  threeStars: 'threeStars',
  baseWeight: 'baseWeight',
  checkFix: 'checkFix',
  aggressionFix: 'aggressionFix',
  ppPkFix: 'ppPkFix',
  comebackFix: 'comebackFix',
  passFix: 'passFix',
  faceoffFix: 'faceoffFix',
  runawayFix: 'runawayFix',
  penaltyShotTableFix: 'penaltyShotTableFix',
  penaltyShotFixes: 'penaltyShotFixes',
  goaliePullFix: 'goaliePullFix',
  blindRingFix: 'blindRingFix',
  snipingFix: 'snipingFix',
  awarenessFix: 'awarenessFix',
  crowdFix: 'crowdFix',
  goalieHold: 'goalieHold',
  goalieWidth: 'goalieBox',
  goalieOut: 'goalieBox',
  goalieLine: 'goalieLine',
  stamina: 'stamina',
  energyDrain: 'energyDrain',
  energyRecovery: 'energyRecovery',
  speedBurst: 'speedBurst',
  turnRate: 'turnRate',
  realTime: 'clock',
}

export const BONUS_TEXTS: Record<Bonuses, string> = {
  original: 'as the original game has them',
  disabled: 'no bonuses',
  hidden: 'bonuses not shown in Edit Lines',
  playersMatchLines: 'players match Edit Lines',
  linesMatchPlayers: 'Edit Lines matches players',
}
export const STAR_TEXTS: Record<ThreeStars, string> = {
  original: "the original game's",
  linesOff: 'improved, for line changes off',
  linesOn: 'improved, for line changes on',
}

// A goalie's hold time in seconds, to the hundredth.
export const holdSeconds = (frames: number) => Number((frames / 60).toFixed(2))

// A choice in words, as reports give it.
export function hackValueText<K extends keyof HackChoices>(key: K, choices: HackChoices): string {
  const value = choices[key]
  if (key === 'wideRatings') return value ? '0 to 15' : '0 to 6'
  if (key === 'bonuses') return BONUS_TEXTS[choices.bonuses]
  if (key === 'threeStars') return STAR_TEXTS[choices.threeStars]
  if (key === 'baseWeight') return `${choices.baseWeight} pounds`
  if (key === 'goalieHold') return choices.goalieHold === 0 ? 'no whistle' : `${holdSeconds(choices.goalieHold)} seconds`
  if (key === 'speedBurst' && choices.speedBurst === 0) return "the original game's"
  if (typeof value === 'number') return String(value)
  if (key === 'checkFix') return choices.checkFix === 'all120' ? 'everyone checks as the computer' : choices.checkFix === 'all240' ? 'everyone checks as a person' : 'off'
  if (value === 'simple') return 'the earlier, simpler fix'
  if (value === 'earlier') return 'an earlier version'
  return value === true || value === 'on' ? 'on' : 'off'
}

// What going from one set of choices to another changes, a line for each.
// Parts in `unknown` are left out, since they do not change.
export function hackChanges(before: HackChoices, after: HackChoices, unknown: HackPart[] = []): string[] {
  return (Object.keys(HACK_TITLES) as (keyof HackChoices)[])
    .filter((key) => before[key] !== after[key] && !unknown.includes(HACK_PARTS[key]))
    .map((key) => `${HACK_TITLES[key]}: ${hackValueText(key, before)} to ${hackValueText(key, after)}.`)
}

// How the hacks in one ROM differ from those in another.
export function hackDifferences(before: Uint8Array, after: Uint8Array): string[] {
  const [was, now] = [detectHacks(before), detectHacks(after)]
  return hackChanges(was.choices, now.choices, [...was.unknown, ...now.unknown])
}
