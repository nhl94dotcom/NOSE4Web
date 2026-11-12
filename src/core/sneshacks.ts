import { penaltyTimeText } from './penaltytime'
import type { RomProject } from './rom'
import { discordPost } from './discord'
import { findCode, findCodeAll, loRomAddress, loRomBank, loRomOffset, snesCodeInPlace, snesHomeTeamAddress, splitSnesFile } from './snes'
import { SNES_FIGHT_BONUS_RANGE, SNES_FIGHT_SHARED_SITE, snesFightBlocked, snesFightCountJump, snesFightState, withoutSnesFight, withSnesFight } from './snesfight'
import { snesPeriodCountPlace } from './snesmenu'
import { refreshSnesSettings } from './snessettings'

// Hacks for NHL '94 on the SNES, from the community's disassembly,
// NHL94SNESVault (github.com/Mhopkinsinc/NHL94SNESVault), whose patches were
// written to be put into a copy of the original ROM. Each is a set of places
// in the ROM with the original game's bytes and the hack's. A hack is
// recognised only where every one of its places holds one set or the other;
// anything else is some other change, and the hack is left alone. New code
// goes into room the original game leaves unused (0xFF), which it is put back
// to when the hack is taken out.

export type SnesHack =
  | 'hotColdFix'
  | 'ppPkFix'
  | 'defenceControl'
  | 'oneMinutePenalties'
  | 'thirtySecondPeriods'
  | 'noInterference'
  | 'noPenaltyShots'
  | 'noGoalPosts'
  | 'skipEaIntro'
  | 'skipPucksIntro'
  | 'faceoffFix'
  | 'penaltyShotFixes'
  | 'extraAttackerFix'
  | 'yButtonFix'
  | 'comebackFix'
  | 'awarenessFix'
  | 'secondAssist'
  | 'stickShots'
  | 'forwardsAndDefence'
  | 'showMaxBoost'
  | 'manualPullGoalie'
  | 'regainAssist'
  | 'fourthPeriodOvertime'
  | 'hitEnergy'
  | 'holdEnergy'
  | 'injuryBonus'
  | 'noSkatingDrain'
  | 'freeBurst'
  | 'energySpeed'
  | 'goaliePoke'
  | 'seasonOvertime'
  | 'penaltyTime'
  | 'fighting'
  | 'injuries'
  | 'seasonShootout'

interface Site {
  // The game's address.
  at: number
  original: string
  hacked: string
}

const free = (count: number) => 'FF'.repeat(count)
const hex16 = (value: number) => [value & 0xff, value >> 8].map((b) => b.toString(16).padStart(2, '0')).join('')
const hex24 = (value: number) => hex16(value & 0xffff) + ((value >> 16) & 0xff).toString(16).padStart(2, '0')

// Faceoffs off the dots, as on the Genesis (see hacks.ts): Stop4Pen takes a
// raw spot and puts it on a dot only past the hash marks. The fix replaces
// that step with the NHL rules: a goal at centre; a penalty (codes $14 to
// $2E on the SNES, but not $16, an injury from a hit with no penalty) in the
// offending team's own end, at the dot on the side of
// the puck; anything else past a blue line at that end's dot on the puck's
// side, and in the neutral zone at the nearest neutral dot. limitfo runs as
// before. The stoppage is the newest entry in PenBuf, not the one a0 points
// after, which a roughing call from a hit (FallDown) leaves elsewhere. The 94 bytes from the raw spot to the call of limitfo become a call
// to the new code and a jump to that call. Stop4Pen keeps d0, d1 and a0 at
// $A5 and $A9 in the direct page in every build; PenBuf, pfgoal (the
// player's end) and the faceoff spot fox / foy move with the build.
const FACEOFF_REGION = 94
const faceoffOriginal = (fox: number, foy: number) =>
  'A5A5 85C5 38 E94600 3005 A94600 85A5 A5A5 38 E9BAFF 1005 A9BAFF 85A5 A5A9 38 E9A600 3013 A9CE00 85A9 A94600 85A5 A5C5 1005 ' +
  `A9BAFF 85A5 A5A9 38 E95AFF 1013 A932FF 85A9 A94600 85A5 A5C5 1005 A9BAFF 85A5 A5A5 8F${hex24(fox)} A5A9 8F${hex24(foy)}`
const faceoffCall = (to: number) => `20${hex16(to)} 80${(FACEOFF_REGION - 5).toString(16)} ${'EA'.repeat(FACEOFF_REGION - 5)}`
const faceoffCode = (penBuf: number, pfgoal: number, fox: number, foy: number) =>
  `A00000 B9${hex16(penBuf)} F004 C8 C8 80F7 C00000 F034 88 88 B9${hex16(penBuf)} 29FF00 C90E00 F059 C91400 9022 C92F00 B01D ` +
  `C91600 F018 B9${hex16(penBuf)} EB 297F00 0A A8 A9CE00 85A9 B9${hex16(pfgoal)} F005 A932FF 85A9 A5A5 3005 A94600 8003 A9BAFF 85A5 ` +
  `A5A9 300F C95900 9005 A9CE00 8012 A94100 800D C9A8FF B005 A932FF 8003 A9BFFF 85A9 8004 64A5 64A9 A5A5 8F${hex24(fox)} ` +
  `A5A9 8F${hex24(foy)} 60`
// Where the new code keeps fox's address, to find it in a ROM that has the hack.
const FACEOFF_FOX_AT = 0x7e
// PenBuf in the original game; it moves with the game's other variables.
const PEN_BUF = 0x15de
const minutes = (at: number): Site => ({ at, original: '02', hacked: '01' })

// Places by the original game's addresses. A hack not listed is always found
// by the code around it (see RELOCATED), as in a ROM whose code has moved.
const SITES: Partial<Record<SnesHack, Site[]>> = {
  // The game divides each player's hot or cold value by four with an unsigned
  // shift, so a cold value becomes a large one and puts the rating at the
  // maximum. The fix divides it keeping its sign.
  hotColdFix: [
    { at: 0x9fd234, original: 'B9121A 4A 4A', hacked: '2032FB EA EA' },
    {
      at: 0x9ffb32,
      original: free(17),
      hacked: 'B9121A 1009 49FF 1A 4A 4A 49FF 1A 60 4A 4A 60',
    },
  ],
  // The game adds the low half of a team's power play and penalty kill byte
  // on the power play and takes the high half off on the penalty kill, the
  // other way round from the data (as on the Genesis). The fix, the editor's
  // own, rewrites the two in the same 32 bytes, with the branches to them:
  // the power play takes the high half (LSR x4, AND #$F) and the penalty
  // kill the low half (AND #$F), each then stored as before.
  ppPkFix: [
    {
      at: 0x9fcf9d,
      original: 'F00D A00100 B789 290F00 8D0B0D 8013 A00100 B789 4A4A4A4A 290F00 49FFFF 1A 8D090D',
      hacked: 'F011 A00100 B789 4A4A4A4A 290F00 8D0B0D 800F A00100 B789 290F00 49FFFF 1A 8D090D',
    },
  ],
  // Turns defence control on for both teams at the start of every game.
  defenceControl: [
    { at: 0x9f837c, original: '22B2C69F', hacked: '2024FB EA' },
    { at: 0x9ffb24, original: free(14), hacked: '22B2C69F A90100 8D941C 8D961C 60' },
  ],
  // Minor penalties of one minute: each minor's length in the penalty table,
  // and the clock code taught to read a one-minute one.
  oneMinutePenalties: [
    ...[0x80d4c7, 0x80d4e9, 0x80d50b, 0x80d52b, 0x80d54b, 0x80d56b, 0x80d58c, 0x80d5b1, 0x80d5c9].map(minutes),
    { at: 0x9eb417, original: '29FF00', hacked: '4C5BFB' },
    { at: 0x9efb5b, original: free(19), hacked: 'C90104 F005 C9010A D003 4C21B4 29FF00 4C1AB4' },
  ],
  // The main menu's period lengths include a hidden fourth: 30 seconds.
  thirtySecondPeriods: [{ at: 0x9dacd7, original: '0300', hacked: '0400' }],
  noInterference: [{ at: 0x9ebaa8, original: '30BD', hacked: '80BD' }],
  noPenaltyShots: [{ at: 0x9ec063, original: 'D003', hacked: 'D008' }],
  // A puck that reaches the net between the posts is always a goal.
  noGoalPosts: [{ at: 0x9e9230, original: 'ADF90D', hacked: '4C0F92' }],
  skipEaIntro: [{ at: 0x9f8289, original: '2236F49F', hacked: 'EAEAEAEA' }],
  skipPucksIntro: [{ at: 0x9f82c0, original: '2218B19D', hacked: 'EAEAEAEA' }],
  // NHL94SNESVault's ExtraAttackerFix (issue 10), as it has it: in Edit Lines,
  // picking a line's extra attacker for one of its positions puts him in both
  // and drops the player he replaced, since the game's own swap checks look at
  // neighbouring places only (Match Viewer tested it in the game). Edit Lines'
  // test of the line position (cmp #1) becomes a call to the Vault's code,
  // which finds the player moved among the line's places, the extra attacker's
  // too, and puts him back, then makes that test. Its code uses the original
  // game's work memory, so it is offered only in ROMs laid out as the original.
  // The Vault's searches the line's own number of rows and the extra
  // attacker's place after them (lineslots + 1 places from lineslots down),
  // which on the penalty-kill lines, of 4 rows, ends at the unused RW place
  // and never reaches the extra attacker (Match Viewer). NOSE4Web's searches
  // a fixed 6 places on every line, from the extra attacker's down (ADC #5
  // and LDX #6 / NOP for ADC lineslots and LDX lineslots / INX).
  extraAttackerFix: [
    { at: 0x9b8c96, original: 'C90100', hacked: '2078CE' },
    { at: 0x9bce78, original: free(66), hacked: '48 A5A5 18 690500 8595 A20600 EA A595 20728D CF8F1D9F F007 C695 CA D0F0 801E CA A5A5 18 6D9F1D ED8B1D 8595 20728D 48 A5A5 86AF 18 6DAF00 8595 68 207C8D 68 C90100 60' },
  ],
  // NHL94SNESVault's ForwardsAndDefenseHack: Edit Lines lists every skater,
  // forwards and defencemen, for every position. Where it counts the players
  // to list for a position, it counts the defencemen and the forwards
  // together. It needs the extra attacker fix, whose swaps it relies on, and
  // its code follows that fix's.
  forwardsAndDefence: [
    { at: 0x9b8e1a, original: '10 21 2200939B', hacked: 'EA EA EA 4CBACE' },
    { at: 0x9bceba, original: free(33), hacked: '2200939B 8DA31D 2200D39E A5A5 8DAB1D 22DC929B 18 6DA31D 8DA31D ADAB1D 4C3B8E' },
  ],
  // NHL94SNESVault's ShowMaxBoost, for a ROM with the hot and cold bug: where
  // the bug puts a rating at the maximum, Edit Lines and the team roster show
  // it as 100, as it plays, not the low value the game works out for display.
  // NOSE4Web's version tests the stored hot or cold byte ($16), as the game
  // in play does (any of $80 or more is maxed), where the Vault's tests the
  // value scaled for display ($14), which rounds a cold -1 to 0 and so missed
  // about 1 rating in 28 (Match Viewer). $9F:9ABD reloads A from $A5.
  showMaxBoost: [
    { at: 0x9f9a30, original: '4CBD9A', hacked: '4C43FB' },
    { at: 0x9ffb43, original: free(17), hacked: 'A516 C98000 B003 4CBD9A A96400 8DA500 6B' },
  ],
  // NHL94SNESVault's ManualPullGoalie: during play, L and R together pull a
  // team's goalie for an extra attacker, or put him back, with a beep. Where
  // the game reads whether the goalie is in the net, it first checks the pads:
  // the team's pad (player 1 for home, player 2 for away, or the first of
  // them on it) with L and R pressed turns GoalieInNetHmAw over, unless the
  // goalie is off for a penalty. That check runs only every 24 frames, so the
  // Vault's, reading the buttons held then, missed quick taps and turned a long
  // hold over twice (Match Viewer). NOSE4Web's acts on a press: GetNewPresses,
  // once a game loop, ends with a call (in place of its last store, which the
  // new code makes) to code that, for pads 1 and 2, sets a count of 24 loops
  // at $1EF0 or $1EF2 (unused RAM, Match Viewer) when the pad has just pressed
  // L or R and holds exactly L and R, and otherwise counts it down; the check
  // turns the goalie over when its pad's count is set, and clears it. While
  // the game is paused (sflags $15D8 bit 0) both counts are zeroed, as play
  // takes some 37 frames to resume without reading the pads, and a count left
  // from a press in a short pause would otherwise run out in play (Match
  // Viewer).
  manualPullGoalie: [
    { at: 0x9ed0bf, original: 'A491 B9AA17', hacked: '206EFB EA EA' },
    {
      at: 0x9efb6e,
      original: free(87),
      hacked:
        'A20000 AC9100 B9AA17 C900FF D001 60 B9C1FB DD841C F009 E8 E8 E00400 D0F1 802D BDF01E F028 9EF01E EA EA EA ' +
        'B9AA17 F007 C9FFFF F002 8016 49FFFF 99AA17 2207D49F A90070 8564 A90500 227DA180 A491 B9AA17 60 0100 0200',
    },
    { at: 0x9b84d8, original: '8DA20A', hacked: '20DBCE' },
    { at: 0x9bcedb, original: free(63), hacked: '8DA20A AD D815 4A 9007 9CF01E 9CF21E 60 A20000 BDB80A 293000 F013 BD7607 29FF00 C93000 D008 A91800 9DF01E 8009 BDF01E F004 3A 9DF01E E8 E8 E00400 D0D5 60' },
  ],
}

