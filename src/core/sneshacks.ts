import { fightTimeText, penaltyTimeText } from './penaltytime'
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
  | 'bodychecks'
  | 'bodychecksShown'
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
  | 'threeOnThree'
  | 'creaseIcing'
  | 'hybridIcing'
  | 'shootoutInjuries'
  | 'fightTime'
  | 'oneTimerFix'

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
  // NHL94SNESVault's PlayerStat_BodyChecks_Display (SDL16 has it), which leaves the column's sort on penalty minutes.
  bodychecksShown: [[
    { at: 0x9c8a60, original: 'BD8A19', hacked: 'BD8E16' },
    { at: 0x9cf32a, original: '504D', hacked: '4366' },
    { at: 0x9c8c18, original: '50656E616C74696573', hacked: '20436865636B732020' },
  ]],
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
  'bodychecks',
  'bodychecksShown',
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
  'threeOnThree',
  'creaseIcing',
  'hybridIcing',
  'shootoutInjuries',
  'fightTime',
  'oneTimerFix',
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
  bodychecks: 'Bodycheck counts for each player',
  bodychecksShown: 'Bodychecks in Player Stats',
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
  threeOnThree: '3 on 3 overtime',
  creaseIcing: 'No icing within the crease',
  hybridIcing: 'Hybrid icing',
  shootoutInjuries: 'The injured sit out the shootout',
  fightTime: 'Fighting penalty time',
  oneTimerFix: 'One-timer that never fires fix',
}

// Hacks that go together, as NHL94SNESVault has them: one that needs another
// on, and two that cannot both be.
// Energy taking all of a skater's speed needs skating to cost nothing: goalies never go to the bench, so the
// drain would slow them more than the original game does (Match Viewer).
const NEEDS: Partial<Record<SnesHack, SnesHack>> = { forwardsAndDefence: 'extraAttackerFix', fourthPeriodOvertime: 'thirtySecondPeriods', energySpeed: 'noSkatingDrain', bodychecksShown: 'bodychecks' }
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

// A hack's title inside a sentence: "the hot and cold bug fix", but "a shootout for ..." as it is.
const theTitle = (hack: SnesHack) => {
  const title = SNES_HACK_TITLES[hack].toLowerCase()
  return /^(a|an) /.test(title) ? title : `the ${title}`
}

// Why these choices cannot go into a ROM together, if they cannot.
function clash(choices: SnesHackChoices): string | null {
  for (const [needer, needed] of Object.entries(NEEDS) as [SnesHack, SnesHack][]) {
    if (choices[needer] && !choices[needed]) return `${SNES_HACK_TITLES[needer]} needs ${theTitle(needed)} on.`
  }
  for (const [a, b] of EXCLUDES) if (choices[a] && choices[b]) return `${SNES_HACK_TITLES[a]} and ${theTitle(b)} cannot both be on.`
  return null
}

export type SnesHackChoices = Record<SnesHack, boolean>

export interface SnesHackState {
  choices: SnesHackChoices
  // Hacks whose places hold something else. They are never changed.
  unknown: SnesHack[]
  // Hacks the ROM has in NHL94SNESVault's version, where NOSE4Web's differs.
  vaultVersions?: SnesHack[]
  // Hacks not offered for this build, which has its own of the same (off, and not to be put in), with why.
  notOffered?: Partial<Record<SnesHack, string>>
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
export type SnesAmount = 'hitEnergy' | 'holdEnergy' | 'injuryBonus' | 'penaltyTime' | 'fighting' | 'injuries' | 'seasonShootout' | 'threeOnThree' | 'fightTime'
export const SNES_AMOUNTS: SnesAmount[] = ['hitEnergy', 'holdEnergy', 'injuryBonus', 'penaltyTime', 'fighting', 'injuries', 'seasonShootout', 'threeOnThree', 'fightTime']
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
    case 'threeOnThree':
      return ['off', 'in the regular season', 'in every overtime'][value] ?? String(value)
    case 'penaltyTime':
      return penaltyTimeText(value)
    case 'fightTime':
      return fightTimeText(value)
    default:
      return value === SNES_AMOUNT_OFF[hack] ? 'off' : String(value)
  }
}
export const SNES_AMOUNT_OFF: Record<SnesAmount, number> = { hitEnergy: 0, holdEnergy: 0, injuryBonus: 0, penaltyTime: 60, fighting: -1, injuries: 0, seasonShootout: 0, threeOnThree: 0, fightTime: 0 }
export const RECOMMENDED_SNES_HIT_ENERGY = 204
export const RECOMMENDED_SNES_HOLD_ENERGY = 102
// Energy lost only to hits, as on the Genesis: skating and bursts cost nothing, a knockdown a third of full energy, a hold half that.
export const SNES_HITS_ONLY = { hitEnergy: 1365, holdEnergy: 683 } as const
// For the Genesis's effect (+27% injuries, 1.33 times for the most-hit): Match Viewer's estimates from 29
// recorded SNES league games, the knockdown counted before its own roll, up to 5 knockdowns, are +4 at +18%
// and 1.23, +5 at +23% and 1.29, +6 at +27% and 1.35, +7 at +32% and 1.41, +8 at +37% and 1.47, +19 at +87%
// and 2.11; indicative only, as the recordings had no SNES injuries.
export const RECOMMENDED_SNES_INJURY_BONUS = 6
export const SNES_AMOUNT_RANGES: Record<SnesAmount, [number, number]> = { hitEnergy: [0, 4096], holdEnergy: [0, 4096], injuryBonus: [0, 20], penaltyTime: [1, 255], fighting: SNES_FIGHT_BONUS_RANGE, injuries: [0, 5], seasonShootout: [0, 2], threeOnThree: [0, 2], fightTime: [0, 4095] }
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

// Where the shootout keeps what it saves, by the ROM's RAM: the original's (and its rebuilds'), in bank $7E; the
// SA-1 builds', with the low variables `shift` on and the game state and the saved state in bank $40 (BW-RAM).
const SHOOTOUT_RAM = [
  { shift: 0, bank: 0x7e, low: 0xf100, game: 0xf880, last: 0xfc08, extra: 0xfc10 },
  { shift: 0x6000, bank: 0x40, low: 0x4810, game: 0x4f90, last: 0x5318, extra: 0x5320 },
]
// The shootout's two hooks' lengths, and where B keeps the tie test it does after.
const SHOOTOUT_A_LENGTH = 37
const SHOOTOUT_B_LENGTH = 51
const SHOOTOUT_B_TEST = 44
// ------------------------------------------------------ 3 on 3 overtime
// As on the Genesis (hacks.ts, threeOnThree): in overtime each team has its
// goalie and its line's LW, C and RD; a penalty gives the other team a skater
// more (4 on 3, 5 on 3), 4 on 4 when it ends until the next whistle, then 3 on
// 3 again; a team with three in the box plays two skaters, as a team has six
// sort objects and each boxed player keeps his (Match Viewer, on the Genesis).
// The SNES has no overtime mark: overtime is gsp 3 or more, and not in a
// shootout (shootoutmode) or a penalty shot (penshot); for the regular season
// only, OptPlayMode 0 too. Its places, found by the code around them:
// - releasepl, SetPlList and getlinee load priolist as lda #bank / sta a0+2 /
//   lda #priolist / sta a0; the last two become jsr / nops to code that, in
//   overtime, points a0 at an order of its own (G, C, LW, RD, LD, RW, EA) in
//   its own bank (phk, and per for the address). SetPlList's penalty shot order
//   (priolist+7) is loaded after, as before.
// - InProgress_coin's stz a2 / jsl InProgress_ap / lda #2 / sta a2 / jsl
//   InProgress_ap (not reached in a penalty shot) becomes jsr / nops to code
//   that, in overtime, counts each team's players kept off by penalties as
//   InProgress_ap does (the "just called" bit cleared, coincidental and
//   injured not counted, at most 2), and every boxed player, then sets each
//   team 4 and the other's penalties beyond its own, at most 6 less its boxed
//   players and at least 3; else the two calls as they were.
//   Neither team more than two skaters ahead of the other, as the NHL allows.
// - StartPer's stz reloadtime, before the period's clock is set, becomes jsr
//   to code that does it, then the same count for the opening faceoff (a
//   penalty from the third period carries over as 4 on 3), and in a shootout
//   puts both teams back to 6.
// - puckfaceoff2's row of its formation table for the number on the ice
//   (lda d4 / negate / adc #6 / asl x3 / sta d4) becomes jsr / nops: in
//   overtime the full row, each player on his own spot.
// - GetLowestPen's power-play team at full strength test (lda tmap,y /
//   cmp #6, then beq) becomes jsr / nops: in overtime Z is set when that team
//   has no one in its box list but for coincidental penalties.
const OT3_TEXTS = ['Off: 5 on 5, as the original game', 'In the regular season', 'In every overtime, playoffs included']
export const SNES_THREE_ON_THREE_TEXTS = OT3_TEXTS

