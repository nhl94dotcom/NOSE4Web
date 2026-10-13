// Changes to the game's own code: bug fixes, extra statistics, finer ratings.
//
// Everything here is the work of Michael Capewell (smozoma), ported from his
// hack program smozROM with his permission. The places changed, the code put
// there and the table of weights by year are his.
//
//   smozROM  Copyright 2010 Michael Capewell (smozoma)
//   https://github.com/nhl94dotcom/smozROM
//   Released under the GNU General Public License, version 3 or later.
//
// Each hack is looked for by the exact bytes it leaves, and a ROM whose code
// at a hack's places is neither the original game's nor the hack's is left
// alone there: the editor does not guess at code it does not know.

import { convertWeight } from './attributes'
import { readAscii, readU16, readU32, writeAscii, writeU16, writeU32 } from './bytes'
import { findGame, NHL94, type GameConfig } from './games'
import type { RomProject } from './rom'
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
}

// 'ratings' covers the rating scale and the bonuses, whose code is shared.
export type HackPart = 'weightFix' | 'bodychecks' | 'secondAssist' | 'plusMinus' | 'ratings' | 'threeStars' | 'baseWeight'

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
}

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
// The original game takes the checker's weight from the other player's, so
// that light players check well and heavy ones fall over. The fix turns that
// round and brings both players' checking ratings into it.

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
  }
  return { choices, unknown }
}

// A ROM with the wanted hacks, which may be larger than the one given. Parts
// whose code is not recognised are left exactly as they are. Like smozROM,
// it takes out every hack it knows and puts the wanted ones in afresh, in
// smozROM's order, so that the same choices always give the same ROM.
export function hackRom(rom: Uint8Array, wanted: HackChoices): Uint8Array {
  if (!validBase(wanted.baseWeight)) throw new HackError('A base weight has to be an even number from 102 to 152.')
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
  weightFix: 'Weight bug fix',
  bodychecks: 'Bodycheck statistics',
  secondAssist: 'Second-assist bug fix',
  plusMinus: 'Plus-minus statistic',
  wideRatings: 'Rating scale',
  bonuses: 'Hot and cold bonuses',
  threeStars: 'Three stars',
  baseWeight: 'Base weight',
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

// A choice in words, as reports give it.
export function hackValueText<K extends keyof HackChoices>(key: K, choices: HackChoices): string {
  const value = choices[key]
  if (key === 'wideRatings') return value ? '0 to 15' : '0 to 6'
  if (key === 'bonuses') return BONUS_TEXTS[choices.bonuses]
  if (key === 'threeStars') return STAR_TEXTS[choices.threeStars]
  if (key === 'baseWeight') return `${choices.baseWeight} pounds`
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