// Earlier versions of hacks, where NOSE4Web's own now differ: those
// NHL94SNESVault puts in, and NOSE4Web's own earlier ones. Recognised as the
// hack, and replaced by NOSE4Web's when asked.
const VAULT_VERSIONS: Partial<Record<SnesHack, Site[][]>> = {
  extraAttackerFix: [[
    { at: 0x9b8c96, original: 'C90100', hacked: '2078CE' },
    { at: 0x9bce78, original: free(66), hacked: '48 A5A5 18 6D9F1D 8595 AE9F1D E8 A595 20728D CF8F1D9F F007 C695 CA D0F0 801E CA A5A5 18 6D9F1D ED8B1D 8595 20728D 48 A5A5 86AF 18 6DAF00 8595 68 207C8D 68 C90100 60' },
  ]],
  showMaxBoost: [[
    { at: 0x9f9a30, original: '4CBD9A', hacked: '4C43FB' },
    { at: 0x9ffb43, original: free(14), hacked: '2414 3003 4CBD9A A96400 8DA500 6B' },
  ]],
  manualPullGoalie: [
    // NOSE4Web's of 9 November 2026, 10:00, which counted presses made in a pause.
    [
      { at: 0x9ed0bf, original: 'A491 B9AA17', hacked: '206EFB EA EA' },
      {
        at: 0x9efb6e,
        original: free(87),
        hacked:
          'A20000 AC9100 B9AA17 C900FF D001 60 B9C1FB DD841C F009 E8 E8 E00400 D0F1 802D BDF01E F028 9EF01E EA EA EA ' +
          'B9AA17 F007 C9FFFF F002 8016 49FFFF 99AA17 2207D49F A90070 8564 A90500 227DA180 A491 B9AA17 60 0100 0200',
      },
      { at: 0x9b84d8, original: '8DA20A', hacked: '20DBCE' },
      { at: 0x9bcedb, original: free(50), hacked: '8DA20A A20000 BDB80A 293000 F013 BD7607 29FF00 C93000 D008 A91800 9DF01E 8009 BDF01E F004 3A 9DF01E E8 E8 E00400 D0D5 60' },
    ],
    // NHL94SNESVault's.
    [
      { at: 0x9ed0bf, original: 'A491 B9AA17', hacked: '206EFB EA EA' },
      {
        at: 0x9efb6e,
        original: free(87),
        hacked:
          'A20000 AC9100 B9AA17 C900FF D001 60 B9C1FB DD841C F009 E8 E8 E00400 D0F1 802D BD7607 29FF00 C93000 D022 ' +
          'B9AA17 F007 C9FFFF F002 8016 49FFFF 99AA17 2207D49F A90070 8564 A90500 227DA180 A491 B9AA17 60 0100 0200',
      },
    ],
  ],
}

export const SNES_HACKS: SnesHack[] = [
  'hotColdFix',
  'ppPkFix',
  'defenceControl',
  'oneMinutePenalties',
  'thirtySecondPeriods',
  'noInterference',
  'noPenaltyShots',
  'noGoalPosts',
  'skipEaIntro',
  'skipPucksIntro',
  'faceoffFix',
  'penaltyShotFixes',
  'extraAttackerFix',
  'yButtonFix',
  'comebackFix',
  'awarenessFix',
  'secondAssist',
  'stickShots',
  'forwardsAndDefence',
  'showMaxBoost',
  'manualPullGoalie',
  'regainAssist',
  'fourthPeriodOvertime',
  'hitEnergy',
  'holdEnergy',
  'injuryBonus',
  'noSkatingDrain',
  'freeBurst',
  'energySpeed',
  'goaliePoke',
  'seasonOvertime',
  'penaltyTime',
  'fighting',
  'injuries',
  'seasonShootout',
]

export const SNES_HACK_TITLES: Record<SnesHack, string> = {
  hotColdFix: 'Hot and cold bug fix',
  ppPkFix: 'Power play and penalty kill fix',
  defenceControl: 'Defence control on',
  oneMinutePenalties: 'One-minute penalties',
  thirtySecondPeriods: '30-second periods',
  noInterference: 'No interference penalties',
  noPenaltyShots: 'No penalty shots',
  noGoalPosts: 'No goal posts',
  skipEaIntro: 'Skip the EA intro',
  skipPucksIntro: 'Skip the flying pucks intro',
  faceoffFix: 'Faceoff spot fix',
  penaltyShotFixes: 'Penalty shot fixes',
  extraAttackerFix: 'Extra attacker fix',
  yButtonFix: 'Y button fix',
  comebackFix: 'Comeback bonus fix',
  awarenessFix: "Computer forwards' awareness fix",
  secondAssist: 'Second-assist bug fix',
  stickShots: 'Count stick deflections as shots',
  forwardsAndDefence: 'Any skater at any position in Edit Lines',
  showMaxBoost: 'Show the maximum boost in Edit Lines',
  manualPullGoalie: 'Pull the goalie with L and R',
  regainAssist: 'Regained-puck assist fix',
  fourthPeriodOvertime: '99-minute overtime on the fourth period length',
  hitEnergy: 'Energy lost when knocked down',
  holdEnergy: 'Energy lost when held or hooked',
  injuryBonus: 'Injury risk added by each knockdown',
  noSkatingDrain: 'Skating costs no energy',
  freeBurst: 'Speed bursts cost no energy',
  energySpeed: "Energy takes all of a skater's speed",
  goaliePoke: 'Goalie poke check reaches the ice',
  seasonOvertime: 'Overtime until a goal in the regular season',
  penaltyTime: 'Penalty time',
  fighting: 'Fighting',
  injuries: 'Injuries',
  seasonShootout: 'A shootout for tied regular-season games',
}

// Hacks that go together, as NHL94SNESVault has them: one that needs another
// on, and two that cannot both be.
// Energy taking all of a skater's speed needs skating to cost nothing: goalies never go to the bench, so the
// drain would slow them more than the original game does (Match Viewer).
const NEEDS: Partial<Record<SnesHack, SnesHack>> = { forwardsAndDefence: 'extraAttackerFix', fourthPeriodOvertime: 'thirtySecondPeriods', energySpeed: 'noSkatingDrain' }
const EXCLUDES: [SnesHack, SnesHack][] = [['showMaxBoost', 'hotColdFix'], ['seasonOvertime', 'seasonShootout']]

// `choices` with `hack` just set to `on`, and the hacks that go with it set to match.
export function withSnesHackChoice(choices: SnesHackChoices, hack: SnesHack, on: boolean): SnesHackChoices {
  const next = { ...choices, [hack]: on }
  for (const [needer, needed] of Object.entries(NEEDS) as [SnesHack, SnesHack][]) {
    if (on && hack === needer) next[needed] = true
    if (!on && hack === needed) next[needer] = false
  }
  for (const pair of EXCLUDES) if (on && pair.includes(hack)) next[pair[0] === hack ? pair[1] : pair[0]] = false
  return next
}

// Why these choices cannot go into a ROM together, if they cannot.
function clash(choices: SnesHackChoices): string | null {
  for (const [needer, needed] of Object.entries(NEEDS) as [SnesHack, SnesHack][]) {
    if (choices[needer] && !choices[needed]) return `${SNES_HACK_TITLES[needer]} needs the ${SNES_HACK_TITLES[needed].toLowerCase()} on.`
  }
  for (const [a, b] of EXCLUDES) if (choices[a] && choices[b]) return `${SNES_HACK_TITLES[a]} and the ${SNES_HACK_TITLES[b].toLowerCase()} cannot both be on.`
  return null
}

export type SnesHackChoices = Record<SnesHack, boolean>

export interface SnesHackState {
  choices: SnesHackChoices
  // Hacks whose places hold something else. They are never changed.
  unknown: SnesHack[]
  // Hacks the ROM has in NHL94SNESVault's version, where NOSE4Web's differs.
  vaultVersions?: SnesHack[]
  // The amount each hack that holds one has, 0 where it is off.
  amounts?: Record<SnesAmount, number>
}

const hexBytes = (text: string) => Uint8Array.from(text.replace(/\s/g, '').match(/../g)!.map((pair) => parseInt(pair, 16)))

// ---------------------------------------------------------- moved code
// ROMs rebuilt from the disassembly (the 32-team build) have the same code
// in other places, calling routines and reading variables at other
// addresses. There each hack's places are found by the code around them,
// and its bytes made with that ROM's addresses; new code goes into room
// left unused in the same bank.

// A place in the ROM (an offset in it) and its two contents; the original is
// null where a hack in the ROM has lost it.
interface Placed {
  at: number
  original: Uint8Array | null
  hacked: Uint8Array
  // For a hack that holds an amount, on its new code: the amount, and whether it is NOSE4Web's earlier version.
  amount?: number
  earlier?: boolean
}

const word = (value: number) => [value & 0xff, (value >> 8) & 0xff]
const bytesOf = (...parts: (number | number[] | Uint8Array | string)[]) =>
  Uint8Array.from(parts.flatMap((part) => (typeof part === 'string' ? [...hexBytes(part)] : typeof part === 'number' ? [part] : [...part])))
const same = (rom: Uint8Array, at: number, bytes: Uint8Array) => bytes.every((byte, i) => rom[at + i] === byte)
const unused = (count: number) => new Uint8Array(count).fill(0xff)

// The one place of some code: its offset, or -1 if it is not there once.
function only(rom: Uint8Array, pattern: string): number {
  const found = findCodeAll(rom, pattern)
  return found.length === 1 ? found[0].at : -1
}

// Room for `count` bytes in the bank of `near`: the end of the last unused
// run there long enough, a byte of it left before.
function roomInBank(rom: Uint8Array, near: number, count: number): number {
  const start = near - (near % 0x8000)
  const end = Math.min(rom.length, start + 0x8000)
  for (let i = end; i > start; ) {
    let run = i
    while (run > start && rom[run - 1] === 0xff) run--
    if (i - run > count) return i - count
    i = run - 1
  }
  return -1
}

// How far the game's variables have moved from the original game's: none in
// a LoROM rebuild, $6000 in the SA-1 build.
function shift(rom: Uint8Array): number | null {
  const home = snesHomeTeamAddress(rom)
  return home === null ? null : home - 0x1c98
}

// Code that calls new code (JSR or JMP to it in the same bank), and the new
// code: placed where the call says when the hack is in, else in free room.
function withNewCode(rom: Uint8Array, site: number, call: (address: number) => Uint8Array, original: Uint8Array | null, code: Uint8Array): Placed[] | null {
  const hackedAt = loRomOffset(loRomBank(site, 0x80), readU16(rom, site + 1))
  const isIn = original === null || !same(rom, site, original)
  const room = isIn ? hackedAt : roomInBank(rom, site, code.length)
  if (room < 0) return null
  return [
    { at: site, original, hacked: call(loRomAddress(room)) },
    { at: room, original: unused(code.length), hacked: code },
  ]
}
const readU16 = (rom: Uint8Array, at: number) => rom[at] | (rom[at + 1] << 8)
// The fourth period length's overtime: 99 minutes.
const FOURTH_OVERTIME = 99 * 60