// Machine code from hex, labels, 8-bit branches (opcode and label), per and brl (label).
type Asm65 = (string | number[] | Uint8Array | { label: string } | { branch: number; to: string } | { per: string } | { brl: string })[]
function asm65(parts: Asm65): Uint8Array {
  const size = (part: Asm65[number]) =>
    typeof part === 'string' ? hexBytes(part).length : Array.isArray(part) || part instanceof Uint8Array ? part.length : 'label' in part ? 0 : 'branch' in part ? 2 : 3
  const labels = new Map<string, number>()
  let pc = 0
  for (const part of parts) {
    if (typeof part === 'object' && !Array.isArray(part) && !(part instanceof Uint8Array) && 'label' in part) labels.set(part.label, pc)
    pc += size(part)
  }
  const out: number[] = []
  for (const part of parts) {
    if (typeof part === 'string') out.push(...hexBytes(part))
    else if (Array.isArray(part) || part instanceof Uint8Array) out.push(...part)
    else if ('label' in part) continue
    else if ('branch' in part) {
      const to = labels.get(part.to)
      const by = to === undefined ? NaN : to - (out.length + 2)
      if (!(by >= -128 && by <= 127)) throw new Error(`Branch to ${part.to} out of reach.`)
      out.push(part.branch, by & 0xff)
    } else {
      const [op, name] = 'per' in part ? [0x62, part.per] : [0x82, (part as { brl: string }).brl]
      const by = labels.get(name)! - (out.length + 3)
      out.push(op, by & 0xff, (by >> 8) & 0xff)
    }
  }
  return Uint8Array.from(out)
}
const BCC = 0x90
const BCS = 0xb0
const BEQ = 0xf0
const BNE = 0xd0
const BMI = 0x30
const BPL = 0x10
const BRA = 0x80

interface Ot3Env {
  gsp: number
  shootout: number
  penshot: number
  tmap: number
  tmpdst: number
  tmboxlist: number
  reloadtime: number
  playMode: Uint8Array
  prio: { bank: number; address: number }
  a0: number
  a2: number
  d0: number
  d1: number
  d4: number
  inProgressAp: Uint8Array
}

// Falls through when 3 on 3 is on now (season: in the regular season too), else branches to `skip`.
const ot3Active = (env: Ot3Env, season: boolean, skip: string): Asm65 => [
  bytesOf('AD', word(env.gsp), 'C9 0300'),
  { branch: BCC, to: skip },
  bytesOf('AD', word(env.shootout)),
  { branch: BNE, to: skip },
  bytesOf('AD', word(env.penshot)),
  { branch: BNE, to: skip },
  ...(season ? [bytesOf('AF', env.playMode), { branch: BNE, to: skip }] : []),
]
// Team `base`'s count (tmpdst from base: 0, or $34 for the visitors): d0 its penalties as InProgress_ap counts them,
// at most 2, d1 every player in its box. Y and X used.
const ot3Count = (env: Ot3Env, base: number, tag: string): Asm65 => [
  bytesOf('64', env.d0, '64', env.d1, 'A0 3200'),
  { label: `lp${tag}` },
  bytesOf('98 18 69', word(base), 'AA BD', word(env.tmpdst)),
  { branch: BMI, to: `nap${tag}` },
  { branch: BEQ, to: `nap${tag}` },
  bytesOf('E6', env.d1, '29 FFDF 9D', word(env.tmpdst), '89 0050'),
  { branch: BNE, to: `nap${tag}` },
  bytesOf('A5', env.d0, 'C9 0200'),
  { branch: BEQ, to: `nap${tag}` },
  bytesOf('E6', env.d0),
  { label: `nap${tag}` },
  '88 88',
  { branch: BPL, to: `lp${tag}` },
]
// Both teams' players on the ice in overtime; X kept, a2 left at 2 as InProgress_coin leaves it.
const ot3Body = (env: Ot3Env): Asm65 => [
  'DA',
  ...ot3Count(env, 0x34, 'v'),
  bytesOf('D4', env.d0, 'D4', env.d1),
  ...ot3Count(env, 0, 'h'),
  // Visitors: 4 + max(0, home's - theirs), at most max(3, 6 - their boxed).
  bytesOf('A5', env.d0, '38 E3 03'),
  { branch: BPL, to: 'p1' },
  'A9 0000',
  { label: 'p1' },
  bytesOf('18 69 0400 8D', word(env.tmap + 2), 'A9 0600 38 E3 01 C9 0300'),
  { branch: BCS, to: 'f1' },
  'A9 0300',
  { label: 'f1' },
  bytesOf('CD', word(env.tmap + 2)),
  { branch: BCS, to: 'k1' },
  bytesOf('8D', word(env.tmap + 2)),
  { label: 'k1' },
  // Home: 4 + max(0, visitors' - home's), at most max(3, 6 - home's boxed).
  bytesOf('A3 03 38 E5', env.d0),
  { branch: BPL, to: 'p2' },
  'A9 0000',
  { label: 'p2' },
  bytesOf('18 69 0400 8D', word(env.tmap), 'A9 0600 38 E5', env.d1, 'C9 0300'),
  { branch: BCS, to: 'f2' },
  'A9 0300',
  { label: 'f2' },
  bytesOf('CD', word(env.tmap)),
  { branch: BCS, to: 'k2' },
  bytesOf('8D', word(env.tmap)),
  { label: 'k2' },
  // Neither team more than two skaters ahead of the other, as the NHL allows (Match Viewer: with three of a team in
  // the box the other had five against its two): each at most the other's + 2.
  bytesOf('AD', word(env.tmap), '18 69 0200 CD', word(env.tmap + 2)),
  { branch: BCS, to: 'g1' },
  bytesOf('8D', word(env.tmap + 2)),
  { label: 'g1' },
  bytesOf('AD', word(env.tmap + 2), '18 69 0200 CD', word(env.tmap)),
  { branch: BCS, to: 'g2' },
  bytesOf('8D', word(env.tmap)),
  { label: 'g2' },
  bytesOf('68 68 A9 0200 85', env.a2, 'FA'),
]
const ot3Prio = (env: Ot3Env, season: boolean) =>
  asm65([
    bytesOf('A9', word(env.prio.address), '85', env.a0),
    ...ot3Active(env, season, 'r'),
    bytesOf('4B 4B 68 29 FF00 85', env.a0 + 2),
    { per: 'list' },
    bytesOf('68 85', env.a0),
    { label: 'r' },
    '6B',
    { label: 'list' },
    '00 04 03 02 01 05 06 FF',
  ])
const ot3RecountOriginal = (env: Ot3Env) => bytesOf('64', env.a2, '22', env.inProgressAp, 'A9 0200 85', env.a2, '22', env.inProgressAp)
const ot3Recount = (env: Ot3Env, season: boolean) =>
  asm65([...ot3Active(env, season, 'orig'), { brl: 'ot' }, { label: 'orig' }, ot3RecountOriginal(env), '6B', { label: 'ot' }, ...ot3Body(env), '6B'])
const ot3Start = (env: Ot3Env, season: boolean) =>
  asm65([
    bytesOf('9C', word(env.reloadtime), 'AD', word(env.shootout)),
    { branch: BEQ, to: 'ot' },
    bytesOf('A9 0600 8D', word(env.tmap), '8D', word(env.tmap + 2), '6B'),
    { label: 'ot' },
    ...ot3Active(env, season, 'r'),
    { brl: 'body' },
    { label: 'r' },
    '6B',
    { label: 'body' },
    ...ot3Body(env),
    '6B',
  ])
const ot3FaceoffOriginal = (env: Ot3Env) => bytesOf('A5', env.d4, '49 FFFF 1A 18 69 0600 0A 0A 0A 85', env.d4)
const ot3Faceoff = (env: Ot3Env, season: boolean) =>
  asm65([...ot3Active(env, season, 'n'), bytesOf('64', env.d4, '6B'), { label: 'n' }, ot3FaceoffOriginal(env), '6B'])
const ot3ClockOriginal = (env: Ot3Env) => bytesOf('B9', word(env.tmap), 'C9 0600')
const ot3Clock = (env: Ot3Env, season: boolean) =>
  asm65([
    ...ot3Active(env, season, 'n'),
    'DA 98',
    { branch: BEQ, to: 't0' },
    'A2 1A00',
    { branch: BRA, to: 't1' },
    { label: 't0' },
    'A2 0000',
    { label: 't1' },
    { label: 'loop' },
    bytesOf('BD', word(env.tmboxlist), 'E8 29 FF00 89 8000'),
    { branch: BNE, to: 'none' },
    'C0 0000',
    { branch: BEQ, to: 'h' },
    '18 69 3400',
    { label: 'h' },
    bytesOf('DA AA BD', word(env.tmpdst), 'FA 89 0040'),
    { branch: BNE, to: 'loop' },
    'FA A9 0100 6B',
    { label: 'none' },
    'FA A9 0000 6B',
    { label: 'n' },
    ot3ClockOriginal(env),
    '6B',
  ])
const jsrPadded = (length: number) => (address: number) => bytesOf('20', word(address), new Array(length - 3).fill(0xea))

