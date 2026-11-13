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

import { penaltyTimeText } from './penaltytime'
import { convertWeight } from './attributes'
import { readAscii, readU16, readU32, writeAscii, writeU16, writeU32 } from './bytes'
import { fightState, withFight, withFightChoice, withoutFight, type FightChoice } from './fight'
import { bloodAdded, bloodChoice, bloodInNow, bloodTakenOut } from './genesisblood'
import { GENESIS_HACK_GROUPS } from './hackgroups'
import { findGame, NHL94, type GameConfig } from './games'
import type { RomProject } from './rom'
import { discordPost } from './discord'
import { genesisOptionLimits } from './menuteams'
import { claimSpace, fullRomReason } from './space'
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
  oneTimerAssist: boolean
  regainAssist: boolean
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
  // Aims a one-timer at an open net (the goalie out of the puck's line) at the
  // middle, mid-height, where the original aims it high and it often sails over.
  openNetFix: boolean
  // Lets a checker hit the same player again once he has got up, where the
  // original ignores the pair until some other pair's check lands.
  repeatCheckFix: boolean
  // chaos's fighting patch (fight.ts): not in the ROM, or in it with the main
  // menu's Fighting line starting at Off, On or On - Arcade Mode.
  fighting: FightChoice
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
  // A goalie's stick deflection counts as a shot on goal, as a catch or a body save does.
  stickShots: boolean
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
  // Skating on the ice costs no energy (line changes on); hits, holds and bursts still can.
  noSkatingDrain: boolean
  // The energy a C-button speed burst costs (line changes on); 0 for none.
  burstEnergy: number
  // The push the C button gives; 0 for the original game's, which is 32 for a fresh player and less for a tired one.
  speedBurst: number
  turnRate: number
  // The game, penalty and penalty shot clocks count true seconds.
  realTime: boolean
  // Whether a hit can injure, and for how long.
  injuries: Injuries
  // The range of each player's hot and cold values: from -n to n - 1.
  hotColdRange: number
  noIcing: boolean
  // Icing decided as the puck crosses the goal line, by who is nearer the end-zone dots.
  hybridIcing: boolean
  // Penalties called on the other team while one is pending (known bug 12).
  delayedCalls: boolean
  // Overtime 3 on 3 (LW, C, RD), with a skater more for a power play.
  threeOnThree: ThreeOnThree
  // B-checks with penalties off: 'asPenaltiesOn' plays them as with penalties
  // on; 'forum' is the forum's version, which changes the computer's with them on.
  bCheckPenaltiesOff: BCheckPenaltiesOff
  // How long B is held before a person takes the goalie, in counts of the game's timer: 17 in the original game.
  goalieDelay: number
  // Edit Lines and Team Rosters fitted to the skaters' positions a ROM that
  // puts fewer skaters on the ice uses: 0 for the original game's five, else
  // first position x 10 + how many (1 LD, 2 RD, 3 LW, 4 C, 5 RW), so 32 is LW and C.
  fewerSkaterLines: number
  // The wait on each of the two intro screens, in counts of 4 frames less one: 80 in the original game.
  introWait: number
  // Offer the menu's fourth period length, and the regular season's overtime on it in seconds: 0 is the original game (three lengths).
  fourthPeriodOvertime: number
  // How a regular-season game tied after overtime ends: as a tie, as the
  // original game has it, or with more overtime until a goal.
  seasonTies: SeasonTies
  // Edit Lines lists every skater for every position, and saves such lines.
  anyPosition: boolean
  // Energy a skater loses when knocked down, and when a hold or hook catches him (0 to $1000 is empty to full): 0 is the original game.
  hitEnergy: number
  holdEnergy: number
  // Impact added to an eligible hit's injury roll for each knockdown the skater has taken (0 is the original game), and the most it adds.
  injuryBonus: number
  injuryCap: number
  // How fast the puck slows on the ice: it loses 1 / 2^n of its speed a frame, 9 in the original game.
  puckFriction: number
  // Seconds in the penalty box for each penalty minute (60 in the original).
  penaltySeconds: number
  // Which of the game's colour sets the puck is drawn in.
  puckColours: PuckColours
  // The colours both nets are drawn in, from the same choices.
  netColours: PuckColours
  // The fan in green in the stands, with his arm and leg back.
  greenFan: boolean
  // NOSE4Web's head bleeding for players hurt for the game (genesisblood.ts).
  headBleeding: boolean
}

export type PuckColours = 'rink' | 'crowd' | 'home' | 'away'
export type SeasonTies = 'tie' | 'overtime' | 'shootout' | 'shootoutNow'

export type BCheckPenaltiesOff = 'original' | 'asPenaltiesOn' | 'forum'
export type Injuries = 'original' | 'never' | 'penaltyOnly' | 'period' | 'game' | 'longFall'

// 'ratings' covers the rating scale and the bonuses, whose code is shared.
// 'goalieBox' covers both ways a goalie without the puck may roam.
export type HackPart =
  | 'weightFix'
  | 'bodychecks'
  | 'secondAssist'
  | 'oneTimerAssist'
  | 'regainAssist'
  | 'plusMinus'
  | 'ratings'
  | 'threeStars'
  | 'baseWeight'
  | 'checkFix'
  | 'aggressionFix'
  | 'ppPkFix'
  | 'comebackFix'
  | 'passFix'
  | 'openNetFix'
  | 'repeatCheckFix'
  | 'fighting'
  | 'faceoffFix'
  | 'runawayFix'
  | 'penaltyShotTableFix'
  | 'penaltyShotFixes'
  | 'goaliePullFix'
  | 'blindRingFix'
  | 'snipingFix'
  | 'awarenessFix'
  | 'crowdFix'
  | 'stickShots'
  | 'goalieHold'
  | 'goalieBox'
  | 'goalieLine'
  | 'stamina'
  | 'energyDrain'
  | 'energyRecovery'
  | 'noSkatingDrain'
  | 'burstEnergy'
  | 'speedBurst'
  | 'turnRate'
  | 'clock'
  | 'injuries'
  | 'hotColdRange'
  | 'noIcing'
  | 'hybridIcing'
  | 'delayedCalls'
  | 'threeOnThree'
  | 'bCheckPenaltiesOff'
  | 'goalieDelay'
  | 'fewerSkaterLines'
  | 'introWait'
  | 'fourthPeriodOvertime'
  | 'seasonTies'
  | 'anyPosition'
  | 'hitEnergy'
  | 'holdEnergy'
  | 'injuryBonus'
  | 'injuryCap'
  | 'puckFriction'
  | 'penaltySeconds'
  | 'puckColours'
  | 'netColours'
  | 'greenFan'
  | 'headBleeding'

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
  oneTimerAssist: false,
  regainAssist: false,
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
  openNetFix: false,
  repeatCheckFix: false,
  fighting: 'none',
  faceoffFix: false,
  runawayFix: false,
  penaltyShotTableFix: false,
  penaltyShotFixes: false,
  goaliePullFix: false,
  blindRingFix: false,
  snipingFix: false,
  awarenessFix: false,
  crowdFix: false,
  stickShots: false,
  goalieHold: 140,
  goalieWidth: 36,
  goalieOut: 231,
  goalieLine: 170,
  stamina: false,
  energyDrain: 33,
  energyRecovery: 9,
  noSkatingDrain: false,
  burstEnergy: 204,
  speedBurst: 0,
  turnRate: 150,
  realTime: false,
  injuries: 'original',
  hotColdRange: 9,
  noIcing: false,
  hybridIcing: false,
  delayedCalls: false,
  threeOnThree: 'off',
  bCheckPenaltiesOff: 'original',
  goalieDelay: 17,
  fewerSkaterLines: 0,
  introWait: 80,
  fourthPeriodOvertime: 0,
  seasonTies: 'tie',
  anyPosition: false,
  hitEnergy: 0,
  holdEnergy: 0,
  injuryBonus: 0,
  injuryCap: 10,
  puckFriction: 9,
  penaltySeconds: 60,
  puckColours: 'rink',
  netColours: 'rink',
  greenFan: false,
  headBleeding: false,
}