// ------------------------------------------------------- energy lost to hits
// The hacks whose new code holds an amount: energy (0 to $1000) a skater
// loses. 0 is off. The recommended amounts are Match Viewer's, from measured
// shifts: a burst's cost for a knockdown, half that for a hold; up to a quarter of full energy.
export type SnesAmount = 'hitEnergy' | 'holdEnergy' | 'injuryBonus' | 'penaltyTime' | 'fighting' | 'injuries' | 'seasonShootout'
export const SNES_AMOUNTS: SnesAmount[] = ['hitEnergy', 'holdEnergy', 'injuryBonus', 'penaltyTime', 'fighting', 'injuries', 'seasonShootout']
// The amount that is the original game, the hack off: none, but 60 seconds for each penalty minute.
// Fighting's amount is its bonus to the fighting ratings, which can be 0 with the fights in: off is -1.
// The injuries choice's amount: 0 the original game.
export const SNES_INJURY_TEXTS = ['As in the original game', 'Never: a hit is only a fall', 'The penalty, but no injury', 'Every injury for the period', 'Every injury for the game', 'A long fall instead: down about 5 seconds']
// SPAinjury1's two lists (SPFfallback 281 and +16, falling and lying for ever) and the long fall's: the back fall's
// frames getting up (SPFduck 345, +4), lying 300 ticks, about 5 seconds (an ordinary fall lies 100; Match Viewer).
const SNES_LONG_FALL = '2c01'
const SNES_FALL_LISTS = [
  { original: '19011400' + '1a011400' + '1b01e803' + '1b0118fc', longFall: '1a010600' + '1b01' + SNES_LONG_FALL + '1c010800' + '5901f8ff' },
  { original: '29011400' + '2a011400' + '2b01e803' + '2b0118fc', longFall: '2a010600' + '2b01' + SNES_LONG_FALL + '2c010800' + '5d01f8ff' },
]
// The shootout's choice: none, after one overtime, or after period 3 with no overtime.
export const SNES_SHOOTOUT_TEXTS = ['None: as the original game', 'A shootout after one overtime', 'A shootout after period 3, no overtime']
// An amount in words, for the Apply list, Changes and the Discord post.
export function snesAmountText(hack: SnesAmount, value: number): string {
  switch (hack) {
    case 'fighting':
      return value === SNES_AMOUNT_OFF.fighting ? 'off' : `on, with a bonus of ${value}`
    case 'injuries':
      return SNES_INJURY_TEXTS[value]?.toLowerCase() ?? String(value)
    case 'seasonShootout':
      return SNES_SHOOTOUT_TEXTS[value]?.toLowerCase() ?? String(value)
    case 'penaltyTime':
      return penaltyTimeText(value)
    default:
      return value === SNES_AMOUNT_OFF[hack] ? 'off' : String(value)
  }
}
export const SNES_AMOUNT_OFF: Record<SnesAmount, number> = { hitEnergy: 0, holdEnergy: 0, injuryBonus: 0, penaltyTime: 60, fighting: -1, injuries: 0, seasonShootout: 0 }
export const RECOMMENDED_SNES_HIT_ENERGY = 204
export const RECOMMENDED_SNES_HOLD_ENERGY = 102
// Energy lost only to hits, as on the Genesis: skating and bursts cost nothing, a knockdown a third of full energy, a hold half that.
export const SNES_HITS_ONLY = { hitEnergy: 1365, holdEnergy: 683 } as const
// For the Genesis's effect (+27% injuries, 1.33 times for the most-hit): Match Viewer's estimates from 29
// recorded SNES league games, the knockdown counted before its own roll, up to 5 knockdowns, are +4 at +18%
// and 1.23, +5 at +23% and 1.29, +6 at +27% and 1.35, +7 at +32% and 1.41, +8 at +37% and 1.47, +19 at +87%
// and 2.11; indicative only, as the recordings had no SNES injuries.
export const RECOMMENDED_SNES_INJURY_BONUS = 6
export const SNES_AMOUNT_RANGES: Record<SnesAmount, [number, number]> = { hitEnergy: [0, 4096], holdEnergy: [0, 4096], injuryBonus: [0, 20], penaltyTime: [1, 255], fighting: SNES_FIGHT_BONUS_RANGE, injuries: [0, 5], seasonShootout: [0, 2] }
const isAmount = (hack: SnesHack): hack is SnesAmount => (SNES_AMOUNTS as SnesHack[]).includes(hack)
// Where the code keeps its amount, and the position or flail operand it ends with.
const HIT_AMOUNT_AT = 38
const HIT_POSITION_AT = 58
const HOLD_AMOUNT_AT = 25
const HOLD_FLAIL_AT = 45
// Where the roll's bonus and impact operands are in its piece of the injury block.
const INJURY_BONUS_AT = 36
const INJURY_IMPACT_AT = 55

// What the energy code needs from this ROM, all from the energy drain in
// playeracc: lda.l OptLine / beq; ...; jsl getpde; lda d0; sec; sbc #33 ...
// (lda seed / and #$3F / bne: one call in 64; the bne is bra with noSkatingDrain).
const DRAIN = 'af......f0..ad....293f00....22......a5..38e9210085..c9000c30..bd....85..1865..85..5c......'
const DRAIN_SKIP_AT = 12
// jml setpde. The direct-page a2 and d1 are read from getpde itself.
function energyEnv(
  rom: Uint8Array,
): { gmclock: Uint8Array; optLine: Uint8Array; getpde: Uint8Array; setpde: Uint8Array; a2: number; d0: number; d1: number; pnum: Uint8Array; pfteam: Uint8Array } | null {
  const drain = only(rom, DRAIN)
  if (drain < 0) return null
  const getpde = rom.slice(drain + 15, drain + 18)
  const at = loRomOffset(getpde[2], getpde[0] | (getpde[1] << 8))
  if (at < 0 || at + 19 > rom.length || rom[at] !== 0xbd || rom[at + 7] !== 0x85 || rom[at + 17] !== 0x85) return null
  // FallDown's .t2 tests the clock with lda.w gmclock (its first 3 bytes may be the hit energy's jsr).
  const fall = only(rom, '......' + 'f0..64..bd....f005a9020085..ad....d0..a4........1a99')
  if (fall < 0) return null
  return {
    gmclock: rom.slice(fall + 18, fall + 20),
    optLine: rom.slice(drain, drain + 4),
    getpde,
    setpde: rom.slice(drain + 42, drain + 45),
    a2: rom[at + 18],
    d0: rom[drain + 19],
    d1: rom[at + 8],
    pnum: rom.slice(at + 1, at + 3),
    pfteam: rom.slice(at + 10, at + 12),
  }
}

// The penalties whose length the one-minute penalties change, by the bytes
// around each (the same in every build).
const MINOR_PENALTIES = [
  ['00000200f6fa', '040a0043'],
  ['010a010bfffe', '040a0053'],
  ['01020103fffe', '040a0054'],
  ['01040105fffe', '0a0a0052'],
  ['010d010efffe', '040a0052'],
  ['010d010efffe', '04090048'],
  ['01090108fffe', '040d0043'],
  ['010f0110fffe', '040e0049'],
  ['0101060cfffe', '04090048'],
]

type Relocate = (rom: Uint8Array, source: Uint8Array | null, amount?: number) => Placed[] | null