// The places of 3 on 3 overtime in this ROM, and which choice (1 the regular season, 2 every overtime) its code is.
function threeOnThreePlaces(rom: Uint8Array, amount?: number): Placed[] | null {
  const s = shift(rom)
  if (s === null) return null
  // priolist (two orders of 7), and its loads: lda #bank / sta a0+2, then lda #priolist / sta a0 or the hook.
  const list = only(rom, '00010204030506000301020405 06'.replace(' ', ''))
  if (list < 0) return null
  const prio = { bank: loRomBank(list, 0x80), address: loRomAddress(list) }
  const loads = findCodeAll(rom, `a9${prio.bank.toString(16).padStart(2, '0')}0085(..)`).filter(({ at }) => {
    const next = at + 5
    return (rom[next] === 0xa9 && readU16(rom, next + 1) === prio.address && rom[next + 3] === 0x85) || (rom[next] === 0x20 && rom[next + 3] === 0xea && rom[next + 4] === 0xea)
  })
  if (loads.length !== 3) return null
  const a0 = loads[0].groups[0] - 2
  if (loads.some(({ groups }) => groups[0] !== a0 + 2)) return null
  // InProgress_ap: lda #6 / sta d1 / lda #$32 / sta d0 / lda a2 / beq; and InProgress_coin between lda penshot / bne and stx.
  const penshot = 0x1e9b + s
  const ap = findCodeAll(rom, 'a90600 85(..) a93200 85(..) a5(..) f003 a93400'.replace(/ /g, ''))
  if (ap.length !== 1) return null
  const [d1, d0, a2] = ap[0].groups
  const coin = only(rom, `ad${hex16(penshot)}d0..` + '..'.repeat(15) + '86..a20e00')
  const start = only(rom, '64..22......a9020085..22......' + '......' + '22......22......22......22......ad')
  const faceoffs = findCodeAll(rom, `ad${hex16(0x17a6 + s)}85..a6..bd....f0..ad${hex16(0x17a8 + s)}85(..)` + '..'.repeat(15) + 'a9..0085')
  const faceoff = faceoffs.length === 1 ? faceoffs[0].at : -1
  const clock = only(rom, 'a4..' + '..'.repeat(6) + 'f0..a5..38e5')
  const tail = only(rom, 'ee....ad....c90300f0..90..a903008d....af........06' + '.'.repeat(24) + 'f0..a904008d')
  if (coin < 0 || start < 0 || faceoff < 0 || clock < 0 || tail < 0) return null
  const env: Ot3Env = {
    gsp: 0x1630 + s,
    shootout: 0x1d81 + s,
    penshot,
    tmap: 0x17a6 + s,
    tmpdst: 0x1852 + s,
    tmboxlist: 0x18ba + s,
    reloadtime: 0x0cc7 + s,
    playMode: rom.slice(tail + 20, tail + 23),
    prio,
    a0,
    a2,
    d0,
    d1,
    d4: faceoffs[0].groups[0],
    inProgressAp: bytesOf(word(loRomAddress(ap[0].at)), loRomBank(ap[0].at, 0x80)),
  }
  const sites = {
    prio: loads.map(({ at }) => at + 5),
    coin: coin + 5,
    start: start + 15,
    faceoff: faceoff + 17,
    clock: clock + 2,
  }
  // The places as the code for `season` gives them. Each site calls a stub in its own bank (jsl / rts, 5 bytes),
  // and the stub the code, in a bank with room (the original game's $9B, then $80), as the sites' banks have
  // little: so the hacks that need room there still find it. Where the hack is in, each call says where.
  const placesFor = (season: boolean): Placed[] | null => {
    const parts = [
      ...sites.prio.map((at) => ({ at, length: 5, original: bytesOf('A9', word(prio.address), '85', a0), code: ot3Prio(env, season) })),
      { at: sites.coin, length: 15, original: ot3RecountOriginal(env), code: ot3Recount(env, season) },
      { at: sites.start, length: 3, original: bytesOf('9C', word(env.reloadtime)), code: ot3Start(env, season) },
      { at: sites.faceoff, length: 15, original: ot3FaceoffOriginal(env), code: ot3Faceoff(env, season) },
      { at: sites.clock, length: 6, original: ot3ClockOriginal(env), code: ot3Clock(env, season) },
    ]
    const STUB = 5
    const bankOf = (at: number) => at - (at % 0x8000)
    const open = parts.filter((part) => same(rom, part.at, part.original))
    const stubRoom = new Map<number, number>()
    for (const bank of new Set(open.map((part) => bankOf(part.at)))) {
      const at = roomInBank(rom, bank, STUB * open.filter((part) => bankOf(part.at) === bank).length)
      if (at < 0) return null
      stubRoom.set(bank, at)
    }
    const farTotal = open.reduce((sum, part) => sum + part.code.length, 0)
    let far = -1
    for (const bank of [0x9b, 0x80]) {
      const start = (bank & 0x7f) << 15
      if (farTotal > 0 && start < rom.length) far = roomInBank(rom, start, farTotal)
      if (far >= 0 || farTotal === 0) break
    }
    if (farTotal > 0 && far < 0) return null
    const placed: Placed[] = []
    for (const part of parts) {
      let stub: number
      let code: number
      if (same(rom, part.at, part.original)) {
        stub = stubRoom.get(bankOf(part.at))!
        stubRoom.set(bankOf(part.at), stub + STUB)
        code = far
        far += part.code.length
      } else {
        if (rom[part.at] !== 0x20) return null
        stub = loRomOffset(loRomBank(part.at, 0x80), readU16(rom, part.at + 1))
        if (rom[stub] !== 0x22 || rom[stub + 4] !== 0x60) return null
        code = loRomOffset(rom[stub + 3], readU16(rom, stub + 1))
      }
      placed.push(
        { at: part.at, original: part.original, hacked: jsrPadded(part.length)(loRomAddress(stub)) },
        { at: stub, original: unused(STUB), hacked: bytesOf('22', word(loRomAddress(code)), loRomBank(code, 0x80), '60') },
        { at: code, original: unused(part.code.length), hacked: part.code, amount: season ? 1 : 2 },
      )
    }
    return placed
  }
  if (amount === 1) return placesFor(true)
  if (amount === 2) return placesFor(false)
  // Which code the ROM holds, if any: the regular season's, or every overtime's.
  for (const season of [true, false]) {
    const places = placesFor(season)
    if (places && places.every((place) => holds(rom, place, 'hacked'))) return places
  }
  return placesFor(false)
}

// ------------------------------------------------------------------- icing
// The SNES plays touch icing as the Genesis does (a2touchpuck arms it; the
// next player to touch the puck past the goal line decides), with two
// differences (Match Viewer): PuckIChk marks any crossing past y $108, with no
// crease exception, and updateplayers waves icing off before the crossing when
// a defending player, the goalie too, is within 30 of a low, slow puck. Two
// options, found by the code around them:
// - creaseIcing: PuckIChk's mark, lda #ifcgl / tsb iflags (its rtl kept),
//   becomes jsl / nops to code that drops icing (trb ifok) for a puck within
//   the crease's width, |puckx| 44 or less, as the Genesis does, else marks.
// - hybridIcing: pucknorm's jsl PuckIChk becomes jsl to code that calls it,
//   and when that has just marked the crossing with icing armed, decides as the
//   Genesis version does (hacks.ts): each team's skater nearest the line across
//   the end-zone dots (y 206; past it counts as there), goalies, objects off the
//   ice (position 0 or negative) and the unavailable (pflags $1000) left out; a
//   defender as near or nearer, icing at once (AddPenalty, X and a3 the icer,
//   d0 PenIcing, as a2touchpuck calls it), else waved off (trb ifok). With the
//   crease option too, a puck it drops is never decided.
interface IcingEnv {
  iflags: number
  puckx: number
  ypos: number
  position: number
  pflags: number
  pfteam: number
  a3: number
  d0: number
  addPenalty: Uint8Array
  puckIChk: Uint8Array
}

function icingEnv(rom: Uint8Array): { env: IcingEnv; mark: number; call: number } | null {
  const s = shift(rom)
  if (s === null) return null
  const checks = findCodeAll(rom, 'ad(....)890400f0..890100d0..ad(....)10..a9080185..ad....890200d0..a9f8fe38ed(....)10..6ba9080138ed....10..')
  if (checks.length !== 1) return null
  const [iflags, puckc, pucky] = checks[0].groups
  const check = checks[0].at
  const mark = check + 50
  const penalty = only(rom, `ad${hex16(iflags + 1)}29ff000a85..aaa90c0085..22`)
  if (penalty < 0) return null
  const puckIChk = bytesOf(word(loRomAddress(check)), loRomBank(check, 0x80))
  // pucknorm's call: jsl PuckIChk (or the hack's code) / jsl ChkOffsides / lda gmclock / bne / lda puckc / bpl.
  const calls = findCodeAll(rom, `22(......)22......ad....d0..ad${hex16(puckc)}10..`).filter(({ at }) => {
    if (same(rom, at + 1, puckIChk)) return true
    const code = loRomOffset(rom[at + 3], readU16(rom, at + 1))
    return code >= 0 && code + 8 <= rom.length && same(rom, code + 4, bytesOf('22', puckIChk))
  })
  if (calls.length !== 1) return null
  return {
    env: {
      iflags,
      puckx: pucky - 0x62,
      ypos: pucky - 0x1c,
      position: 0x0f43 + s,
      pflags: 0x1283 + s,
      pfteam: 0x1503 + s,
      a3: rom[penalty + 8],
      d0: rom[penalty + 14],
      addPenalty: rom.slice(penalty + 16, penalty + 19),
      puckIChk,
    },
    mark,
    call: calls[0].at,
  }
}