// The least and most each number can be.
export const HACK_RANGES = {
  goalieHold: [0, 3600],
  goalieWidth: [0, 124],
  goalieOut: [0, 255],
  goalieLine: [0, 255],
  // Below 16, a player's endurance bonus (half his endurance, up to 15, while his energy is at least $C00)
  // can outweigh the loss: his energy climbs past full until a fast skater's speed wraps round to the slowest
  // (Match Viewer, in the game: $1000 to $12BE in 2 minutes at 0). Skating that costs nothing is noSkatingDrain.
  energyDrain: [16, 999],
  energyRecovery: [0, 999],
  burstEnergy: [0, 4096],
  speedBurst: [0, 95],
  turnRate: [1, 999],
  hotColdRange: [0, 9],
  goalieDelay: [1, 128],
  introWait: [0, 600],
  fourthPeriodOvertime: [0, 5999],
  hitEnergy: [0, 4096],
  holdEnergy: [0, 4096],
  injuryBonus: [0, 10],
  injuryCap: [1, 60],
  puckFriction: [1, 12],
  penaltySeconds: [1, 255],
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
  if (!claimed) throw new HackError(`There is no room left in this ROM for the code this needs.${fullRomReason(work.rom)}`)
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

// Where the one-timer assist fix has taken over the second place, the fix's
// own check is in the one-timer fix's code instead (oneTimerAssist below).
const secondAssist: Part<boolean> = {
  detect(rom) {
    const oneTimer = oneTimerCode(rom)
    if (oneTimer) {
      if (is(rom, ASSIST_HOOKS[0].at, ASSIST_HOOKS[0].original)) return oneTimer.assist ? undefined : false
      return hooked(rom, ASSIST_HOOKS[0], ASSIST_CODE) !== null && oneTimer.assist ? true : undefined
    }
    if (ASSIST_HOOKS.every((hook) => is(rom, hook.at, hook.original))) return false
    const targets = ASSIST_HOOKS.map((hook) => hooked(rom, hook, ASSIST_CODE))
    return targets[0] !== null && targets[0] === targets[1] ? true : undefined
  },
  remove(rom) {
    const target = hooked(rom, ASSIST_HOOKS[0], ASSIST_CODE)
    if (target === null) return
    const second = hooked(rom, ASSIST_HOOKS[1], ASSIST_CODE) === target
    erase(rom, target, ASSIST_CODE.length)
    rom.set(ASSIST_HOOKS[0].original, ASSIST_HOOKS[0].at)
    if (second) rom.set(ASSIST_HOOKS[1].original, ASSIST_HOOKS[1].at)
  },
  apply(work, value) {
    if (!value) return
    const target = place(work, ASSIST_CODE)
    for (const hook of ASSIST_HOOKS) writeHook(work.rom, hook, target)
  },
}

// ------------------------------------------------------ one-timer assist fix
// Found by the NHL94 Match Viewer project. a2touchpuck adds a player to the
// last-touch list with three checks: not if he is the last touch already;
// tmflast, which replaces the last touch rather than moving the list down;
// and clearing a second assist who is the new last touch. onetimershot puts
// the shooter on the list with three plain moves at $F6CE4 instead, so when
// the receiver's stick touched the pass without catching it before the
// one-timer, the list reads shooter, shooter, passer and the goal has no
// assist (3 of 71 one-timer goals in recorded games). The fix calls
// a2touchpuck's own list update there (42 bytes, Match Viewer's). With the
// second-assist fix on, that fix's check goes in its code too (48 bytes),
// since this takes over the place the second-assist fix also calls from.

const ONE_TIMER_HOOK: Hook = { at: 0xf6ce4, original: bytes('3168 001A 001C 3168 0018 001A 3140 0018') }

// a2touchpuck's list update as a routine of its own, with d0 the toucher and
// a0 his team: not if he is the last toucher already; else with the overwrite
// flag (tmflast) set he replaces the last toucher, and otherwise the list
// moves down; and a second assist who is the new last toucher is cleared.
// `assist`: with the second-assist fix's check. Without it, Match Viewer's
// one-timer routine, byte for byte.
function listUpdate(assist: boolean): Uint8Array {
  const check = assist ? 'B068 001A 6706' : ''
  const extra = assist ? 6 : 0
  const set = 26 + extra
  const end = 40 + extra
  const disp = (target: number, from: number) => (target - from).toString(16).padStart(2, '0')
  return bytes(
    `B068 0018 67${disp(end, 6)} 08A8 0003 0030 66${disp(set, 14)} ${check} 3168 001A 001C 3168 0018 001A ` +
      '3140 0018 B068 001C 6604 50E8 001C 4E75',
  )
}
const LIST_UPDATES = [false, true].map((assist) => ({ assist, code: listUpdate(assist) }))

// The one-timer fix's code in this ROM, if it has it, where, and which version.
function oneTimerCode(rom: Uint8Array): { code: Uint8Array; target: number; assist: boolean } | null {
  for (const version of LIST_UPDATES) {
    const target = hooked(rom, ONE_TIMER_HOOK, version.code)
    if (target !== null) return { ...version, target }
  }
  return null
}

const ONE_TIMER_REST = ONE_TIMER_HOOK.original.subarray(6)

const oneTimerAssist = {
  detect(rom: Uint8Array): boolean | undefined {
    if (oneTimerCode(rom)) return true
    // The place as the original game has it, or with the second-assist fix's call in its first six bytes.
    if (!is(rom, ONE_TIMER_HOOK.at + 6, ONE_TIMER_REST)) return undefined
    return is(rom, ONE_TIMER_HOOK.at, ONE_TIMER_HOOK.original) || hooked(rom, ASSIST_HOOKS[1], ASSIST_CODE) !== null ? false : undefined
  },
  remove(rom: Uint8Array) {
    const found = oneTimerCode(rom)
    if (!found) return
    erase(rom, found.target, found.code.length)
    rom.set(ONE_TIMER_HOOK.original, ONE_TIMER_HOOK.at)
  },
  // After the second-assist fix, whose call at the same place this replaces.
  apply(work: Work, value: boolean, secondAssistOn: boolean) {
    if (!value) return
    hook(work, ONE_TIMER_HOOK, listUpdate(secondAssistOn))
  },
}

// --------------------------------------------- regained-puck assist fix
// Match Viewer: 8 of 274 recorded goals. puckglue sets tmflast when the
// other team takes the puck, and a2touchpuck's "same player as tmtouch1"
// exit (beq.w .same at $1017A) skips the bclr that clears it, so a player
// who wins the puck back himself keeps it set, and the teammate he passes to
// replaces him as the last toucher: his assist is lost. Match Viewer's fix,
// tested in the game: the 8 bytes of cmp.w tmtouch1(a0),d0 / beq.w .same at
// $10176 become jsr / nop to 20 bytes that make the same compare; for the
// same player they clear the flag and go on to .same ($101A4, by changing
// the return address), and otherwise return to the original bclr and list
// update, the second-assist fix's call in it included.
const REGAIN_HOOK: Hook = { at: 0x10176, original: bytes('B068 0018 6700 0028') }
const REGAIN_CODE = bytes('B068 0018 660C 08A8 0003 0030 2EBC 0001 01A4 4E75')

const regainAssist: Part<boolean> = {
  detect(rom) {
    if (is(rom, REGAIN_HOOK.at, REGAIN_HOOK.original)) return false
    return hooked(rom, REGAIN_HOOK, REGAIN_CODE) !== null ? true : undefined
  },
  remove(rom) {
    const target = hooked(rom, REGAIN_HOOK, REGAIN_CODE)
    if (target === null) return
    erase(rom, target, REGAIN_CODE.length)
    rom.set(REGAIN_HOOK.original, REGAIN_HOOK.at)
  },
  apply(work, value) {
    if (value) hook(work, REGAIN_HOOK, REGAIN_CODE)
  },
}

// ------------------------------------------------ fourth period length's overtime
// McMarkis's "5 Minutes, 99 Min OT" (NHL94-Gens-Patches, 99MinOT_Menu), made
// general. The menu offers three of the game's four period lengths; this
// offers the fourth too (its count in both OptionLimits tables, 3 to 4), and
// gives a regular-season game on it its own overtime. ResetClock has, at
// $7822, tst.w OptPlayMode / bne.w .0 (playoffs: overtime as long as a
// period) / move.w #600,d0 (the regular season's 10:00, the Clock's
// overtime). Those first 8 bytes become jsr / nop to 24 bytes that make the
// same test; in the regular season on the fourth length they load the
// overtime and skip the move, in the playoffs they skip it, and otherwise
// they return to it. So the Clock's overtime stays where it is, and playoffs
// are as in the original game (McMarkis's patch gives them 10:00 or 99:00).
// The fourth length and its menu text are set with the others (Game
// settings); the original's is 30 seconds.
const OT4_HOOK: Hook = { at: 0x7822, original: bytes('4A78 D048 6600 0006') }
// tst.w OptPlayMode.w; bne.s skip; cmpi.w #3,Optperlen.w; bne.s back;
// move.w #n,d0; skip: addq.l #6,(sp); rts; back: rts.
const ot4Code = (seconds: number) => bytes(`4A78 D048 660C 0C78 0003 D050 6608 303C ${seconds.toString(16).padStart(4, '0')} 5C97 4E75 4E75`)
const OT4_VALUE_AT = 16
const OT4_LINE = 4
const OT4_LENGTHS = { original: 3, hacked: 4 }
// After the code (never run): 'N4' and the count the menu had before, as league ROMs (CDL, RGDL) already offer the
// fourth length; taking the hack out gives that back. ROMs made before it have none, and get 3 back.
const OT4_TAG = 0x4e34
const ot4Before = (rom: Uint8Array, target: number) => (target + 28 <= rom.length && readU16(rom, target + 24) === OT4_TAG ? readU16(rom, target + 26) : OT4_LENGTHS.original)

function ot4Target(rom: Uint8Array): number | null {
  if (readU16(rom, OT4_HOOK.at) !== OP_JSR || readU16(rom, OT4_HOOK.at + 6) !== OP_NOP) return null
  const target = readU32(rom, OT4_HOOK.at + 2)
  if (target + 24 > rom.length) return null
  return is(rom, target, ot4Code(readU16(rom, target + OT4_VALUE_AT))) ? target : null
}

const setPeriodChoices = (rom: Uint8Array, count: number) => {
  for (const table of genesisOptionLimits(rom)) writeU16(rom, table + OT4_LINE * 2, count)
}

const fourthPeriodOvertime: Part<number> = {
  detect(rom) {
    if (is(rom, OT4_HOOK.at, OT4_HOOK.original)) return 0
    const target = ot4Target(rom)
    return target === null ? undefined : readU16(rom, target + OT4_VALUE_AT)
  },
  remove(rom) {
    const target = ot4Target(rom)
    if (target === null) return
    const before = ot4Before(rom, target)
    erase(rom, target, readU16(rom, target + 24) === OT4_TAG ? 28 : 24)
    rom.set(OT4_HOOK.original, OT4_HOOK.at)
    setPeriodChoices(rom, before)
  },
  apply(work, value) {
    if (value <= 0) return
    const tables = genesisOptionLimits(work.rom)
    if (tables.length === 0) throw new HackError("The main menu's table of choices is not where the original game has it.")
    const before = readU16(work.rom, tables[0] + OT4_LINE * 2)
    hook(work, OT4_HOOK, Uint8Array.from([...ot4Code(value), OT4_TAG >> 8, OT4_TAG & 0xff, before >> 8, before & 0xff]))
    setPeriodChoices(work.rom, OT4_LENGTHS.hacked)
  },
}

// ------------------------------------------- tied regular-season games
// PeriodOver (setup94.asm): when overtime ends, gsp goes back to 3; a playoff
// game (OptPlayMode not 0) branches to the tie test, which plays another
// overtime while the score is tied; a regular-season game first sets gsp to
// 4, game over, so it ends tied. Match Viewer's GENESIS STUDY_NOTES: without
// that move.w #4,(gsp).w at $1725C (6 bytes, made NOPs) the regular season
// plays on as the playoffs do, each overtime as long as the Clock's (10:00, or
// the fourth period length's where that option is on), until a goal.
// The end of a period decides game over a second time: hockey94's .eop, at
// the end of an overtime (gsp 3), sends a regular-season game (OptPlayMode 0)
// to .eog with the beq.s at $7C4C, which marks the game over and calls the
// Stars of the Game. With only the first change the next overtime starts with
// the game already over and never resumes (Match Viewer), so that beq.s goes
// too. A ROM made with only the first (as the editor first did) is read as
// overtime, and given the second when its hacks are next applied.
const TIES_AT = 0x1725c
const TIES = { original: bytes('31FC 0004 C466'), overtime: bytes('4E71 4E71 4E71') }
// What comes before it: move.w #3,(gsp).w; tst.w (OptPlayMode).w; bne.w .1.
const TIES_BEFORE = bytes('31FC 0003 C466 4A78 D048 6600 0008')
const EOP_AT = 0x7c4c
const EOP = { original: bytes('67C8'), overtime: bytes('4E71') }
// What comes before it: cmpi.w #3,(gsp).w; bne.w; tst.w (OptPlayMode).w.
const EOP_BEFORE = bytes('0C78 0003 C466 6600 0008 4A78 D048')

// Or a shootout, as the game's own Shootout mode plays one. With .eop's
// branch gone as above, PeriodOver's move.w #4,(gsp).w becomes a call: in a
// tied game it turns the shootout on as SetupStart does for Shootout mode
// (gmode2 bit 0, ClearShootout, both teams' Create_HotCold_Table) and marks
// it the editor's ($FFF082, free RAM on every league ROM, Match Viewer);
// gsp stays 3, so the tie test sends the game on to the intermission and
// StartPer, which plays it as a shootout. Not tied, gsp still becomes 4 at
// that test. A shootout already on is left as it is. Two things Match Viewer
// found in the game: the overtime's ends are kept unless gmode's gmdir (bit
// 1) is cleared, and Goal's shootout test then throws out every goal; and a
// shootout goal also goes through Goal's ordinary path, into the score, the
// scorer's and goalie's stats, the goals by period and the scoring summary.
// So both team structs (all of those are in them, $364 bytes each), the
// scoring summary's length and the plus-minus log's length word ($FFDEF4,
// which the plus-minus hack's log starts with) are kept from $FFF084, to be
// put back at the end.
//   move.w (HmGoals).w,d0; cmp.w (AwGoals).w,d0; bne.s .x
//   btst #0,(gmode2).w; bne.s .x; bset #0,(gmode2).w; st ($F082).w
//   movem.l d0-d7/a0-a6,-(sp)
//   lea (tmstruct).w,a0; lea ($F084).w,a1; move.w #$1B1,d0; .l move.l (a0)+,(a1)+; dbf d0,.l
//   move.w (ScoreSumbytes).w,(a1); move.w ($DEF4).w,($F74E).w; bclr #1,(gmode).w; jsr ClearShootout
//   lea (tmstruct).w,a0; jsr Create_HotCold_Table; lea (awtmstruct).w,a0; jsr Create_HotCold_Table
//   movem.l (sp)+,d0-d7/a0-a6; .x rts
const SHOOTOUT_START = bytes(
  '3038 C6DA B078 CA3E 6656 0838 0000 C2FA 664E 08F8 0000 C2FA 50F8 F082 48E7 FFFE 41F8 C6CE 43F8 F084 303C 01B1 22D8 51C8 FFFC 32B8 C472 31F8 DEF4 F74E 08B8 0001 C2EA 4EB9 000F C47C 41F8 C6CE 4EB9 000F 70A2 41F8 CA32 4EB9 000F 70A2 4CDF 7FFF 4E75',
)
// When the shootout is won, NextShooter jumps to ExitToOpening, back to the
// title as Shootout mode does. For the editor's shootout that jump becomes a
// call to the code below. Its shootout is told from Shootout mode's by the
// mark and by gsp: 3 for it, 0 in Shootout mode, so that a mark left set (by a
// reset during a shootout; nothing clears that RAM) never changes Shootout
// mode. Then: the team structs, scoring summary and plus-minus log as they
// were before the shootout, the winners' score one more, the shootout's gmode2 bits (0, 1
// and 3; a byte, as the game's btst and bset use it) cleared, gsp 4, and on
// to the end of the game as PeriodOver goes there (forceblack, PeriodOver_sp:
// the scores, the intermission, GameOver).
//   addq.l #4,sp; tst.b ($F082).w; beq.s .title; cmpi.w #3,(gsp).w; beq.s .ours; .title jmp ExitToOpening
//   .ours sf ($F082).w; lea ($F084).w,a0; lea (tmstruct).w,a1; move.w #$1B1,d0; .l move.l (a0)+,(a1)+; dbf d0,.l
//   move.w (a0),(ScoreSumbytes).w; move.w ($F74E).w,($DEF4).w
//   move.w (homeshootgoals).w,d0; cmp.w (awayshootgoals).w,d0; bgt.s .home
//   addq.w #1,(AwGoals).w; bra.s .done; .home addq.w #1,(HmGoals).w
//   .done andi.b #$F4,(gmode2).w; move.w #4,(gsp).w; jsr forceblack; jmp PeriodOver_sp
const SHOOTOUT_END_HOOK: Hook = { at: 0xfc4ca, original: bytes('4EF9 0001 72E4') }
const SHOOTOUT_END_BEFORE = bytes('0838 0003 C2FA 6700 0008')
const SHOOTOUT_END = bytes(
  '588F 4A38 F082 6708 0C78 0003 C466 6706 4EF9 0001 72E4 51F8 F082 41F8 F084 43F8 C6CE 303C 01B1 22D8 51C8 FFFC 31D0 C472 31F8 F74E DEF4 3038 D574 B078 D576 6E06 5278 CA3E 6004 5278 C6DA 0238 00F4 C2FA 31FC 0004 C466 4EB9 0001 0F32 4EF9 0001 7278',
)
const SHOOTOUT_START_HOOK: Hook = { at: TIES_AT, original: TIES.original }

// Or the shootout straight after period 3, with no overtime. PeriodOver's tie
// test (.1: move.w (HmGoals).w,d0; sub.w (AwGoals).w,d0, then beq to play on)
// runs after every period; it becomes a call to code that, in the regular
// season (OptPlayMode 0) with period 3 just over (gsp 3), first runs the
// shootout's start code above, then does the same test, so the beq that
// follows sees its result. The start code itself checks the score is tied.
// Overtime then never comes, so .eop and the move after overtime stay as
// they are; the end code is the same.
//   tst.w (OptPlayMode).w; bne.s .t; cmpi.w #3,(gsp).w; bne.s .t; jsr start
//   .t move.w (HmGoals).w,d0; sub.w (AwGoals).w,d0; rts
const TIE_TEST_HOOK: Hook = { at: 0x17262, original: bytes('3038 C6DA 9078 CA3E') }
const hex8 = (value: number) => value.toString(16).padStart(8, '0')
const nowCode = (start: number) =>
  bytes(`4A78 D048 660E 0C78 0003 C466 6606 4EB9 ${hex8(start)} 3038 C6DA 9078 CA3E 4E75`)
const NOW_JSR_AT = 16
const NOW_LENGTH = 30
// Where the tie test calls code for the shootout after period 3, and where that code's start code is.
function nowHooked(rom: Uint8Array): { at: number; start: number } | null {
  if (readU16(rom, TIE_TEST_HOOK.at) !== OP_JSR || readU16(rom, TIE_TEST_HOOK.at + 6) !== OP_NOP) return null
  const at = readU32(rom, TIE_TEST_HOOK.at + 2)
  if (at + NOW_LENGTH > rom.length) return null
  const start = readU32(rom, at + NOW_JSR_AT)
  if (!is(rom, at, nowCode(start)) || !is(rom, start, SHOOTOUT_START)) return null
  return { at, start }
}

const seasonTies: Part<SeasonTies> = {
  detect(rom) {
    if (!is(rom, TIES_AT - TIES_BEFORE.length, TIES_BEFORE) || !is(rom, EOP_AT - EOP_BEFORE.length, EOP_BEFORE)) return undefined
    if (!is(rom, SHOOTOUT_END_HOOK.at - SHOOTOUT_END_BEFORE.length, SHOOTOUT_END_BEFORE)) return undefined
    const eop = is(rom, EOP_AT, EOP.original) ? 'tie' : is(rom, EOP_AT, EOP.overtime) ? 'overtime' : undefined
    const endOriginal = is(rom, SHOOTOUT_END_HOOK.at, SHOOTOUT_END_HOOK.original)
    const now = nowHooked(rom)
    if (now !== null) {
      return hooked(rom, SHOOTOUT_END_HOOK, SHOOTOUT_END) !== null && eop === 'tie' && is(rom, TIES_AT, TIES.original) ? 'shootoutNow' : undefined
    }
    if (!is(rom, TIE_TEST_HOOK.at, TIE_TEST_HOOK.original)) return undefined
    if (hooked(rom, SHOOTOUT_START_HOOK, SHOOTOUT_START) !== null && hooked(rom, SHOOTOUT_END_HOOK, SHOOTOUT_END) !== null) {
      return eop === 'overtime' ? 'shootout' : undefined
    }
    if (!endOriginal) return undefined
    if (is(rom, TIES_AT, TIES.original)) return eop === 'tie' ? 'tie' : undefined
    return is(rom, TIES_AT, TIES.overtime) && eop ? 'overtime' : undefined
  },
  remove(rom) {
    const now = nowHooked(rom)
    if (now !== null) {
      erase(rom, now.at, NOW_LENGTH)
      erase(rom, now.start, SHOOTOUT_START.length)
      rom.set(TIE_TEST_HOOK.original, TIE_TEST_HOOK.at)
    }
    const start = hooked(rom, SHOOTOUT_START_HOOK, SHOOTOUT_START)
    if (start !== null) erase(rom, start, SHOOTOUT_START.length)
    const end = hooked(rom, SHOOTOUT_END_HOOK, SHOOTOUT_END)
    if (end !== null) {
      erase(rom, end, SHOOTOUT_END.length)
      rom.set(SHOOTOUT_END_HOOK.original, SHOOTOUT_END_HOOK.at)
    }
    if (start !== null || is(rom, TIES_AT, TIES.overtime)) rom.set(TIES.original, TIES_AT)
    if (is(rom, EOP_AT, EOP.overtime)) rom.set(EOP.original, EOP_AT)
  },
  apply(work, value) {
    if (value === 'tie') return
    if (value === 'shootoutNow') {
      const start = place(work, SHOOTOUT_START)
      hook(work, TIE_TEST_HOOK, nowCode(start))
      hook(work, SHOOTOUT_END_HOOK, SHOOTOUT_END)
      return
    }
    work.rom.set(EOP.overtime, EOP_AT)
    if (value === 'overtime') {
      work.rom.set(TIES.overtime, TIES_AT)
      return
    }
    hook(work, SHOOTOUT_START_HOOK, SHOOTOUT_START)
    hook(work, SHOOTOUT_END_HOOK, SHOOTOUT_END)
  },
}

// ------------------------------------------------------- energy lost to hits
// A community idea, read from the code by Match Viewer: a skater knocked
// down loses energy, and one caught by a hold or hook loses some too, with
// line changes On only (OptLine 0 and not Auto's full-energy flag, sflags7
// bit 4), as the game's own drain. Energy runs from 0 to $1000; a burst
// costs $CC. FallDown's .cont2 ($14116, a real fall, past the stumble test,
// each pair once) has tst.w position(a3) / beq.w .chkpos: those 8 bytes
// become jsr / nop to code that, for a skater (position(a2) not 0) knocked
// down by a player (SCnum(a3) 11 or less: not the puck), takes the amount
// off with getpde and setpde, registers kept, then makes the same test and
// returns to .chkpos ($14150) for a goalie hitter. holdcheck's move.w
// #SPAflail,d1 / bsr.w SetSPA ($13F5C), the moment a hold catches a3 (once
// a hold: a3 is then locked), becomes jsr / nop to code that takes its
// amount off a3, then sets the flail and goes on to SetSPA.
type Asm = (string | { label: string } | { branch: number; to: string })[]
// Machine code from hex and short branches (forward or back) to labels in it.
function assemble(parts: Asm): Uint8Array {
  const sizes = parts.map((part) => (typeof part === 'string' ? bytes(part).length : 'label' in part ? 0 : 2))
  const labels: Record<string, number> = {}
  let at = 0
  parts.forEach((part, i) => {
    if (typeof part !== 'string' && 'label' in part) labels[part.label] = at
    at += sizes[i]
  })
  const out = new Uint8Array(at)
  at = 0
  parts.forEach((part, i) => {
    if (typeof part === 'string') out.set(bytes(part), at)
    else if ('branch' in part) {
      const distance = labels[part.to] - (at + 2)
      if (distance === 0 || distance < -128 || distance > 127) throw new Error(`A short branch to ${part.to} cannot reach it.`)
      out.set([part.branch, distance & 0xff], at)
    }
    at += sizes[i]
  })
  return out
}
const BEQ = 0x67
const BNE = 0x66
const BGT = 0x6e
const BCC = 0x64
const BLS = 0x63

const HIT_HOOK: Hook = { at: 0x14116, original: bytes('4A6B 0034 6700 0034') }
const hex4 = (value: number) => value.toString(16).padStart(4, '0')
// Nothing is taken after the whistle: btst #0,gmode ($C2EA), set while the clock is stopped, as the injury roll tests it.
const CLOCK_STOPPED = '0838 0000 C2EA'
const hitCode = (amount: number) =>
  assemble([
    CLOCK_STOPPED,
    { branch: BNE, to: 'done' },
    '4A78 D058',
    { branch: BNE, to: 'done' },
    '0838 0004 C2FC',
    { branch: BNE, to: 'done' },
    '4A6A 0034',
    { branch: BEQ, to: 'done' },
    '0C6B 000B 0052',
    { branch: BGT, to: 'done' },
    `48E7 E0F0 264A 4EB9 0001 575A 0440 ${hex4(amount)} 4EB9 0001 577A 4CDF 0F07`,
    { label: 'done' },
    '4A6B 0034',
    { branch: BNE, to: 'return' },
    '2EBC 0001 4150',
    { label: 'return' },
    '4E75',
  ])
const valueAt = (code: (value: number) => Uint8Array) => code(0x1234).findIndex((byte, i, all) => byte === 0x12 && all[i + 1] === 0x34)
const HIT_VALUE_AT = valueAt(hitCode)
// NOSE4Web's first version (3180527, played by Match Viewer), which took energy after the whistle too:
// recognised, and replaced whenever the hacks are put in again.
const firstHitCode = (amount: number) =>
  bytes(
    `4A78 D058 6630 0838 0004 C2FC 6628 4A6A 0034 6722 0C6B 000B 0052 6E1A 48E7 E0F0 264A 4EB9 0001 575A 0440 ${hex4(amount)} 4EB9 0001 577A 4CDF 0F07 4A6B 0034 6606 2EBC 0001 4150 4E75`,
  )
const FIRST_HIT_VALUE_AT = 42
const HOLD_HOOK: Hook = { at: 0x13f5c, original: bytes('323C 0CF4 6100 C7D8') }
const holdCode = (amount: number) =>
  assemble([
    CLOCK_STOPPED,
    { branch: BNE, to: 'flail' },
    '4A78 D058',
    { branch: BNE, to: 'flail' },
    '0838 0004 C2FC',
    { branch: BNE, to: 'flail' },
    `48E7 E0F0 4EB9 0001 575A 0440 ${hex4(amount)} 4EB9 0001 577A 4CDF 0F07`,
    { label: 'flail' },
    '323C 0CF4 4EF9 0001 073A',
  ])
const HOLD_VALUE_AT = valueAt(holdCode)
const firstHoldCode = (amount: number) =>
  bytes(`4A78 D058 6620 0838 0004 C2FC 6618 48E7 E0F0 4EB9 0001 575A 0440 ${hex4(amount)} 4EB9 0001 577A 4CDF 0F07 323C 0CF4 4EF9 0001 073A`)
const FIRST_HOLD_VALUE_AT = 26
// The recommended amounts: a burst's cost for a knockdown (5% of full, about 25 game seconds of skating
// on the Genesis), half that for a hold. Match Viewer measured half as much as too small to notice (under
// 4% more tiring in a game); up to a quarter of full energy for a league that wants hits to wear players down.
export const RECOMMENDED_HIT_ENERGY = 204
// Energy lost only to hits, as a league asked: skating and bursts cost nothing, a knockdown a third of
// full energy (three empty a skater), a hold half that. Match Viewer measured an average skater's top
// speed at 2/3, 1/3 and no energy as 13%, 26% and 35% below full.
export const HITS_ONLY = { noSkatingDrain: true, burstEnergy: 0, hitEnergy: 1365, holdEnergy: 683 } as const
export const RECOMMENDED_HOLD_ENERGY = 102
export const FULL_ENERGY = 0x1000

// A part whose hook calls code holding one amount: this version's code first, then earlier ones it recognises.
type AmountCode = [code: (amount: number) => Uint8Array, valueAt: number]
function amountPart(at: Hook, versions: AmountCode[]): Part<number> {
  const [code] = versions[0]
  const target = (rom: Uint8Array): { to: number; value: number; length: number } | null => {
    if (readU16(rom, at.at) !== OP_JSR || readU16(rom, at.at + 6) !== OP_NOP) return null
    const to = readU32(rom, at.at + 2)
    for (const [version, valueAt] of versions) {
      const length = version(0).length
      if (to + length > rom.length) continue
      const value = readU16(rom, to + valueAt)
      if (is(rom, to, version(value))) return { to, value, length }
    }
    return null
  }
  return {
    detect(rom) {
      if (is(rom, at.at, at.original)) return 0
      return target(rom)?.value
    },
    remove(rom) {
      const found = target(rom)
      if (found === null) return
      erase(rom, found.to, found.length)
      rom.set(at.original, at.at)
    },
    apply(work, value) {
      if (value > 0) hook(work, at, code(value))
    },
  }
}
const holdEnergy = amountPart(HOLD_HOOK, [
  [holdCode, HOLD_VALUE_AT],
  [firstHoldCode, FIRST_HOLD_VALUE_AT],
])

// ------------------------------------------------ injury risk from knockdowns
// The other half of the community idea, from Match Viewer's reading: each
// knockdown a skater takes raises his chance of being injured by a later
// hit, a little, up to a cap, and the count halves at every intermission.
// An injury can only come from the few hits the original game already lets
// injure (a carrier falling back while facing straight up or down the ice),
// where FallDown rolls 0 to 159 against the hit's impact ($14428: move.l
// #$A0,d0 / bsr randomd0 / cmp.w impact(a2),d0 / bgt.w .22): the bonus is
// added to the impact there, so the chance rises by about bonus / 160.
// - The counts: a byte a player, 32 a team, at $FFF000 (free in every
//   recorded game, below the stack and above the plus-minus log at $FFDEF4).
// - Counting: the knockdown hook at .cont2 also adds 1 for the skater
//   knocked down (to at most 255), whatever the line changes.
// - The roll: its 8 bytes become jsr / nop to code that adds count x bonus,
//   capped, to impact before the same compare, and returns to .22 ($14494)
//   for no injury.
// - Each game: StartGame's jsr clearTeamStats ($778C) goes through code that
//   clears the counts first.
// - Each intermission: PeriodOver's addq #1,gsp / bchg #gmdir,gmode ($17236)
//   become jsr / nop to code that halves every count, then does them.
// a0 = the count of player a2: $FFF000, plus 32 for the away team, plus his roster number (d1 used).
const COUNT_OF_A2: Asm = ['7200 122A 0066 082A 0006 0062', { branch: BEQ, to: 'home' }, '0641 0020', { label: 'home' }, '41F8 F000 D0C1']

// The knockdown hook's code when it counts: the energy part only for an amount; nothing after the whistle.
const countingHitCode = (amount: number) =>
  assemble([
    '48E7 E0F0',
    CLOCK_STOPPED,
    { branch: BNE, to: 'done' },
    '4A6A 0034',
    { branch: BEQ, to: 'done' },
    '0C6B 000B 0052',
    { branch: BGT, to: 'done' },
    ...COUNT_OF_A2,
    '5210',
    { branch: BCC, to: 'counted' },
    '5310',
    { label: 'counted' },
    ...(amount > 0
      ? ['4A78 D058', { branch: BNE, to: 'done' }, '0838 0004 C2FC', { branch: BNE, to: 'done' }, `264A 4EB9 0001 575A 0440 ${hex4(amount)} 4EB9 0001 577A`]
      : []),
    { label: 'done' },
    '4CDF 0F07 4A6B 0034',
    { branch: BNE, to: 'return' },
    '2EBC 0001 4150',
    { label: 'return' },
    '4E75',
  ])
const COUNTING_VALUE_AT = valueAt(countingHitCode)
// The first counting version (0f3e827, played by Match Viewer), which counted knockdowns after the whistle too.
const firstCountingHitCode = (amount: number) =>
  assemble([
    '48E7 E0F0 4A6A 0034',
    { branch: BEQ, to: 'done' },
    '0C6B 000B 0052',
    { branch: BGT, to: 'done' },
    ...COUNT_OF_A2,
    '5210',
    { branch: BCC, to: 'counted' },
    '5310',
    { label: 'counted' },
    ...(amount > 0
      ? ['4A78 D058', { branch: BNE, to: 'done' }, '0838 0004 C2FC', { branch: BNE, to: 'done' }, `264A 4EB9 0001 575A 0440 ${hex4(amount)} 4EB9 0001 577A`]
      : []),
    { label: 'done' },
    '4CDF 0F07 4A6B 0034',
    { branch: BNE, to: 'return' },
    '2EBC 0001 4150',
    { label: 'return' },
    '4E75',
  ])
const FIRST_COUNTING_VALUE_AT = valueAt(firstCountingHitCode)

// The knockdown hook: the energy amount, and whether it counts.
interface HitHook {
  energy: number
  counting: boolean
}
const hitTarget = (rom: Uint8Array) => {
  if (readU16(rom, HIT_HOOK.at) !== OP_JSR || readU16(rom, HIT_HOOK.at + 6) !== OP_NOP) return null
  const to = readU32(rom, HIT_HOOK.at + 2)
  return to < rom.length ? to : null
}
function readHitHook(rom: Uint8Array): (HitHook & { length: number }) | null {
  const to = hitTarget(rom)
  if (to === null) return null
  const energy = (at: number) => (at + 2 <= rom.length ? readU16(rom, to + at) : 0)
  const candidates: [Uint8Array, HitHook][] = [
    [hitCode(energy(HIT_VALUE_AT)), { energy: energy(HIT_VALUE_AT), counting: false }],
    [countingHitCode(0), { energy: 0, counting: true }],
    [countingHitCode(energy(COUNTING_VALUE_AT)), { energy: energy(COUNTING_VALUE_AT), counting: true }],
    [firstHitCode(energy(FIRST_HIT_VALUE_AT)), { energy: energy(FIRST_HIT_VALUE_AT), counting: false }],
    [firstCountingHitCode(0), { energy: 0, counting: true }],
    [firstCountingHitCode(energy(FIRST_COUNTING_VALUE_AT)), { energy: energy(FIRST_COUNTING_VALUE_AT), counting: true }],
  ]
  for (const [code, value] of candidates) if (is(rom, to, code)) return { ...value, length: code.length }
  return null
}
const hitHook: Part<HitHook> = {
  detect(rom) {
    if (is(rom, HIT_HOOK.at, HIT_HOOK.original)) return { energy: 0, counting: false }
    const found = readHitHook(rom)
    return found ? { energy: found.energy, counting: found.counting } : undefined
  },
  remove(rom) {
    const found = readHitHook(rom)
    if (!found) return
    erase(rom, hitTarget(rom)!, found.length)
    rom.set(HIT_HOOK.original, HIT_HOOK.at)
  },
  apply(work, value) {
    if (value.counting) hook(work, HIT_HOOK, countingHitCode(value.energy))
    else if (value.energy > 0) hook(work, HIT_HOOK, hitCode(value.energy))
  },
}

const ROLL_HOOK: Hook = { at: 0x14432, original: bytes('B06A 0032 6E00 005C') }
const rollCode = (bonus: number, cap: number) =>
  assemble([
    '48E7 6080',
    ...COUNT_OF_A2,
    `7400 1410 C4FC ${hex4(bonus)} 0C42 ${hex4(cap)}`,
    { branch: BLS, to: 'capped' },
    `343C ${hex4(cap)}`,
    { label: 'capped' },
    'D46A 0032 B042 4CDF 0106',
    { branch: BGT, to: 'safe' },
    '4E75',
    { label: 'safe' },
    '2EBC 0001 4494 4E75',
  ])
const ROLL_BONUS_AT = rollCode(0x1234, 0).findIndex((byte, i, all) => byte === 0x12 && all[i + 1] === 0x34)
const ROLL_CAP_AT = rollCode(0, 0x1234).findIndex((byte, i, all) => byte === 0x12 && all[i + 1] === 0x34)
const GAME_HOOK: Hook = { at: 0x778c, original: bytes('4EB9 0001 7102') }
const GAME_CODE = bytes('48E7 8080 41F8 F000 703F 4218 51C8 FFFC 4CDF 0101 4EF9 0001 7102')
const PERIOD_HOOK: Hook = { at: 0x17236, original: bytes('5278 C466 0878 0001 C2EA') }
const PERIOD_CODE = bytes('48E7 C080 41F8 F000 703F 1210 E209 10C1 51C8 FFF8 4CDF 0103 5278 C466 0878 0001 C2EA 4E75')
// The recommended bonus and cap, for the effect the commissioner chose from Match Viewer's estimates over 26
// recorded league games: about 30% more injuries a game, the most-hit skaters about 1.4 times as likely to be
// hurt. A knockdown is counted before its own injury roll, so the first already adds the bonus; with that,
// Match Viewer puts +5 impact a knockdown, at most +25, at +27% and 1.33 times (+10 / 50, chosen first, at
// +54% and 1.66); +2 / 10 was too little to notice.
export const RECOMMENDED_INJURY_BONUS = 5
export const RECOMMENDED_INJURY_CAP = 25

interface InjuryRisk {
  bonus: number
  cap: number
}
const rollTarget = (rom: Uint8Array) => {
  if (readU16(rom, ROLL_HOOK.at) !== OP_JSR || readU16(rom, ROLL_HOOK.at + 6) !== OP_NOP) return null
  const to = readU32(rom, ROLL_HOOK.at + 2)
  if (to + ROLL_CAP_AT + 2 > rom.length) return null
  return is(rom, to, rollCode(readU16(rom, to + ROLL_BONUS_AT), readU16(rom, to + ROLL_CAP_AT))) ? to : null
}
const injuryRisk: Part<InjuryRisk> = {
  detect(rom) {
    const plain = [ROLL_HOOK, GAME_HOOK, PERIOD_HOOK].map((each) => is(rom, each.at, each.original))
    if (plain.every(Boolean)) return { bonus: 0, cap: NO_HACKS.injuryCap }
    const roll = rollTarget(rom)
    if (roll === null || hooked(rom, GAME_HOOK, GAME_CODE) === null || hooked(rom, PERIOD_HOOK, PERIOD_CODE) === null) return undefined
    return { bonus: readU16(rom, roll + ROLL_BONUS_AT), cap: readU16(rom, roll + ROLL_CAP_AT) }
  },
  remove(rom) {
    const roll = rollTarget(rom)
    const game = hooked(rom, GAME_HOOK, GAME_CODE)
    const period = hooked(rom, PERIOD_HOOK, PERIOD_CODE)
    if (roll === null || game === null || period === null) return
    erase(rom, roll, rollCode(0, 0).length)
    erase(rom, game, GAME_CODE.length)
    erase(rom, period, PERIOD_CODE.length)
    for (const each of [ROLL_HOOK, GAME_HOOK, PERIOD_HOOK]) rom.set(each.original, each.at)
  },
  apply(work, value) {
    if (value.bonus <= 0) return
    hook(work, ROLL_HOOK, rollCode(value.bonus, value.cap))
    hook(work, GAME_HOOK, GAME_CODE)
    hook(work, PERIOD_HOOK, PERIOD_CODE)
  },
}

// ------------------------------------------------- any skater at any position
// As the SNES hack from NHL94SNESVault, read from the code by Match Viewer.
// SelectLinePlayer lists the forwards for slots 3 to 5 and the defencemen
// for 1 and 2 by branching on the slot (cmp.w #2,d2 / bgt.w .n / add.w
// d0,d1 at $83A2); with the bgt and the add gone, every slot lists every
// skater, from the first after the goalies. SetLineSlot already swaps a
// player picked from elsewhere on the line. Lines saved from the editor's
// exit menu keep each slot as a nibble counted from the first forward or
// defenceman, which a defenceman at forward overflows, and the save block
// around them is full (the playoff state and totals follow), so a byte a
// slot, counted from the first skater, goes in 34 bytes of save RAM at
// $1EC0 that no ROM uses (the original's own blocks end at $E20; a scan of
// the league ROMs found none other), with the team + 1 first, built at
// $FFF040:
// - EncodeTeamLines ($8928) writes the old block as before (WriteLineData
//   keeps the playoffs; the editor's exit offers Load by its team byte), with
//   each slot's nibble where the player fits it (a forward at forward, a
//   defenceman at defence) and the first forward or defenceman where he
//   doesn't, so a ROM without the hack loads lines that fit exactly and never
//   a player who isn't there; then the new block (WriteSRAM,
//   MakeSRAMChecksum). Its first version wrote only the team byte there.
// - DecodeTeamLines ($88C8) reads the new block (ReadSRAM) and, if it is the
//   same team's, puts each slot's player in with SetLineSlot; lines saved
//   before the hack go through the original code.
// Both are menu handlers: their first 8 bytes become jsr / nop to code that
// drops the jsr's return and returns to the menu itself.
const SELECT_AT = 0x83a4
const SELECT = { original: bytes('6E00 000A D240'), hacked: bytes('4E71 4E71 4E71') }
const ENCODE_HOOK: Hook = { at: 0x8928, original: bytes('48E7 F8F0 307C D076') }
const ENCODE_CODE = assemble([
  // movem.l d0-d5/a0-a4,-(sp); the team + 1 to both blocks (a4 = the old one's nibbles, a0 = the new one's bytes)
  '588F 48E7 FCF8 302A 0028 5240 387C D076 18C0 41F8 F040 10C0',
  // a1 = the lines, d1 = goalies (GetGoalieCount), d5 = forwards (GetForwardCount), a3 = AttributeOffsetTbl
  '43EA 016A 4EB9 0000 9F40 3200 4EB9 0000 9F7E 3A00 267C 0000 898A 4242 4244',
  { label: 'next' },
  '141B',
  { branch: 0x6b, to: 'done' },
  // d3 = the player counted from the first skater, to the new block
  '1631 2000 5303 9601 10C3 0242 0007 0C42 0002',
  { branch: 0x6e, to: 'forward' },
  // a defence slot: counted from the first defenceman, or 0 for a forward
  '9605',
  { branch: 0x64, to: 'pack' },
  '7600',
  { branch: 0x60, to: 'pack' },
  { label: 'forward' },
  // a forward slot: as it is for a forward, or 0 for a defenceman
  'B605',
  { branch: 0x65, to: 'pack' },
  '7600',
  { label: 'pack' },
  // low nibble, then high nibble and the next byte, as the original
  '0844 0000',
  { branch: 0x66, to: 'high' },
  '1883',
  { branch: 0x60, to: 'next' },
  { label: 'high' },
  'E903 871C',
  { branch: 0x60, to: 'next' },
  { label: 'done' },
  '4EB9 000F E696 203C 0000 1EC0 7222 41F8 F040 4EB9 0001 A1E4 4EB9 0001 A206 4CDF 1F3F 4E75',
])
// The first version (b2606c6), which left the old block's nibbles as they were.
const FIRST_ENCODE_CODE = assemble([
  '588F 48E7 F8F0 307C D076 302A 0028 5240 1080 4EB9 000F E696',
  '41F8 F040 10C0 43EA 016A 4EB9 0000 9F40 3200 267C 0000 898A 4242',
  { label: 'next' },
  '141B',
  { branch: 0x6b, to: 'done' },
  '1631 2000 5303 9601 10C3',
  { branch: 0x60, to: 'next' },
  { label: 'done' },
  '203C 0000 1EC0 7222 41F8 F040 4EB9 0001 A1E4 4EB9 0001 A206 4CDF 0F1F 4E75',
])
// Where the encode routine is, and how long, in either version.
function encodeAt(rom: Uint8Array): { at: number; length: number } | null {
  for (const code of [ENCODE_CODE, FIRST_ENCODE_CODE]) {
    const at = hooked(rom, ENCODE_HOOK, code)
    if (at !== null) return { at, length: code.length }
  }
  return null
}
const DECODE_HOOK: Hook = { at: 0x88c8, original: bytes('48E7 F890 307C D076') }
const DECODE_CODE = assemble([
  '588F 48E7 F890 203C 0000 1EC0 7222 41F8 F040 4EB9 0001 A244 1038 F040 B038 D076',
  { branch: BEQ, to: 'ours' },
  '307C D076 4EF9 0000 88D0',
  { label: 'ours' },
  '41F8 F041 4EB9 0000 9F40 3200 267C 0000 898A 4242',
  { label: 'next' },
  '1413',
  { branch: 0x6b, to: 'done' },
  '7000 1018 D041 5240 141B 4EB9 0000 8898',
  { branch: 0x60, to: 'next' },
  { label: 'done' },
  '4CDF 091F 4E75',
])
const anyPosition: Part<boolean> = {
  detect(rom) {
    const plain = is(rom, SELECT_AT, SELECT.original) && is(rom, ENCODE_HOOK.at, ENCODE_HOOK.original) && is(rom, DECODE_HOOK.at, DECODE_HOOK.original)
    if (plain) return false
    return is(rom, SELECT_AT, SELECT.hacked) && encodeAt(rom) !== null && hooked(rom, DECODE_HOOK, DECODE_CODE) !== null ? true : undefined
  },
  remove(rom) {
    const encode = encodeAt(rom)
    const decode = hooked(rom, DECODE_HOOK, DECODE_CODE)
    if (!is(rom, SELECT_AT, SELECT.hacked) || encode === null || decode === null) return
    erase(rom, encode.at, encode.length)
    erase(rom, decode, DECODE_CODE.length)
    rom.set(SELECT.original, SELECT_AT)
    rom.set(ENCODE_HOOK.original, ENCODE_HOOK.at)
    rom.set(DECODE_HOOK.original, DECODE_HOOK.at)
  },
  apply(work, value) {
    if (!value) return
    hook(work, ENCODE_HOOK, ENCODE_CODE)
    hook(work, DECODE_HOOK, DECODE_CODE)
    work.rom.set(SELECT.hacked, SELECT_AT)
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

// One-timers at an open net (Match Viewer's GENESIS_SHOOTING.md, 4.4). The
// game aims a one-timer itself (shotdiradj, logic94.asm), and computer
// shooters the same way: where the sightline from the puck through the
// opposing goalie passes within 22 of the net's middle, just inside the post
// away from him (2 or 6); with no goalie, the middle at mid-height (8); and
// where the sightline misses the net, the goalie having wandered out of the
// puck's line, high in the middle (0). That is the worst aim at an open net:
// the target is just under the crossbar and the scatter only goes up, so
// close in about 4 in 10 sail over or hit the bar. The clr.w d0 that gives
// the 0 at $C5FC becomes moveq #8,d0, the pulled goalie's aim; the other
// cases set d0 after it, and the penalty shot and shootout aim still follow.
const OPEN_NET_AT = 0xc5fc
const OPEN_NET = { original: bytes('4240 B87C 002C'), hacked: bytes('7008 B87C 002C') }
const openNetFix: Part<boolean> = {
  detect: (rom) => (is(rom, OPEN_NET_AT, OPEN_NET.original) ? false : is(rom, OPEN_NET_AT, OPEN_NET.hacked) ? true : undefined),
  remove: (rom) => {
    if (is(rom, OPEN_NET_AT, OPEN_NET.hacked)) rom.set(OPEN_NET.original, OPEN_NET_AT)
  },
  apply: (work, value) => void (value && work.rom.set(OPEN_NET.hacked, OPEN_NET_AT)),
}

// chaos's fighting patch: see fight.ts.
function applyFight(work: Work, choice: FightChoice): void {
  if (choice === 'none') return
  try {
    work.rom = withFight(work.rom, choice)
  } catch (e) {
    throw new HackError(e instanceof Error ? e.message : String(e))
  }
}

// Repeated checks (Match Viewer's GENESIS_MECHANICS.md 7.3; known bug 8).
// FallDown, which every knockdown and wobble goes through, ignores the same
// checker and target as the last call anywhere on the ice: after a hit, the
// same checker can do nothing to that player until some other pair's hit
// lands, however long that takes (11 such checks in recorded games, none
// knocked anyone down, against 22% otherwise). FallDown already ignores a
// target that is falling or stumbling; the pair test is what stops a checker
// flattening a player again as he gets up. The fix keeps the pair test only
// while the target is still recovering: a knockdown sets his nopuck byte to
// 120 and a wobble his nopuckb to 60, each counting down every frame, so the
// pair is ignored while that word is not zero, and a later check counts. (A
// fall into the bench lasts longer, about 155 frames, but carries the man over
// the boards out of any checker's reach for all of it: Match Viewer.) The
// 18 bytes at $140A8 (cmpa.l PlayerChked,a2; bne.w .cont; cmpa.l
// PlayerChking,a3; bne.w .cont; rts) become a call to the same tests with
// the extra one; where the pair is ignored, it drops its return and returns
// from FallDown, as the rts did.
const REPEAT_HOOK: Hook = { at: 0x140a8, original: bytes('B5F8 DEDC 6600 000C B7F8 DEE0 6600 0004 4E75') }
export const REPEAT_CODE = bytes('B5F8 DEDC 660E B7F8 DEE0 6608 4A6A 005E 6702 588F 4E75')
// A version (774efea) that also kept the checker off a man falling into the
// bench, which no checker can reach then: recognised, and replaced.
const REPEAT_CODE_BENCH = bytes('B5F8 DEDC 661E B7F8 DEE0 6618 4A6A 005E 6610 0C6A 193E 0058 6708 0C6A 1A00 0058 6602 588F 4E75')
const repeatHooked = (rom: Uint8Array) =>
  [REPEAT_CODE, REPEAT_CODE_BENCH].flatMap((code) => {
    const target = hooked(rom, REPEAT_HOOK, code)
    return target === null ? [] : [{ target, code }]
  })[0] ?? null
const repeatCheckFix: Part<boolean> = {
  detect(rom) {
    if (is(rom, REPEAT_HOOK.at, REPEAT_HOOK.original)) return false
    return repeatHooked(rom) !== null ? true : undefined
  },
  remove(rom) {
    const found = repeatHooked(rom)
    if (found === null) return
    erase(rom, found.target, found.code.length)
    rom.set(REPEAT_HOOK.original, REPEAT_HOOK.at)
  },
  apply(work, value) {
    if (value) hook(work, REPEAT_HOOK, REPEAT_CODE)
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

// Stick deflections as shots on goal (Match Viewer's GENESIS_SHOOTING 4.7). A
// loose puck faster than a goalie's stick can catch goes to puckstick's .stdef,
// which plays the sound and deflects it, and never counts the shot: only a
// catch or a body touch reaches ChkShotStat. So shots along the ice go
// missing from the totals, more of them for a team attacking down the screen.
// The option counts a goalie's stick deflection while the shot flag
// (sflags2 sf2shot) stands, with the clock running and not in a highlight.
// It clears the flag, so the shot counts once, and enters ChkShotStat at
// .addShot with the shooter (shotplayer) in d0 and its own stack frame,
// past .Cwdupdate, so the crowd meter, which play reads, is left as it was:
// statistics only. bsr.w a2touchpuck / bra.w deflect at $151D6 becomes a
// call to the code below, which ends with both. (Match Viewer built and
// tested it: over 1,200 shots, each changed by at most one shot on goal, and
// play the same.)
const STICK_HOOK: Hook = { at: 0x151d6, original: bytes('6100 AF66 6000 0528') }
// tst.w position(a2); bne .touch; btst #0,(sflags).w; bne .touch; btst #4,(sflags).w; bne .touch;
// bclr #sf2shot,(sflags2).w; beq .touch; pea .touch(pc); movem.l d0-d1/a1-a3,-(sp);
// move.w (shotplayer).w,d0; jmp .addShot; .touch: jsr a2touchpuck; addq.l #4,sp; jmp deflect
export const STICK_CODE = bytes(
  '4A6A 0034 662A 0838 0000 C2EA 6622 0838 0004 C2EA 661A 08B8 0004 C2EE 6712 487A 0010 48E7 C070 3038 BED8 4EF9 0001 2FD0 4EB9 0001 013E 588F 4EF9 0001 5704',
)

const stickShots: Part<boolean> = {
  detect(rom) {
    if (is(rom, STICK_HOOK.at, STICK_HOOK.original)) return false
    return hooked(rom, STICK_HOOK, STICK_CODE) === null ? undefined : true
  },
  remove(rom) {
    const target = hooked(rom, STICK_HOOK, STICK_CODE)
    if (target === null) return
    erase(rom, target, STICK_CODE.length)
    rom.set(STICK_HOOK.original, STICK_HOOK.at)
  },
  apply(work, value) {
    if (value) hook(work, STICK_HOOK, STICK_CODE)
  },
}

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
// .sube, the drain each 128 frames on the ice: tst.w OptLine / bne.w rtss2 becomes bra.w rtss2, so it never runs.
const noSkatingDrain = switchPart(0x10d2a, bytes('6600'), bytes('6000'))
// burst: subi.w #$CC,d0 before setpde, with line changes on.
const burstEnergy = numberPart([site(0xbb72, '0440')], NO_HACKS.burstEnergy)

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

// ------------------------------------------------------------- injuries
// From the forum (chaos) and the Genesis disassembly (Match Viewer). FallDown
// makes a hit an injury past one last test, btst #gmclock then bne.w .22 at
// $14440; setInjuryType then takes the checker's Fighting / 4 (0 to 3): 0 is
// for the period (bne.w .not0 at $14508 not taken), 3 for the game (beq.w
// .injurygame at $14520), and 1 or 2 for the period unless chkFgtBit1 says
// the game. Never: the bne.w becomes bra.w, so the hit is a fall and nothing
// more. Every injury for the period: the bne.w at $14508 becomes two NOPs
// (the forum's change at $14536 misses Fighting 12 and more). For the game:
// $14508 and $14520 become bra.w. A penalty but no injury (Match Viewer's):
// the call of setInjuryType at $14450 and the injury countdown, move.w
// #4,(InjCntDown).w at $1446A, become NOPs, so the penalty is called with no
// injury box, and the player lies down for about 10 seconds and skates on.
// All five tested in the game by Match Viewer. A long fall instead (Match
// Viewer's): the call of setInjuryType at $14450 becomes bra.w .22 ($14494), the
// ordinary fall's end, so there is no injury, no box and no penalty; and
// SPAinjuryfall's two lists, which fall and then lie for ever, become a back
// fall that gets up (SPFfallback+1, 6; +2, the lying time; +3, 8; SPFduck,
// -8; and +17 / +18 / +19 with SPFduck+4), lying 300 ticks (about 5 seconds;
// an ordinary fall lies 100). Nothing else uses SPAinjuryfall with no
// injuries; and FallDown skips a player in it, so he is not knocked down
// again while he lies there. Head bleeding rewrites the same lists for its
// frames, and with no injuries would never show, so the two do not go
// together.

const INJURY_SITES = [0x14440, 0x14508, 0x14520, 0x14450, 0x1446a]
const INJURY_KEPT = ['6100005A', '31FC0004C3EC']
const INJURY_BYTES: Record<Injuries, string[]> = {
  original: ['66000052', '66000012', '67000018', ...INJURY_KEPT],
  never: ['60000052', '66000012', '67000018', ...INJURY_KEPT],
  penaltyOnly: ['66000052', '66000012', '67000018', '4E714E71', '4E714E714E71'],
  period: ['66000052', '4E714E71', '67000018', ...INJURY_KEPT],
  game: ['66000052', '60000012', '60000018', ...INJURY_KEPT],
  // bra.w .22 ($14494, move.w #SFXcrowdcheer,-(sp)): $14494 - $14452. (The first build said $46, 4 bytes past it,
  // which skipped the push and hung the game; Match Viewer found it.)
  longFall: ['66000052', '66000012', '67000018', '60000042', '31FC0004C3EC'],
}
const INJURY_LISTS = [0x6f8a, 0x6f9a]
export const LONG_FALL_TICKS = 300
const FALL_LISTS = {
  original: ['0111 0006 0112 0006 0113 001E 0113 FC00', '0121 0006 0122 0006 0123 001E 0123 FC00'],
  longFall: [`0112 0006 0113 ${LONG_FALL_TICKS.toString(16).padStart(4, '0')} 0114 0008 0151 FFF8`, `0122 0006 0123 ${LONG_FALL_TICKS.toString(16).padStart(4, '0')} 0124 0008 0155 FFF8`],
}
const listsAre = (rom: Uint8Array, which: keyof typeof FALL_LISTS) => INJURY_LISTS.every((at, i) => is(rom, at, bytes(FALL_LISTS[which][i])))

const injuries: Part<Injuries> = {
  detect(rom) {
    const value = (Object.keys(INJURY_BYTES) as Injuries[]).find((each) => INJURY_SITES.every((at, i) => is(rom, at, bytes(INJURY_BYTES[each][i]))))
    if (value === 'longFall') return listsAre(rom, 'longFall') ? value : undefined
    return value
  },
  remove(rom) {
    INJURY_SITES.forEach((at, i) => rom.set(bytes(INJURY_BYTES.original[i]), at))
    if (listsAre(rom, 'longFall')) INJURY_LISTS.forEach((at, i) => rom.set(bytes(FALL_LISTS.original[i]), at))
  },
  apply(work, value) {
    if (value === 'longFall') {
      if (!listsAre(work.rom, 'original')) {
        throw new HackError(
          "A long fall instead of an injury needs the injury animation as the original game has it. If this ROM has head bleeding, which draws its blood in that animation, take it out first: with no injuries it would never show.",
        )
      }
      INJURY_LISTS.forEach((at, i) => work.rom.set(bytes(FALL_LISTS.longFall[i]), at))
    }
    INJURY_SITES.forEach((at, i) => work.rom.set(bytes(INJURY_BYTES[value][i]), at))
  },
}

// ------------------------------------------------------- hot and cold range
// Create_HotCold_Table fills each player's 16 hot and cold values with
// randomd0s of move.w #9,d0 at $F70AC: each from -n to n - 1, so -9 to 8 in
// the original game. In play only the first is used, added to the rating x 5
// after a signed divide by 3, so -2 to 2 do nothing and 2 or less removes the
// effect on the ice (3 can draw -3), though Edit Lines and the player cards
// still show the values; 0 makes every value 0. Tested by Match Viewer:
// working ratings changed by 9: 88, 4: 49, 3: 19, 2: none.
const hotColdRange = numberPart([site(0xf70ac, '303C')], NO_HACKS.hotColdRange)

// ---------------------------------------------------------------- no icing
// From the forum (TheTome) and the disassembly (Match Viewer): a2touchpuck
// ends with bset #ifok,(iflags).w; rts at $1023E, arming an icing check when
// a player sends the puck from his own half. Skipping it leaves no icing
// state, so no call, and the computer goalie plays a loose puck as usual.
// The forum's bra.s +2 lands on the bset's address word, $BF80, which runs as
// eor.l d7,d0 before the rts; NOSE4Web's bra.s +4 goes to the rts. Both are
// recognised.
const ICING_AT = 0x1023e
const ICING = { original: bytes('08F8 0002 BF80'), hacked: bytes('6004 0002 BF80'), forum: bytes('6002 0002 BF80') }
const noIcing: Part<boolean> = {
  detect: (rom) => (is(rom, ICING_AT, ICING.original) ? false : is(rom, ICING_AT, ICING.hacked) || is(rom, ICING_AT, ICING.forum) ? true : undefined),
  remove: (rom) => rom.set(ICING.original, ICING_AT),
  apply: (work, value) => void (value && work.rom.set(ICING.hacked, ICING_AT)),
}

// ------------------------------------------------------------ hybrid icing
// The original game plays touch icing (from the disassembly): a2touchpuck arms
// the check when a team not short-handed sends the puck from its own half
// (ifok, icingPlayer, ifdir: which goal line); PuckIChk, from pucknorm, marks
// the loose puck crossing that goal line outside the crease's width (bset
// #ifcgl,(iflags).w at $102A0; inside it the check is dropped), and the next
// player to touch it decides: a defending skater, icing; an attacker or the
// goalie, waved off. Hybrid icing, as the NHL has played it since 2013-14,
// decides as the puck crosses: the hook keeps the bset, then takes each team's
// skater nearest the line across the end-zone faceoff dots (y 206 from centre,
// where the icing faceoff is; a skater past it counts as there), leaving out
// goalies, objects not in play (position negative) and players going to or
// from the bench or box (pf2unav). A defender as near or nearer: icing, called
// at once as a2touchpuck's .icing does (AddPenalty PenIcing, $11F2C, for the
// icing player); an attacker nearer: waved off (bclr #ifok, as the crease
// test does). Distance only, not speed. Short-handed teams still never ice,
// and with No icing on there is nothing to decide.
const HYBRID_HOOK: Hook = { at: 0x102a0, original: bytes('08F8 0000 BF80') }
const HYBRID_CODE = bytes('48E7 F880 08F8 0000 BF80 363C 00CE 0838 0001 BF80 6602 4443 307C B04A 0C38 0006 BF81 6D04 D0FC 0300 6146 3202 307C B04A 0C38 0006 BF81 6C04 D0FC 0300 6132 B441 6E22 4CDF 011F 2F0B 4240 1038 BF81 EF40 367C B04A D6C0 303C 000C 4EB9 0001 1F2C 265F 4E75 08B8 0002 BF80 4CDF 011F 4E75 343C 7FFF 7805 4A68 0034 6F20 0828 0002 0063 6618 3028 0014 9043 4A43 6B02 4440 4A40 6A02 7000 B042 6C02 3400 D0FC 0080 51CC FFD4 4E75')
const hybridIcing: Part<boolean> = {
  detect: (rom) => (is(rom, HYBRID_HOOK.at, HYBRID_HOOK.original) ? false : hooked(rom, HYBRID_HOOK, HYBRID_CODE) !== null ? true : undefined),
  remove(rom) {
    const target = hooked(rom, HYBRID_HOOK, HYBRID_CODE)
    if (target === null) return
    erase(rom, target, HYBRID_CODE.length)
    rom.set(HYBRID_HOOK.original, HYBRID_HOOK.at)
  },
  apply: (work, value) => void (value && hook(work, HYBRID_HOOK, HYBRID_CODE)),
}

// ---------------------------------------------- calls during a delayed penalty
// Known bug 12, from the disassembly (Match Viewer): checkagr, the penalty roll
// behind body checks, holds, hooks and pokes, gives the checker d0 = $7F (no
// penalty) at .teamchk ($13EBE) when the other team has a penalty pending
// (DelayedPen, $FFC300: bit 2 visitors pending against a home checker, bit 1
// the other way), so while one team's call is delayed the other cannot be
// called. Its first test, btst #2,($C300).w at $13EC4, becomes bra.w to the
// routine's rts at $13EE0, so the roll goes on as at any other time. The rest
// already copes: PenBuf, the boxes and the log are per entry and team, a foul
// by the team with the puck stops play at once, and two minors at one whistle
// are both served, 4 on 4. Goalie interference and roughing after an injury
// never went through this test. The SNES game has no such test. Tested in
// the game by Match Viewer: 2 such calls in six games, the original none.
const DELAYED_AT = 0x13ec4
const DELAYED = { original: bytes('0838 0002'), hacked: bytes('6000 001A') }
const delayedCalls: Part<boolean> = {
  detect: (rom) => (is(rom, DELAYED_AT, DELAYED.original) ? false : is(rom, DELAYED_AT, DELAYED.hacked) ? true : undefined),
  remove: (rom) => rom.set(DELAYED.original, DELAYED_AT),
  apply: (work, value) => void (value && work.rom.set(DELAYED.hacked, DELAYED_AT)),
}

// ------------------------------------------------------ 3 on 3 overtime
// As the NHL plays it: in overtime each team has its goalie and three
// skaters, the line's LW, C and RD (two forwards and a defenceman, a centre
// for the draws); a penalty gives the other team a skater more (4 on 3, then
// 5 on 3), and when it ends the teams play 4 on 4 to the next stoppage, then
// 3 on 3 again. From Match Viewer's reading of the code. The game fields
// tmap players (goalie included; 6 at full strength) in priolist's order
// (G, LD, RD, C, LW, RW, extra attacker), as it does for a team short-handed,
// so the lines stay whole and line changes On or Off make no difference:
// - releasepl, getlinee and SetPlList each take priolist (movea.l #priolist,a0,
//   at $12A00, $12EC4 and $1583C); in overtime they take an order of their
//   own, G, C, LW, RD, LD, RW, extra attacker, so 4 is G, C, LW and RD, the
//   next on the ice LD, and with the goalie pulled the four skaters.
// - InProgress, at every whistle, counts each team's players kept off by
//   penalties (InProgress_ap, both teams, $123A2); in overtime 4 each, and
//   one more for each penalty the other team has beyond its own (at most 2),
//   still clearing each penalty's "just called" bit as InProgress_ap does.
//   So a power play adds a skater, and the next whistle after it ends brings
//   the teams back to three; releasepl's player back from the box in between
//   makes it 4 on 4.
//   A team has 6 sort objects and each boxed player keeps his, so a team is
//   given no more than 6 less its boxed players (all of them), nor fewer than
//   3: with three in the box it plays its goalie, C and LW, where it would
//   have been given three skaters and placed only two, losing the centre
//   (Match Viewer, seed 21: goalie, three skaters and three boxed need seven).
//   And neither team more than two skaters ahead of the other, as the NHL
//   allows: with three of a team in the box the other would have had five
//   against its two (Match Viewer); it is 4 on 2 then.
// - StartPer, where it marks overtime (bset #1,sflags7 at $7870), counts the
//   same way for the opening faceoff (a penalty from the third period carries
//   over as 4 on 3), and puts both teams back to 6 for a shootout.
// - The faceoff places players by a row of .apl for the number on the ice;
//   the 4-player row was made for a team two short (G, LD, RD, C) and would
//   put the LW back on the left. In overtime every count takes the full row,
//   each player on his own spot ($FA6E: neg/addq/asl, the row's offset).
// - GetLowestPen, the power-play clock, takes a power-play team below 6 to
//   have its own man in the box too (cmpi.w #6,tmap(a3) at $12A50), and at
//   4 on 3 showed 0:00 (Match Viewer); in overtime it asks the box list
//   itself whether the team has anyone in it but for coincidental penalties.
// - setpersonel gives each listed player not yet on the ice a free sort
//   object (.4 to its dbpl at $15800): the first free one whose position tests
//   non-negative, else the last free one. A boxed player's object (position
//   $FF) qualifies, and a substitute put there is lost: a draw went 4 on 2 when
//   the centre's substitute went to a boxed player's object (Match Viewer, seed
//   11). 3 on 3 makes it likely, as a line player in the box always needs a
//   substitute while the boxed still hold objects. In overtime it passes over
//   objects of boxed players (tmpdst of the object's pnum above 0); with none
//   left, and outside overtime, the original's loop as it was.
// Only when not a shootout (gmode2 bit 0); 'season' only in the regular
// season (OptPlayMode 0), as the NHL's playoffs play 5 on 5.
export type ThreeOnThree = 'off' | 'season' | 'all'
export const THREE_ON_THREE_TEXTS: Record<ThreeOnThree, string> = {
  off: 'Off: 5 on 5, as the original game',
  season: 'In the regular season',
  all: 'In every overtime, playoffs included',
}
const OT3_PRIO_HOOKS: Hook[] = [0x12a00, 0x12ec4, 0x1583c].map((at) => ({ at, original: bytes('207C 0001 9286') }))
const OT3_RECOUNT_HOOK: Hook = { at: 0x123a2, original: bytes('347C C6CE 6100 0036 D4FC 0364 6100 002E') }
const OT3_START_HOOK: Hook = { at: 0x7870, original: bytes('08F8 0001 C2FC') }
const OT3_FACEOFF_HOOK: Hook = { at: 0xfa6e, original: bytes('4444 5C44 E744') }
const OT3_BOX_HOOK: Hook = { at: 0x12a50, original: bytes('0C6B 0006 0024') }
const OT3_PERS_HOOK: Hook = { at: 0x15800, original: bytes('D6FC 0080 4A2B 0061 5BCB FFF6 6A00 0004 304B 4A6B 0034 5ACB FFE8') }
const OT3_PRIO_SEASON = bytes('207C 0001 9286 0838 0001 C2FC 6712 0838 0000 C2FA 660A 4A78 D048 6604 41FA 0004 4E75 0004 0302 0105 06FF')
const OT3_RECOUNT_SEASON = bytes('0838 0001 C2FC 6700 0092 0838 0000 C2FA 6600 0088 4A78 D048 6600 0080 48E7 3C00 347C C6CE 6100 008A 3601 3A04 D4FC 0364 6100 007E 3403 9441 6A02 7400 5842 7006 9044 0C40 0003 6C02 7003 B440 6F02 3400 3542 0024 3401 9443 6A02 7400 5842 7006 9045 0C40 0003 6C02 7003 B440 6F02 3400 3542 FCC0 302A 0024 322A FCC0 3401 5442 B042 6F04 3542 0024 3400 5442 B242 6F04 3542 FCC0 4CDF 003C 4E75 347C C6CE 4EB9 0001 23DE D4FC 0364 4EB9 0001 23DE 4E75 7200 7800 7032 4A72 0066 6F20 5244 08B2 0005 0066 0832 0006 0066 6610 0832 0004 0066 6608 0C41 0002 6702 5241 5540 6AD6 4E75')
const OT3_START_SEASON = bytes('08F8 0001 C2FC 0838 0000 C2FA 6600 0088 4A78 D048 6600 008C 48E7 3C00 347C C6CE 6100 0082 3601 3A04 D4FC 0364 6100 0076 3403 9441 6A02 7400 5842 7006 9044 0C40 0003 6C02 7003 B440 6F02 3400 3542 0024 3401 9443 6A02 7400 5842 7006 9045 0C40 0003 6C02 7003 B440 6F02 3400 3542 FCC0 302A 0024 322A FCC0 3401 5442 B042 6F04 3542 0024 3400 5442 B242 6F04 3542 FCC0 4CDF 003C 4E75 31FC 0006 C6F2 31FC 0006 CA56 4E75 7200 7800 7032 4A72 0066 6F20 5244 08B2 0005 0066 0832 0006 0066 6610 0832 0004 0066 6608 0C41 0002 6702 5241 5540 6AD6 4E75')
const OT3_FACEOFF_SEASON = bytes('0838 0001 C2FC 6712 0838 0000 C2FA 660A 4A78 D048 6604 7800 4E75 4444 5C44 E744 4E75')
const OT3_PRIO_ALL = bytes('207C 0001 9286 0838 0001 C2FC 670C 0838 0000 C2FA 6604 41FA 0004 4E75 0004 0302 0105 06FF')
const OT3_RECOUNT_ALL = bytes('0838 0001 C2FC 6700 008A 0838 0000 C2FA 6600 0080 48E7 3C00 347C C6CE 6100 008A 3601 3A04 D4FC 0364 6100 007E 3403 9441 6A02 7400 5842 7006 9044 0C40 0003 6C02 7003 B440 6F02 3400 3542 0024 3401 9443 6A02 7400 5842 7006 9045 0C40 0003 6C02 7003 B440 6F02 3400 3542 FCC0 302A 0024 322A FCC0 3401 5442 B042 6F04 3542 0024 3400 5442 B242 6F04 3542 FCC0 4CDF 003C 4E75 347C C6CE 4EB9 0001 23DE D4FC 0364 4EB9 0001 23DE 4E75 7200 7800 7032 4A72 0066 6F20 5244 08B2 0005 0066 0832 0006 0066 6610 0832 0004 0066 6608 0C41 0002 6702 5241 5540 6AD6 4E75')
const OT3_START_ALL = bytes('08F8 0001 C2FC 0838 0000 C2FA 6600 0080 48E7 3C00 347C C6CE 6100 0082 3601 3A04 D4FC 0364 6100 0076 3403 9441 6A02 7400 5842 7006 9044 0C40 0003 6C02 7003 B440 6F02 3400 3542 0024 3401 9443 6A02 7400 5842 7006 9045 0C40 0003 6C02 7003 B440 6F02 3400 3542 FCC0 302A 0024 322A FCC0 3401 5442 B042 6F04 3542 0024 3400 5442 B242 6F04 3542 FCC0 4CDF 003C 4E75 31FC 0006 C6F2 31FC 0006 CA56 4E75 7200 7800 7032 4A72 0066 6F20 5244 08B2 0005 0066 0832 0006 0066 6610 0832 0004 0066 6608 0C41 0002 6702 5241 5540 6AD6 4E75')
const OT3_FACEOFF_ALL = bytes('0838 0001 C2FC 670C 0838 0000 C2FA 6604 7800 4E75 4444 5C44 E744 4E75')
const OT3_BOX_SEASON = bytes('0838 0001 C2FC 6728 0838 0000 C2FA 6620 4A78 D048 661A 41EB 009A 4242 1418 6B0C 0833 0006 2066 66F4 7401 4E75 4242 4E75 0C6B 0006 0024 4E75')
const OT3_BOX_ALL = bytes('0838 0001 C2FC 6722 0838 0000 C2FA 661A 41EB 009A 4242 1418 6B0C 0833 0006 2066 66F4 7401 4E75 4242 4E75 0C6B 0006 0024 4E75')
const OT3_PERS_SEASON = bytes('0838 0001 C2FC 674E 0838 0000 C2FA 6646 4A78 D048 6640 48E7 C040 91C8 7005 224B D2FC 0080 4A29 0061 6A18 7200 1229 0066 6B08 D241 4A72 1066 6E08 2049 4A69 0034 6A0E 51C8 FFDC 2008 6606 4CDF 0203 6006 4CDF 0203 4E75 D6FC 0080 4A2B 0061 5BCB FFF6 6A00 0004 304B 4A6B 0034 5ACB FFE8 4E75')
const OT3_PERS_ALL = bytes('0838 0001 C2FC 6748 0838 0000 C2FA 6640 48E7 C040 91C8 7005 224B D2FC 0080 4A29 0061 6A18 7200 1229 0066 6B08 D241 4A72 1066 6E08 2049 4A69 0034 6A0E 51C8 FFDC 2008 6606 4CDF 0203 6006 4CDF 0203 4E75 D6FC 0080 4A2B 0061 5BCB FFF6 6A00 0004 304B 4A6B 0034 5ACB FFE8 4E75')
const OT3_PARTS = (choice: Exclude<ThreeOnThree, 'off'>): [Hook, Uint8Array][] => {
  const season = choice === 'season'
  return [
    ...OT3_PRIO_HOOKS.map((hook): [Hook, Uint8Array] => [hook, season ? OT3_PRIO_SEASON : OT3_PRIO_ALL]),
    [OT3_RECOUNT_HOOK, season ? OT3_RECOUNT_SEASON : OT3_RECOUNT_ALL],
    [OT3_START_HOOK, season ? OT3_START_SEASON : OT3_START_ALL],
    [OT3_FACEOFF_HOOK, season ? OT3_FACEOFF_SEASON : OT3_FACEOFF_ALL],
    [OT3_BOX_HOOK, season ? OT3_BOX_SEASON : OT3_BOX_ALL],
    [OT3_PERS_HOOK, season ? OT3_PERS_SEASON : OT3_PERS_ALL],
  ]
}
const threeOnThree: Part<ThreeOnThree> = {
  detect(rom) {
    if (OT3_PARTS('all').every(([hook]) => is(rom, hook.at, hook.original))) return 'off'
    for (const choice of ['season', 'all'] as const) {
      if (OT3_PARTS(choice).every(([hook, code]) => hooked(rom, hook, code) !== null)) return choice
    }
    return undefined
  },
  remove(rom) {
    for (const choice of ['season', 'all'] as const) {
      for (const [hook, code] of OT3_PARTS(choice)) {
        const target = hooked(rom, hook, code)
        if (target === null) continue
        erase(rom, target, code.length)
        rom.set(hook.original, hook.at)
      }
    }
  },
  apply(work, value) {
    if (value === 'off') return
    for (const [from, code] of OT3_PARTS(value)) hook(work, from, code)
  },
}

// ------------------------------------------------ B-checks with penalties off
// From the forum (CoachMac) and the disassembly (Match Viewer). In Bcheck,
// with penalties off and a person making the B-check, the trip works only
// after an extra roll (randomd0($20 + checker's Chk - target's Agl) reaching
// $18); everyone else goes straight to .checkdir. $13FDC is bne.w .checkdir,
// taken with penalties on, and $13FE6 beq.w .checkdir, taken when the checker
// is not a person. The forum swaps both, which with penalties on gives the
// computer's checker the roll; NOSE4Web's makes $13FDC bra.w, so that with
// penalties off B-checks play as they do with them on, and nothing else.
const BCHECK_SITES = [0x13fdc, 0x13fe6]
const BCHECK_BYTES: Record<BCheckPenaltiesOff, string[]> = {
  original: ['6600003A', '67000030'],
  asPenaltiesOn: ['6000003A', '67000030'],
  forum: ['6700003A', '66000030'],
}
const bCheckPenaltiesOff: Part<BCheckPenaltiesOff> = {
  detect: (rom) => (Object.keys(BCHECK_BYTES) as BCheckPenaltiesOff[]).find((value) => BCHECK_SITES.every((at, i) => is(rom, at, bytes(BCHECK_BYTES[value][i])))),
  remove: (rom) => BCHECK_SITES.forEach((at, i) => rom.set(bytes(BCHECK_BYTES.original[i]), at)),
  apply: (work, value) => BCHECK_SITES.forEach((at, i) => work.rom.set(bytes(BCHECK_BYTES[value][i]), at)),
}

// --------------------------------------------------------- goalie control delay
// From the forum (smozoma) and the disassembly (Match Viewer): holding B
// counts the pad's bholdtimer ($FFBF06 for pads 1 and 2, $FFBF08 for pads 3
// and 4) down from $11, and the eight places that set it all hold the start
// value: two move.w #$1111 resets, when the hold-reset timer runs out, and
// six move.b #$11. Pads 3 and 4 use the same code, with their timer swapped
// in. From 1 to $80: the count is subq.b #1 then bpl, so more than $80 would
// be negative at once and taken almost straight away.
const DELAY_WORDS = [0xad04, 0xad0a]
const DELAY_BYTES = [0xb12f, 0xb139, 0xb36d, 0xb377, 0xb39b, 0xb3c3]
const DELAY_WORD_LEAD = bytes('31FC')
const DELAY_BYTE_LEAD = bytes('11FC 00')
const goalieDelay: Part<number> = {
  detect(rom) {
    if (!DELAY_WORDS.every((at) => is(rom, at - 2, DELAY_WORD_LEAD)) || !DELAY_BYTES.every((at) => is(rom, at - 3, DELAY_BYTE_LEAD))) return undefined
    const values = [...DELAY_WORDS.flatMap((at) => [rom[at], rom[at + 1]]), ...DELAY_BYTES.map((at) => rom[at])]
    return values.every((value) => value === values[0]) && values[0] >= 1 && values[0] <= 0x80 ? values[0] : undefined
  },
  remove: (rom) => goalieDelay.apply({ rom }, NO_HACKS.goalieDelay),
  apply(work, value) {
    for (const at of DELAY_WORDS) work.rom.set([value, value], at)
    for (const at of DELAY_BYTES) work.rom[at] = value
  },
}

// ------------------------------------------------- Edit Lines for fewer skaters
// From smozoma's forum post and the disassembly (Match Viewer). With line
// changes off, Edit Lines draws and lets the cursor reach the five skaters'
// positions, and Team Rosters' line view lists them, even where a ROM leaves
// some empty, which shows stale data and can crash. For used positions that
// follow each other in LD, RD, LW, C, RW order, from position s, n of them:
// the cursor's first position (move.w #s at $82F2), its lowest and highest
// (cmp.w at $8374 and $837A), the first position drawn (addq.w #s,d4 at
// $8636), the number of rows less one ($879C), the roster view's first
// position ($8C6E) and rows less one (moveq at $8C76), the header labels
// ($86DC, every 6 bytes) and the row names ($191D2, every 4). The roster view
// takes a row off the penalty-kill lines (subq.w #1,d1 at $8C82), which have
// no RW: it is kept only where the ROM plays RW (with one row it would loop
// 65,536 times), else it becomes a NOP. With line changes on, Edit Lines takes
// each line's rows from LineIconPosTable (x, y and rows less one, 6 bytes a
// line, the counts at $87A2 to $87BA for the five full lines and $87C0 and
// $87C6 for the penalty kill's four), which are fitted too; left at 5 and 4
// the editor crashed there (Match Viewer, in the game). The earlier version,
// smozoma's for 2 on 2 and NOSE4Web's first, fitted neither; a ROM with it is
// recognised, and given these when its hacks are next applied.
const POSITION_LABELS = ['LD', 'RD', 'LW', 'C ', 'RW']
const ROW_NAMES = ['LD', 'RD', 'LW', 'C\0', 'RW']
const ascii2 = (text: string) => [text.charCodeAt(0), text.charCodeAt(1)]

const FULL_LINE_COUNTS = [0x87a2, 0x87a8, 0x87ae, 0x87b4, 0x87ba]
const KILL_LINE_COUNTS = [0x87c0, 0x87c6]

function lineViewBytes(first: number, count: number, earlier = false): [number, number[]][] {
  const last = first + count - 1
  // The penalty kill's rows: the used positions up to C.
  const killRows = Math.max(1, Math.min(last, 4) - first + 1)
  const keepSubq = earlier ? count > 1 : last === 5 && count > 1
  const sites: [number, number[]][] = [
    [0x82f2, [0, first]],
    [0x8374, [0, first]],
    [0x837a, [0, first + count - 1]],
    [0x8636, [0x50 | (first << 1), 0x44]],
    [0x879c, [0, count - 1]],
    [0x8c6e, [0, first]],
    [0x8c76, [0x72, count - 1]],
    [0x8c82, keepSubq ? [0x53, 0x41] : [0x4e, 0x71]],
    ...FULL_LINE_COUNTS.map((at): [number, number[]] => [at, [0, earlier ? 4 : count - 1]]),
    ...KILL_LINE_COUNTS.map((at): [number, number[]] => [at, [0, earlier ? 3 : killRows - 1]]),
  ]
  POSITION_LABELS.forEach((_, i) => sites.push([0x86dc + i * 6, ascii2(i < count ? POSITION_LABELS[first - 1 + i] : '  ')]))
  ROW_NAMES.forEach((name, i) => sites.push([0x191d2 + i * 4, ascii2(i < count ? ROW_NAMES[first - 1 + i] : name)]))
  return sites
}

const fitsView = (first: number, count: number) => first >= 1 && count >= 1 && first + count - 1 <= 5
const viewCode = (first: number, count: number) => (first === 1 && count === 5 ? 0 : first * 10 + count)

const fewerSkaterLines: Part<number> = {
  detect(rom) {
    const first = rom[0x82f3]
    const count = rom[0x879d] + 1
    if (!fitsView(first, count)) return undefined
    const holds = (earlier: boolean) => lineViewBytes(first, count, earlier).every(([at, bytes]) => bytes.every((byte, i) => rom[at + i] === byte))
    return holds(false) || holds(true) ? viewCode(first, count) : undefined
  },
  remove: (rom) => lineViewBytes(1, 5).forEach(([at, bytes]) => rom.set(bytes, at)),
  apply(work, value) {
    if (value === 0) return
    const [first, count] = [Math.floor(value / 10), value % 10]
    if (!fitsView(first, count)) throw new HackError('Edit Lines can only be fitted to positions that follow each other.')
    lineViewBytes(first, count).forEach(([at, bytes]) => work.rom.set(bytes, at))
  },
}

// The value that fits Edit Lines to the skaters' positions a ROM uses on its
// first line, from the line positions it leaves empty on every team; 0 where
// it uses all five, null where the used ones do not follow each other.
export function fewerSkaterLinesFor(empty: boolean[] | undefined): number | null {
  const used = [1, 2, 3, 4, 5].filter((slot) => !empty?.[slot])
  if (used.length === 0) return null
  const [first, count] = [used[0], used.length]
  if (used.some((slot, i) => slot !== first + i)) return null
  return viewCode(first, count)
}

// The positions a value fits Edit Lines to, as the game names them.
export function fewerSkaterLinesText(value: number): string {
  if (value === 0) return 'LD, RD, LW, C and RW'
  const [first, count] = [Math.floor(value / 10), value % 10]
  const names = POSITION_LABELS.slice(first - 1, first - 1 + count).map((label) => label.trim())
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

// -------------------------------------------------------------- intro waits
// The EA Sports screen ($17AAC) and the High Score and Mark Lesser screen
// ($FEE2C) each wait for (n + 1) x 4 frames, n = 80 in the original game, so
// about 5.4 seconds; a button skips either. The count borrows the random
// seed's first word but always ends, so any value is safe (Match Viewer).
const introWait = numberPart([site(0x17aac, '31FC'), site(0xfee2c, '31FC')], NO_HACKS.introWait)

// ------------------------------------------------------------ puck friction
// moveq #9,d2 at $AC1C: anything with its deceleration-off flag on the ice
// loses 1/512 of its speed a frame (a skater, moveq #6 at $AC10, 1/64): the
// puck always, a player receiving a pass, and a skater with the runaway-speed
// bug. Nothing else reads it, and there is no friction in the air (Match
// Viewer). From chaos's forum post, play-tested there.
const FRICTION_AT = 0xac1c
const puckFriction: Part<number> = {
  detect: (rom) => (rom[FRICTION_AT] === 0x74 && rom[FRICTION_AT + 1] >= 1 && rom[FRICTION_AT + 1] <= 12 ? rom[FRICTION_AT + 1] : undefined),
  remove: (rom) => void (rom[FRICTION_AT + 1] = NO_HACKS.puckFriction),
  apply: (work, value) => void (work.rom[FRICTION_AT + 1] = value),
}

// ------------------------------------------------------------- penalty time
// penalty94's .Sa, sending a player to the box: ext.w d2 (his penalty's
// minutes, from the penalty table); mulu.w #$3C,d2; bset #$D,d2: the box
// time, in seconds of the game clock, is the minutes times 60. This is the
// only place minutes become time. The minutes themselves still go into the
// penalty minutes statistics, and the 5-minute test for coincidental majors
// reads them, not the time. The time word keeps flags from bit 12 up, so a
// penalty must stay under 4096 seconds: with up to 255 seconds a minute, any
// penalty of 16 minutes or less does.
const PENALTY_TIME_AT = 0x1230c
const penaltySeconds: Part<number> = {
  detect(rom) {
    if (!is(rom, PENALTY_TIME_AT, bytes('4882 C4FC')) || !is(rom, PENALTY_TIME_AT + 6, bytes('08C2 000D'))) return undefined
    const value = readU16(rom, PENALTY_TIME_AT + 4)
    return value >= 1 && value <= 255 ? value : undefined
  },
  remove: (rom) => writeU16(rom, PENALTY_TIME_AT + 4, NO_HACKS.penaltySeconds),
  apply: (work, value) => writeU16(work.rom, PENALTY_TIME_AT + 4, value),
}

// -------------------------------------------------------------- puck colours
// Frames 395 to 404, the puck and its flip, are one piece each: X, Y, tile,
// then the attribute word, whose high byte at $A1670 to $A16B8 (every 8)
// holds the flips and the palette, bits 5 and 6: the rink's colours (the
// original), the crowd's, the home team's or the visitors' (AdamCatalyst's
// forum post, the pieces placed by Match Viewer). The shadow is left alone.
const PUCK_ATTRIBUTES = Array.from({ length: 10 }, (_, i) => 0xa1670 + i * 8)
const PUCK_PALETTES: Record<PuckColours, number> = { rink: 0x00, crowd: 0x20, home: 0x40, away: 0x60 }
const PUCK_FLIPS = [0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x08, 0x08, 0x08, 0x08]
const puckColours: Part<PuckColours> = {
  detect(rom) {
    if (!PUCK_ATTRIBUTES.every((at, i) => (rom[at] & ~0x60) === PUCK_FLIPS[i])) return undefined
    const bits = rom[PUCK_ATTRIBUTES[0]] & 0x60
    if (!PUCK_ATTRIBUTES.every((at) => (rom[at] & 0x60) === bits)) return undefined
    return (Object.keys(PUCK_PALETTES) as PuckColours[]).find((key) => PUCK_PALETTES[key] === bits)
  },
  remove: (rom) => PUCK_ATTRIBUTES.forEach((at, i) => void (rom[at] = PUCK_FLIPS[i])),
  apply: (work, value) => PUCK_ATTRIBUTES.forEach((at, i) => void (work.rom[at] = PUCK_FLIPS[i] | PUCK_PALETTES[value])),
}

// --------------------------------------------------------------- net colours
// Frames 405 (the bottom net, 4 pieces) and 406 (the top net, 2 pieces) are
// the six pieces from $A16BA; each attribute word's high byte, $A16C0 to
// $A16E8 (every 8), holds the flips and the palette as the puck's do
// (clockwise's forum post moved them to the crowd's colours for red posts;
// the pieces placed by Match Viewer). Both nets take the same colours.
const NET_ATTRIBUTES = Array.from({ length: 6 }, (_, i) => 0xa16c0 + i * 8)
const NET_FLIPS = [0x00, 0x08, 0x00, 0x08, 0x00, 0x08]
const netColours: Part<PuckColours> = {
  detect(rom) {
    if (!NET_ATTRIBUTES.every((at, i) => (rom[at] & ~0x60) === NET_FLIPS[i])) return undefined
    const bits = rom[NET_ATTRIBUTES[0]] & 0x60
    if (!NET_ATTRIBUTES.every((at) => (rom[at] & 0x60) === bits)) return undefined
    return (Object.keys(PUCK_PALETTES) as PuckColours[]).find((key) => PUCK_PALETTES[key] === bits)
  },
  remove: (rom) => NET_ATTRIBUTES.forEach((at, i) => void (rom[at] = NET_FLIPS[i])),
  apply: (work, value) => NET_ATTRIBUTES.forEach((at, i) => void (work.rom[at] = NET_FLIPS[i] | PUCK_PALETTES[value])),
}

// ---------------------------------------------------------------- green fan
// Two tiles of the sideboards' tile map put back a fan's arm and leg, from
// tiles still in the ROM (kingraph's forum post): $BDEAE 0063 to 206A, and
// $BDEEE 006E to 2074. Several league ROMs have it.
const GREEN_FAN = [
  { at: 0xbdeae, original: bytes('0063'), hacked: bytes('206A') },
  { at: 0xbdeee, original: bytes('006E'), hacked: bytes('2074') },
]
const greenFan: Part<boolean> = {
  detect: (rom) => (GREEN_FAN.every((s) => is(rom, s.at, s.original)) ? false : GREEN_FAN.every((s) => is(rom, s.at, s.hacked)) ? true : undefined),
  remove: (rom) => GREEN_FAN.forEach((s) => rom.set(s.original, s.at)),
  apply: (work, value) => void (value && GREEN_FAN.forEach((s) => work.rom.set(s.hacked, s.at))),
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
  // The knockdown hook counts exactly when the injury risk is in.
  const hit = hitHook.detect(rom)
  const risk = injuryRisk.detect(rom)
  const injury = risk && hit && hit.counting === risk.bonus > 0 ? risk : undefined
  const choices: HackChoices = {
    weightFix: found('weightFix', weightFix.detect(rom), NO_HACKS.weightFix),
    bodychecks: found('bodychecks', bodychecks.detect(rom), NO_HACKS.bodychecks),
    secondAssist: found('secondAssist', secondAssist.detect(rom), NO_HACKS.secondAssist),
    oneTimerAssist: found('oneTimerAssist', oneTimerAssist.detect(rom), NO_HACKS.oneTimerAssist),
    regainAssist: found('regainAssist', regainAssist.detect(rom), NO_HACKS.regainAssist),
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
    openNetFix: found('openNetFix', openNetFix.detect(rom), NO_HACKS.openNetFix),
    repeatCheckFix: found('repeatCheckFix', repeatCheckFix.detect(rom), NO_HACKS.repeatCheckFix),
    fighting: found('fighting', fightState(rom), NO_HACKS.fighting),
    faceoffFix: found('faceoffFix', faceoffFix.detect(rom), NO_HACKS.faceoffFix),
    runawayFix: found('runawayFix', runawayFix.detect(rom), NO_HACKS.runawayFix),
    penaltyShotTableFix: found('penaltyShotTableFix', penaltyShotTableFix.detect(rom), NO_HACKS.penaltyShotTableFix),
    penaltyShotFixes: found('penaltyShotFixes', penaltyShotFixes.detect(rom), NO_HACKS.penaltyShotFixes),
    goaliePullFix: found('goaliePullFix', goaliePullFix.detect(rom), NO_HACKS.goaliePullFix),
    blindRingFix: found('blindRingFix', blindRingFix.detect(rom), NO_HACKS.blindRingFix),
    snipingFix: found('snipingFix', snipingFix.detect(rom), NO_HACKS.snipingFix),
    awarenessFix: found('awarenessFix', awarenessFix.detect(rom), NO_HACKS.awarenessFix),
    crowdFix: found('crowdFix', crowdFix.detect(rom), NO_HACKS.crowdFix),
    stickShots: found('stickShots', stickShots.detect(rom), NO_HACKS.stickShots),
    goalieHold: found('goalieHold', goalieHold.detect(rom), NO_HACKS.goalieHold),
    goalieWidth: NO_HACKS.goalieWidth,
    goalieOut: NO_HACKS.goalieOut,
    goalieLine: found('goalieLine', goalieLine.detect(rom), NO_HACKS.goalieLine),
    stamina: found('stamina', stamina.detect(rom), NO_HACKS.stamina),
    energyDrain: found('energyDrain', energyDrain.detect(rom), NO_HACKS.energyDrain),
    energyRecovery: found('energyRecovery', energyRecovery.detect(rom), NO_HACKS.energyRecovery),
    noSkatingDrain: found('noSkatingDrain', noSkatingDrain.detect(rom), NO_HACKS.noSkatingDrain),
    burstEnergy: found('burstEnergy', burstEnergy.detect(rom), NO_HACKS.burstEnergy),
    speedBurst: found('speedBurst', speedBurst.detect(rom), NO_HACKS.speedBurst),
    turnRate: found('turnRate', turnRate.detect(rom), NO_HACKS.turnRate),
    realTime: found('clock', clock.detect(rom), NO_HACKS.realTime),
    injuries: found('injuries', injuries.detect(rom), NO_HACKS.injuries),
    hotColdRange: found('hotColdRange', hotColdRange.detect(rom), NO_HACKS.hotColdRange),
    noIcing: found('noIcing', noIcing.detect(rom), NO_HACKS.noIcing),
    hybridIcing: found('hybridIcing', hybridIcing.detect(rom), NO_HACKS.hybridIcing),
    delayedCalls: found('delayedCalls', delayedCalls.detect(rom), NO_HACKS.delayedCalls),
    threeOnThree: found('threeOnThree', threeOnThree.detect(rom), NO_HACKS.threeOnThree),
    bCheckPenaltiesOff: found('bCheckPenaltiesOff', bCheckPenaltiesOff.detect(rom), NO_HACKS.bCheckPenaltiesOff),
    goalieDelay: found('goalieDelay', goalieDelay.detect(rom), NO_HACKS.goalieDelay),
    fewerSkaterLines: found('fewerSkaterLines', fewerSkaterLines.detect(rom), NO_HACKS.fewerSkaterLines),
    introWait: found('introWait', introWait.detect(rom), NO_HACKS.introWait),
    fourthPeriodOvertime: found('fourthPeriodOvertime', fourthPeriodOvertime.detect(rom), NO_HACKS.fourthPeriodOvertime),
    seasonTies: found('seasonTies', seasonTies.detect(rom), NO_HACKS.seasonTies),
    anyPosition: found('anyPosition', anyPosition.detect(rom), NO_HACKS.anyPosition),
    hitEnergy: found('hitEnergy', hit?.energy, NO_HACKS.hitEnergy),
    holdEnergy: found('holdEnergy', holdEnergy.detect(rom), NO_HACKS.holdEnergy),
    injuryBonus: found('injuryBonus', injury?.bonus, NO_HACKS.injuryBonus),
    injuryCap: found('injuryCap', injury?.cap, NO_HACKS.injuryCap),
    puckFriction: found('puckFriction', puckFriction.detect(rom), NO_HACKS.puckFriction),
    penaltySeconds: found('penaltySeconds', penaltySeconds.detect(rom), NO_HACKS.penaltySeconds),
    puckColours: found('puckColours', puckColours.detect(rom), NO_HACKS.puckColours),
    netColours: found('netColours', netColours.detect(rom), NO_HACKS.netColours),
    greenFan: found('greenFan', greenFan.detect(rom), NO_HACKS.greenFan),
    // With the long fall the injury animation is not the original's, so the blood cannot go in: off, not unknown.
    headBleeding: found('headBleeding', bloodChoice(rom) ?? (injuries.detect(rom) === 'longFall' ? false : undefined), NO_HACKS.headBleeding),
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
  if (wanted.injuries === 'longFall' && wanted.headBleeding) {
    throw new HackError('A long fall instead of an injury and head bleeding cannot both be on: the blood is drawn in the injury animation the long fall turns into a fall that gets up, and with no injuries it would never show.')
  }
  const { unknown, choices } = detectHacks(rom)
  const work: Work = { rom: rom.slice() }
  // Fighting that stays in is left as it is, but for its menu's starting
  // choice. Head bleeding goes on top of everything: it comes out first where
  // it is not wanted, or where fighting (whose frames it goes into) changes,
  // and goes in last.
  const fightKept = choices.fighting !== 'none' && wanted.fighting !== 'none'
  const bloodKnown = !unknown.includes('headBleeding')
  // Read afresh: work.rom changes in place below, and a state remembered for it would go stale.
  if (bloodKnown && bloodInNow(rom) && (!wanted.headBleeding || (!fightKept && choices.fighting !== wanted.fighting))) work.rom = bloodTakenOut(work.rom)
  const removeFight = () => {
    if (fightKept) return
    work.rom = withoutFight(work.rom)
  }
  const putFight = () => {
    if (fightKept && wanted.fighting !== 'none') {
      work.rom = withFightChoice(work.rom, wanted.fighting)
      return
    }
    applyFight(work, wanted.fighting)
  }
  const steps: [HackPart, () => void, () => void][] = [
    ['weightFix', () => weightFix.remove(work.rom), () => weightFix.apply(work, wanted.weightFix)],
    ['bodychecks', () => bodychecks.remove(work.rom), () => bodychecks.apply(work, wanted.bodychecks)],
    ['baseWeight', () => baseWeight.remove(work.rom), () => baseWeight.apply(work, wanted.baseWeight)],
    ['secondAssist', () => secondAssist.remove(work.rom), () => secondAssist.apply(work, wanted.secondAssist)],
    ['oneTimerAssist', () => oneTimerAssist.remove(work.rom), () => oneTimerAssist.apply(work, wanted.oneTimerAssist, wanted.secondAssist)],
    ['regainAssist', () => regainAssist.remove(work.rom), () => regainAssist.apply(work, wanted.regainAssist)],
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
    ['noSkatingDrain', () => noSkatingDrain.remove(work.rom), () => noSkatingDrain.apply(work, wanted.noSkatingDrain)],
    ['burstEnergy', () => burstEnergy.remove(work.rom), () => burstEnergy.apply(work, wanted.burstEnergy)],
    ['speedBurst', () => speedBurst.remove(work.rom), () => speedBurst.apply(work, wanted.speedBurst)],
    ['turnRate', () => turnRate.remove(work.rom), () => turnRate.apply(work, wanted.turnRate)],
    ['clock', () => clock.remove(work.rom), () => clock.apply(work, wanted.realTime)],
    ['passFix', () => passFix.remove(work.rom), () => passFix.apply(work, wanted.passFix)],
    ['openNetFix', () => openNetFix.remove(work.rom), () => openNetFix.apply(work, wanted.openNetFix)],
    ['repeatCheckFix', () => repeatCheckFix.remove(work.rom), () => repeatCheckFix.apply(work, wanted.repeatCheckFix)],
    ['faceoffFix', () => faceoffFix.remove(work.rom), () => faceoffFix.apply(work, wanted.faceoffFix)],
    ['runawayFix', () => runawayFix.remove(work.rom), () => runawayFix.apply(work, wanted.runawayFix)],
    ['penaltyShotTableFix', () => penaltyShotTableFix.remove(work.rom), () => penaltyShotTableFix.apply(work, wanted.penaltyShotTableFix)],
    ['penaltyShotFixes', () => penaltyShotFixes.remove(work.rom), () => penaltyShotFixes.apply(work, wanted.penaltyShotFixes)],
    ['goaliePullFix', () => goaliePullFix.remove(work.rom), () => goaliePullFix.apply(work, wanted.goaliePullFix)],
    ['blindRingFix', () => blindRingFix.remove(work.rom), () => blindRingFix.apply(work, wanted.blindRingFix)],
    ['snipingFix', () => snipingFix.remove(work.rom), () => snipingFix.apply(work, wanted.snipingFix)],
    ['awarenessFix', () => awarenessFix.remove(work.rom), () => awarenessFix.apply(work, wanted.awarenessFix)],
    ['crowdFix', () => crowdFix.remove(work.rom), () => crowdFix.apply(work, wanted.crowdFix)],
    ['stickShots', () => stickShots.remove(work.rom), () => stickShots.apply(work, wanted.stickShots)],
    ['injuries', () => injuries.remove(work.rom), () => injuries.apply(work, wanted.injuries)],
    ['hotColdRange', () => hotColdRange.remove(work.rom), () => hotColdRange.apply(work, wanted.hotColdRange)],
    ['noIcing', () => noIcing.remove(work.rom), () => noIcing.apply(work, wanted.noIcing)],
    ['hybridIcing', () => hybridIcing.remove(work.rom), () => hybridIcing.apply(work, wanted.hybridIcing)],
    ['delayedCalls', () => delayedCalls.remove(work.rom), () => delayedCalls.apply(work, wanted.delayedCalls)],
    ['threeOnThree', () => threeOnThree.remove(work.rom), () => threeOnThree.apply(work, wanted.threeOnThree)],
    ['bCheckPenaltiesOff', () => bCheckPenaltiesOff.remove(work.rom), () => bCheckPenaltiesOff.apply(work, wanted.bCheckPenaltiesOff)],
    ['goalieDelay', () => goalieDelay.remove(work.rom), () => goalieDelay.apply(work, wanted.goalieDelay)],
    ['fewerSkaterLines', () => fewerSkaterLines.remove(work.rom), () => fewerSkaterLines.apply(work, wanted.fewerSkaterLines)],
    ['introWait', () => introWait.remove(work.rom), () => introWait.apply(work, wanted.introWait)],
    ['fourthPeriodOvertime', () => fourthPeriodOvertime.remove(work.rom), () => fourthPeriodOvertime.apply(work, wanted.fourthPeriodOvertime)],
    ['seasonTies', () => seasonTies.remove(work.rom), () => seasonTies.apply(work, wanted.seasonTies)],
    ['anyPosition', () => anyPosition.remove(work.rom), () => anyPosition.apply(work, wanted.anyPosition)],
    ['hitEnergy', () => hitHook.remove(work.rom), () => hitHook.apply(work, { energy: wanted.hitEnergy, counting: wanted.injuryBonus > 0 })],
    ['injuryBonus', () => injuryRisk.remove(work.rom), () => injuryRisk.apply(work, { bonus: wanted.injuryBonus, cap: wanted.injuryCap })],
    ['holdEnergy', () => holdEnergy.remove(work.rom), () => holdEnergy.apply(work, wanted.holdEnergy)],
    ['puckFriction', () => puckFriction.remove(work.rom), () => puckFriction.apply(work, wanted.puckFriction)],
    ['penaltySeconds', () => penaltySeconds.remove(work.rom), () => penaltySeconds.apply(work, wanted.penaltySeconds)],
    ['puckColours', () => puckColours.remove(work.rom), () => puckColours.apply(work, wanted.puckColours)],
    ['netColours', () => netColours.remove(work.rom), () => netColours.apply(work, wanted.netColours)],
    ['greenFan', () => greenFan.remove(work.rom), () => greenFan.apply(work, wanted.greenFan)],
    // Last, as it makes the ROM 3 MB; what the others add goes below 2 MB.
    ['fighting', removeFight, putFight],
  ]
  // An earlier version of a hack that is being kept is not touched either.
  if (wanted.bodychecks === 'earlier' && choices.bodychecks !== 'earlier') throw new HackError('This ROM does not have the earlier bodycheck statistics to keep.')
  const kept: HackPart[] = wanted.bodychecks === 'earlier' ? ['bodychecks'] : []
  const known = steps.filter(([part]) => !unknown.includes(part) && !kept.includes(part))
  for (const [, remove] of known) remove()
  for (const [, , apply] of known) apply()
  if (bloodKnown && wanted.headBleeding && !bloodInNow(work.rom)) work.rom = bloodAdded(work.rom.slice())
  // A fresh array, so nothing remembered about the one changed in place goes with it.
  return work.rom.slice()
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
  oneTimerAssist: true,
  regainAssist: true,
  aggressionFix: true,
  ppPkFix: true,
  comebackFix: true,
  passFix: true,
  runawayFix: true,
  penaltyShotTableFix: true,
  penaltyShotFixes: true,
  stickShots: true,
}

// `choices` with the recommended fixes, except where this ROM's code is not known.
export function withRecommendedFixes(choices: HackChoices, unknown: HackPart[]): HackChoices {
  const next = { ...choices }
  for (const [key, value] of Object.entries(RECOMMENDED_FIXES) as [keyof HackChoices, never][]) {
    if (!unknown.includes(HACK_PARTS[key])) next[key] = value
  }
  return next
}

// The order the Hacks page has them in (core/hackgroups.ts).
const PAGE_ORDER: (keyof HackChoices)[] = GENESIS_HACK_GROUPS.flatMap((group) => group.hacks)

// What this ROM has, as a Discord post for a league's owners: each hack that
// differs from the original game, and what the editor cannot read.
// `extra`: more lines for the post, such as its pictures (hacksheet.ts).
export function hacksForDiscord(state: HackState, name: string, extra: string[] = []): string {
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
    else if (typeof value === 'number' && key !== 'speedBurst' && key !== 'penaltySeconds') lines.push(`- **${HACK_TITLES[key]}**: ${hackValueText(key, state.choices)} (the original game has ${hackValueText(key, NO_HACKS)})`)
    else lines.push(`- **${HACK_TITLES[key]}**: ${hackValueText(key, state.choices)}`)
  }
  return discordPost(name, [...lines, ...extra], unread)
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
  oneTimerAssist: 'One-timer assist fix',
  regainAssist: 'Regained-puck assist fix',
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
  openNetFix: 'One-timer open net fix',
  repeatCheckFix: 'Repeated checks fix',
  fighting: 'Fighting',
  seasonTies: 'Tied regular-season games',
  faceoffFix: 'Faceoff spot fix',
  runawayFix: 'Runaway speed fix',
  penaltyShotTableFix: 'Penalty shot table fix',
  penaltyShotFixes: 'Penalty shot fixes',
  goaliePullFix: 'Computer goalie pull fix',
  blindRingFix: 'Close the five-hole blind ring',
  snipingFix: 'Pulled-goalie sniping fix',
  awarenessFix: "Computer forwards' awareness fix",
  crowdFix: 'Crowd bonus fix',
  stickShots: 'Count stick deflections as shots',
  goalieHold: 'Goalie hold time',
  goalieWidth: 'Goalie range to each side',
  goalieOut: 'Goalie range up the ice',
  goalieLine: 'Goalie whistle line',
  stamina: 'Unlimited stamina',
  energyDrain: 'Energy lost on the ice',
  energyRecovery: 'Energy gained on the bench',
  noSkatingDrain: 'Skating costs no energy',
  burstEnergy: 'Energy a C-button burst costs',
  speedBurst: 'Speed burst',
  turnRate: 'Stopping and turning',
  realTime: 'Real-time clock',
  injuries: 'Injuries',
  hotColdRange: 'Hot and cold range',
  noIcing: 'No icing',
  hybridIcing: 'Hybrid icing',
  delayedCalls: 'Calls during a delayed penalty',
  threeOnThree: '3 on 3 overtime',
  bCheckPenaltiesOff: 'B-checks with penalties off',
  goalieDelay: 'Goalie control delay',
  fewerSkaterLines: 'Edit Lines for fewer skaters',
  introWait: 'Intro screen wait',
  fourthPeriodOvertime: 'Fourth period length, with its own overtime',
  anyPosition: 'Any skater at any position in Edit Lines',
  hitEnergy: 'Energy lost when knocked down',
  injuryBonus: 'Injury risk added by each knockdown',
  injuryCap: 'Most injury risk knockdowns can add',
  holdEnergy: 'Energy lost when held or hooked',
  puckFriction: 'Puck friction',
  penaltySeconds: 'Penalty time',
  puckColours: 'Puck colours',
  netColours: 'Net colours',
  greenFan: 'The fan in green',
  headBleeding: 'Head bleeding',
}

// Which part's code each choice is kept in.
export const HACK_PARTS: Record<keyof HackChoices, HackPart> = {
  weightFix: 'weightFix',
  bodychecks: 'bodychecks',
  secondAssist: 'secondAssist',
  oneTimerAssist: 'oneTimerAssist',
  regainAssist: 'regainAssist',
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
  openNetFix: 'openNetFix',
  repeatCheckFix: 'repeatCheckFix',
  fighting: 'fighting',
  seasonTies: 'seasonTies',
  faceoffFix: 'faceoffFix',
  runawayFix: 'runawayFix',
  penaltyShotTableFix: 'penaltyShotTableFix',
  penaltyShotFixes: 'penaltyShotFixes',
  goaliePullFix: 'goaliePullFix',
  blindRingFix: 'blindRingFix',
  snipingFix: 'snipingFix',
  awarenessFix: 'awarenessFix',
  crowdFix: 'crowdFix',
  stickShots: 'stickShots',
  goalieHold: 'goalieHold',
  goalieWidth: 'goalieBox',
  goalieOut: 'goalieBox',
  goalieLine: 'goalieLine',
  stamina: 'stamina',
  energyDrain: 'energyDrain',
  energyRecovery: 'energyRecovery',
  noSkatingDrain: 'noSkatingDrain',
  burstEnergy: 'burstEnergy',
  speedBurst: 'speedBurst',
  turnRate: 'turnRate',
  realTime: 'clock',
  injuries: 'injuries',
  hotColdRange: 'hotColdRange',
  noIcing: 'noIcing',
  hybridIcing: 'hybridIcing',
  delayedCalls: 'delayedCalls',
  threeOnThree: 'threeOnThree',
  bCheckPenaltiesOff: 'bCheckPenaltiesOff',
  goalieDelay: 'goalieDelay',
  fewerSkaterLines: 'fewerSkaterLines',
  introWait: 'introWait',
  fourthPeriodOvertime: 'fourthPeriodOvertime',
  anyPosition: 'anyPosition',
  hitEnergy: 'hitEnergy',
  injuryBonus: 'injuryBonus',
  injuryCap: 'injuryCap',
  holdEnergy: 'holdEnergy',
  puckFriction: 'puckFriction',
  penaltySeconds: 'penaltySeconds',
  puckColours: 'puckColours',
  netColours: 'netColours',
  greenFan: 'greenFan',
  headBleeding: 'headBleeding',
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
  if (key === 'penaltySeconds') return penaltyTimeText(choices.penaltySeconds)
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