// The shootout's two hooks' lengths, and where B keeps the tie test it does after.
const SHOOTOUT_A_LENGTH = 37
const SHOOTOUT_B_LENGTH = 51
const SHOOTOUT_B_TEST = 44
const RELOCATED: Partial<Record<SnesHack, Relocate>> = {
  // A shootout for a tied regular-season game, the game's own (PlayShootout), from PeriodOver: after one
  // overtime, its lda #4 / sta gsp (a regular-season game after overtime) becomes jsl A; after period 3, its tie
  // test lda tmscore / cmp tmscore+2 becomes jsl B, which does the test after (so the beq after it is as it was).
  // Either, for a tied game (B: in the regular season, period 3 just over), goes to RUN with the gsp to come back
  // with: the mark set ($7E:F0F0), the state PlayShootout's StartGame_go clears saved to $7E:F100 up (Match
  // Viewer: $15D3-$1D52, which has gsp, the scores, the team stats and lines; $30F4-$347B, the scoring summary and
  // the games-started count; and lastperiod, $1EAD), PlayShootout, the winner read from its tally in the scores,
  // all put back, the winners' score one more, gsp set so that PeriodOver comes back to the same test, and
  // PeriodOver again from the top, the jsl's return dropped. There A or B finds the mark, clears it, and the
  // game, no longer tied, ends as any other. After one overtime also needs clockcont_0's regular-season game
  // over gone, as for overtime until a goal. The free RAM is Match Viewer's, past the injury risk's counts
  // ($7E:F034-$F0B3); for the 1 MB builds, laid out as the original.
  seasonShootout: (rom, _source, amount) => {
    if (!snesCodeInPlace(rom)) return null
    // The tail of PeriodOver, its two places (12 bytes) left open, as either may be hooked.
    const tail = only(rom, 'ee....ad....c90300f0..90..a903008d....af........06' + '.'.repeat(24) + 'f0..a904008d')
    const start = only(rom, '22......22......22......22......ad....d0..ad....d0..22......ad....d0..22......af')
    const clock = only(rom, 'ad....c90300d006af..........22')
    const call = only(rom, 'af......c90400d0..22......')
    if (tail < 0 || start < 0 || clock < 0 || call < 0) return null
    const gsp = rom.slice(tail + 1, tail + 3)
    const playMode = rom.slice(tail + 20, tail + 23)
    const sites = { afterOvertime: tail + 25, tieTest: tail + 31, clock: clock + 12 }
    const original = { afterOvertime: bytesOf('A90400 8D', gsp), clock: hexBytes('F09F') }
    const hooked = (site: number) => rom[site] === 0x22 && rom[site + 4] === 0xea && rom[site + 5] === 0xea
    const now = hooked(sites.afterOvertime) ? 1 : hooked(sites.tieTest) ? 2 : 0
    if (now !== 1 && !same(rom, sites.clock, original.clock)) return null
    const choice = amount ?? (now === 0 ? 1 : now)
    const site = now === 1 ? sites.afterOvertime : sites.tieTest
    const codeAt = now ? loRomOffset(rom[site + 3], readU16(rom, site + 1)) : -1
    // The tie test as the original has it, lda tmscore / cmp tmscore+2: read from B where it is in.
    const tieTest = now === 2 ? rom.slice(codeAt + SHOOTOUT_B_TEST, codeAt + SHOOTOUT_B_TEST + 6) : rom.slice(sites.tieTest, sites.tieTest + 6)
    if (tieTest[0] !== 0xad || tieTest[3] !== 0xcd || readU16(tieTest, 4) !== readU16(tieTest, 1) + 2) return null
    const score = readU16(tieTest, 1)
    const mark = hexBytes('F0F07E')
    const long = (address: number) => bytesOf(word(address), 0x7e)
    const playShootout = rom.slice(call + 10, call + 13)
    const periodOver = bytesOf(word(loRomAddress(start)), loRomBank(start, 0x80))
    // A, after one overtime: the mark set (back from the shootout): clear it; tied: the shootout; else as before.
    const after = (run: number) =>
      bytesOf('AF', mark, '29FF00', 'D00E', 'AD', word(score), 'CD', word(score + 2), 'D00D', 'A20300', '4C', word(run),
        'A90000', '8F', mark, 'A90400', '8D', gsp, '6B')
    // B, after period 3: the shootout only for a tied regular-season game with period 3 just over; then the test.
    const now3 = (run: number) =>
      bytesOf('AF', mark, '29FF00', 'D01C', 'AF', playMode, 'D01D', 'AD', gsp, 'C90300', 'D015', 'AD', word(score), 'CD', word(score + 2), 'D00D',
        'A20200', '4C', word(run), 'A90000', '8F', mark, tieTest, '6B')
    const run = bytesOf(
      'C230', '8B', 'DA', 'A9FF00', '8F', mark,
      // Saved: $15D3-$1D52 to $F100, $30F4-$347B to $F880, lastperiod to $FC08.
      '8B', 'A97F07', 'A2D315', 'A000F1', '547E7E', 'A98703', 'A2F430', 'A080F8', '547E7E', 'AB',
      'AFAD1E7E', '8F08FC7E',
      '22', playShootout,
      // The winner: X 0 the home team, 2 the visitors.
      'A20000', 'AF', long(score), 'CF', long(score + 2), 'B003', 'A20200', 'DA',
      // Put back.
      '8B', 'A97F07', 'A200F1', 'A0D315', '547E7E', 'A98703', 'A280F8', 'A0F430', '547E7E', 'AB',
      'AF08FC7E', '8FAD1E7E',
      // The winners' goal; gsp to come back with; PeriodOver from the top, the jsl's return dropped.
      'FA', 'BF', long(score), '1A', '9F', long(score), 'FA', '8A', '8F', gsp, '7E', 'AB', '3B', '18', '690300', '1B', '5C', periodOver,
    )
    // The code as it is in, where it is (to take out, or to read), or as it is to go in.
    const shape = now && (choice === 0 || choice === now) ? now : choice
    const hookLength = shape === 1 ? SHOOTOUT_A_LENGTH : SHOOTOUT_B_LENGTH
    const length = hookLength + run.length
    const codeRoom = now ? codeAt : roomInBank(rom, sites.afterOvertime, length)
    if (codeRoom < 0) return null
    const address = loRomAddress(codeRoom)
    const hook = shape === 1 ? after(address + hookLength) : now3(address + hookLength)
    const jsl = bytesOf('22', word(address), loRomBank(codeRoom, 0x80), 'EAEA')
    return [
      { at: sites.afterOvertime, original: original.afterOvertime, hacked: choice === 1 ? jsl : original.afterOvertime, amount: choice },
      { at: sites.tieTest, original: tieTest, hacked: choice === 2 ? jsl : tieTest },
      { at: sites.clock, original: original.clock, hacked: choice === 1 ? hexBytes('EAEA') : original.clock },
      { at: codeRoom, original: unused(length), hacked: bytesOf(hook, run) },
    ]
  },
  // Injuries, as on the Genesis (hacks.ts), at the places Match Viewer found (the SA-1 builds have the same code
  // elsewhere). Its amount is the choice, SNES_INJURY_TEXTS. The roll's clock test after it, bne .23 (when the
  // clock runs the hit can injure), becomes bra for never: the fall and the loose puck stay. setInjuryType's lda
  // #7 / jsl randoma8 / cmp #0 / bne .rtl picks the period (one in 7 the game): bra for every injury for the
  // period, NOPs for the game. The penalty but no injury: FallDown's jsl setInjuryType and the sta InjCntDown that
  // brings up the injury box 4 seconds later both go; the player lies down, the call stays, and he plays on. A
  // long fall instead: the jsl becomes jmp .25, the ordinary fall's end (no injury, box or penalty), and
  // SPAinjury1's two lists, which fall and lie for ever, a back fall that gets up after LONG_FALL ticks lying.
  injuries: (rom, source, amount) => {
    const never = only(rom, '10..ad....' + '..' + '..b9....30..f0')
    const period = only(rom, 'a90700' + '22......c90000' + '....' + 'a9fcff')
    const call = only(rom, '9d....' + '........' + 'a90400' + '......' + 'a91600')
    // .25: after jsl AddPenalty2 / jmp Stop4Pen, ldy a2 / lda SPA,y.
    const tail = only(rom, '22......4c....a4..b9')
    const lists = SNES_FALL_LISTS.map((list) => [list.original, list.longFall].map((bytes) => only(rom, bytes)).find((at) => at >= 0) ?? -1)
    if (never < 0 || period < 0 || call < 0 || tail < 0 || lists.some((at) => at < 0)) return null
    const sites = { never: never + 5, period: period + 10, call: call + 3, count: call + 10 }
    const end = loRomAddress(tail + 7) & 0xffff
    const jump = bytesOf('4C', word(end), 'EA')
    if (![0xd0, 0x80].includes(rom[sites.never])) return null
    // What the ROM has now.
    const at = (site: number, length: number) => rom.slice(site, site + length)
    const nops = (bytes: Uint8Array) => bytes.every((b) => b === 0xea)
    const longIn = same(rom, sites.call, jump) && lists.every((list, i) => same(rom, list, hexBytes(SNES_FALL_LISTS[i].longFall)))
    const penaltyIn = nops(at(sites.call, 4)) && nops(at(sites.count, 3))
    const periodNow = rom[sites.period] === 0x80 ? 3 : nops(at(sites.period, 2)) ? 4 : rom[sites.period] === 0xd0 ? 0 : -1
    const now = rom[sites.never] === 0x80 ? 1 : penaltyIn ? 2 : longIn ? 5 : periodNow
    if (now < 0 || (!longIn && !penaltyIn && rom[sites.call] !== 0x22)) return null
    const choice = amount ?? (now === 0 ? 1 : now)
    // The original bytes: this ROM's where it has them, else the ROM's as opened, at the same places.
    const opened = source && source.length === rom.length ? source : null
    const fromOpened = (site: number, length: number, ok: (bytes: Uint8Array) => boolean) => {
      const bytes = opened?.slice(site, site + length)
      return bytes && ok(bytes) ? bytes : null
    }
    const callOriginal = rom[sites.call] === 0x22 ? at(sites.call, 4) : fromOpened(sites.call, 4, (b) => b[0] === 0x22)
    const countOriginal = rom[sites.count] === 0x8d ? at(sites.count, 3) : fromOpened(sites.count, 3, (b) => b[0] === 0x8d)
    const branch = rom[sites.period] === 0xd0 || rom[sites.period] === 0x80 ? rom[sites.period + 1] : (fromOpened(sites.period, 2, (b) => b[0] === 0xd0)?.[1] ?? null)
    if (branch === null && choice !== 4) return null
    // A choice that needs the call or the count as they were, with them nowhere to be had: not offered.
    if ((callOriginal === null && choice !== 2 && choice !== 5) || (countOriginal === null && choice !== 2)) return null
    return [
      { at: sites.never, original: Uint8Array.of(0xd0), hacked: Uint8Array.of(choice === 1 ? 0x80 : 0xd0), amount: choice },
      { at: sites.period, original: branch === null ? null : Uint8Array.of(0xd0, branch), hacked: choice === 3 ? Uint8Array.of(0x80, branch!) : choice === 4 ? hexBytes('EAEA') : Uint8Array.of(0xd0, branch!) },
      { at: sites.call, original: callOriginal, hacked: choice === 2 ? hexBytes('EAEAEAEA') : choice === 5 ? jump : callOriginal! },
      { at: sites.count, original: countOriginal, hacked: choice === 2 ? hexBytes('EAEAEA') : countOriginal! },
      ...lists.map((list, i) => ({ at: list, original: hexBytes(SNES_FALL_LISTS[i].original), hacked: hexBytes(choice === 5 ? SNES_FALL_LISTS[i].longFall : SNES_FALL_LISTS[i].original) })),
    ]
  },
  // InProgress, sending a player to the box: ldx #$003C / lda d2 (his penalty's minutes) / and #$FF / jsl
  // Mul8U / ora #$2000: the box time, in seconds of the game clock, is the minutes times 60, the only place
  // minutes become time, as on the Genesis (hacks.ts). The 60 becomes the seconds wanted for each minute.
  penaltyTime: (rom, _source, amount) => {
    const found = only(rom, 'a2....a5..29ff0022......090020')
    if (found < 0) return null
    const now = readU16(rom, found + 1)
    if (now < 1 || now > 255) return null
    // Turned on without a number (as when every hack is chosen): half length, unless the ROM has its own already.
    const value = amount ?? (now !== SNES_AMOUNT_OFF.penaltyTime ? now : 30)
    return [{ at: found + 1, original: hexBytes('3C00'), hacked: hexBytes(hex16(value)), amount: value }]
  },
  hotColdFix: (rom) => {
    const found = only(rom, '851698186514a8e220..........8900f002090018651610')
    if (found < 0) return null
    const site = found + 9
    const code = (variable: number[]) => bytesOf('B9', variable, '1009 49FF 1A 4A 4A 49FF 1A 60 4A 4A 60')
    if (rom[site] === 0xb9 && same(rom, site + 3, hexBytes('4A4A'))) {
      const variable = word(readU16(rom, site + 1))
      return withNewCode(rom, site, (to) => bytesOf('20', word(to), 'EAEA'), bytesOf('B9', variable, '4A4A'), code(variable))
    }
    if (rom[site] !== 0x20 || !same(rom, site + 3, hexBytes('EAEA'))) return null
    const at = loRomOffset(loRomBank(site, 0x80), readU16(rom, site + 1))
    const variable = word(readU16(rom, at + 1))
    return withNewCode(rom, site, (to) => bytesOf('20', word(to), 'EAEA'), bytesOf('B9', variable, '4A4A'), code(variable))
  },
  ppPkFix: (rom) => {
    const site = only(rom, 'f0..a00100b789' + '..'.repeat(27) + 'a00200b789290f0049ffff1a85a5')
    if (site < 0) return null
    const isIn = rom[site + 1] === 0x11
    const [first, second] = [readU16(rom, site + (isIn ? 15 : 11)), readU16(rom, site + 32)]
    const original = bytesOf('F00D A00100 B789 290F00 8D', word(first), '8013 A00100 B789 4A4A4A4A 290F00 49FFFF 1A 8D', word(second))
    const hacked = bytesOf('F011 A00100 B789 4A4A4A4A 290F00 8D', word(first), '800F A00100 B789 290F00 49FFFF 1A 8D', word(second))
    return [{ at: site, original, hacked }]
  },
  defenceControl: (rom) => {
    const found = only(rom, 'c90100d006a920000c....' + '........' + '22......22......a97e008d')
    const moved = shift(rom)
    if (found < 0 || moved === null) return null
    const site = found + 11
    const isIn = rom[site] === 0x20 && rom[site + 3] === 0xea
    const routine = isIn ? loRomOffset(loRomBank(site, 0x80), readU16(rom, site + 1)) + 1 : site + 1
    const target = rom.slice(routine, routine + 3)
    const code = bytesOf('22', target, 'A90100 8D', word(0x1c94 + moved), '8D', word(0x1c96 + moved), '60')
    return withNewCode(rom, site, (to) => bytesOf('20', word(to), 'EA'), bytesOf('22', target), code)
  },
  oneMinutePenalties: (rom) => {
    const minors = MINOR_PENALTIES.map(([before, after]) => only(rom, before + '..' + after))
    const found = only(rom, 'a8a9..00858fa9....858d18778d858da78d' + '......' + 'f0c9c90100f0c4a90004')
    if (found < 0 || minors.some((at) => at < 0)) return null
    const site = found + 18
    const address = loRomAddress(site)
    const code = bytesOf('C90104 F005 C9010A D003 4C', word(address + 0x0a), '29FF00 4C', word(address + 3))
    const clock = withNewCode(rom, site, (to) => bytesOf('4C', word(to)), hexBytes('29FF00'), code)
    if (!clock) return null
    return [...minors.map((at) => ({ at: at + 6, original: hexBytes('02'), hacked: hexBytes('01') })), ...clock]
  },
  // The menu's Period line, found through setoptions' table of choice counts.
  thirtySecondPeriods: (rom) => {
    const at = snesPeriodCountPlace(rom)
    return at < 0 ? null : [{ at, original: hexBytes('0300'), hacked: hexBytes('0400') }]
  },
  // With line changes on, playeracc's drain each 64th frame on the ice (with the endurance give-back)
  // never runs: its bne past it becomes bra.
  noSkatingDrain: (rom) => {
    const found = only(rom, DRAIN)
    if (found < 0 || ![0xd0, 0x80].includes(rom[found + DRAIN_SKIP_AT])) return null
    const length = rom[found + DRAIN_SKIP_AT + 1]
    return [{ at: found + DRAIN_SKIP_AT, original: Uint8Array.of(0xd0, length), hacked: Uint8Array.of(0x80, length) }]
  },
  // burst (the C button, with line changes on): jsl getpde; lda.l OptLine / beq; lda d0 / sec / sbc #$CC; sta d0;
  // jsl setpde, then full energy with Auto. The cost becomes 0.
  freeBurst: (rom) => {
    const found = only(rom, '22......af......f0..a5..38e9....85..22......af......c90200d005a90010')
    if (found < 0) return null
    return [{ at: found + 13, original: hexBytes('E9CC00'), hacked: hexBytes('E90000') }]
  },
  // playeracc's speed class: lda d0 (energy) / lsr / clc / adc #$800 / tax, then leg speed x 16 times it, the
  // high word the MaxSpeed index; so no energy halves the class. With the shift and add gone it is the
  // energy itself, as on the Genesis: an empty skater skates at the slowest class there is.
  energySpeed: (rom) => {
    const found = only(rom, 'a5..' + '..........' + 'aa680a0a0a0a22')
    if (found < 0) return null
    return [{ at: found + 2, original: hexBytes('4A18690008'), hacked: hexBytes('EAEAEAEAEA') }]
  },
  // The goalie's stick test (checkpuckcoll_ccx .9) takes the frame's stick spot: |x| is the reach, and
  // |y| a height, from (2/3)|y| - (2/3)|x| to (2/3)|y| + (2/3)|x| (at least 5), so a stick held up or
  // down the ice never reaches a puck on it, and a goalie's X poke straight ahead is useless (Match
  // Viewer). The stick box is centred on the stick spot (GetHot) and its size, the reach, comes from
  // GetFrameHot, about 2 for every poke frame (Match Viewer). While he is in the poke (SPA = SPAgpoke), the
  // new code makes the reach at least 6, a skater's steal radius, and the bottom of the height the ice,
  // keeping its top, so the poke knocks loose a puck on the ice within 6 units of its tip and still
  // cannot knock down a raised shot. Nothing else changes: his stance and stick saves are as before,
  // and a poke that reaches the puck knocks it loose, as a sideways one does. sta d3 / ldx curobj after the
  // height becomes jsr / nop. SPA and the poke's animation are read from puckglue and assgoalie.
  // Tied regular-season games, as the Genesis's (hacks.ts): the game decides game over twice at the end of an
  // overtime. PeriodOver: after overtime gsp goes back to 3, and lda.l OptPlayMode / bne .2 lets only a playoff
  // game on to the tie test, a regular-season one getting gsp 4 first; the bne becomes bra. clockcont_0's .8:
  // lda gsp / cmp #3 / bne / lda.l OptPlayMode / beq .7 ends a regular-season overtime; the beq goes. Each
  // regular-season overtime is ResetClock's, 5:00.
  seasonOvertime: (rom) => {
    const period = only(rom, 'ee....ad....c90300f0..90..a903008d....af........06a904008d....ad....cd....')
    const clock = only(rom, 'ad....c90300d006af..........22')
    if (period < 0 || clock < 0) return null
    // The beq goes back 97 bytes, to .7, in every build.
    return [
      { at: period + 23, original: hexBytes('D0'), hacked: hexBytes('80') },
      { at: clock + 12, original: hexBytes('F09F'), hacked: hexBytes('EAEA') },
    ]
  },
  goaliePoke: (rom) => {
    const found = only(rom, '9822......a5a589008' + '0f00449ffff1a85ad0aaabf......85b5a5a989008' + '0f00449ffff1a0aaabf......')
    const spa = only(rom, 'a491a98c0099....b9....c9....')
    const poke = only(rom, 'a9....22......a9f0009d')
    if (found < 0 || spa < 0 || poke < 0) return null
    const site = found + 43
    // assgoalie .22 starts the poke: sta facedir,x / sta pfalock,x with A the poke's direction, so straight up
    // the ice (direction 0) leaves the facing unlocked and the next think stands him up before the poke reaches
    // full stretch, in the original game too (Match Viewer). pfalock is only tested for non-zero, so its sta
    // becomes a jsr to code storing $80. Both hooks share one block of new code, in the same bank.
    const lockAt = poke - 3
    if (loRomBank(site, 0x80) !== loRomBank(lockAt, 0x80)) return null
    const head = bytesOf('85B1 A691 BD', rom.slice(spa + 9, spa + 11), 'C9', rom.slice(poke + 1, poke + 3))
    const reach = bytesOf(head, 'D012 A90600 C5AD 9002 85AD A5B1 18 65B5 85B5 64B1 A6E4 60')
    const siteOriginal = hexBytes('85B1A6E4')
    const isIn = !same(rom, site, siteOriginal)
    const room = isIn ? loRomOffset(loRomBank(site, 0x80), readU16(rom, site + 1)) : -1
    // pfalock's address: from the sta, or from the code where it is in.
    const lockStore = isIn ? rom.slice(room + reach.length + 4, room + reach.length + 6) : rom.slice(lockAt + 1, lockAt + 3)
    if (!isIn && rom[lockAt] !== 0x9d) return null
    const lock = bytesOf('A98000 9D', lockStore, '60')
    const code = bytesOf(reach, lock)
    const at = isIn ? room : roomInBank(rom, site, code.length)
    if (at < 0) return null
    return [
      { at: site, original: siteOriginal, hacked: bytesOf('20', word(loRomAddress(at)), 'EA') },
      { at: lockAt, original: bytesOf('9D', lockStore), hacked: bytesOf('20', word(loRomAddress(at + reach.length))) },
      { at, original: unused(code.length), hacked: code },
    ]
  },
  noInterference: (rom) => {
    const found = only(rom, '38e91f00' + '....' + 'bd....890040d0b5a9140038fd....22')
    return found < 0 ? null : [{ at: found + 4, original: hexBytes('30BD'), hacked: hexBytes('80BD') }]
  },
  noPenaltyShots: (rom) => {
    const found = only(rom, '....' + '4c....a9ffff8003a900006b8687a20000b5a548')
    return found < 0 ? null : [{ at: found, original: hexBytes('D003'), hacked: hexBytes('D008') }]
  },
  noGoalPosts: (rom) => {
    const found = only(rom, '4c....64a9ad....450c30d1a9000038e50c850ca9000038e5a585a5ad....d0bc' + '......' + 'c90d00f00ea5adc91200')
    const moved = shift(rom)
    if (found < 0 || moved === null) return null
    return [{ at: found + 0x21, original: bytesOf('AD', word(0x0df9 + moved)), hacked: bytesOf('4C', word(loRomAddress(found))) }]
  },
  // The intros are skipped by taking out the call that plays them; to put it
  // back, the call is taken from the ROM as it was opened where it is not here.
  skipEaIntro: (rom, source) => intro(rom, source, '68858d68858f6b6bc23022......', '22....80a90000aa9f00007fcacad0f8'),
  skipPucksIntro: (rom, source) => intro(rom, source, '2226859ba900008d....2226859b9c....', '22......ad....d0fbad....d0f6a900008f'),
  penaltyShotFixes: (rom) => penaltyShotFixes(rom),
  // The comeback bonus (bug 25), as on the Genesis: setplayer works out half
  // the period less the clock, then beq .2 and bpl .6, which skips the bonus in
  // the second half of the third period where it should skip it in the first.
  // The fix makes the bpl a bmi. Exactly half still gets it. (Match Viewer.)
  comebackFix: (rom) => {
    const found = only(rom, 'a5a538ed....f002....ad....38')
    if (found < 0 || (rom[found + 8] !== 0x10 && rom[found + 8] !== 0x30)) return null
    return [{ at: found + 8, original: hexBytes('10'), hacked: hexBytes('30') }]
  },
  // The awareness slip (bug 20), as on the Genesis: the winger's and the
  // centre's offence jobs (asswingo, asscentero) reload the decision timer with
  // adc aidef,x where the other offence jobs use aioff. The fix makes both
  // aioff: the operand's low byte $43 becomes $23. Each is found by the jump
  // to it (the same in every build). The defence jobs, which jump to theirs
  // the same way, keep aidef. (Match Viewer's reading of the reloads.)
  awarenessFix: (rom) => {
    const sites = ['30034c2d85187d', '30034c798b187d'].map((pattern) => only(rom, pattern))
    if (sites.some((found) => found < 0 || (rom[found + 7] !== 0x43 && rom[found + 7] !== 0x23))) return null
    return sites.map((found) => ({ at: found + 7, original: hexBytes('43'), hacked: hexBytes('23') }))
  },
  // The second assist (bug 1), as on the Genesis: a2touchpuck shifts a team's
  // last touches down (tmtouch2 to tmtouch3, tmtouch1 to tmtouch2) with no
  // check, then drops the third if the new toucher is it too. So in C, A, B,
  // A, with A scoring, B has the only assist. The fix keeps tmtouch3 where the
  // new toucher is tmtouch2 already, as the Genesis fix does: the 12 bytes of
  // the shift become a call to the shift with that test. The SNES has no
  // other shift. Found by the bra .3 before it and the code after, which
  // stores d0 (the toucher) in tmtouch1 and compares it with tmtouch3.
  // (Match Viewer's reading, tested in the game in all three builds.)
  secondAssist: (rom) => {
    const found = only(rom, '800c' + '..'.repeat(12) + 'a5..99....d9....d006a9ffff99')
    if (found < 0) return null
    const site = found + 2
    const d0 = rom[site + 13]
    const [t1, t3] = [word(readU16(rom, site + 15)), word(readU16(rom, site + 18))]
    const t2 = word(readU16(rom, site + 15) + 4)
    const original = bytesOf('B9', t2, '99', t3, 'B9', t1, '99', t2)
    const call = (to: number) => bytesOf('20', word(to), 'EA'.repeat(9))
    if (!same(rom, site, original) && !(rom[site] === 0x20 && same(rom, site + 3, hexBytes('EA'.repeat(9))))) return null
    const code = bytesOf('A5', d0, 'D9', t2, 'F006', original, '60')
    return withNewCode(rom, site, call, original, code)
  },
  // Assists lost after a regained puck (Match Viewer: 10 of 259 recorded
  // goals). a2touchpuck's "already the last toucher" exit, cmp tmtouch1,y /
  // beq at $9E:C523 in the original game, runs before the overwrite flag
  // (tmflags bit 2) is cleared, so when the last toucher before an opponent
  // wins the puck back himself the flag stays set, and the teammate he passes
  // to then overwrites him as the last toucher, and his assist is lost. The
  // fix calls new code in place of the cmp and beq: the same compare, and on
  // the same player the flag cleared (the list kept) before going on where
  // the beq went, with A reloaded from the direct-page copy the routine
  // compares (16-bit A and index, as there). Found by the code around it in
  // every build: the 2 MB ones have their RAM $6000 on.
  // Injury risk from knockdowns, as NOSE4Web's Genesis option (the sites
  // read by Match Viewer). A word a player at $7E:F034, 32 a team (free in
  // every recorded game of the original and its 1 MB edits; not in the
  // rebuilt builds, whose RAM is elsewhere). FallDown's .2, which every real
  // fall reaches, has lda.w #$0078: that becomes jsr to code that adds 1 (to
  // at most 255) for a skater (position,y) knocked down by a player (X below
  // $18). The roll (lda #150 / jsl randoma8 / asl / ldy a2 / sec / sbc.w
  // impact,y / bpl .23: an injury when the result is below 0) has its sbc
  // become jsr to code that also takes off count x bonus, at most 5 x bonus,
  // leaving the result and its flags for the bpl. StartGame's jsl
  // restoreteams (its jsl clearTeamStats is defence control's site) and
  // PeriodOver's first jsl forcefade go through code that clears, or halves,
  // the counts first. The four pieces are one block in FallDown's bank.
  injuryBonus: (rom, _source, amount) => {
    const env = energyEnv(rom)
    if (!env || !snesCodeInPlace(rom)) return null
    const COUNT_AFTER = '99....bd....38f9....85..bd....38f9....85..22'
    const count = only(rom, 'a4..' + '......' + COUNT_AFTER)
    // With the fights in, their jml F_countcheck has taken the ldy a2 / lda #$78 (Match Viewer): the two share the
    // place, the fights' jml going to a stub of this code, ldy a2 / jsr count / jml F_countcheck.
    const fight = count < 0 ? snesFightState(rom, [SNES_FIGHT_SHARED_SITE]) : undefined
    const shared = fight?.kind === 'in' ? only(rom, '5c......ea' + COUNT_AFTER) : -1
    // The bne after the clock's lda may be the injuries choice's bra (never injured).
    const roll = ['d0', '80'].map((branch) => only(rom, 'a99600' + '22......0aa4..38' + '......' + `10..ad....${branch}..b9....`)).find((at) => at >= 0) ?? -1
    const start = only(rom, 'a9....0c....' + '........' + '22......22......a9..00')
    const period = only(rom, '22......22......22......22......ad....d0..ad....d0..22......ad....d0..22......af')
    if ((count < 0 && shared < 0) || roll < 0 || start < 0 || period < 0) return null
    const chained = count < 0
    const sites = { count: chained ? shared : count + 2, roll: roll + 11, start: start + 10, period }
    const fightJump = fight?.kind === 'in' ? snesFightCountJump(fight.bank) : null
    // The stub, where a chained one is in: ldy a2 (the ldy of the place, as the fights' F_countcheck has it); jsr; jml.
    const stubOf = (blockAddress: number, a2: number) => bytesOf('A4', a2, '20', word(blockAddress), fightJump!.subarray(0, 4))
    let hooked: boolean
    let block = -1
    let a2 = rom[count >= 0 ? count + 1 : -1] ?? 0x91
    if (chained) {
      hooked = !same(rom, sites.count, fightJump!)
      if (hooked) {
        const stub = loRomOffset(rom[sites.count + 3], readU16(rom, sites.count + 1))
        if (rom[stub] !== 0xa4 || rom[stub + 2] !== 0x20) return null
        a2 = rom[stub + 1]
        block = loRomOffset(loRomBank(sites.count, 0x80), readU16(rom, stub + 3))
        if (!same(rom, stub, stubOf(loRomAddress(block), a2))) return null
      } else a2 = 0x91
    } else {
      hooked = rom[sites.count] === 0x20
      block = hooked ? loRomOffset(loRomBank(sites.count, 0x80), readU16(rom, sites.count + 1)) : -1
    }
    const position = word(readU16(rom, roll + 22))
    const table = '34F07E'
    const ofY = bytesOf('B9', env.pnum, '29FF00 0A AA B9', env.pfteam, 'F006 8A 18 694000 AA')
    // This version counts only while the clock runs (lda gmclock / bne, after the whistle nothing); the first counted after it too.
    const offsets = (clocked: boolean) => {
      const rollAt = clocked ? 54 : 49
      return { rollAt, startAt: rollAt + 65, periodAt: rollAt + 65 + 26 }
    }
    const build = (clocked: boolean, bonus: number, impact: number[], restore: Uint8Array, fade: Uint8Array) =>
      bytesOf(
        // Count.
        'DA', clocked ? bytesOf('AD', env.gmclock, 'D02B') : [], 'B9', position, 'F026 E01800 B021', ofY, 'BF', table, 'C9FF00 B005 1A 9F', table,
        'FA A97800 60',
        // Roll (65 bytes).
        '48 DA', ofY, 'BF', table, 'AA A90000 E00000 F007 18 69', word(bonus), 'CA 80F4 C9', word(bonus * 5), '9003 A9', word(bonus * 5),
        'FA 48 A303 38 F9', impact, '38 E301 8303 68 68 60',
        // Each game (26 bytes), and each intermission (28 bytes): the flags kept, 16-bit registers meanwhile.
        '08 C230 48 DA A27E00 A90000 9F', table, 'CA CA 10F8 FA 68 28 5C', restore,
        '08 C230 48 DA A27E00 BF', table, '4A 9F', table, 'CA CA 10F3 FA 68 28 5C', fade,
      )
    let found: { clocked: boolean; bonus: number; impact: number[]; restore: Uint8Array; fade: Uint8Array } | null = null
    if (hooked) {
      for (const clocked of [true, false]) {
        const at = offsets(clocked)
        const bonus = readU16(rom, block + at.rollAt + INJURY_BONUS_AT)
        const impact = word(readU16(rom, block + at.rollAt + INJURY_IMPACT_AT))
        const restore = rom.slice(block + at.startAt + 23, block + at.startAt + 26)
        const fade = rom.slice(block + at.periodAt + 25, block + at.periodAt + 28)
        if (same(rom, block, build(clocked, bonus, impact, restore, fade))) {
          found = { clocked, bonus, impact, restore, fade }
          break
        }
      }
      if (!found) return null
    }
    const clocked = amount !== undefined || !found ? true : found.clocked
    const bonus = amount ?? found?.bonus ?? RECOMMENDED_SNES_INJURY_BONUS
    const impact = found?.impact ?? word(readU16(rom, sites.roll + 1))
    const restore = found?.restore ?? rom.slice(sites.start + 1, sites.start + 4)
    const fade = found?.fade ?? rom.slice(sites.period + 1, sites.period + 4)
    const plain = build(clocked, bonus, impact, restore, fade)
    // Chained, the stub follows the code.
    const length = plain.length + (chained ? 9 : 0)
    const at = hooked ? block : roomInBank(rom, sites.count, length)
    if (at < 0) return null
    const address = loRomAddress(at)
    const code = chained ? bytesOf(plain, stubOf(address, a2)) : plain
    const { rollAt, startAt, periodAt } = offsets(clocked)
    const long = (offset: number) => bytesOf('22', word(address + offset), 0x80 | Math.floor(at / 0x8000))
    const countPlace: Placed = chained
      ? { at: sites.count, original: fightJump!, hacked: bytesOf('5C', word(address + plain.length), 0x80 | Math.floor(at / 0x8000), 'EA') }
      : { at: sites.count, original: hexBytes('A97800'), hacked: bytesOf('20', word(address)) }
    return [
      countPlace,
      { at, original: unused(code.length), hacked: code, amount: bonus, earlier: !clocked },
      { at: sites.roll, original: bytesOf('F9', impact), hacked: bytesOf('20', word(address + rollAt)) },
      { at: sites.start, original: bytesOf('22', restore), hacked: long(startAt) },
      { at: sites.period, original: bytesOf('22', fade), hacked: long(periodAt) },
    ]
  },
  // Energy lost to hits (a community idea; the sites read by Match Viewer),
  // as NOSE4Web's Genesis option. FallDown's .t2 (a real fall: X the
  // hitter, a2 the player hit) starts lda.w position,x / beq .2; the lda
  // becomes jsr to code that, with line changes on (lda.l OptLine / beq, the
  // energy drain's own test), for a skater (position,y) knocked down by a
  // player (X below $18, not the puck), takes the amount off with getpde and
  // setpde (X, Y and the a2, d0 and d1 they use kept), then does the lda, so
  // the beq after it is as before. holdcheck's lda.w #SPAflail, the moment a
  // hold or hook catches X, becomes jsr to code that takes its amount off X
  // the same way, then does the lda. Every address is taken from the ROM's
  // own code, so it goes into every build.
  hitEnergy: (rom, _source, amount) => {
    const env = energyEnv(rom)
    // The team's check count after it: lda tmchecks,y, or a jsr where a ROM counts checks its own way (Classic, SDL16).
    const tail = 'f0..64..bd....f005a9020085..ad....d0..a4........1a99'
    const plain = only(rom, 'bd....' + tail)
    const hooked = plain >= 0 ? -1 : only(rom, '20....' + tail)
    const site = plain >= 0 ? plain : hooked
    if (!env || site < 0) return null
    const code = plain >= 0 ? -1 : loRomOffset(loRomBank(site, 0x80), readU16(rom, site + 1))
    const { a2, d0, d1 } = env
    // This version takes nothing while the clock is stopped (lda gmclock / bne: after the whistle); the first took it then too.
    const shift = (clocked: boolean) => (clocked ? 5 : 0)
    const build = (clocked: boolean, value: number, position: number[]) =>
      bytesOf(
        'DA 5A A5', a2, '48 A5', d0, '48 A5', d1, '48', clocked ? bytesOf('AD', env.gmclock, 'D023') : [], env.optLine, 'F0 1D E0 1800 B0 18 A4', a2,
        'B9', position, 'F0 11 BB 22', env.getpde, 'A5', d0, '38 E9', word(value), '85', d0, '22', env.setpde,
        '68 85', d1, '68 85', d0, '68 85', a2, '7A FA BD', position, '60',
      )
    let found: { clocked: boolean; value: number; position: number[] } | null = null
    if (code >= 0) {
      for (const clocked of [true, false]) {
        const position = word(readU16(rom, code + HIT_POSITION_AT + shift(clocked)))
        const value = readU16(rom, code + HIT_AMOUNT_AT + shift(clocked))
        if (same(rom, code, build(clocked, value, position))) {
          found = { clocked, value, position }
          break
        }
      }
      if (!found) return null
    }
    const clocked = amount !== undefined || !found ? true : found.clocked
    const position = found?.position ?? word(readU16(rom, site + 1))
    const value = amount ?? found?.value ?? RECOMMENDED_SNES_HIT_ENERGY
    const places = withNewCode(rom, site, (to) => bytesOf('20', word(to)), bytesOf('BD', position), build(clocked, value, position))
    return places && [places[0], { ...places[1], amount: value, earlier: !clocked }]
  },
  holdEnergy: (rom, _source, amount) => {
    const env = energyEnv(rom)
    const tail = '9d....22......a6..a4..84..86..'
    const plain = only(rom, 'a9....' + tail)
    const hooked = plain >= 0 ? -1 : only(rom, '20....' + tail)
    const site = plain >= 0 ? plain : hooked
    if (!env || site < 0) return null
    const code = plain >= 0 ? -1 : loRomOffset(loRomBank(site, 0x80), readU16(rom, site + 1))
    const { a2, d0, d1 } = env
    const shift = (clocked: boolean) => (clocked ? 5 : 0)
    const build = (clocked: boolean, value: number, flail: number[]) =>
      bytesOf(
        'DA 5A A5', a2, '48 A5', d0, '48 A5', d1, '48', clocked ? bytesOf('AD', env.gmclock, 'D016') : [], env.optLine, 'F0 10 22', env.getpde, 'A5', d0,
        '38 E9', word(value), '85', d0, '22', env.setpde, '68 85', d1, '68 85', d0, '68 85', a2, '7A FA A9', flail, '60',
      )
    let found: { clocked: boolean; value: number; flail: number[] } | null = null
    if (code >= 0) {
      for (const clocked of [true, false]) {
        const flail = word(readU16(rom, code + HOLD_FLAIL_AT + shift(clocked)))
        const value = readU16(rom, code + HOLD_AMOUNT_AT + shift(clocked))
        if (same(rom, code, build(clocked, value, flail))) {
          found = { clocked, value, flail }
          break
        }
      }
      if (!found) return null
    }
    const clocked = amount !== undefined || !found ? true : found.clocked
    const flail = found?.flail ?? word(readU16(rom, site + 1))
    const value = amount ?? found?.value ?? RECOMMENDED_SNES_HOLD_ENERGY
    const places = withNewCode(rom, site, (to) => bytesOf('20', word(to)), bytesOf('A9', flail), build(clocked, value, flail))
    return places && [places[0], { ...places[1], amount: value, earlier: !clocked }]
  },
  // McMarkis's "5 Minutes, 99 Min OT\" (his Genesis patch), as NOSE4Web's
  // Genesis option has it. ResetClock has, for overtime: lda.l OptPlayMode /
  // bne .1 (playoffs: as long as a period) / lda #300 / sta d0 (the regular
  // season's 5:00, the Clock's overtime). Its first 6 bytes become jmp / nop
  // to 26 bytes in the same bank that make the same test, then in the
  // regular season on the fourth length (Optperlen 3, read as GetPeriodTime
  // reads it) set 99:00 and go on to .1; otherwise they go back to the lda.
  // The menu's fourth length is the 30-second periods hack's, so that is
  // needed too; its length and text are set on Game settings.
  fourthPeriodOvertime: (rom) => {
    const before = 'ad....f007a9....85a58013ad....c90300300b'
    const plain = only(rom, before + 'af......d005a9....85a5')
    const hooked = plain >= 0 ? -1 : only(rom, before + '4c....eaeaeaa9....85a5')
    const found = plain >= 0 ? plain : hooked
    const period = findCode(rom, 'afc234..0aaabf')
    if (found < 0 || !period) return null
    const site = found + 20
    const from = plain >= 0 ? site : loRomOffset(loRomBank(site, 0x80), readU16(rom, site + 1))
    if (rom[from] !== 0xaf) return null
    const playMode = rom.slice(from, from + 4)
    const address = loRomAddress(site)
    const code = bytesOf(playMode, 'D00E', rom.slice(period.at, period.at + 4), 'C90300 D008 A9', word(FOURTH_OVERTIME), '85A5 4C', word(address + 11), '4C', word(address + 6))
    return withNewCode(rom, site, (to) => bytesOf('4C', word(to), 'EAEAEA'), bytesOf(playMode, 'D005'), code)
  },
  regainAssist: (rom) => {
    const after = 'b9(....)890400f01929fbff99'
    const plain = only(rom, '85(..)a4..d9(....)f03d' + after)
    const hooked = plain >= 0 ? -1 : only(rom, '85(..)a4..20....eaea' + after)
    const found = plain >= 0 ? plain : hooked
    if (found < 0) return null
    const site = found + 4
    const dp = rom[found + 1]
    const flags = readU16(rom, site + 6)
    let toucher: number
    let target: number
    if (plain >= 0) {
      toucher = readU16(rom, site + 1)
      target = (loRomAddress(site) + 5 + 0x3d) & 0xffff
    } else {
      const code = loRomOffset(loRomBank(site, 0x80), readU16(rom, site + 1))
      if (rom[code] !== 0xd9 || rom[code + 18] !== 0x4c) return null
      toucher = readU16(rom, code + 1)
      target = readU16(rom, code + 19)
    }
    const original = bytesOf('D9', word(toucher), 'F03D')
    const call = (to: number) => bytesOf('20', word(to), 'EAEA')
    const code = bytesOf('D9', word(toucher), 'F001 60 68 B9', word(flags), '29FBFF 99', word(flags), 'A5', dp, '4C', word(target))
    return withNewCode(rom, site, call, original, code)
  },
  // Stick deflections (bug 34), as on the Genesis but wider: in puckstick, a
  // puck too fast for the goalie to catch takes .t1x (nopuck 8) to .3, which
  // plays the sound, has him touch it and deflects it, and never counts the
  // shot (ChkShotStat). That is a hard shot off his stick, low or high, or
  // his glove. The fix points .t1x's jmp .3 at new code: for a goalie
  // (position 0) it calls ChkShotStat first, which counts a shot only while
  // the puck is a shot (sf2shot) and the clock runs, and clears sf2shot so it
  // counts once; then it goes on to .3. Y is the player there. Found by the
  // tests before .t1x (lda position,x; beq .t1x; lda d2; cmp #$25; bcc), and
  // ChkShotStat by its start. (Match Viewer's reading and hook, tested in the
  // game: every changed shot one more on goal, none counted twice.)
  stickShots: (rom) => {
    const found = only(rom, 'bd....f0..a5..c9250090034c....a4..a9080099....4c....')
    const shot = only(rom, 'a900101c....d0034c....ad....f0034c....a58d48a58f48')
    if (found < 0 || shot < 0) return null
    const site = found + 23
    const position = word(readU16(rom, found + 1))
    const bank = loRomBank(site, 0x80)
    const target = loRomOffset(bank, readU16(rom, site + 1))
    // .3 starts lda #3, jsl PuckSfx; or the jump is to the new code, which ends jmp .3.
    const head = bytesOf('B9', position, 'D004 22')
    const dot3 = same(rom, target, hexBytes('A90300 22')) ? readU16(rom, site + 1) : same(rom, target, head) ? readU16(rom, target + 10) : -1
    if (dot3 < 0) return null
    const original = bytesOf('4C', word(dot3))
    const code = bytesOf(head, word(loRomAddress(shot)), loRomBank(shot, 0x80), '4C', word(dot3))
    return withNewCode(rom, site, (to) => bytesOf('4C', word(to)), original, code)
  },
  // Holdplayer: lda position,x; beq; lda pfalock,x; beq .t1; lda SPA,x; cmp #SPAburst; bne .t1; rtl.
  yButtonFix: (rom) => {
    const found = only(rom, 'bd....f00dbd....f009bd....c9....' + '....' + '6b')
    if (found < 0) return null
    const at = found + 16
    if (rom[at] === 0xd0 && rom[at + 1] === 0x01) return [{ at, original: hexBytes('D001'), hacked: hexBytes('EAEA') }]
    return rom[at] === 0xea && rom[at + 1] === 0xea ? [{ at, original: hexBytes('D001'), hacked: hexBytes('EAEA') }] : null
  },
  // Found by the icing rule just before it, which reads pfgoal.
  faceoffFix: (rom) => {
    const found = only(rom, 'a9580285a9b9....f005a9a8fd85a9')
    const moved = shift(rom)
    if (found < 0 || moved === null) return null
    const site = found + 15
    const pfgoal = readU16(rom, found + 6)
    const isIn = rom[site] === 0x20 && rom[site + 3] === 0x80
    // fox and foy: where the game's code stores them, or where the new code does.
    const from = isIn ? loRomOffset(loRomBank(site, 0x80), readU16(rom, site + 1)) + FACEOFF_FOX_AT : site + 85
    const fox = rom[from] | (rom[from + 1] << 8) | (rom[from + 2] << 16)
    const foy = fox + 2
    const original = hexBytes(faceoffOriginal(fox, foy))
    if (!isIn && !same(rom, site, original)) return null
    return withNewCode(rom, site, (to) => hexBytes(faceoffCall(to)), original, hexBytes(faceoffCode(PEN_BUF + moved, pfgoal, fox, foy)))
  },
}