const creaseMarkOriginal = (env: IcingEnv) => bytesOf('A9 0100 0C', word(env.iflags))
const creaseCode = (env: IcingEnv) =>
  asm65([
    bytesOf('AD', word(env.puckx)),
    { branch: BPL, to: 'p' },
    '49 FFFF 1A',
    { label: 'p' },
    'C9 2D00',
    { branch: BCS, to: 'mark' },
    bytesOf('A9 0400 1C', word(env.iflags), '6B'),
    { label: 'mark' },
    bytesOf('A9 0100 0C', word(env.iflags), '6B'),
  ])
// Locals on the stack: the icing team's nearest at 1,s, the defenders' at 3,s, the dots' y at 5,s.
const hybridCode = (env: IcingEnv) =>
  asm65([
    bytesOf('AD', word(env.iflags), '48 22', env.puckIChk, '68 89 0100'),
    { branch: BEQ, to: 'fresh' },
    '6B',
    { label: 'fresh' },
    bytesOf('AD', word(env.iflags), '29 0500 C9 0500'),
    { branch: BEQ, to: 'go' },
    '6B',
    { label: 'go' },
    bytesOf('DA 5A D4', env.a3, 'D4', env.d0),
    bytesOf('AD', word(env.iflags), '89 0200'),
    { branch: BNE, to: 'top' },
    'A9 32FF',
    { branch: BRA, to: 'dot' },
    { label: 'top' },
    'A9 CE00',
    { label: 'dot' },
    '48 F4 FF7F F4 FF7F',
    // The icing team, 0 home or 1 visitors, in d0.
    bytesOf('AD', word(env.iflags + 1), '29 FF00 0A AA BD', word(env.pfteam)),
    { branch: BEQ, to: 'it' },
    'A9 0100',
    { label: 'it' },
    bytesOf('85', env.d0, 'A2 1600'),
    { label: 'loop' },
    bytesOf('BD', word(env.position)),
    { branch: BMI, to: 'next' },
    { branch: BEQ, to: 'next' },
    bytesOf('BD', word(env.pflags), '89 0010'),
    { branch: BNE, to: 'next' },
    bytesOf('BD', word(env.ypos), '38 E3 05 A8 A3 05'),
    { branch: BMI, to: 'bot' },
    '98 49 FFFF 1A',
    { branch: BRA, to: 'chk' },
    { label: 'bot' },
    '98',
    { label: 'chk' },
    { branch: BPL, to: 'pos' },
    'A9 0000',
    { label: 'pos' },
    bytesOf('A8 BD', word(env.pfteam)),
    { branch: BEQ, to: 'h' },
    'A9 0100',
    { label: 'h' },
    bytesOf('C5', env.d0),
    { branch: BEQ, to: 'att' },
    '98 C3 03',
    { branch: BCS, to: 'next' },
    '83 03',
    { branch: BRA, to: 'next' },
    { label: 'att' },
    '98 C3 01',
    { branch: BCS, to: 'next' },
    '83 01',
    { label: 'next' },
    'CA CA',
    { branch: BPL, to: 'loop' },
    // Defenders as near or nearer: icing; else waved off.
    'A3 03 C3 01',
    { branch: BEQ, to: 'call' },
    { branch: BCC, to: 'call' },
    bytesOf('A9 0400 1C', word(env.iflags)),
    { branch: BRA, to: 'out' },
    { label: 'call' },
    bytesOf('AD', word(env.iflags + 1), '29 FF00 0A AA 85', env.a3, 'A9 0C00 85', env.d0, '22', env.addPenalty),
    { label: 'out' },
    bytesOf('68 68 68 68 85', env.d0, '68 85', env.a3, '7A FA 6B'),
  ])

// A site that jsl's to new code: the site as it is to be, and the code, where the site's jsl says when the hack is
// in, else in room in the original game's bank $9B, then $80, then the site's own bank.
function withFarCode(rom: Uint8Array, site: number, original: Uint8Array, pad: number, code: Uint8Array): Placed[] | null {
  const isIn = !same(rom, site, original)
  let room = -1
  if (isIn) {
    if (rom[site] !== 0x22) return null
    room = loRomOffset(rom[site + 3], readU16(rom, site + 1))
  } else {
    for (const bank of [0x9b, 0x80, loRomBank(site, 0x80)]) {
      const start = (bank & 0x7f) << 15
      if (start < rom.length) room = roomInBank(rom, start, code.length)
      if (room >= 0) break
    }
  }
  if (room < 0) return null
  return [
    { at: site, original, hacked: bytesOf('22', word(loRomAddress(room)), loRomBank(room, 0x80), new Array(pad).fill(0xea)) },
    { at: room, original: unused(code.length), hacked: code },
  ]
}

// -------------------------------------------------------- fighting penalty time
// As on the Genesis (hacks.ts, fightSeconds): how long a fight keeps each
// fighter in the box, in seconds of the game clock. InProgress, sending a
// player to the box, works out the time into d2 (minutes x 60, ora #$2000),
// then picks his team's half (.6: clc / adc d0 / tay, then lda tmpdst,y) and
// stores it, keeping the old time's $1000. That clc / adc d0 / tay becomes jsl
// to code that does it, then for the fighting penalties ($2A, and $2C the
// winner's, the penalty [a0] as InProgress logs it) puts $2000 and the set
// time in d2. Minutes and coincidental majors as before. 0 is off.
function fightTimePlaces(rom: Uint8Array, amount?: number): Placed[] | null {
  const times = findCodeAll(rom, 'a2....a5(..)29ff0022......090020')
  if (times.length !== 1) return null
  const d2 = times[0].groups[0]
  // .6, just after: plx / lda a2 / beq / lda #$34.
  const sites = findCodeAll(rom, 'faa5..f003a93400').filter(({ at }) => at > times[0].at && at - times[0].at < 0x20)
  if (sites.length !== 1) return null
  const site = sites[0].at + 8
  // The penalty's logging before it: lda [a0] / and #$FF / sep #$20.
  const logs = findCodeAll(rom, 'a7(..)29ff00e220').filter(({ at }) => at < times[0].at && times[0].at - at < 0x60)
  if (logs.length !== 1) return null
  const a0 = logs[0].groups[0]
  const isIn = rom[site] === 0x22
  let d0: number
  let seconds = amount ?? 0
  let room = -1
  if (isIn) {
    room = loRomOffset(rom[site + 3], readU16(rom, site + 1))
    if (room < 0 || rom[room] !== 0x18 || rom[room + 1] !== 0x65) return null
    d0 = rom[room + 2]
    if (amount === undefined) seconds = readU16(rom, room + 20) & 0x0fff
  } else {
    if (rom[site] !== 0x18 || rom[site + 1] !== 0x65 || rom[site + 3] !== 0xa8) return null
    d0 = rom[site + 2]
  }
  const value = seconds >= 1 && seconds < 0x1000 ? seconds : 300
  const code = asm65([
    bytesOf('18 65', d0, 'A8 A7', a0, '29 FF00 C9 2A00'),
    { branch: BEQ, to: 'f' },
    'C9 2C00',
    { branch: BNE, to: 'r' },
    { label: 'f' },
    bytesOf('A9', word(value | 0x2000), '85', d2),
    { label: 'r' },
    '6B',
  ])
  if (!isIn) {
    for (const bank of [0x9b, 0x80, loRomBank(site, 0x80)]) {
      const start = (bank & 0x7f) << 15
      if (start < rom.length) room = roomInBank(rom, start, code.length)
      if (room >= 0) break
    }
  }
  if (room < 0) return null
  return [
    { at: site, original: bytesOf('18 65', d0, 'A8'), hacked: bytesOf('22', word(loRomAddress(room)), loRomBank(room, 0x80)) },
    { at: room, original: unused(code.length), hacked: code, amount: value },
  ]
}