function intro(rom: Uint8Array, source: Uint8Array | null, before: string, after: string): Placed[] | null {
  const pattern = before + '........' + after
  const found = only(rom, pattern)
  if (found < 0) return null
  const site = found + before.length / 2
  const call = (from: Uint8Array, at: number) => (from[at] === 0x22 ? from.slice(at, at + 4) : null)
  const fromSource = source && only(source, pattern) >= 0 ? call(source, only(source, pattern) + before.length / 2) : null
  return [{ at: site, original: call(rom, site) ?? fromSource, hacked: hexBytes('EAEAEAEA') }]
}

// Each hack's places in `rom`, or null where it cannot be found there.
function placesOf(rom: Uint8Array, hack: SnesHack, source: Uint8Array | null, inPlace = snesCodeInPlace(rom), amount?: number): Placed[] | null {
  const sites = SITES[hack]
  if (inPlace && sites) {
    return sites.map((site) => ({ at: loRomOffset(site.at >> 16, site.at & 0xffff), original: hexBytes(site.original), hacked: hexBytes(site.hacked) }))
  }
  return RELOCATED[hack]?.(rom, source, amount) ?? null
}

// The amount a hack's code in the ROM holds (its places built from what is there).
function amountIn(rom: Uint8Array, hack: SnesAmount): number {
  const places = placesOf(rom, hack, null)
  if (!places || !places.every((place) => holds(rom, place, 'hacked'))) return SNES_AMOUNT_OFF[hack]
  return places.find((place) => place.amount !== undefined)?.amount ?? SNES_AMOUNT_OFF[hack]
}

const holds = (rom: Uint8Array, place: Placed, which: 'original' | 'hacked') => {
  const expected = place[which]
  return expected !== null && place.at + expected.length <= rom.length && same(rom, place.at, expected)
}

// Where a ROM's code has been moved and a hack's places cannot be found,
// the hack is unknown, and left alone. Worked out once for each ROM the
// project holds; the editor never changes those in place.
const detected = new WeakMap<Uint8Array, SnesHackState>()

export function detectSnesHacks(rom: Uint8Array): SnesHackState {
  const known = detected.get(rom)
  if (known) return known
  const state = detect(rom)
  detected.set(rom, state)
  return state
}

function detect(rom: Uint8Array): SnesHackState {
  const inPlace = snesCodeInPlace(rom)
  const unknown: SnesHack[] = []
  const vaultVersions: SnesHack[] = []
  // With the injury risk chained after the fights (see injuryBonus), their shared place holds its jml, not theirs.
  const fightPlain = snesFightState(rom)
  const fightShared = fightPlain === undefined && rom[SNES_FIGHT_SHARED_SITE] === 0x5c ? snesFightState(rom, [SNES_FIGHT_SHARED_SITE]) : undefined
  const fight = fightPlain ?? (fightShared?.kind === 'in' ? fightShared : undefined)
  const choices = Object.fromEntries(
    SNES_HACKS.map((hack) => {
      // The fights are a block of their own (snesfight.ts), not places as the other hacks are.
      if (hack === 'fighting') {
        if (fight === undefined) unknown.push(hack)
        return [hack, fight?.kind === 'in']
      }
      const places = placesOf(rom, hack, null, inPlace)
      if (places && places.every((place) => holds(rom, place, 'original'))) return [hack, false]
      if (places && places.every((place) => holds(rom, place, 'hacked'))) {
        if (places.some((place) => place.earlier)) vaultVersions.push(hack)
        return [hack, true]
      }
      const earlier = VAULT_VERSIONS[hack] ?? []
      if (inPlace && earlier.some((version) => version.every((site) => holds(rom, placedSite(site), 'hacked')))) {
        vaultVersions.push(hack)
        return [hack, true]
      }
      unknown.push(hack)
      return [hack, false]
    }),
  ) as SnesHackChoices
  // With the fights in, the injury risk's place holds their hook: it is off, not some other code; and the other way round.
  if (fight?.kind === 'in' && unknown.includes('injuryBonus')) unknown.splice(unknown.indexOf('injuryBonus'), 1)
  // Overtime until a goal takes clockcont_0's game over out, as the shootout after one overtime does: the shootout is off then.
  if (inPlace && choices.seasonOvertime && unknown.includes('seasonShootout')) unknown.splice(unknown.indexOf('seasonShootout'), 1)
  if (fight === undefined && choices.injuryBonus && snesFightState(rom, [SNES_FIGHT_SHARED_SITE])?.kind === 'none') unknown.splice(unknown.indexOf('fighting'), 1)
  const amounts = Object.fromEntries(
    SNES_AMOUNTS.map((hack) => [hack, !choices[hack] ? SNES_AMOUNT_OFF[hack] : hack === 'fighting' ? (fight as { bonus: number }).bonus : amountIn(rom, hack)]),
  ) as Record<SnesAmount, number>
  return { choices, unknown, vaultVersions, amounts }
}