// ---------------------------------------------------- the one-timer that never fires
// Found by Match Viewer (SNES_SHOOTING 4.5): a one-timer request starts the
// receiver's swing (SPAonetimerf or SPAonetimerb), whose first frame holds
// while asspassrec waits for the puck, keeping him from taking it (nopuck).
// When the wait ends without a shot (the pass late, someone else touching it,
// or B pressed), asspassrec's .6 clears the request and leaves the assignment
// but not the swing; he then takes the puck the ordinary way and carries it
// through the rest of the swing, and no shot comes (2 of 1,043 swings in 25
// computer games). .6's lda #$FFFF / sta passReceiverPlayerNum becomes jsl /
// nops to code that, when he is still winding up (one of the two swings,
// SPAnum below $10), sets him gliding (SPAglide, by SetSPAFromA, as
// puckfaceoff2 does), then does them. Found by the code around them.
function oneTimerPlaces(rom: Uint8Array): Placed[] | null {
  // .6 after its first 6 bytes (lda #$FFFF / sta passReceiverPlayerNum, or the hack's jsl / nops).
  const sixes = findCodeAll(rom, '9e....9c....bd....29feff9d....4c....').filter(({ at }) => at >= 6 && ((rom[at - 6] === 0xa9 && rom[at - 5] === 0xff && rom[at - 4] === 0xff && rom[at - 3] === 0x8d) || (rom[at - 6] === 0x22 && rom[at - 2] === 0xea && rom[at - 1] === 0xea)))
  const eights = findCodeAll(rom, 'bd(....)c9(....)f0..c9(....)f0..5aa00000e00c00')
  if (sixes.length !== 1 || eights.length !== 1) return null
  const site = sixes[0].at - 6
  let receiver: number
  if (rom[site] === 0x22) {
    const code = loRomOffset(rom[site + 3], readU16(rom, site + 1))
    // The code ends lda #$FFFF / sta passReceiverPlayerNum / rtl, at 28 from its start.
    if (code < 0 || !same(rom, code + 28, hexBytes('A9FFFF8D'))) return null
    receiver = readU16(rom, code + 32)
  } else receiver = readU16(rom, site + 4)
  const [spa, forehand, backhand] = eights[0].groups
  // puckfaceoff2's skater: lda #SPAgready / bra / lda #SPAglide / jsl SetSPAFromA / jsl updateanim.
  const glides = findCodeAll(rom, 'a9....8003a9(....)22(......)22').filter(({ groups }) => groups[0] !== forehand)
  if (glides.length !== 1) return null
  const glide = glides[0].groups[0]
  const setSpa = rom.slice(glides[0].at + 9, glides[0].at + 12)
  const code = asm65([
    bytesOf('BD', word(spa), 'C9', word(forehand)),
    { branch: BEQ, to: 'w' },
    bytesOf('C9', word(backhand)),
    { branch: BNE, to: 'd' },
    { label: 'w' },
    bytesOf('BD', word(spa + 0x20), 'C9 1000'),
    { branch: BCS, to: 'd' },
    bytesOf('A9', word(glide), '22', setSpa),
    { label: 'd' },
    bytesOf('A9 FFFF 8D', word(receiver), '6B'),
  ])
  return withFarCode(rom, site, bytesOf('A9 FFFF 8D', word(receiver)), 2, code)
}

// ------------------------------------------------ the injured out of the shootout
// For the shootout of a tied regular-season game (seasonShootout): a skater
// out for the game takes no attempt (Match Viewer's reading). PlayShootout
// takes each attempt's shooter from the team's list (.t1x the visitors, .t1xx
// the home team: tay / sep #$20 / lda list,y with y the round 1 to 5, then
// rep / and / dec / sta BA_Skater_Offset); each becomes jsl / nops to code
// that, while the season shootout's mark is set, steps y on through 1 to 5
// (wrapping) past each listed player whose tmpdst, as saved when the shootout
// began (StartGame_go clears the game's), is $FFFC, out for the game; a
// period's injury is over by then (PeriodOver). With all five out, the
// listed player as before. Outside the season shootout, the original's.
// McMarkis's 2 MB and SA-1 builds also mark a player hurt in a fight in
// fightinj (a byte a roster slot, as tmpdst's index / 2), as his major's box
// time covers his $FFFC until it is served (FightInjuredKeep); StartGame_go
// clears it (FightGameStart). There PlayShootout's jsl StartGame_go becomes jsl
// to code that, while the mark is set, first copies it to free RAM (Match
// Viewer: $7E:FE00, or $40:5800 on the SA-1 builds), and the skip passes over
// a player marked there too.
const SHOOTOUT_SITES = [
  { pattern: 'c22029ff003a8d....a90c008d....a902008d', list: 0x1d79, team: 0x34 },
  { pattern: 'c22029ff003a8d....a900008d....9c', list: 0x1d71, team: 0 },
]
const shooterOriginal = (list: number) => bytesOf('A8 E2 20 B9', word(list))
const shooterCode = (list: number, saved: Uint8Array, team: number, copy: Uint8Array | null) =>
  asm65([
    'A8 AF F0F07E 29 FF00',
    { branch: BEQ, to: 'orig' },
    'DA 5A F4 0500',
    { label: 'loop' },
    bytesOf('B9', word(list), '29 FF00'),
    { branch: BEQ, to: 'ok' },
    bytesOf('3A 0A 18 69', word(team), 'AA BF', saved, 'C9 FCFF'),
    ...(copy ? [{ branch: BEQ, to: 'skip' }, bytesOf('8A 4A AA BF', copy, '29 FF00'), { branch: BEQ, to: 'ok' }] : [{ branch: BNE, to: 'ok' }]),
    { label: 'skip' },
    'C8 C0 0600',
    { branch: BCC, to: 'in' },
    'A0 0100',
    { label: 'in' },
    'A3 01 3A 83 01',
    { branch: BNE, to: 'loop' },
    'A3 03 A8',
    { label: 'ok' },
    '68 68 FA',
    { label: 'orig' },
    bytesOf('E2 20 B9', word(list), '6B'),
  ])

// The copy of fightinj (52 bytes), then StartGame_go.
const fightCopyCode = (fightinj: Uint8Array, copy: Uint8Array, startGame: Uint8Array) =>
  asm65([
    'AF F0F07E 29 FF00',
    { branch: BEQ, to: 'go' },
    'DA A2 3200',
    { label: 'loop' },
    bytesOf('BF', fightinj, '9F', copy, 'CA CA'),
    { branch: BPL, to: 'loop' },
    'FA',
    { label: 'go' },
    bytesOf('5C', startGame),
  ])
const FIGHT_COPY = { 0x7e: 0xfe00, 0x40: 0x5800 } as Record<number, number>

function shootoutInjuryPlaces(rom: Uint8Array): Placed[] | null {
  const s = shift(rom)
  const ram = SHOOTOUT_RAM.find((layout) => layout.shift === s)
  if (s === null || !ram) return null
  // The saved tmpdst: the saved run starts at $15D3.
  const saved = bytesOf(word(ram.low + 0x1852 - 0x15d3), ram.bank)
  // fightinj, where FightInjuredKeep reads it (lda.l fightinjany / beq / phx / phy / ldx), and PlayShootout's
  // jsl StartGame_go (after its two jsl InitShooters).
  const keeps = findCodeAll(rom, 'af82e7(..)f0..da5aa2')
  if (keeps.length > 1) return null
  const fightBank = keeps.length === 1 ? keeps[0].groups[0] : -1
  if (fightBank >= 0 && FIGHT_COPY[fightBank] === undefined) return null
  const fightinj = fightBank >= 0 ? bytesOf(word(0xe74e), fightBank) : null
  const copy = fightBank >= 0 ? bytesOf(word(FIGHT_COPY[fightBank]), fightBank) : null
  let startSite = -1
  if (fightinj) {
    const starts = findCodeAll(rom, 'a9020085..22......22......22......22......a901008d')
    if (starts.length !== 1) return null
    startSite = starts[0].at + 9
  }
  const sites: number[] = []
  for (const site of SHOOTOUT_SITES) {
    const found = findCodeAll(rom, site.pattern).filter(({ at }) => at >= 6 && (same(rom, at - 6, shooterOriginal(site.list + s)) || (rom[at - 6] === 0x22 && rom[at - 2] === 0xea && rom[at - 1] === 0xea)))
    if (found.length !== 1) return null
    sites.push(found[0].at - 6)
  }
  // One block, the visitors' code then the home team's, in bank $9B, else $80, else the sites' bank.
  const codes = SHOOTOUT_SITES.map((site) => shooterCode(site.list + s, saved, site.team, copy))
  const first = shooterOriginal(SHOOTOUT_SITES[0].list + s)
  const isIn = !same(rom, sites[0], first)
  let room = -1
  if (isIn) {
    if (rom[sites[0]] !== 0x22) return null
    room = loRomOffset(rom[sites[0] + 3], readU16(rom, sites[0] + 1))
    if (room < 0) return null
  }
  // StartGame_go: from its jsl, or where the hack is in, from the copy's jml.
  const copyLength = fightinj && copy ? fightCopyCode(fightinj, copy, new Uint8Array(3)).length : 0
  let startGame: Uint8Array | null = null
  if (fightinj) {
    const copyAt = isIn ? room + codes[0].length + codes[1].length : -1
    startGame = isIn ? rom.slice(copyAt + copyLength - 3, copyAt + copyLength) : rom.slice(startSite + 1, startSite + 4)
  }
  const copyCode = fightinj && copy && startGame ? fightCopyCode(fightinj, copy, startGame) : new Uint8Array(0)
  const block = bytesOf(...codes, copyCode)
  if (!isIn) {
    for (const bank of [0x9b, 0x80, loRomBank(sites[0], 0x80)]) {
      const start = (bank & 0x7f) << 15
      if (start < rom.length) room = roomInBank(rom, start, block.length)
      if (room >= 0) break
    }
  }
  if (room < 0) return null
  const entries = [room, room + codes[0].length, room + codes[0].length + codes[1].length]
  const jsl = (at: number) => bytesOf('22', word(loRomAddress(at)), loRomBank(at, 0x80))
  return [
    ...SHOOTOUT_SITES.map((site, i): Placed => ({
      at: sites[i],
      original: shooterOriginal(site.list + s),
      hacked: bytesOf(jsl(entries[i]), 'EA EA'),
    })),
    ...(startGame ? [{ at: startSite, original: bytesOf('22', startGame), hacked: jsl(entries[2]) }] : []),
    { at: room, original: unused(block.length), hacked: block },
  ]
}