const placedSite = (site: Site): Placed => ({ at: loRomOffset(site.at >> 16, site.at & 0xffff), original: hexBytes(site.original), hacked: hexBytes(site.hacked) })

export class SnesHackError extends Error {}

// The ROM with the hacks wanted put in or taken out. Hacks the ROM holds
// something else for are left as they are; asking to change one is an error.
// `updateVault`: hacks the ROM has in NHL94SNESVault's version, where
// NOSE4Web's differs, are replaced by NOSE4Web's if they are to stay on.
export function applySnesHacks(project: RomProject, wanted: Partial<SnesHackChoices>, updateVault = false, amounts: Partial<Record<SnesAmount, number>> = {}): RomProject {
  const { choices, unknown, vaultVersions = [], amounts: had } = detectSnesHacks(project.bytes)
  // An amount is the hack on, or off at SNES_AMOUNT_OFF (0, or 60 for penalty time).
  wanted = { ...wanted }
  for (const hack of SNES_AMOUNTS) {
    const amount = amounts[hack]
    if (amount === undefined) continue
    const [least, most] = SNES_AMOUNT_RANGES[hack]
    if (amount !== SNES_AMOUNT_OFF[hack] && (amount < least || amount > most || !Number.isInteger(amount))) {
      throw new SnesHackError(`${SNES_HACK_TITLES[hack]} must be a whole number from ${least} to ${most}.`)
    }
    wanted[hack] = amount !== SNES_AMOUNT_OFF[hack]
  }
  // The fights going in or out with the injury risk on: they share FallDown's count ($9E:9BD2), the injury risk
  // chained after the fights' jml where both are in. So the injury risk comes out, the rest is done, and it goes
  // back in, chained or not as the fights now are.
  const fightToggles = wanted.fighting !== undefined && wanted.fighting !== choices.fighting && !unknown.includes('fighting')
  const injuryAfter = wanted.injuryBonus ?? choices.injuryBonus
  if (fightToggles && (injuryAfter || choices.injuryBonus) && !unknown.includes('injuryBonus')) {
    // Its amount: the one asked for, else the ROM's if it is on, else the recommended.
    const bonus = amounts.injuryBonus ?? (choices.injuryBonus ? had?.injuryBonus : undefined) ?? RECOMMENDED_SNES_INJURY_BONUS
    const out = choices.injuryBonus ? applySnesHacks(project, { injuryBonus: false }) : project
    const rest = applySnesHacks(out, { ...wanted, injuryBonus: false }, updateVault, { ...amounts, injuryBonus: SNES_AMOUNT_OFF.injuryBonus })
    return injuryAfter ? applySnesHacks(rest, { injuryBonus: true }, false, { injuryBonus: bonus }) : rest
  }
  const problem = clash({ ...choices, ...Object.fromEntries(Object.entries(wanted).filter(([, value]) => value !== undefined)) })
  if (problem) throw new SnesHackError(problem)
  // The fights come out first, so that hacks whose places they hook (the injury risk) can go in, and go in last.
  const fightWanted = wanted.fighting
  const bonus = amounts.fighting !== undefined && amounts.fighting !== SNES_AMOUNT_OFF.fighting ? amounts.fighting : undefined
  const fightChanges = fightWanted !== undefined && (fightWanted !== choices.fighting || (fightWanted && bonus !== undefined && bonus !== had?.fighting))
  if (fightChanges && unknown.includes('fighting')) throw new SnesHackError(`${SNES_HACK_TITLES.fighting} cannot be changed: ${snesFightBlocked(project.bytes) ?? 'this ROM has other code in its place.'}`)
  const rom = fightChanges && !fightWanted ? (withoutSnesFight(project.bytes) as typeof project.bytes).slice() : project.bytes.slice()
  const source = splitSnesFile(project.source)?.rom ?? null
  for (const hack of SNES_HACKS) {
    if (hack === 'fighting') continue
    const want = wanted[hack]
    const update = updateVault && want === true && vaultVersions.includes(hack)
    const amount = isAmount(hack) ? amounts[hack] : undefined
    // A new amount for a hack already in: take it out, then put it in with the amount.
    // A new amount, or NOSE4Web's version of an earlier one, for a hack already in: take it out, then put it in.
    const reAmount = isAmount(hack) && want === true && choices[hack] && ((amount !== undefined && amount !== had?.[hack]) || update)
    if (want === undefined || (want === choices[hack] && !update && !reAmount)) continue
    if (unknown.includes(hack)) {
      throw new SnesHackError(`${SNES_HACK_TITLES[hack]} cannot be changed: this ROM has other code in its place.`)
    }
    // Each hack is placed in the ROM as the ones before it have left it, so that their new code does not overlap.
    if (reAmount) {
      for (const place of placesOf(rom, hack, source) ?? []) if (place.original) rom.set(place.original, place.at)
    }
    const places = placesOf(rom, hack, source, undefined, amount ?? (isAmount(hack) && reAmount ? had?.[hack] : undefined))
    if (!places) throw new SnesHackError(`${SNES_HACK_TITLES[hack]} cannot be changed: this ROM has no room for it.`)
    for (const place of places) {
      const bytes = want ? place.hacked : place.original
      if (!bytes) throw new SnesHackError(`${SNES_HACK_TITLES[hack]} cannot be taken out: this ROM had it when it was opened, so the code it replaced is not known.`)
      rom.set(bytes, place.at)
    }
  }
  // The fights in last, as they grow the ROM, or their bonus changed.
  let out = rom
  if (fightChanges && fightWanted) {
    try {
      out = withSnesFight(rom, bonus ?? (choices.fighting ? had?.fighting : undefined)) as typeof rom
    } catch (e) {
      throw new SnesHackError(e instanceof Error ? e.message : String(e))
    }
  }
  // The 30-second periods add a choice to the menu's Period line, and the one-minute penalties change their lengths.
  return { ...project, bytes: out, settings: refreshSnesSettings(project.bytes, out, project.settings) }
}