const RELOCATED: Partial<Record<SnesHack, Relocate>> = {
  shootoutInjuries: (rom) => shootoutInjuryPlaces(rom),
  oneTimerFix: (rom) => oneTimerPlaces(rom),
  fightTime: (rom, _source, amount) => fightTimePlaces(rom, amount),
  creaseIcing: (rom) => {
    const found = icingEnv(rom)
    return found && withFarCode(rom, found.mark, creaseMarkOriginal(found.env), 2, creaseCode(found.env))
  },
  hybridIcing: (rom) => {
    const found = icingEnv(rom)
    return found && withFarCode(rom, found.call, bytesOf('22', found.env.puckIChk), 0, hybridCode(found.env))
  },
  threeOnThree: (rom, _source, amount) => threeOnThreePlaces(rom, amount),
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
  // ($7E:F034-$F0B3). In the SA-1 builds the low variables are in BW-RAM at $6000 on ($40:6000 up) and bank $7E's
  // game state in bank $40, so the state is saved in BW-RAM's free $40:4810 up (Match Viewer's $40:4800-$5FFF);
  // the mark stays in WRAM, which the game clears when it starts, as BW-RAM keeps what it had (a mark left by a
  // reset would last). Which layout a ROM has is read from its code: gsp's address and OptPlayMode's bank.
  seasonShootout: (rom, _source, amount) => {
    // The tail of PeriodOver, its two places (12 bytes) left open, as either may be hooked.
    const tail = only(rom, 'ee....ad....c90300f0..90..a903008d....af........06' + '.'.repeat(24) + 'f0..a904008d')
    const start = only(rom, '22......22......22......22......ad....d0..ad....d0..22......ad....d0..22......af')
    const clock = only(rom, 'ad....c90300d006af..........22')
    const call = only(rom, 'af......c90400d0..22......')
    // PauseExitGame, the shootout menus' Exit Shootout: lda d1 / bit #$8080 / bne / jmp PauseMenuPoll / jsl AskExitGame.
    const exit = only(rom, 'a5..898080d0..4c....22......c90000d0..4c....9c....5c......')
    if (tail < 0 || start < 0 || clock < 0 || call < 0 || exit < 0) return null
    const gsp = rom.slice(tail + 1, tail + 3)
    const playMode = rom.slice(tail + 20, tail + 23)
    const ram = SHOOTOUT_RAM.find((layout) => readU16(gsp, 0) === 0x1630 + layout.shift && playMode[2] === layout.bank)
    if (!ram) return null
    const b = ram.bank
    // The 2 MB builds' own player stats, which ClearTeamStats' jsl ClearPlayerChecks also clears (Match Viewer):
    // checks for and against ($E788, $E7BC), posts ($E7F0) and, where it calls ClearPlayerIceTime, time on ice
    // ($E800), all in the game state's bank. Saved as one run from the checks to the last of them.
    const clearChecks = only(rom, CLEAR_PLAYER_CHECKS)
    let extra: { from: number; length: number } | null = null
    if (clearChecks >= 0 && rom[clearChecks + 10] === b && rom[clearChecks + 22] === b) {
      const from = readU16(rom, clearChecks + 8)
      let end = readU16(rom, clearChecks + 24) + 2
      const ice = rom[clearChecks + 27] === 0x22 ? loRomOffset(rom[clearChecks + 30], readU16(rom, clearChecks + 28)) : -1
      if (ice >= 0 && rom[ice] === 0xa2 && rom[ice + 3] === 0x9f && rom[ice + 6] === b && same(rom, ice + 7, hexBytes('CACA10F86B'))) {
        end = readU16(rom, ice + 4) + readU16(rom, ice + 1) + 2
      }
      if (end > from && end - from <= 0x100) extra = { from, length: end - from }
    }
    const saveExtra = (back: boolean, use: boolean) =>
      use && extra ? bytesOf('A9', word(extra.length - 1), 'A2', word(back ? ram.extra : extra.from), 'A0', word(back ? extra.from : ram.extra), '54', b, b) : []
    const sites = { afterOvertime: tail + 25, tieTest: tail + 31, clock: clock + 12, exit: exit + 10 }
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
    const long = (address: number) => bytesOf(word(address), b)
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
    // `extras`: with the 2 MB builds' player stats saved too; NOSE4Web's of the morning of 12 November 2026 had not.
    const runOf = (extras: boolean) => bytesOf(
      'C230', '8B', 'DA', 'A9FF00', '8F', mark,
      // Saved: $15D3-$1D52 to $F100, $30F4-$347B to $F880, lastperiod to $FC08, a 2 MB build's player stats to $FC10 (as the layout has them).
      '8B', 'A97F07', 'A2', word(0x15d3 + ram.shift), 'A0', word(ram.low), '54', b, b, 'A98703', 'A2F430', 'A0', word(ram.game), '54', b, b, saveExtra(false, extras), 'AB',
      'AF', long(0x1ead + ram.shift), '8F', long(ram.last),
      '22', playShootout,
      // The winner: X 0 the home team, 2 the visitors.
      'A20000', 'AF', long(score), 'CF', long(score + 2), 'B003', 'A20200', 'DA',
      // Put back.
      '8B', 'A97F07', 'A2', word(ram.low), 'A0', word(0x15d3 + ram.shift), '54', b, b, 'A98703', 'A2', word(ram.game), 'A0F430', '54', b, b, saveExtra(true, extras), 'AB',
      'AF', long(ram.last), '8F', long(0x1ead + ram.shift),
      // The winners' goal; gsp to come back with; PeriodOver from the top, the jsl's return dropped.
      'FA', 'BF', long(score), '1A', '9F', long(score), 'FA', '8A', '8F', gsp, b, 'AB', '3B', '18', '690300', '1B', '5C', periodOver,
    )
    // The code as it is in, where it is (to take out, or to read), or as it is to go in.
    const shape = now && (choice === 0 || choice === now) ? now : choice
    const hookLength = shape === 1 ? SHOOTOUT_A_LENGTH : SHOOTOUT_B_LENGTH
    // In, the version is the one whose Exit Shootout lock (after RUN) the exit's jsl calls.
    const locksAt = (runLength: number) => now && codeAt >= 0 && rom[sites.exit] === 0x22 && readU16(rom, sites.exit + 1) === (loRomAddress(codeAt + hookLength + runLength) & 0xffff)
    const extras = !(now && extra && !locksAt(runOf(true).length) && locksAt(runOf(false).length))
    const run = runOf(extras)
    // Exit Shootout locked: while the mark is set, AskExitGame's call answers No at once (lda #0), so the menu stays
    // for Resume and a league game cannot be left from its shootout; with the mark clear it is AskExitGame (jml).
    const askAt = codeAt >= 0 ? codeAt + hookLength + run.length : -1
    const askExit = now && rom[sites.exit] === 0x22 && askAt >= 0 && readU16(rom, sites.exit + 1) === (loRomAddress(askAt) & 0xffff) ? rom.slice(askAt + 14, askAt + 17) : rom.slice(sites.exit + 1, sites.exit + 4)
    const lock = bytesOf('AF', mark, '29FF00', 'F004', 'A90000', '6B', '5C', askExit)
    const length = hookLength + run.length + lock.length
    const codeRoom = now ? codeAt : roomInBank(rom, sites.afterOvertime, length)
    if (codeRoom < 0) return null
    const address = loRomAddress(codeRoom)
    const hook = shape === 1 ? after(address + hookLength) : now3(address + hookLength)
    const jsl = bytesOf('22', word(address), loRomBank(codeRoom, 0x80), 'EAEA')
    const lockCall = bytesOf('22', word(address + hookLength + run.length), loRomBank(codeRoom, 0x80))
    return [
      { at: sites.exit, original: bytesOf('22', askExit), hacked: choice ? lockCall : bytesOf('22', askExit) },
      { at: sites.afterOvertime, original: original.afterOvertime, hacked: choice === 1 ? jsl : original.afterOvertime, amount: choice },
      { at: sites.tieTest, original: tieTest, hacked: choice === 2 ? jsl : tieTest },
      { at: sites.clock, original: original.clock, hacked: choice === 1 ? hexBytes('EAEA') : original.clock },
      { at: codeRoom, original: unused(length), hacked: bytesOf(hook, run, lock), ...(extras ? {} : { earlier: true }) },
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
    const s = shift(rom)
    if (!env || s === null) return null
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
    // The counts: $7E:F034 in the original game and its 1 MB edits; in the rebuilt builds, whose title screen keeps its
    // team list at $7E:F000-$F03F, past it at $7E:F040 (the 32-team LoROM build: Match Viewer found $7E:F03F-$FFFF
    // never written), or in BW-RAM at $40:5400, past the shootout's save (the SA-1 builds: $40:4800-$5FFF free).
    const table = snesCodeInPlace(rom) ? '34F07E' : s === 0 ? '40F07E' : '005440'
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
  // The game's scratch variables (a2 $91, d0 $A5, ...) are direct-page ones and never shifted. Where the Vault's code
  // names one by its full address, `direct` keeps that on the builds with D = $0000 and uses the direct-page form on
  // the SA-1 ones, which run this code with D = $3000 (Match Viewer: shifted, then full addresses, both failed there).
  // The five made first for the original game's layout (SITES), found by the code around them in the builds whose
  // code is elsewhere, with their variables moved (`shift`) and the routines they call read from that build's code.
  // On the original game each gives exactly the bytes SITES has (the new code where the free room is).
  showMaxBoost: (rom) => {
    const s = shift(rom)
    const found = only(rom, 'c964009003a9640085a5fa4c....a5b185a5fa4c')
    if (s === null || found < 0) return null
    const site = found + 11
    const head = hexBytes('A516 C98000 B003 4C')
    const target = loRomOffset(loRomBank(site, 0x80), readU16(rom, site + 1))
    const back = same(rom, target, head) ? readU16(rom, target + head.length) : readU16(rom, site + 1)
    return withNewCode(rom, site, (to) => bytesOf('4C', word(to)), bytesOf('4C', word(back)), bytesOf(head, word(back), 'A96400', direct(s, '8D', 0xa5), '6B'))
  },
  extraAttackerFix: (rom) => {
    const s = shift(rom)
    const found = only(rom, '22......3865a585a5ad....38ed....' + '......' + 'f0..c90200f0..c90300f0..c90400f0..a5a51a1a859520....cd....')
    if (s === null || found < 0) return null
    const site = found + 16
    const [lines, slots] = [readU16(rom, found + 10), readU16(rom, found + 14)]
    const tail = found + 16 + 3 + 2 + 5 * 3 + 6
    const byte = readU16(rom, tail + 1)
    const lineSlot = readU16(rom, tail + 4)
    // The byte at [$95] read (8D72 in the original) and written (8D7C) by two routines, one after the other.
    if (!same(rom, loRomOffset(loRomBank(site, 0x80), byte), hexBytes('E220A795C22029FF0060 29FF00E2208795C22060'))) return null
    const code = bytesOf(
      '48 A5A5 18 690500 8595 A20600 EA A595 20', word(byte), 'CF', word(lineSlot), '9F F007 C695 CA D0F0 801E CA A5A5 18 6D', word(lines), 'ED', word(slots),
      '8595 20', word(byte), '48 A5A5 86AF 18', direct(s, '6D', 0xaf), '8595 68 20', word(byte + 10), '68 C90100 60',
    )
    return withNewCode(rom, site, (to) => bytesOf('20', word(to)), hexBytes('C90100'), code)
  },
  forwardsAndDefence: (rom) => {
    const s = shift(rom)
    const found = only(rom, 'ad....38ed....c90300' + '............' + 'a5a58d....22......a5a58d....22......ad....1865a58d')
    if (s === null || found < 0) return null
    const site = found + 10
    const [count, saved] = [readU16(rom, site + 9), readU16(rom, site + 18)]
    const [second, third] = [rom.slice(site + 12, site + 15), rom.slice(site + 21, site + 24)]
    // The first jsl: in its place, or the new code's first instruction where the hack is in.
    const hooked = same(rom, site, hexBytes('EAEAEA4C'))
    const target = hooked ? loRomOffset(loRomBank(site, 0x80), readU16(rom, site + 4)) : -1
    if (hooked && rom[target] !== 0x22) return null
    if (!hooked && !same(rom, site, hexBytes('1021 22'))) return null
    const first = hooked ? rom.slice(target + 1, target + 4) : rom.slice(site + 3, site + 6)
    const back = loRomAddress(site) + 0x21
    const code = bytesOf('22', first, '8D', word(count), '22', second, 'A5A5 8D', word(saved), '22', third, '18 6D', word(count), '8D', word(count), 'AD', word(saved), '4C', word(back))
    // The jmp comes after three nops, so withNewCode (a call first) does not fit.
    const room = hooked ? target : roomInBank(rom, site, code.length)
    if (room < 0) return null
    return [
      { at: site, original: bytesOf('1021 22', first), hacked: bytesOf('EAEAEA 4C', word(loRomAddress(room))) },
      { at: room, original: unused(code.length), hacked: code },
    ]
  },
  manualPullGoalie: (rom) => {
    const s = shift(rom)
    const check = only(rom, 'a90200858d22......648da9020085..' + '..........' + '30')
    const presses = only(rom, 'ad....8d....ad....8d....ad....' + '......' + '60da0aaabd')
    const turn = only(rom, 'b9....0900ff99....22......6b6491')
    const beep = findCodeAll(rom, 'a900708564a9050022(......)')
    if (s === null || check < 0 || presses < 0 || turn < 0 || beep.length === 0) return null
    const bank = (at: number) => loRomBank(at, 0x80)
    const site = check + 16
    const tmgoalie = word(readU16(rom, turn + 1))
    const turnOver = rom.slice(turn + 10, turn + 13)
    const beepAt = rom.slice(beep[0].at + 9, beep[0].at + 12)
    const counts = 0x1ef0 + s
    // The team's pad: the original game's code reads it from the table at the code's end (lda table,y), with the data
    // bank the code's own. The SA-1 builds run this on the SA-1 CPU with their caller's data bank (SA1Call), so that
    // read finds other bytes and the goalie is never pulled (Match Viewer): there it is worked out from the team,
    // tya / lsr / inc (team 0 pad 1, team 2 pad 2), in the same three bytes. The table stays, unread.
    const padOf = (address: number) => (snesCodeInPlace(rom) ? bytesOf('B9', word(address + 0x53)) : hexBytes('98 4A 1A'))
    const checkOriginal = bytesOf('A491 B9', tmgoalie)
    const checkCode = (address: number) =>
      bytesOf(
        'A20000', direct(s, 'AC', 0x91), 'B9', tmgoalie, 'C900FF D001 60', padOf(address), 'DD', word(0x1c84 + s), 'F009 E8 E8 E00400 D0F1 802D BD', word(counts),
        'F028 9E', word(counts), 'EA EA EA B9', tmgoalie, 'F007 C9FFFF F002 8016 49FFFF 99', tmgoalie, '22', turnOver, 'A90070 8564 A90500 22', beepAt,
        'A491 B9', tmgoalie, '60 0100 0200',
      )
    const pressSite = presses + 15
    const stored = readU16(rom, presses + 10) + 2
    const pressOriginal = bytesOf('8D', word(stored))
    const pressCode = bytesOf(
      '8D', word(stored), 'AD', word(0x15d8 + s), '4A 9007 9C', word(counts), '9C', word(counts + 2), '60 A20000 BD', word(0x0ab8 + s), '293000 F013 BD', word(0x0776 + s),
      '29FF00 C93000 D008 A91800 9D', word(counts), '8009 BD', word(counts), 'F004 3A 9D', word(counts), 'E8 E8 E00400 D0D5 60',
    )
    const CHECK_LENGTH = 87
    const placed = (at: number, original: Uint8Array) => {
      const hooked = !same(rom, at, original)
      if (hooked && rom[at] !== 0x20) return -2
      return hooked ? loRomOffset(bank(at), readU16(rom, at + 1)) : -1
    }
    const checkAt = placed(site, checkOriginal)
    const pressAt = placed(pressSite, pressOriginal)
    if (checkAt === -2 || pressAt === -2) return null
    const checkRoom = checkAt >= 0 ? checkAt : roomInBank(rom, site, CHECK_LENGTH)
    const pressRoom = pressAt >= 0 ? pressAt : roomInBank(rom, pressSite, pressCode.length)
    if (checkRoom < 0 || pressRoom < 0) return null
    return [
      { at: site, original: checkOriginal, hacked: bytesOf('20', word(loRomAddress(checkRoom)), 'EAEA') },
      { at: checkRoom, original: unused(CHECK_LENGTH), hacked: checkCode(loRomAddress(checkRoom)) },
      { at: pressSite, original: pressOriginal, hacked: bytesOf('20', word(loRomAddress(pressRoom))) },
      { at: pressRoom, original: unused(pressCode.length), hacked: pressCode },
    ]
  },
  // Each player's bodychecks, given and taken, as NHL94SNESVault's PlayerStat_BodyChecks counts them (NHL94_Classic
  // and SDL16 have it, byte for byte): FallDown's team count (ldy a0 / lda tmchecks,y / inc / sta, a check made
  // in play) has its lda become jsr to code that adds 1 to the checker's (a3) byte at $168E and the player hit's
  // (a2) at $16C2, 26 a team (the roster place, from pnum), then does the lda. Both lists are in the game state
  // StartGame clears each game, the shootout's save included. They lie in the penalty log's room past its 20th
  // entry ($163E, 4 bytes an entry, room for 65), where the Vault put them, and where nhl94online.com reads them from
  // save states; a game with more than 20 penalties shares those bytes. Found by the code around it, the
  // variables moved as the build has them.
  bodychecks: (rom) => {
    const s = shift(rom)
    const found = only(rom, 'ad....d0..a489' + '......' + '1a99')
    if (s === null || found < 0) return null
    const site = found + 7
    const tmchecks = readU16(rom, found + 12)
    if (tmchecks !== 0x17b6 + s) return null
    const code = bodycheckCode(s)
    return withNewCode(rom, site, (to) => bytesOf('20', word(to)), bytesOf('B9', word(tmchecks)), code)
  },
  // The checks given shown in Player Stats in place of penalty minutes (PM becomes Cf, the sort title Checks), as
  // the Vault's PlayerStat_BodyChecks_Display, and sorted by them too: ComparePlayerStats' penalty minutes
  // (sep / lda ppenmin,y / cmp ppenmin,x) read the checks, where the Vault's still sorts by penalty minutes.
  bodychecksShown: (rom) => {
    const s = shift(rom)
    if (s === null) return null
    const ppenmin = word(0x198a + s)
    const given = word(BODYCHECKS_GIVEN + s)
    const draw = only(rom, 'a91d008d....e220bd' + hexOf(Uint8Array.from(ppenmin)) + 'c220')
    const drawn = draw >= 0 ? draw : only(rom, 'a91d008d....e220bd' + hexOf(Uint8Array.from(given)) + 'c220')
    const sortOf = (stat: number[]) => only(rom, 'e220b9' + hexOf(Uint8Array.from(stat)) + 'dd' + hexOf(Uint8Array.from(stat)) + 'c220')
    const sorted = [sortOf(ppenmin), sortOf(given)].find((at) => at >= 0) ?? -1
    const heading = ['Pt Sh PM', 'Pt Sh Cf'].map((text) => only(rom, hexOf(new TextEncoder().encode(text)))).find((at) => at >= 0) ?? -1
    const titles = ['5b20', '5b'].flatMap((open) => ['Penalties', ' Checks  '].map((text) => only(rom, open + hexOf(new TextEncoder().encode(text)) + (open === '5b' ? '20' : ''))).map((at) => (at < 0 ? -1 : at + open.length / 2)))
    const title = titles.find((at) => at >= 0) ?? -1
    if (drawn < 0 || sorted < 0 || heading < 0 || title < 0) return null
    return [
      { at: drawn + 8, original: bytesOf('BD', ppenmin), hacked: bytesOf('BD', given) },
      { at: sorted + 2, original: bytesOf('B9', ppenmin, 'DD', ppenmin), hacked: bytesOf('B9', given, 'DD', given) },
      { at: heading + 6, original: hexBytes('504D'), hacked: hexBytes('4366') },
      { at: title, original: new TextEncoder().encode('Penalties'), hacked: new TextEncoder().encode(' Checks  ') },
    ]
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
  if (choices.seasonOvertime && unknown.includes('seasonShootout')) unknown.splice(unknown.indexOf('seasonShootout'), 1)
  // And the other way round: the shootout's hooks take the places overtime until a goal is found by.
  if (choices.seasonShootout && unknown.includes('seasonOvertime')) unknown.splice(unknown.indexOf('seasonOvertime'), 1)
  if (fight === undefined && choices.injuryBonus && snesFightState(rom, [SNES_FIGHT_SHARED_SITE])?.kind === 'none') unknown.splice(unknown.indexOf('fighting'), 1)
  const amounts = Object.fromEntries(
    SNES_AMOUNTS.map((hack) => [hack, !choices[hack] ? SNES_AMOUNT_OFF[hack] : hack === 'fighting' ? (fight as { bonus: number }).bonus : amountIn(rom, hack)]),
  ) as Record<SnesAmount, number>
  // A build with its own player checks: the bodycheck counts are not offered (while they are off).
  const notOffered: Partial<Record<SnesHack, string>> = {}
  if (only(rom, CLEAR_PLAYER_CHECKS) >= 0) for (const hack of ['bodychecks', 'bodychecksShown'] as const) if (!choices[hack]) notOffered[hack] = OWN_CHECKS
  return { choices, unknown, vaultVersions, amounts, ...(Object.keys(notOffered).length ? { notOffered } : {}) }
}

const placedSite = (site: Site): Placed => ({ at: loRomOffset(site.at >> 16, site.at & 0xffff), original: hexBytes(site.original), hacked: hexBytes(site.hacked) })

export class SnesHackError extends Error {}

// The ROM with the hacks wanted put in or taken out. Hacks the ROM holds
// something else for are left as they are; asking to change one is an error.
// `updateVault`: hacks the ROM has in NHL94SNESVault's version, where
// NOSE4Web's differs, are replaced by NOSE4Web's if they are to stay on.
export function applySnesHacks(project: RomProject, wanted: Partial<SnesHackChoices>, updateVault = false, amounts: Partial<Record<SnesAmount, number>> = {}): RomProject {
  const { choices, unknown, vaultVersions = [], amounts: had, notOffered = {} } = detectSnesHacks(project.bytes)
  for (const [hack, why] of Object.entries(notOffered) as [SnesHack, string][]) if (wanted[hack]) throw new SnesHackError(why)
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
  // Those coming out first, so that one going in finds the places another one leaves (the shootout and overtime
  // until a goal share theirs); otherwise in the usual order.
  const order = [...SNES_HACKS.filter((hack) => wanted[hack] === false), ...SNES_HACKS.filter((hack) => wanted[hack] !== false)]
  for (const hack of order) {
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
    const notOffered = current.notOffered?.[hack]
    if (notOffered && other.choices[hack]) {
      notCopied.push(`${SNES_HACK_TITLES[hack]}: ${notOffered}`)
      continue
    }
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
  'hotColdFix', 'ppPkFix', 'comebackFix', 'faceoffFix', 'penaltyShotFixes', 'extraAttackerFix', 'yButtonFix', 'awarenessFix', 'oneTimerFix', 'secondAssist', 'stickShots',
  'bodychecks', 'bodychecksShown', 'regainAssist', 'forwardsAndDefence', 'showMaxBoost', 'manualPullGoalie',
  'defenceControl', 'oneMinutePenalties', 'thirtySecondPeriods', 'fourthPeriodOvertime', 'seasonOvertime', 'noInterference', 'noPenaltyShots', 'noGoalPosts', 'creaseIcing', 'hybridIcing', 'hitEnergy', 'holdEnergy', 'injuryBonus', 'noSkatingDrain', 'freeBurst', 'energySpeed', 'goaliePoke', 'skipEaIntro', 'skipPucksIntro',
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

// The 2 MB builds' ClearPlayerChecks (ClearTeamStats calls it): phx; lda #0; ldx #$32; sta.l pchf,x; sta.l pcha,x;
// dex x2; bpl; sta.l tmposts; sta.l tmposts+2. Those builds count each player's checks for and against themselves.
const CLEAR_PLAYER_CHECKS = 'daa90000a2..009f......9f......caca10..8f......8f......'
const OWN_CHECKS = "This build counts each player's checks for and against itself (the SA-1 builds show them in Player Stats as CF and CA), so NOSE4Web's bodycheck counts are not offered."

// A direct-page variable named in new code. The original game and the LoROM 32-team build run it with the direct
// page at $0000, where the Vault's full-address forms ($00A5) find the variable; the SA-1 builds run Edit Lines and
// the goalie check with D = $3000 (Match Viewer's probes), so there the 2-byte direct-page form, padded with a nop
// to the same length, is the one that follows D.
function direct(s: number, absolute: string, variable: number): Uint8Array {
  if (s === 0) return bytesOf(absolute, word(variable))
  const dp: Record<string, string> = { '8D': '85', '6D': '65', 'AC': 'A4' }
  return hexBytes(`${dp[absolute]} ${variable.toString(16).padStart(2, '0')} EA`)
}

// Where the Vault's bodycheck counts are, in the original game: the checks given, then those taken, 26 a team.
const BODYCHECKS_GIVEN = 0x168e
const BODYCHECKS_TAKEN = 0x16c2
// The Vault's counting code, with a build's variables (moved by `s`).
function bodycheckCode(s: number): Uint8Array {
  const pnum = word(0x12a3 + s)
  const count = (team: string, list: number) => bytesOf('BD', pnum, 'A689 E0', team, 'D004 18 691A00 AA E220 FE', word(list + s), 'C220')
  return bytesOf('48 DA A695', count('0200', BODYCHECKS_GIVEN), 'A691', count('0000', BODYCHECKS_TAKEN), 'FA 68 B9', word(0x17b6 + s), '60')
}

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