// This ROM's choices set to another SNES ROM's hacks. A hack either ROM has
// other code in place of keeps this ROM's choice, and is named where the other
// ROM's differs.
export function snesHacksCopiedFrom(current: SnesHackState, other: SnesHackState): { choices: SnesHackChoices; notCopied: string[] } {
  const choices = { ...current.choices }
  const notCopied: string[] = []
  for (const hack of SNES_HACKS) {
    if (other.choices[hack] === current.choices[hack]) continue
    if (other.unknown.includes(hack) || current.unknown.includes(hack)) {
      notCopied.push(`${SNES_HACK_TITLES[hack]}: one of the two ROMs has other code in its place.`)
    } else {
      choices[hack] = other.choices[hack]
    }
  }
  return { choices, notCopied }
}

// The fixes a league can take without choosing anything, each tested in the
// game. Left as they are: the faceoff spot fix, a choice between eras; the
// hot and cold bug fix, since without the bug every player plays lower than
// leagues are used to (it suits rosters whose ratings are set higher); and
// the Y button fix, a habit players expect.
// Defence control on from the start is not a fix, but the commissioner's choice for every league (2026-11-11).
export const RECOMMENDED_SNES_FIXES: SnesHack[] = ['ppPkFix', 'comebackFix', 'penaltyShotFixes', 'extraAttackerFix', 'secondAssist', 'regainAssist', 'stickShots', 'defenceControl']

// `choices` with the recommended fixes on, except where this ROM has other code.
export function withRecommendedSnesFixes(choices: SnesHackChoices, unknown: SnesHack[]): SnesHackChoices {
  const next = { ...choices }
  for (const hack of RECOMMENDED_SNES_FIXES) if (!unknown.includes(hack)) next[hack] = true
  return next
}

// The order the Hacks page has them in.
const SNES_PAGE_ORDER: SnesHack[] = [
  'hotColdFix', 'ppPkFix', 'comebackFix', 'faceoffFix', 'penaltyShotFixes', 'extraAttackerFix', 'yButtonFix', 'awarenessFix', 'secondAssist', 'stickShots',
  'regainAssist', 'forwardsAndDefence', 'showMaxBoost', 'manualPullGoalie',
  'defenceControl', 'oneMinutePenalties', 'thirtySecondPeriods', 'fourthPeriodOvertime', 'seasonOvertime', 'noInterference', 'noPenaltyShots', 'noGoalPosts', 'hitEnergy', 'holdEnergy', 'injuryBonus', 'noSkatingDrain', 'freeBurst', 'energySpeed', 'goaliePoke', 'skipEaIntro', 'skipPucksIntro',
]

// Whether Edit Lines may put any skater at any position in this ROM.
export function snesAnyPosition(project: RomProject): boolean {
  return project.game.platform === 'snes' && detectSnesHacks(project.bytes).choices.forwardsAndDefence
}

// Hacks found only where the code is as the original game has it, so not
// missed in a ROM whose code has moved.
export function snesHackInPlaceOnly(hack: SnesHack): boolean {
  return hack === 'fighting' || !RELOCATED[hack]
}

// What this ROM has, as a Discord post for a league's owners. Hacks found
// only where the code is in place are not missed where it has moved.
// `extra`: more lines for the post, such as its pictures (hacksheet.ts).
export function snesHacksForDiscord(rom: Uint8Array, name: string, extra: string[] = []): string {
  const { choices, unknown } = detectSnesHacks(rom)
  const inPlace = snesCodeInPlace(rom)
  const { amounts } = detectSnesHacks(rom)
  const lines = SNES_PAGE_ORDER.filter((hack) => choices[hack] && !unknown.includes(hack)).map(
    (hack) => `- **${SNES_HACK_TITLES[hack]}**${isAmount(hack) && amounts ? `: ${snesAmountText(hack, amounts[hack])}` : ''}`,
  )
  const unread = SNES_PAGE_ORDER.filter((hack) => unknown.includes(hack) && (inPlace || !snesHackInPlaceOnly(hack))).map((hack) => SNES_HACK_TITLES[hack])
  return discordPost(name, [...lines, ...extra], unread)
}

// How the hacks in one SNES ROM differ from those in another.
export function snesHackDifferences(before: Uint8Array, after: Uint8Array): string[] {
  const [was, now] = [detectSnesHacks(before), detectSnesHacks(after)]
  const onOff = (value: boolean) => (value ? 'on' : 'off')
  const differs = (hack: SnesHack) => was.choices[hack] !== now.choices[hack] || (isAmount(hack) && was.amounts?.[hack] !== now.amounts?.[hack])
  return SNES_HACKS.filter((hack) => differs(hack) && !was.unknown.includes(hack) && !now.unknown.includes(hack)).map((hack) =>
    isAmount(hack)
      ? `${SNES_HACK_TITLES[hack]}: ${snesAmountText(hack, was.amounts?.[hack] ?? SNES_AMOUNT_OFF[hack])} to ${snesAmountText(hack, now.amounts?.[hack] ?? SNES_AMOUNT_OFF[hack])}.`
      : `${SNES_HACK_TITLES[hack]}: ${onOff(was.choices[hack])} to ${onOff(now.choices[hack])}.`,
  )
}

// For tests: a hack's places found by the code around them, as for a ROM
// whose code has moved, whatever the ROM.
export function relocatedSnesHack(rom: Uint8Array, hack: SnesHack): { at: number; original: Uint8Array | null; hacked: Uint8Array }[] | null {
  return RELOCATED[hack]?.(rom, null) ?? null
}

// Penalty shots retaken (bug 27 in the known bugs list). Every other way a
// penalty shot or shootout attempt ends calls EndPenaltyShotPlay (a goal, the
// loose puck meeting the boards in wallcoll, the time limit, the puck caught
// or carried back), but two whistles leave the shot pending, so the next
// faceoff sets up another from where the shooter stands: checkgoalp's, when a
// bursting player knocks the net off (the goalie-hold code), and pucknorm's
// for a loose puck that has not moved for 2 seconds (out of play), found by
// the Match Viewer project. The fix calls EndPenaltyShotPlay first at both,
// which does nothing outside a penalty shot and keeps X, the player
// AddPenalty2 is called on, then sets d0 again, as it uses it:
//   checkgoalp:  lda #PenGhold; sta d0; jmp AddPenalty2   becomes  jmp net / nop x5
//   pucknorm:    jsl AddPenalty2                          becomes  jsl still
//   net:    jsl EndPenaltyShotPlay; lda #PenGhold; sta d0; jmp AddPenalty2
//   still:  jsl EndPenaltyShotPlay; lda #PenOOP; sta d0; jml AddPenalty2
// The two are put together in unused room in the bank of checkgoalp.
const NET_BEFORE = '0c....ad....d0..68'
const NET_WHISTLE = 'a9080085a54c'
const STILL_BEFORE = 'a9060085a5ce....10..'
const END_PENALTY_SHOT = 'ad....f0..ad....f0..da9c....a9ffff8d....a90a0085a522'
const NET_CODE_SIZE = 12
const STILL_CODE_SIZE = 13

const hexOf = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
const long = (at: number) => bytesOf(word(loRomAddress(at)), loRomBank(at, 0x80))

function penaltyShotFixes(rom: Uint8Array): Placed[] | null {
  const ending = only(rom, END_PENALTY_SHOT)
  if (ending < 0) return null
  const endCall = bytesOf('22', long(ending))
  // Only where the game itself calls it at that address.
  if (findCodeAll(rom, hexOf(endCall)).length === 0) return null
  const netOriginal = only(rom, NET_BEFORE + NET_WHISTLE + '....')
  const netHooked = netOriginal < 0 ? only(rom, NET_BEFORE + '4c....eaeaeaeaea') : -1
  const netFound = netOriginal >= 0 ? netOriginal : netHooked
  const stillFound = only(rom, STILL_BEFORE + '22......80..')
  if (netFound < 0 || stillFound < 0) return null
  const net = netFound + NET_BEFORE.length / 2
  const still = stillFound + STILL_BEFORE.length / 2
  const isIn = netOriginal < 0
  const bank = loRomBank(net, 0x80)
  const room = isIn ? loRomOffset(bank, readU16(rom, net + 1)) : roomInBank(rom, net, NET_CODE_SIZE + STILL_CODE_SIZE)
  if (room < 0) return null
  // AddPenalty2, from the game's jmp or from the new code's.
  const addPenalty = isIn ? readU16(rom, room + 10) : readU16(rom, net + 6)
  const addPenaltyLong = bytesOf(word(addPenalty), bank)
  const netCode = bytesOf(endCall, NET_WHISTLE, word(addPenalty))
  const stillCode = bytesOf(endCall, 'a9060085a5', '5c', addPenaltyLong)
  return [
    { at: net, original: bytesOf(NET_WHISTLE, word(addPenalty)), hacked: bytesOf('4C', word(loRomAddress(room)), 'EAEAEAEAEA') },
    { at: still, original: bytesOf('22', addPenaltyLong), hacked: bytesOf('22', long(room + NET_CODE_SIZE)) },
    { at: room, original: unused(NET_CODE_SIZE + STILL_CODE_SIZE), hacked: bytesOf(netCode, stillCode) },
  ]
}

// The Y button (hook or hold) works for a player locked in an animation, a
// knocked-down one among them, where the game's other buttons do nothing
// while he is locked (doinput tests pfalock for them, not before Y). Holdplayer
// lets a locked player through unless his animation is the speed burst; the
// fix makes it leave for any locked animation, as the other buttons do, by
// turning the branch that skips its rtl into two nops. NHL94SNESVault's
// YButtonBugFix stops it only where pfalock holds 1 (an ordinary knockdown);
// pfalock holds the animation for a fall into the boards or the bench, or a
// player being held, so this covers those too.

// For tests: the faceoff spot fix's new code, for these addresses.
export function snesFaceoffCode(penBuf: number, pfgoal: number, fox: number, foy: number): Uint8Array {
  return hexBytes(faceoffCode(penBuf, pfgoal, fox, foy))
}
