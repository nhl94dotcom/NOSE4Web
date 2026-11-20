import { fightTimeText, penaltyTimeText } from './penaltytime'
import type { RomProject } from './rom'
import { discordPost } from './discord'
import { holdSeconds, REFEREE_TEXTS } from './hacks'
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
  | 'barrPick'
  | 'barrCoin'
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
  | 'referees'
  | 'seasonShootout'
  | 'threeOnThree'
  | 'creaseIcing'
  | 'hybridIcing'
  | 'shootoutInjuries'
  | 'fightTime'
  | 'oneTimerFix'
  | 'shotFix'
  | 'lockedChangeFix'
  | 'lockedDefenceFix'
  | 'openNetFix'
  | 'timeOnIce'
  | 'timeOnIceShown'
  | 'postsFix'
  | 'nhlShootout'
  | 'choppyIce'
  | 'clutchTime'
  | 'giveaways'
  | 'giveawaysShown'
  | 'giveawayPages'
  | 'organResume'
  | 'realTime'
  | 'noIcing'
  | 'threeStars'
  | 'goalieHold'
  | 'diveHold'
  | 'goalieWidth'
  | 'goalieOut'
  | 'goalieLine'
  | 'speedBurst'
  | 'turnRate'
  | 'puckFriction'

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
  // Ron Barr's pick: ScoutingReport sets hotterteam to the team whose players'
  // hot and cold sum is higher (the home team on a tie), then clears it unless
  // the two differ by 4 or more (cmp #$0004 / bcs), so his "hotter team" line
  // comes only in some games. With 0 it comes every game.
  barrPick: [{ at: 0x9d8324, original: 'C90400', hacked: 'C90000' }],
  // Ron Barr's pick by a coin flip: from lda #$0001 / sta hotextreme to the
  // bra that skips the visitors' branch, the difference of the two sums
  // becomes stz hotextreme / jsl RandomWord / bpl to the rtl (the home team,
  // already in hotterteam) / lda VisTeam / sta hotterteam / rtl, so a team is
  // named every game, never "extremely", and the threshold after is skipped.
  barrCoin: [{ at: 0x9d82fe, original: 'A90100 8D431E AD451E 38 ED471E 3002 800D', hacked: '9C431E 22588680 1006 AD9A1C 8D411E 6B EA' }],
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
  'barrPick',
  'barrCoin',
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
  'referees',
  'seasonShootout',
  'threeOnThree',
  'creaseIcing',
  'hybridIcing',
  'shootoutInjuries',
  'fightTime',
  'oneTimerFix',
  'shotFix',
  'lockedChangeFix',
  'lockedDefenceFix',
  'openNetFix',
  'timeOnIce',
  'timeOnIceShown',
  'postsFix',
  'nhlShootout',
  'choppyIce',
  'clutchTime',
  'giveaways',
  'giveawaysShown',
  'giveawayPages',
  'organResume',
  'realTime',
  'noIcing',
  'threeStars',
  'goalieHold',
  'diveHold',
  'goalieWidth',
  'goalieOut',
  'goalieLine',
  'speedBurst',
  'turnRate',
  'puckFriction',
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
  barrPick: "Ron Barr's pick every game",
  barrCoin: "Ron Barr's pick by a coin flip",
  skipPucksIntro: 'Skip the flying pucks intro',
  faceoffFix: 'Faceoffs on the dots',
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
  showMaxBoost: 'Show hot/cold-boosted ratings in Edit Lines',
  manualPullGoalie: 'Pull the goalie with L+R',
  regainAssist: 'Regained-puck assist fix',
  fourthPeriodOvertime: 'Extra period length with 99-minute overtime',
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
  referees: 'Referee strictness',
  seasonShootout: 'A shootout for tied regular-season games',
  threeOnThree: '3 on 3 overtime',
  creaseIcing: 'No icing within the crease',
  hybridIcing: 'Hybrid icing',
  shootoutInjuries: 'The injured sit out the shootout',
  fightTime: 'Fighting penalty time',
  oneTimerFix: 'One-timer that never fires fix',
  shotFix: 'Shot that never fires fix',
  lockedChangeFix: 'B button while checking or bursting fix',
  lockedDefenceFix: 'L and R defenceman pick while busy fix',
  openNetFix: 'Open net shot fix',
  timeOnIce: 'Time on ice for each player',
  timeOnIceShown: 'Time on ice in Player Stats',
  postsFix: 'Posts counted for the right team',
  nhlShootout: 'Three-round shootout',
  choppyIce: 'Choppy ice',
  clutchTime: 'Clutch time',
  giveaways: 'Giveaways and takeaways for each player',
  giveawaysShown: 'Giveaways and takeaways in Game Stats',
  giveawayPages: 'Giveaways and takeaways in Player Stats',
  organResume: 'Organ music after a pause',
  realTime: 'Real-time clock',
  noIcing: 'No icing',
  threeStars: 'Three stars',
  goalieHold: 'Goalie hold time',
  diveHold: 'Goalie hold after a dive catch',
  goalieWidth: 'Goalie range to each side',
  goalieOut: 'Goalie range up the ice',
  goalieLine: 'Goalie whistle line',
  speedBurst: 'Speed burst',
  turnRate: 'Stopping and turning',
  puckFriction: 'Puck friction',
}

// Hacks that go together, as NHL94SNESVault has them: one that needs another
// on, and two that cannot both be.
// Energy taking all of a skater's speed needs skating to cost nothing: goalies never go to the bench, so the
// drain would slow them more than the original game does (Match Viewer).
const NEEDS: Partial<Record<SnesHack, SnesHack>> = { forwardsAndDefence: 'extraAttackerFix', fourthPeriodOvertime: 'thirtySecondPeriods', energySpeed: 'noSkatingDrain', bodychecksShown: 'bodychecks', timeOnIceShown: 'timeOnIce', giveawaysShown: 'giveaways', giveawayPages: 'giveaways' }
const EXCLUDES: [SnesHack, SnesHack][] = [['showMaxBoost', 'hotColdFix'], ['seasonOvertime', 'seasonShootout'], ['barrPick', 'barrCoin']]

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
  // Only the first letter lowered, so the rest keeps its capitals; one that starts with a name as it is.
  const whole = SNES_HACK_TITLES[hack]
  if (/^Ron Barr/.test(whole)) return whole
  const title = whole.replace(/^[A-Z](?=[a-z ])/, (letter) => letter.toLowerCase())
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
export type SnesAmount = 'hitEnergy' | 'holdEnergy' | 'injuryBonus' | 'penaltyTime' | 'fighting' | 'injuries' | 'referees' | 'seasonShootout' | 'threeOnThree' | 'fightTime' | 'threeStars' | 'goalieHold' | 'diveHold' | 'goalieWidth' | 'goalieOut' | 'goalieLine' | 'speedBurst' | 'turnRate' | 'puckFriction'
export const SNES_AMOUNTS: SnesAmount[] = ['hitEnergy', 'holdEnergy', 'injuryBonus', 'penaltyTime', 'fighting', 'injuries', 'referees', 'seasonShootout', 'threeOnThree', 'fightTime', 'threeStars', 'goalieHold', 'diveHold', 'goalieWidth', 'goalieOut', 'goalieLine', 'speedBurst', 'turnRate', 'puckFriction']
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
// The referee's choice: very lenient (0) to very strict (4), the Genesis's REFEREE_TEXTS; 2 the original game.
export const SNES_REFEREE_TEXTS = Object.values(REFEREE_TEXTS)
// The shootout's choice: none, after one overtime, or after period 3 with no overtime.
export const SNES_SHOOTOUT_TEXTS = ['None: as the original game', 'A shootout after one overtime', 'A shootout after period 3, no overtime']
// An amount in words, for the Apply list, Changes and the Discord post.
export function snesAmountText(hack: SnesAmount, value: number): string {
  switch (hack) {
    case 'fighting':
      return value === SNES_AMOUNT_OFF.fighting ? 'off' : `on, with a bonus of ${value}`
    case 'injuries':
      return SNES_INJURY_TEXTS[value]?.toLowerCase() ?? String(value)
    case 'referees':
      return SNES_REFEREE_TEXTS[value]?.toLowerCase() ?? String(value)
    case 'seasonShootout':
      return SNES_SHOOTOUT_TEXTS[value]?.toLowerCase() ?? String(value)
    case 'threeOnThree':
      return ['off', 'in the regular season', 'in every overtime'][value] ?? String(value)
    case 'penaltyTime':
      return penaltyTimeText(value)
    case 'fightTime':
      return fightTimeText(value)
    case 'speedBurst':
      return value === 0 ? "the original game's" : String(value)
    case 'threeStars':
      return SNES_STAR_TEXTS[value]?.toLowerCase() ?? String(value)
    case 'goalieHold':
      return value === 0 ? 'no whistle' : `${holdSeconds(value)} seconds`
    case 'diveHold':
      return `${holdSeconds(value)} seconds`
    case 'goalieWidth':
    case 'goalieOut':
    case 'goalieLine':
    case 'turnRate':
    case 'puckFriction':
      return String(value)
    default:
      return value === SNES_AMOUNT_OFF[hack] ? 'off' : String(value)
  }
}
// The goalie settings' original game (see goalieEnv): hold 140 frames, range 48 to each side and 228 from centre,
// whistle line 187 from centre. The line is at most 210, as a computer goalie with the puck is always 211 or more out.
// The range can only shrink (Match Viewer): updateplayers also holds every goalie without the puck, while the clock
// runs, within 43 of the middle and 229 or more from centre (cmp #$FFD5 / #$002C, #$00E5 / #$FF1B), so a wider box
// or one farther out changes nothing; hence width at most 48 and distance at least 228.
export const SNES_GOALIE_HOLD = 140
// A catch in a dive: 5 frames, counted once the goalie is up.
export const SNES_DIVE_HOLD = 5
export const SNES_GOALIE_WIDTH = 48
export const SNES_GOALIE_OUT = 228
export const SNES_GOALIE_LINE = 187
export const SNES_GOALIE_LINE_MOST = 210
export const SNES_AMOUNT_OFF: Record<SnesAmount, number> = { hitEnergy: 0, holdEnergy: 0, injuryBonus: 0, penaltyTime: 60, fighting: -1, injuries: 0, referees: 2, seasonShootout: 0, threeOnThree: 0, fightTime: 0, threeStars: 0, goalieHold: SNES_GOALIE_HOLD, diveHold: SNES_DIVE_HOLD, goalieWidth: SNES_GOALIE_WIDTH, goalieOut: SNES_GOALIE_OUT, goalieLine: SNES_GOALIE_LINE, speedBurst: 0, turnRate: 0x70, puckFriction: 9 }
export const RECOMMENDED_SNES_HIT_ENERGY = 204
export const RECOMMENDED_SNES_HOLD_ENERGY = 102
// Energy lost only to hits, as on the Genesis: skating and bursts cost nothing, a knockdown a third of full energy, a hold half that.
export const SNES_HITS_ONLY = { hitEnergy: 1365, holdEnergy: 683 } as const
// For the Genesis's effect (+27% injuries, 1.33 times for the most-hit): Match Viewer's estimates from 29
// recorded SNES league games, the knockdown counted before its own roll, up to 5 knockdowns, are +4 at +18%
// and 1.23, +5 at +23% and 1.29, +6 at +27% and 1.35, +7 at +32% and 1.41, +8 at +37% and 1.47, +19 at +87%
// and 2.11; indicative only, as the recordings had no SNES injuries.
export const RECOMMENDED_SNES_INJURY_BONUS = 6
export const SNES_AMOUNT_RANGES: Record<SnesAmount, [number, number]> = { hitEnergy: [0, 4096], holdEnergy: [0, 4096], injuryBonus: [0, 20], penaltyTime: [1, 255], fighting: SNES_FIGHT_BONUS_RANGE, injuries: [0, 5], referees: [0, 4], seasonShootout: [0, 2], threeOnThree: [0, 2], fightTime: [0, 2047], threeStars: [0, 2], goalieHold: [0, 3600], diveHold: [1, 3600], goalieWidth: [0, SNES_GOALIE_WIDTH], goalieOut: [SNES_GOALIE_OUT, 255], goalieLine: [0, SNES_GOALIE_LINE_MOST], speedBurst: [0, 95], turnRate: [1, 225], puckFriction: [1, 12] }
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
// How long the Stars of the Game show after a season shootout: 3 seconds.
const SHOOTOUT_STARS_FRAMES = 180
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
// McMarkis's 2 MB and SA-1 builds, and NOSE4Web's 1 MB fights (snesfight.ts), pair the two fighters' majors
// (FightCoincidental, after .7: d2 = 5:00 | $2000, and an other-team player
// whose time, and #$07FF, is 5:00, both made coincidental), so there its two
// 5:00s become the set time too (syncFightPairing). Its mask is why the time
// is at most 2047 seconds.
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

// McMarkis's FightCoincidental, in his builds and NOSE4Web's 1 MB fights (lda d2 / cmp #$212C / bne / phx / sty / ldx #$34, then and #$07FF / cmp
// #$012C / beq) pairs two fighters' majors only at 5:00. Set after the hacks go in, from what they make a fight's box
// time: the fight time if it is on, else 5 minutes at the penalty time (Match Viewer: else, with either, the fighters
// no longer offset each other). Not a hack of its own: it follows those two.
function syncFightPairing(rom: Uint8Array): void {
  const pairs = findCodeAll(rom, 'a5..c9....d0..da84..a23400')
  if (pairs.length !== 1) return
  const times = findCodeAll(rom, '29ff07c9....f0').filter(({ at }) => at > pairs[0].at && at - pairs[0].at < 0x40)
  if (times.length !== 1) return
  const fight = amountIn(rom, 'fightTime')
  const perMinute = amountIn(rom, 'penaltyTime')
  const seconds = Math.min(0x7ff, fight > 0 ? fight : 5 * perMinute)
  rom.set(bytesOf(word(seconds | 0x2000)), pairs[0].at + 3)
  rom.set(bytesOf(word(seconds)), times[0].at + 4)
}

// ------------------------------------------------------------- open net shot
// As on the Genesis (hacks.ts, openNetFix), from Match Viewer's reading:
// shotdiradj, which aims every computer shot (doshot calls it; a person's
// shots follow the pad), clears d0 (stz d0, aim 0: high in the middle, just
// under the bar) before testing whether the goalie's sightline covers the
// net, and when it doesn't (an open net) leaves it 0. With no goalie found it
// gives 8 (the middle). Its ldx a3 / stz d0 becomes jsl to code that does the
// ldx and sets d0 to 8, so an open net gets the middle; covered nets still
// set their own aim after it. Found by the code around it.
function openNetPlaces(rom: Uint8Array): Placed[] | null {
  // lda d4 / clc / adc d5 / sta d4 / ldx a3 / stz d0 / lda d4 / cmp #$FFD3 / bmi / cmp #$002D / bpl; or the hack's jsl there.
  const plain = findCodeAll(rom, 'a5..1865..85..a6(..)64(..)a5..c9d3ff30..c92d0010')
  const hooked = findCodeAll(rom, 'a5..1865..85..22(....)(..)a5..c9d3ff30..c92d0010').filter(({ groups }) => {
    const code = loRomOffset(groups[1], groups[0])
    return code >= 0 && rom[code] === 0xa6 && same(rom, code + 2, hexBytes('A90800 85'))
  })
  if (plain.length + hooked.length !== 1) return null
  const site = (plain[0] ?? hooked[0]).at + 7
  let a3: number
  let d0: number
  if (plain.length) [a3, d0] = plain[0].groups
  else {
    const code = loRomOffset(hooked[0].groups[1], hooked[0].groups[0])
    a3 = rom[code + 1]
    d0 = rom[code + 6]
  }
  return withFarCode(rom, site, bytesOf('A6', a3, '64', d0), 0, bytesOf('A6', a3, 'A9 0800 85', d0, '6B'))
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
// puckfaceoff2 does), then does them. Not when onetimer ($1E89) is set: a
// one-timer that struck (.2xx sets it just before doshot) also leaves by .6,
// and keeps its follow-through (Match Viewer: the first version cut it short);
// the give-ups have it clear (puckglue and wallcoll clear it). Found by the
// code around them.
function oneTimerPlaces(rom: Uint8Array): Placed[] | null {
  // .6 after its first 6 bytes (lda #$FFFF / sta passReceiverPlayerNum, or the hack's jsl / nops).
  const sixes = findCodeAll(rom, '9e....9c....bd....29feff9d....4c....').filter(({ at }) => at >= 6 && ((rom[at - 6] === 0xa9 && rom[at - 5] === 0xff && rom[at - 4] === 0xff && rom[at - 3] === 0x8d) || (rom[at - 6] === 0x22 && rom[at - 2] === 0xea && rom[at - 1] === 0xea)))
  const eights = findCodeAll(rom, 'bd(....)c9(....)f0..c9(....)f0..5aa00000e00c00')
  if (sixes.length !== 1 || eights.length !== 1) return null
  const site = sixes[0].at - 6
  let receiver: number
  if (rom[site] === 0x22) {
    const code = loRomOffset(rom[site + 3], readU16(rom, site + 1))
    // The code ends lda #$FFFF / sta passReceiverPlayerNum / rtl, at 33 from its start.
    if (code < 0 || !same(rom, code + 33, hexBytes('A9FFFF8D'))) return null
    receiver = readU16(rom, code + 37)
  } else receiver = readU16(rom, site + 4)
  const [spa, forehand, backhand] = eights[0].groups
  // puckfaceoff2's skater: lda #SPAgready / bra / lda #SPAglide / jsl SetSPAFromA / jsl updateanim.
  const glides = findCodeAll(rom, 'a9....8003a9(....)22(......)22').filter(({ groups }) => groups[0] !== forehand)
  if (glides.length !== 1) return null
  const glide = glides[0].groups[0]
  const setSpa = rom.slice(glides[0].at + 9, glides[0].at + 12)
  // onetimer, which .2xx sets: lda #1 / sta onetimer, once.
  const s = shift(rom)
  if (s === null) return null
  const onetimer = 0x1e89 + s
  if (findCodeAll(rom, 'a901008d' + hex16(onetimer)).length !== 1) return null
  const code = asm65([
    bytesOf('AD', word(onetimer)),
    { branch: BNE, to: 'd' },
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

// ------------------------------------------------- the shot that never fires
// Found by Match Viewer (SNES_SHOOTING 4.5): ShotMode fires a shot only while
// the shot-mode flag (sfssdir, sflags bit 3) is set, and puckglue clears it
// (with sfspdir: lda #$000C / trb sflags, at .4) whenever a player takes the
// puck, even the shooter gathering it again after a steal touch knocked it
// loose in his wind-up; his swing then plays out and no shot comes. That lda /
// trb becomes jsl / nops to code that does them, then sets sfssdir again when
// the new carrier (a2) is still winding up a shot: his animation one of the
// shots (SPA from SPAshotf up to ShotMode's own bound), not yet at the frame
// ShotMode shoots at ($18). ShotMode checks the rest as before. A hold or hook
// (holdcheck) still spoils the shot. Only for a person's shooter (pflags
// pfjoycon, $0008): a computer's shot cannot come back once its assshoot has
// ended, and with nothing to call its ShotMode the flag would linger until the
// puck next changed hands, moving the computer goalie faster (Match Viewer).
// NOSE4Web's first version (13 November 2026) set it for anyone: recognised,
// and replaced when the hacks are next applied. Found by the code around them.
function shotPlaces(rom: Uint8Array): Placed[] | null {
  // ShotMode: lda SPA,x / cmp #SPAshotf / bcc / cmp #bound / bcs / lda SPAnum,x / cmp #$18 / bcs.
  const modes = findCodeAll(rom, 'bd(....)c9(....)90..c9(....)b0..bd(....)c91800b0')
  if (modes.length !== 1) return null
  const [spa, first, bound, spanum] = modes[0].groups
  // puckglue's .4: lda #$000C / trb sflags / ldy a2 / lda position,y / bne; or the hack's jsl / nops, then the same.
  const plain = findCodeAll(rom, 'a90c001c(....)a4(..)b9....d0')
  const hooked = findCodeAll(rom, '22(....)(..)eaeaa4(..)b9....d0').filter(({ groups }) => {
    const code = loRomOffset(groups[1], groups[0])
    return code >= 0 && same(rom, code, hexBytes('A90C001C'))
  })
  if (plain.length + hooked.length !== 1) return null
  const site = (plain[0] ?? hooked[0]).at
  const a2 = plain.length ? plain[0].groups[1] : hooked[0].groups[2]
  const sflags = plain.length ? plain[0].groups[0] : readU16(rom, loRomOffset(hooked[0].groups[1], hooked[0].groups[0]) + 4)
  const original = bytesOf('A9 0C00 1C', word(sflags))
  const s = shift(rom)
  if (s === null) return null
  const pflags = 0x1283 + s
  const codeOf = (personOnly: boolean) => asm65([
    bytesOf('A9 0C00 1C', word(sflags), 'A4', a2),
    ...(personOnly ? [bytesOf('B9', word(pflags), '89 0800'), { branch: BEQ, to: 'r' }] : []),
    bytesOf('B9', word(spa), 'C9', word(first)),
    { branch: BCC, to: 'r' },
    bytesOf('C9', word(bound)),
    { branch: BCS, to: 'r' },
    bytesOf('B9', word(spanum), 'C9 1800'),
    { branch: BCS, to: 'r' },
    bytesOf('A9 0800 0C', word(sflags)),
    { label: 'r' },
    '6B',
  ])
  const code = codeOf(true)
  // NOSE4Web's first version, for anyone: recognised where it is in.
  const first0 = codeOf(false)
  const at = hooked.length ? loRomOffset(hooked[0].groups[1], hooked[0].groups[0]) : -1
  if (at >= 0 && same(rom, at, first0)) {
    const places = withFarCode(rom, site, original, 2, first0)
    return places && [places[0], { ...places[1], earlier: true }]
  }
  return withFarCode(rom, site, original, 2, code)
}

// ------------------------------------------- B and L / R while the skater is busy
// Found by Match Viewer (SNES_MECHANICS 7.3, and a trace: 41 of 905 B presses
// on defence did nothing). findpc, B's choice of skater, can choose the pad's
// own skater while he is locked in a check or burst (those animations, and the
// turns, are let in locked); he is nearest the puck because he just burst or
// checked at it. Chosen, he pokes, but locked he cannot, so nothing happens.
// lockedChangeFix: findpc's .4, lda playerpad,x / bmi .5 (then cmp d4 / bne .8,
// a skater another pad has), becomes jsl / nop to code that leaves A as d4
// (taken) for a skater with no pad or the pad's own unlocked one, and anything
// else (passed over) for another pad's or the pad's own locked one; so B then
// switches to the next best, as the Genesis does while locked.
// lockedDefenceFix: doinput tests pfalock before L and R, and a locked skater's
// branch (.22) takes B, X and A but not L / R, so a press while he is busy,
// even down on the ice, is lost. .22's lda d1 / bit #$8000 becomes jsl / nop
// to code that, when L or R (and not B or X, which go first as before) is
// pressed and he is not a goalie, calls PadTakeLeftDefense / RightDefense (the
// unlocked branch's own) and returns A = 0, so .22 then does nothing more.
function lockedChangePlaces(rom: Uint8Array): Placed[] | null {
  // .3 / .4: lda pflags,x / and #pf2unav / ora pfalock,x / bne .8 / lda playerpad,x / bmi .5 / cmp d4 / bne .8; or the hack's jsl / nop.
  const plain = findCodeAll(rom, 'bd....2900101d(....)d0..bd(....)3004c5(..)d0')
  const hooked = findCodeAll(rom, 'bd....2900101d(....)d0..22(....)(..)eac5(..)d0').filter(({ groups }) => {
    const code = loRomOffset(groups[2], groups[1])
    return code >= 0 && rom[code] === 0xbd && rom[code + 3] === 0x30
  })
  if (plain.length + hooked.length !== 1) return null
  const found = plain[0] ?? hooked[0]
  const site = found.at + 11
  const pfalock = found.groups[0]
  const playerpad = plain.length ? plain[0].groups[1] : readU16(rom, loRomOffset(hooked[0].groups[2], hooked[0].groups[1]) + 1)
  const d4 = plain.length ? plain[0].groups[2] : hooked[0].groups[3]
  const code = asm65([
    bytesOf('BD', word(playerpad)),
    { branch: BMI, to: 'take' },
    bytesOf('C5', d4),
    { branch: BNE, to: 'r' },
    bytesOf('BD', word(pfalock)),
    { branch: BEQ, to: 'take' },
    bytesOf('A9 FFFF 6B'),
    { label: 'take' },
    bytesOf('A5', d4),
    { label: 'r' },
    '6B',
  ])
  return withFarCode(rom, site, bytesOf('BD', word(playerpad), '30 04'), 1, code)
}

function lockedDefencePlaces(rom: Uint8Array): Placed[] | null {
  // The unlocked branch: lda position,x / beq .13 / lda d1 / bit #L / bne .11 / bit #R / bne .12; .11 and .12 jml.
  const ts = findCodeAll(rom, 'bd(....)f0..a5(..)892000d0(..)891000d0(..)')
  if (ts.length !== 1) return null
  const { at, groups: [position, d1, left, right] } = ts[0]
  const target = (from: number, offset: number) => from + (offset < 0x80 ? offset : offset - 0x100)
  const l = target(at + 12, left)
  const r = target(at + 17, right)
  if (rom[l] !== 0x5c || rom[r] !== 0x5c) return null
  // .22: cpx puckc / beq .23 / lda d1 / bit #B / bne .19 / bit #X / beq / jmp .17; or the hack's jsl / nop.
  const plain = findCodeAll(rom, 'ec....f0..a5' + d1.toString(16).padStart(2, '0') + '890080d0..894000f0034c')
  const hooked = findCodeAll(rom, 'ec....f0..22(....)(..)ead0..894000f0034c').filter(({ groups }) => {
    const code = loRomOffset(groups[1], groups[0])
    return code >= 0 && same(rom, code, bytesOf('A5', d1, '89 40C0'))
  })
  if (plain.length + hooked.length !== 1) return null
  const site = (plain[0] ?? hooked[0]).at + 5
  const code = asm65([
    bytesOf('A5', d1, '89 40C0'),
    { branch: BNE, to: 'o' },
    bytesOf('89 3000'),
    { branch: BEQ, to: 'o' },
    bytesOf('BD', word(position)),
    { branch: BEQ, to: 'o' },
    bytesOf('A5', d1, '89 2000'),
    { branch: BEQ, to: 'right' },
    bytesOf('22', rom.slice(l + 1, l + 4)),
    { branch: BRA, to: 'done' },
    { label: 'right' },
    bytesOf('22', rom.slice(r + 1, r + 4)),
    { label: 'done' },
    bytesOf('A9 0000 6B'),
    { label: 'o' },
    bytesOf('A5', d1, '89 0080 6B'),
  ])
  return withFarCode(rom, site, bytesOf('A5', d1, '89 0080'), 1, code)
}

// ------------------------------------------------------------------ time on ice
// McMarkis's Player Stats TOI (NHL94SNES-SA1 b8909787, used with his
// permission), brought to the original game's layout. The Genesis counts each
// player's time on ice: once a second of the game clock (updatepentime's tick,
// sflags3 $0020) updateplayers adds a second to his word. The SNES kept the
// test of the tick, the pnum check (d0 = pnum x 2) and the loadTeamStruct call,
// but not the add. That jsl loadTeamStruct becomes jsl to code that makes it,
// then adds the second to ptoi as McMarkis's builds keep it: $7E:E800, a word
// per roster player, +$34 for the visitors (players from $0C), at most 99:59;
// free in the original game (his build is it rebuilt, with these after the
// replay buffer's end at $E676). Cleared at each game's start: StartGame_scout's
// jsl ScoutingReport (every game passes it; the season shootout, which runs
// StartGame_go, does not) becomes jsl to code that clears the 104 bytes and goes
// on to ScoutingReport. McMarkis's 2 MB and SA-1 builds count it themselves.
const PTOI = 0x7ee800
const OWN_STAT_PAGES = "This build's Player Stats has pages of its own after Penalties (its checks for and against), so NOSE4Web's Time On Ice page is not offered; the time on ice is still counted for save-state readers."
const NO_POSTS = "This build does not count shots off the post (only McMarkis's 2 MB builds do), so there is nothing to fix."
const OWN_ICE_TIME = "This build counts each player's time on ice itself (shown in Player Stats as TOI), so NOSE4Web's is not offered."

function ownIceTime(rom: Uint8Array): boolean {
  // McMarkis's: updateplayers' jsl loadTeamStruct followed by his jsl PlayerIceTime.
  return findCodeAll(rom, 'ad....892000f0..bd....29ff00c98000900309' + '00ff85..c90000' + '30..06..22......22').length > 0
}

function timeOnIcePlaces(rom: Uint8Array): Placed[] | null {
  if (ownIceTime(rom)) return null
  // updateplayers: lda sflags3 / bit #$20 / beq .4 / lda pnum,x / and #$FF / cmp #$80 / bcc / ora #$FF00 / sta d0 / cmp #0 / bmi .4 / asl.b d0 / jsl loadTeamStruct.
  const ticks = findCodeAll(rom, 'ad....892000f0..bd....29ff00c98000900309' + '00ff85(..)c90000' + '30..06..22(......)')
  // StartGame_scout: jsl Create_HotCold_Table / jsl ScoutingReport / lda #$FFFF / sta FrameByNumber / jsl forcefade.
  const scouts = findCodeAll(rom, '22......22......a9ffff8d....22')
  if (ticks.length !== 1 || scouts.length !== 1) return null
  const tickSite = ticks[0].at + 31
  const d0 = ticks[0].groups[0]
  const scoutSite = scouts[0].at + 4
  // The calls as the ROM has them, or as the hack's code makes them (its first jsl, and the clear's closing jml).
  const callIn = (site: number, at: number) => {
    if (rom[site] !== 0x22) return null
    const code = loRomOffset(rom[site + 3], readU16(rom, site + 1))
    return code >= 0 && rom[code + at] === (at === 0 ? 0x22 : 0x5c) ? rom.slice(code + at + 1, code + at + 4) : null
  }
  const ptoi = bytesOf(word(PTOI & 0xffff), PTOI >> 16)
  const clearLength = 14
  const loadTeam = callIn(tickSite, 0) ?? rom.slice(tickSite + 1, tickSite + 4)
  const scouting = callIn(scoutSite, clearLength) ?? rom.slice(scoutSite + 1, scoutSite + 4)
  // Hooked already only where the code there is this hack's.
  const tickCode = asm65([
    bytesOf('22', loadTeam, 'E01800'),
    { branch: BCS, to: 'r' },
    bytesOf('DA A5', d0, '29FF00 E00C00'),
    { branch: BCC, to: 'home' },
    bytesOf('18 693400'),
    { label: 'home' },
    bytesOf('AA BF', ptoi, 'C96F17'),
    { branch: BCS, to: 'top' },
    bytesOf('1A 9F', ptoi),
    { label: 'top' },
    bytesOf('FA'),
    { label: 'r' },
    '6B',
  ])
  const clearCode = asm65([
    bytesOf('A90000 A26600'),
    { label: 'loop' },
    bytesOf('9F', ptoi, 'CA CA'),
    { branch: BPL, to: 'loop' },
    bytesOf('5C', scouting),
  ])
  if (clearCode.length !== clearLength + 4) return null
  const tick = withFarCode(rom, tickSite, bytesOf('22', loadTeam), 0, tickCode)
  if (!tick) return null
  // The clear's room looked for with the count's code in, so the two do not share it.
  const withTick = rom.slice()
  for (const place of tick) withTick.set(place.hacked, place.at)
  const clear = withFarCode(withTick, scoutSite, bytesOf('22', scouting), 0, clearCode)
  return clear && [...tick, ...clear]
}

// ------------------------------------------------------ time on ice in Player Stats
// McMarkis's Player Stats TOI page (NHL94SNES-SA1 b8909787, with his
// permission), for the original game's layout, from the counts timeOnIce
// keeps: a seventh sort column after Penalties, "[Time On Ice", where each
// skater's row is his name, G, A and Pts (the game's own row code, copied) and
// his time as m:ss (PushTime) ending at column 30, as McMarkis's first version
// showed it. Five places: PlayerStatsScreen_right's last column (cmp #5 becomes
// #6); SortPlayerStats' jsl AdvanceStringPtr (column 6: its own title);
// ComparePlayerStats' .t2/.t1 (cmp #5 / bne .t1 / jmp .t1x / .t1: jmp .6
// becomes jsl / bcs .t1x / jmp .8: column 5 as before, 6 by time on ice, else
// no swap); DrawStatsList_rows' jsl .3 (column 6: the TOI row); DrawStatsList's
// header pointer (column 6: "Player G A Pt TOI"). Penalties' title ends in "]".
const TOI_TITLE = '[Time On Ice'
const TOI_HEADER = '  Player         G  A Pt   TOI'

// Room for `length` bytes of new code, as withFarCode finds it: where the hook at `site` already calls when it is
// in, else bank $9B, $80 or the site's.
function farRoom(rom: Uint8Array, site: number, original: Uint8Array, length: number): number {
  if (!same(rom, site, original)) return rom[site] === 0x22 ? loRomOffset(rom[site + 3], readU16(rom, site + 1)) : -1
  for (const bank of [0x9b, 0x80, loRomBank(site, 0x80)]) {
    const start = (bank & 0x7f) << 15
    const room = start < rom.length ? roomInBank(rom, start, length) : -1
    if (room >= 0) return room
  }
  return -1
}

// The Player Stats code the pages hook, found in a ROM as the game has it or with the time on ice page in.
function statPageParts(rom: Uint8Array) {
  if (ownIceTime(rom)) return null
  const ptoi = bytesOf(word(PTOI & 0xffff), PTOI >> 16)
  // DrawStatsList_rows: lda statcolumn / beq .t1 / jsl .3 / bra / jsl .4.
  const rows = findCodeAll(rom, 'ad(....)f00622(......)800422')
  if (rows.length !== 1) return null
  const statcolumn = rows[0].groups[0]
  const rowSite = rows[0].at + 5
  // .3 as the game has it, or where the hack's code jmls to it.
  const callTo = (at: number) => loRomOffset(rom[at + 3], readU16(rom, at + 1))
  let skater = callTo(rowSite)
  // The hack's: lda statcolumn / cmp #6 / beq / jml .3.
  if (skater >= 0 && rom[skater] === 0xad && rom[skater + 8] === 0x5c) skater = callTo(skater + 8)
  // .3: phy / lda d1 / pha / ... name, G, A, Pts (171 bytes), shots and PM, then lda #$FFFF / jsl SetStatColumnPal / pla / sta d1 / ply / rtl.
  if (skater < 0 || !same(rom, skater, hexBytes('5AA5A948A9FFFF22'))) return null
  const head = rom.slice(skater, skater + 171)
  const tail = rom.slice(skater + 247, skater + 259)
  if (head[163] !== 0x22 || head[167] !== 0x22 || tail[0] !== 0xa9 || tail[11] !== 0x6b) return null
  const setPal = head.slice(8, 11), printx = head.slice(15, 17), toStatsPage = head.slice(24, 27), d0 = head[18], statstemp = head.slice(28, 30)
  // PlayerStatsScreen_right: lda statcolumn / cmp #5 (or #6) / bmi / jmp.
  const rights = [5, 6, 7, 8].flatMap((n) => findCodeAll(rom, 'ad' + hexOf(Uint8Array.from(word(statcolumn))) + 'c90' + n + '0030034c'))
  // SortPlayerStats: lda #titles>>16 / sta a1+2 / lda #titles / sta a1 / jsl AdvanceStringPtr / jsl print / ldx.
  const titles = findCodeAll(rom, 'a9(..)0085(..)a9(....)85(..)22(......)22......ae')
  // ComparePlayerStats .t2: cmp #5 / bne .t1 / jmp .t1x / .t1: jmp .6; or the hack's jsl / bcs / jmp / nops.
  const compares = [...findCodeAll(rom, 'c90500d0034c(....)4c(....)'), ...findCodeAll(rom, '22(......)b0(..)4c(....)eaea')]
  // DrawStatsList: lda #header>>16 / sta a1+2 / lda #header / sta a1 / jsl print / pla; or the hack's jsl and nops.
  // DrawStatsList's own: after lda statcolumn / beq .t1 / lda a1+2 / pha / lda a1 / pha.
  const drawList = 'ad' + hexOf(Uint8Array.from(word(statcolumn))) + 'f0..a5..48a5..48'
  const headers = [...findCodeAll(rom, drawList + 'a9(..)0085(..)a9(....)85(..)22......6885'), ...findCodeAll(rom, drawList + '22(......)eaeaeaeaeaea22......6885')]
  // PushTime: a1 = mesareaEnd in bank 0, then the seconds' ones and tens.
  const pushTimes = findCodeAll(rom, 'a90000858fa9....858da5a585..a90a0085..22......c68de220ad....186930878dc230a50085..a90600')
  if (rights.length !== 1 || titles.length !== 1 || compares.length !== 1 || headers.length !== 1 || pushTimes.length !== 1) return null
  const pushTime = long(pushTimes[0].at)
  const rightSite = rights[0].at + 4
  const [titleBank, a1hi, titleList, a1lo, advance] = titles[0].groups
  if (a1hi !== a1lo + 2) return null
  const titleSite = titles[0].at + 10
  // The hack's title code: lda d0 / cmp #6 / bne / ... / rtl / jml AdvanceStringPtr (at 18).
  const titleHooked = (site: number) => {
    const code = callTo(site)
    return code >= 0 && rom[code] === 0xa5 && rom[code + 1] === d0 && same(rom, code + 2, hexBytes('C90600D0')) && rom[code + 18] === 0x5c ? rom.slice(code + 19, code + 22) : null
  }
  const listAt = loRomOffset(titleBank, titleList)
  // The six titles, 14 bytes each (a length word of 14, 12 letters): Penalties' last letter " " or "]".
  if (listAt < 0 || readU16(rom, listAt + 70) !== 14) return null
  const penaltiesEnd = listAt + 83
  const cmpSite = compares[0].at
  const plainCompare = rom[cmpSite] === 0xc9
  const cmpCode = plainCompare ? -1 : callTo(cmpSite)
  // .t1x and .6, from the original or from the hack's code (which keeps them at its end).
  const t1x = plainCompare ? compares[0].groups[0] : readU16(rom, cmpCode - 4)
  const six = plainCompare ? compares[0].groups[1] : readU16(rom, cmpCode - 2)
  const sixAt = loRomOffset(loRomBank(cmpSite, 0x80), six)
  // .6: lda #0 / sta statstemp / bra .8 / .7: lda #1 / sta statstemp / .8.
  if (!same(rom, sixAt, bytesOf('A90000 8D', statstemp, '80'))) return null
  const eight = six + 14
  const cmpAddress = loRomAddress(cmpSite)
  const bcs = t1x - (cmpAddress + 6)
  if (bcs < 0 || bcs > 127) return null
  const headerSite = headers[0].at + 11
  const plainHeader = rom[headerSite] === 0xa9
  const headerCode = plainHeader ? -1 : callTo(headerSite)
  // The hack's: lda statcolumn / cmp #6 / beq / lda #bank / sta / lda #header.
  const [headerBank, , headerAddress] = plainHeader ? headers[0].groups : [rom[headerCode + 9], 0, readU16(rom, headerCode + 14)]
  const a1 = a1lo
  const header = loRomOffset(headerBank, headerAddress)
  if (header < 0 || !same(rom, header + 5, new TextEncoder().encode('  Player'))) return null

  const original = {
    row: bytesOf('22', long(skater)),
    title: bytesOf('22', titleHooked(titleSite) ?? rom.slice(titleSite + 1, titleSite + 4)),
    compare: bytesOf('C9 0500 D003 4C', word(t1x), '4C', word(six)),
    header: bytesOf('A9', headerBank, '00 85', a1 + 2, 'A9', word(headerAddress), '85', a1),
  }
  void advance
  return { headerPrefix: rom.slice(header, header + 5), ptoi, statcolumn, rowSite, skater, head, tail, setPal, printx, toStatsPage, d0, statstemp, pushTime, rightSite, titleSite, cmpSite, t1x, six, eight, bcs, headerSite, headerBank, headerAddress, a1, header, penaltiesEnd, original, callTo }
}

function timeOnIceShownPlaces(rom: Uint8Array): Placed[] | null {
  const pages = giveawayPagesIn(rom)
  if (pages) return pages.toiToggle
  const parts = statPageParts(rom)
  if (!parts) return null
  const { ptoi, statcolumn, rowSite, skater, head, tail, setPal, printx, toStatsPage, d0, statstemp, pushTime, rightSite, titleSite, cmpSite, t1x, six, eight, bcs, headerSite, headerBank, headerAddress, a1, header, penaltiesEnd, original, callTo } = parts
  const text = (s: string) => new TextEncoder().encode(s)
  const builds = {
    // lda statcolumn / cmp #6 / beq toi / jml .3 / toi: the row.
    row: (_at: number) =>
      asm65([
        bytesOf('AD', word(statcolumn), 'C90600'),
        { branch: BEQ, to: 't' },
        bytesOf('5C', long(skater)),
        { label: 't' },
        head,
        bytesOf('A90600 22', setPal, 'A91A00 8D', printx, 'DA 8A 0A AA BF', ptoi, '85', d0, 'FA 22', pushTime, 'A7', a1, 'C90600'),
        { branch: BNE, to: 'p' },
        bytesOf('EE', printx),
        { label: 'p' },
        bytesOf('22', toStatsPage),
        tail,
      ]),
    // lda d0 / cmp #6 / bne o / a1 = the title / rtl / o: jml AdvanceStringPtr; the title.
    title: (at: number) => {
      const code = (titleAt: number) =>
        asm65([
          bytesOf('A5', d0, 'C90600'),
          { branch: BNE, to: 'o' },
          bytesOf('A9', loRomBank(titleAt, 0x80), '00 85', a1 + 2, 'A9', word(loRomAddress(titleAt)), '85', a1, '6B'),
          { label: 'o' },
          bytesOf('5C', original.title.slice(1)),
        ])
      const length = code(0).length
      return bytesOf(code(at + length), word(14), text(TOI_TITLE))
    },
    // .t1x and .6 kept first (for reading back); entry at +4: cmp #5: sec / rtl; cmp #6: by time on ice; else no swap.
    compare: (_at: number) =>
      asm65([
        bytesOf(word(t1x), word(six), 'C90500'),
        { branch: BNE, to: 'n' },
        bytesOf('38 6B'),
        { label: 'n' },
        bytesOf('C90600'),
        { branch: BNE, to: 'z' },
        bytesOf('8A 0A AA BF', ptoi, '85', d0, '98 0A AA BF', ptoi, 'C5', d0),
        { branch: BEQ, to: 'z' },
        { branch: BCC, to: 'z' },
        bytesOf('A90100 8D', statstemp, '18 6B'),
        { label: 'z' },
        bytesOf('9C', statstemp, '18 6B'),
      ]),
    // lda statcolumn / cmp #6 / beq t / a1 = the game's header / rtl / t: a1 = ours / rtl; ours.
    header: (at: number) => {
      const code = (ours: number) =>
        asm65([
          bytesOf('AD', word(statcolumn), 'C90600'),
          { branch: BEQ, to: 't' },
          bytesOf('A9', headerBank, '00 85', a1 + 2, 'A9', word(headerAddress), '85', a1, '6B'),
          { label: 't' },
          bytesOf('A9', loRomBank(ours, 0x80), '00 85', a1 + 2, 'A9', word(loRomAddress(ours)), '85', a1, '6B'),
        ])
      const length = code(0).length
      return bytesOf(code(at + length), rom.slice(header, header + 5), text(TOI_HEADER))
    },
  }
  const hooks = {
    row: { site: rowSite, call: (to: number) => bytesOf('22', long(to)) },
    title: { site: titleSite, call: (to: number) => bytesOf('22', long(to)) },
    compare: { site: cmpSite, call: (to: number) => bytesOf('22', long(to + 4), 'B0', bcs, '4C', word(eight), 'EAEA') },
    header: { site: headerSite, call: (to: number) => bytesOf('22', long(to), 'EAEAEAEAEAEA') },
  }
  // Each piece's room looked for with the ones before it in, so they do not share it.
  const work = rom.slice()
  const places: Placed[] = []
  for (const key of ['row', 'title', 'compare', 'header'] as const) {
    const length = builds[key](0).length
    // The compare's hook calls 4 bytes into its code (after .t1x and .6).
    const site = hooks[key].site
    const isIn = !same(work, site, original[key])
    const room = isIn ? callTo(site) - (key === 'compare' ? 4 : 0) : farRoom(work, site, original[key], length)
    if (room < 0) return null
    const code = builds[key](room)
    places.push({ at: site, original: original[key], hacked: hooks[key].call(room) }, { at: room, original: unused(code.length), hacked: code })
    work.set(code, room)
    work.set(hooks[key].call(room), site)
  }
  places.push(
    { at: rightSite, original: Uint8Array.of(5), hacked: Uint8Array.of(6) },
    { at: penaltiesEnd, original: text(' '), hacked: text(']') },
  )
  return places
}

// ------------------------------------------------------ giveaways and takeaways
// As on the Genesis (hacks.ts, giveaways), by the NHL94 Match Viewer project's
// definitions: a change of puck carrier from one team to the other with no
// whistle between. A takeaway for a skater of the new carrier's team who forced
// it (a stick steal, puckstick's, which on the SNES knocks the puck loose; or a
// check that knocked the carrier down, FallDown's .25); else a giveaway for the
// player who lost it. Goalies get no takeaways. Not a shot (doshot forgets the
// carrier), a faceoff win (sf3fo), a pass between teammates, or a pass or dump-in
// the other team's goalie collects; nothing in a highlight (gmhl) or a shootout
// (shootoutmode). The places, found by the code around them, each a jsl to one
// block of code (entries after the two counting routines):
// - puckglue's ldy a2 / sty puckc (the carrier set) counts;
// - puckstick's tya / lsr / sta lastplayer (the steal: a2 the stealer) and
//   FallDown's two lda #$FFFF / sta puckc, .25's and the injury's (which drops
//   the puck four counts before its stoppage; Match Viewer), say who forced it
//   (a3 the checker);
// - dopass's and assdumpin's txa / lsr / sta lastplayer mark a pass, doshot's
//   forgets the carrier;
// - StartGame_scout's jsl Create_HotCold_Table clears the counts (not the season
//   shootout's StartGame_go).
// - A pass at the net counts as a shot, as Match Viewer counts it: picked up by
//   the other team once it has reached the goalie or the goal line, it is no
//   giveaway (before that, it is). puckgoalie's .t2 jsl ChkShotStat, on every touch of the goalie (holds too)
//   before its carried-puck test at .5, forgets the passer of a pass, then goes
//   to ChkShotStat; and dopass_swing's .2 lda puckvx / sta d0, where dopass and
//   assdumpin go once the puck's speed is set (X the passer), marks the pass
//   one at the net, as on the Genesis: released in the attacking
//   zone (puck y past the blue line, $58, toward the net the passer shoots at,
//   pfgoal,x: the top's goal line y $108, the bottom's -$108), 20 or more in
//   front of the goal line, moving toward it, its line crossing the goal line
//   within 40 of the middle (x 0). With no divide, the test is x * vy +
//   vx * (goal line - y) within 40 * vy, the x mirrored to make vx positive
//   and the speeds halved together to under 256 for an 8-bit multiply. The
//   mark, as on the Genesis, is the cause, $FFFD at the top's net, $FFFC at the
//   bottom's (the puck's y is on that side), with the passer kept: a pass to
//   everything else, the other team's skater picking it up a giveaway. He is
//   forgotten once the pass has reached the goal line or the goalie: pucknorm's
//   jsl ChkOffsides (after hybrid icing's place, its jsl PuckIChk), each frame
//   of a loose puck, looks at the puck's y first (y $108 or more at the top,
//   -$108 or less at the bottom); checkgoal's lda #$FFFF / sta collflag, the
//   puck in a net's box, its top too (off the post or the net's front,
//   where the puck, set back to where it was, may not have reached the line);
//   and a2touchpuck's
//   ldy a2 / cpy #$0018, on every touch, by a goalie: puckgoalie (which calls
//   it), and the puck off his stick or his body (puckstick's deflection,
//   puckbody), which do not go through puckgoalie. NOSE4Web's version of 18
//   November 2026 (bfda480) forgot the passer as it released a pass at the
//   net, so one picked off in the slot was no giveaway: recognised, and
//   replaced when asked.
// The counts, a word per roster player (the visitors $34 bytes on, as the time
// on ice), giveaways then takeaways, then each team's totals (home and visitors'
// giveaways, then takeaways), after the last carrier and the cause ($FFFF none,
// $FFFE a pass): at $7E:FD10, between the season shootout's save ($F100-$FD0F
// with a 2 MB build's player stats) and the fights ($FE00), in room Match Viewer
// found never written in a whole game on the original game, Classic and the 2 MB
// build; in the SA-1 builds, which cannot reach bank $7E, in BW-RAM at $40:5500
// (past the season shootout's save). NOSE4Web's first version (14 November 2026)
// kept them at $7E:E68C, which the 2 MB builds use for their fights (fighton,
// ChkCnt, OptFights... from $E700; Match Viewer): not recognised. Its version of
// 14 November 2026 (8650b4a) credited whoever held the carrier's or forcer's spot
// on the ice when the puck was picked up: recognised, and replaced when asked; as is
// its version of 15 November 2026 (7ad4a23), without the pass at the net.
const GT_RAM = [
  { shift: 0, bank: 0x7e, at: 0xfd10 },
  { shift: 0x6000, bank: 0x40, at: 0x5500 },
]
const GT_GIVE = 4
const GT_TAKE = GT_GIVE + 0x68
const GT_TOTALS = GT_TAKE + 0x68
const GT_SIZE = GT_TOTALS + 8
// After them, the last carrier's roster place (pnum), kept from his pickup, and the forcer's, kept as he forces it: the
// players counted, whoever is in their spots on the ice by the time the puck is picked up (a line change while it was
// loose). Not cleared: each is set with the spot it goes with.
const GT_LASTP = GT_SIZE
const GT_CAUSEP = GT_SIZE + 2
type GtSite = 'glue' | 'steal' | 'pass' | 'dump' | 'shot' | 'fall' | 'injury' | 'goalie' | 'wide' | 'touch' | 'frame' | 'goal'
// The versions: 8650b4a's (14 November 2026), 7ad4a23's (15 November), bfda480's (18 November: with the goalie's touch
// and the swing, which forgot the passer of a pass at the net as it was released), 1d24880's (later on 18 November: with
// a goalie's touch at a2touchpuck, the frame and the net, which counted a pickup after the whistle) and this one.
const GT_WIDE = 2
const GT_NET = 3
const GT_NOW = 4

interface GtEnv {
  ram: (typeof GT_RAM)[number]
  a2: number
  a3: number
  d0: number
  puckc: number
  lastplayer: number
  sites: Record<GtSite | 'scout', number>
}

function gtEnv(rom: Uint8Array): GtEnv | null {
  const moved = shift(rom)
  const ram = GT_RAM.find((layout) => layout.shift === moved)
  if (moved === null || !ram) return null
  const any5 = '..........'
  // puckglue: ldy a2 / cpy puckc / beq .1 / lda #3 / jsl PuckSfx / jsl EndPenaltyShotPlay / stz breakaway / stz onetimer / .1: ldy a2 / sty puckc / sty d0 / stz a0.
  const glue = findCodeAll(rom, 'a4(..)cc(....)f0..a90300' + '22......22......9c....9c....' + any5 + '84..64')
  // puckstick: lda a0 / ldy a2 / sty a0 / sta a2 / tya / lsr / sta lastplayer / lda #sfspdir|sfssdir / trb sflags.
  const steal = findCodeAll(rom, 'a5..a4..84..85..' + any5 + 'a90c001c')
  // dopass: lda #$10 / sta nopuck,x / txa / lsr / sta lastplayer / lda #7; doshot's then ldy #$108; assdumpin's lda #$1E ... jmp.
  const pass = findCodeAll(rom, 'a910009d....' + any5 + 'a90700')
  const shot = findCodeAll(rom, 'a910009d....' + any5 + 'a00801')
  const dump = findCodeAll(rom, 'a91e009d....' + any5 + '4c')
  // FallDown .25: ldy a2 / lda SPA,y / cmp #SPAstumble / beq / lda #$FFFF / sta puckc / ldy a2 / lda pfteam,y.
  const fall = findCodeAll(rom, 'a4..b9....c9....f006' + '............' + 'a4..b9')
  // FallDown's injury: lda position,y / bmi .25 / beq .25 / lda #$FFFF / sta puckc / stz benchcheer / ldy a2 / lda pfteam,y.
  const injury = findCodeAll(rom, 'b9....30..f0..' + '............' + '9c....a4..b9')
  // StartGame_scout: jsl Create_HotCold_Table / jsl ScoutingReport / lda #$FFFF / sta FrameByNumber / jsl forcefade.
  const scout = findCodeAll(rom, '22......22......a9ffff8d....22')
  // puckgoalie .t2: jsl ChkShotStat / jsl a2touchpuck / lda #6 / jsl PuckSfx / lda puckvy / cmp #$3000.
  const goalie = findCodeAll(rom, '22......22......a9060022......ad(....)c90030')
  // dopass_swing: lda position,x / bne .2 / lda pfgoal,x / beq .t1 / lda puckvy / bmi .1 / bra .2 / .t1: lda puckvy /
  // bmi .2 / .1: eor #$FFFF / inc / sta puckvy / .2: lda puckvx / sta d0 / lda puckvy / sta d1 / jsl vtoa.
  const swing = findCodeAll(rom, 'bd(....)d0..bd(....)f0..ad....30..80..ad....30..49ffff1a8d....' + '..........' + 'ad(....)85(..)22')
  // a2touchpuck: ldy a2 / cpy #$0018 (or the jsl there) / bcc .t2 / jmp .6 / .t2: lda Xpos,y / sta.l ltx / lda Ypos,y /
  // sta.l lty / tya / lsr / sta.l ltplayer.
  const touch = findCodeAll(rom, any5 + '90034c....b9....8f......b9....8f......984a8f')
  // pucknorm .4: jsl PuckIChk (or hybrid icing's code) / jsl ChkOffsides (or the jsl there) / lda gmclock / bne .13 /
  // lda puckc / bpl .11.
  const frame = findCodeAll(rom, '22......22......ad....d0..ad(....)10')
  // checkgoal, the puck in a net's box: lda #$FFFF / sta collflag (or the jsl there) / lda puckoldz / cmp #$000D / bmi
  // .t2 / lda puckoldz / sta puckz / jmp .10.
  const goal = findCodeAll(rom, '............ad(....)c90d0030..ad(....)8d....4c')
  if ([glue, steal, pass, shot, dump, fall, injury, scout, goalie, swing, touch, frame, goal].some((found) => found.length !== 1)) return null
  const [a2, puckc] = glue[0].groups
  if (a2 !== 0x91 || puckc !== 0x0ad9 + moved) return null
  const [position, pfgoal, puckvy, d1] = swing[0].groups
  if (position !== 0x0f43 + moved || pfgoal !== 0x14c3 + moved || puckvy !== 0x0eff + moved || goalie[0].groups[0] !== puckvy || d1 !== 0xa9) return null
  // The swing's lda puckvx / sta d0, or the jsl there.
  const wide = swing[0].at + 29
  if (!same(rom, wide, bytesOf('AD', word(0x0edf + moved), '85A5')) && rom[wide] !== 0x22) return null
  // a2touchpuck's ldy a2 / cpy #$0018, or the jsl there (and a nop).
  const touched = touch[0].at
  if (!same(rom, touched, bytesOf('A4', a2, 'C01800')) && (rom[touched] !== 0x22 || rom[touched + 4] !== 0xea)) return null
  if (frame[0].groups[0] !== puckc) return null
  // checkgoal's lda #$FFFF / sta collflag, or the jsl there (and two nops).
  const netted = goal[0].at
  if (goal[0].groups[0] !== goal[0].groups[1]) return null
  if (!same(rom, netted, hexBytes('A9FFFF8D')) && (rom[netted] !== 0x22 || readU16(rom, netted + 4) !== 0xeaea)) return null
  return {
    ram,
    a2,
    a3: 0x95,
    d0: 0xa5,
    puckc,
    lastplayer: 0x0cf3 + moved,
    sites: {
      glue: glue[0].at + 24,
      steal: steal[0].at + 8,
      pass: pass[0].at + 6,
      dump: dump[0].at + 6,
      shot: shot[0].at + 6,
      fall: fall[0].at + 10,
      injury: injury[0].at + 7,
      scout: scout[0].at,
      goalie: goalie[0].at,
      wide,
      touch: touched,
      frame: frame[0].at + 4,
      goal: netted,
    },
  }
}

type GtEntry = 'glue' | 'steal' | 'pass' | 'shot' | 'fall' | 'goalie' | 'wide' | 'touch' | 'frame' | 'goal' | 'stopGlue' | 'stopFrame' | 'scout'

// The block: COUNT give (x the player's object), COUNT take, then the entries (the goalie's ending jml ChkShotStat,
// `check`; a multiply for the pass at the net; the frame's ending jml ChkOffsides, `offsides`; the net's sta collflag,
// `collflag`); the clear's jml last. `version` an earlier one (GT_NOW this one).
function gtCode(
  env: GtEnv,
  base: number,
  hotCold: Uint8Array,
  version = GT_NOW,
  check = new Uint8Array(3),
  offsides = new Uint8Array(3),
  collflag = new Uint8Array(2),
): { code: Uint8Array; entries: Record<GtEntry, number> } {
  const { ram, a2, a3 } = env
  const earlier = version === 0
  const L = (offset: number) => bytesOf(word(ram.at + offset), ram.bank)
  const W = (address: number) => word(address + ram.shift)
  const [gmode, sflags3, shootoutmode, position, pnum] = [0x15d4, 0x15dc, 0x1d81, 0x0f43, 0x12a3]
  // The player's word (his roster place in A, x 2, the visitors' $34 on; x his object, for his team) and his team's
  // total, one more each. The earlier version read the roster place of x's spot then (lda pnum,x).
  const counter = (array: number, totals: number) =>
    asm65([
      bytesOf(earlier ? bytesOf('BD', W(pnum)) : [], '29FF00 C91A00'),
      { branch: BCS, to: 'r' },
      bytesOf('0A E00C00'),
      { branch: BCC, to: 'h' },
      bytesOf('18 693400'),
      { label: 'h' },
      bytesOf('DA AA BF', L(array), '1A 9F', L(array), 'FA E00C00'),
      { branch: BCS, to: 'v' },
      bytesOf('AF', L(totals), '1A 8F', L(totals), '60'),
      { label: 'v' },
      bytesOf('AF', L(totals + 2), '1A 8F', L(totals + 2)),
      { label: 'r' },
      '60',
    ])
  const give = counter(GT_GIVE, GT_TOTALS)
  const take = counter(GT_TAKE, GT_TOTALS + 4)
  const abs = (at: number) => word(loRomAddress(at))
  // (A - $0C) eor (a2 - $0C), pulled: positive when the object in A and a2 are of the same team.
  const sameTeam = bytesOf('38 E90C00 48 A5', a2, '38 E90C00 43 01 83 01 68')
  const glue = asm65([
    bytesOf('A4', a2, '8C', word(env.puckc), 'DA'),
    bytesOf('AD', W(gmode), '291000'),
    // A highlight: nothing (past an 8-bit branch's reach with the roster places kept).
    ...(earlier ? [{ branch: BNE, to: 'x' }] : [{ branch: BEQ, to: 'play' }, { brl: 'x' }, { label: 'play' }]),
    bytesOf('AD', W(shootoutmode), '29FF00'),
    { branch: BNE, to: 'reset' },
    bytesOf('AD', W(sflags3), '291000'),
    { branch: BNE, to: 'reset' },
    bytesOf('AF', L(0)),
    { branch: BMI, to: 'reset' },
    sameTeam,
    { branch: BPL, to: 'reset' },
    // The cause: $FFFF none, a giveaway; from $8000 a pass (the pass at the net's $FFFD and $FFFC too); else the
    // forcer's spot. Earlier versions had only $FFFE for a pass.
    ...(version >= GT_NET
      ? [bytesOf('AF', L(2), 'C9FFFF'), { branch: BEQ, to: 'give' }, bytesOf('C90080'), { branch: BCS, to: 'pass' }]
      : [bytesOf('AF', L(2), 'C9FEFF'), { branch: BEQ, to: 'pass' }, bytesOf('C90080'), { branch: BCS, to: 'give' }]),
    bytesOf('AA BD', W(position)),
    { branch: BEQ, to: 'give' },
    bytesOf('8A', sameTeam),
    { branch: BMI, to: 'give' },
    bytesOf(earlier ? [] : bytesOf('AF', L(GT_CAUSEP)), '20', abs(base + give.length)),
    { branch: BRA, to: 'reset' },
    { label: 'pass' },
    bytesOf('A6', a2, 'BD', W(position)),
    { branch: BEQ, to: 'reset' },
    { label: 'give' },
    bytesOf('AF', L(0), 'AA', earlier ? [] : bytesOf('AF', L(GT_LASTP)), '20', abs(base)),
    { label: 'reset' },
    bytesOf(earlier ? [] : bytesOf('A6', a2, 'BD', W(pnum), '8F', L(GT_LASTP)), 'A5', a2, '8F', L(0), 'A9FFFF 8F', L(2)),
    { label: 'x' },
    bytesOf('FA A4', a2, '6B'),
  ])
  const lastplayer = (from: string) => bytesOf(from, '4A 8D', word(env.lastplayer), '48')
  // The forcer's roster place too, kept with his spot (X kept).
  const forcer = (object: number) => (earlier ? [] : bytesOf('DA A6', object, 'BD', W(pnum), '8F', L(GT_CAUSEP), 'FA'))
  const steal = bytesOf(lastplayer('98'), 'A5', a2, '8F', L(2), forcer(a2), '68 6B')
  const pass = bytesOf(lastplayer('8A'), 'A9FEFF 8F', L(2), '68 6B')
  const shot = bytesOf(lastplayer('8A'), 'A9FFFF 8F', L(0), '8F', L(2), '68 6B')
  const fall = bytesOf('A9FFFF 8D', word(env.puckc), 'A5', a3, '8F', L(2), forcer(a3), '6B')
  // The goalie's touch: a pass's passer forgotten, then ChkShotStat.
  const goalie = asm65([bytesOf('AF', L(2), 'C9FEFF'), { branch: BNE, to: 'x' }, bytesOf('A9FFFF 8F', L(0)), { label: 'x' }, bytesOf('5C', check)])
  // A = A * Y (both under 256), with d0 and d1 (which the swing sets next) and X.
  const { d0 } = env
  const d1 = d0 + 4
  const mul = asm65([
    bytesOf('85', d0, '64', d1, '98'),
    { label: 'm' },
    bytesOf('46', d0),
    { branch: BCC, to: 's' },
    bytesOf('AA 18 65', d1, '85', d1, '8A'),
    { label: 's' },
    bytesOf('0A A6', d0),
    { branch: BNE, to: 'm' },
    bytesOf('A5', d1, '60'),
  ])
  const before = [give, take, glue, steal, pass, shot, fall, goalie].reduce((sum, part) => sum + part.length, 0)
  const multiply = bytesOf('20', abs(base + before))
  const [puckx, pucky, puckvx, puckvy, pfgoal] = [0x0d71, 0x0dd3, 0x0edf, 0x0eff, 0x14c3]
  // The pass at the net (X the passer): y and vy toward his net (pfgoal,x nonzero the top; the bottom's negated),
  // past the blue line and 20 or more in front of the goal line, moving toward it, pushed: dist = $108 - y, then vy
  // (b), then the x (t) and |vx| (a, in Y) mirrored so vx is not negative. a and b halved together to under 256; then
  // p = a * dist, pushed; past +40 if p > (40 - t) * b, past -40 if p < (-40 - t) * b. Then the swing's own lda puckvx /
  // sta d0. The way out first, in reach of the first tests.
  const wide = asm65([
    'DA',
    { branch: BRA, to: 'start' },
    { label: 'out1' },
    '68',
    { label: 'out' },
    bytesOf('FA AD', W(puckvx), '85', d0, '6B'),
    { label: 'start' },
    bytesOf('BD', W(pfgoal)),
    { branch: BNE, to: 'top' },
    bytesOf('A90000 38 ED', W(puckvy), 'A8 A90000 38 ED', W(pucky)),
    { branch: BRA, to: 'go' },
    { label: 'top' },
    bytesOf('AC', W(puckvy), 'AD', W(pucky)),
    { label: 'go' },
    bytesOf('C95800'),
    { branch: BMI, to: 'out' },
    bytesOf('38 E90801 49FFFF 1A C91400'),
    { branch: BMI, to: 'out' },
    bytesOf('48 98'),
    { branch: BMI, to: 'out1' },
    { branch: BEQ, to: 'out1' },
    bytesOf('48 AD', W(puckx), 'AC', W(puckvx)),
    { branch: BPL, to: 'right' },
    bytesOf('49FFFF 1A 48 A90000 38 ED', W(puckvx), 'A8 68'),
    { label: 'right' },
    bytesOf('48'),
    { label: 'norm' },
    bytesOf('C00001'),
    { branch: BCS, to: 'half' },
    bytesOf('A303 C90001'),
    { branch: BCC, to: 'small' },
    { label: 'half' },
    bytesOf('98 4A A8 A303 4A 8303'),
    { branch: BRA, to: 'norm' },
    { label: 'small' },
    bytesOf('A303'),
    { branch: BEQ, to: 'out3' },
    bytesOf('A305', multiply, '48 A305 A8 A92800 38 E303'),
    { branch: BMI, to: 'out4' },
    bytesOf(multiply, 'C301'),
    { branch: BCC, to: 'out4' },
    bytesOf('A9D8FF 38 E303'),
    { branch: BMI, to: 'hit' },
    { branch: BEQ, to: 'hit' },
    bytesOf(multiply, 'C301'),
    { branch: BEQ, to: 'hit' },
    { branch: BCS, to: 'out4' },
    { label: 'hit' },
    // Marked, the passer kept: $FFFD at the top's net (the puck's y positive), $FFFC at the bottom's. The earlier
    // version forgot him (carrier and cause $FFFF).
    ...(version >= GT_NET
      ? [bytesOf('A9FDFF AC', W(pucky)), { branch: BPL, to: 'mark' }, '3A', { label: 'mark' }, bytesOf('8F', L(2))]
      : [bytesOf('A9FFFF 8F', L(0), '8F', L(2))]),
    { label: 'out4' },
    '68',
    { label: 'out3' },
    '68 68',
    { brl: 'out1' },
  ])
  // A goalie's touch, at a2touchpuck (its ldy a2 / cpy #$0018 last, for its bcc), whatever the touch (puckgoalie's, or
  // the puck off his stick or his body, which do not go through puckgoalie): the passer of a pass at the net forgotten.
  const touch = asm65([
    bytesOf('A4', a2, 'C01800'),
    { branch: BCS, to: 'x' },
    bytesOf('B9', W(position)),
    { branch: BNE, to: 'x' },
    bytesOf('AF', L(2), '090100 C9FDFF'),
    { branch: BNE, to: 'x' },
    bytesOf('A9FFFF 8F', L(0), '8F', L(2)),
    { label: 'x' },
    bytesOf('A4', a2, 'C01800 6B'),
  ])
  // Each frame of pucknorm, before ChkOffsides: the passer of a pass at the net forgotten once the puck has reached its
  // goal line (y $108 or more at the top, -$108 or less at the bottom).
  const frame = asm65([
    bytesOf('AF', L(2), 'C9FDFF'),
    { branch: BNE, to: 'bottom' },
    bytesOf('AD', W(pucky), 'C90801'),
    { branch: BMI, to: 'out' },
    { branch: BRA, to: 'clear' },
    { label: 'bottom' },
    bytesOf('C9FCFF'),
    { branch: BNE, to: 'out' },
    bytesOf('AD', W(pucky), 'C9F9FE'),
    { branch: BPL, to: 'out' },
    { label: 'clear' },
    bytesOf('A9FFFF 8F', L(0), '8F', L(2)),
    { label: 'out' },
    bytesOf('5C', offsides),
  ])
  // checkgoal, the puck in a net's box, its top too (its lda #$FFFF / sta collflag first): off the post or the
  // net's front, where the puck, set back to where it was, may not have reached the goal line, the passer of a pass at
  // the net forgotten.
  const goal = asm65([
    bytesOf('A9FFFF 8D', collflag, 'AF', L(2), '090100 C9FDFF'),
    { branch: BNE, to: 'x' },
    bytesOf('A9FFFF 8F', L(0), '8F', L(2)),
    { label: 'x' },
    '6B',
  ])
  const scout = asm65([
    bytesOf('A9FFFF 8F', L(0), '8F', L(2), 'A90000 A2', word(GT_SIZE - GT_GIVE - 2)),
    { label: 'loop' },
    bytesOf('9F', L(GT_GIVE), 'CA CA'),
    { branch: BPL, to: 'loop' },
    bytesOf('5C', hotCold),
  ])
  const parts: [string, Uint8Array][] = [
    ['give', give],
    ['take', take],
    ['glue', glue],
    ['steal', steal],
    ['pass', pass],
    ['shot', shot],
    ['fall', fall],
    ...(version >= GT_WIDE ? ([['goalie', goalie], ['mul', mul], ['wide', wide]] as [string, Uint8Array][]) : []),
    ...(version >= GT_NET ? ([['touch', touch], ['frame', frame], ['goal', goal]] as [string, Uint8Array][]) : []),
  ]
  // No whistle between: from the whistle to the end of the ref's sequence (gmode's gmpen, $0004: set by Stop4Pen at
  // every stoppage, cleared by InProgress_exit as the faceoff comes), the carrier and the cause forgotten, at every
  // pickup (puckglue's call, its ldy a2 / sty puckc first; not counted) and each frame (pucknorm's, then the frame's
  // part). The play goes on after the whistle (pucknorm runs its collision checks with the clock stopped), and a pickup
  // then was counted against the carrier before the whistle.
  if (version >= GT_NOW) {
    const offset = (key: string) => parts.slice(0, parts.findIndex(([name]) => name === key)).reduce((sum, [, bytes]) => sum + bytes.length, 0)
    const stopGlue = asm65([
      bytesOf('AD', W(gmode), '290400'),
      { branch: BNE, to: 'stop' },
      bytesOf('4C', abs(base + offset('glue'))),
      { label: 'stop' },
      bytesOf('A4', a2, '8C', word(env.puckc), 'A9FFFF 8F', L(0), '8F', L(2), '6B'),
    ])
    const stopFrame = asm65([
      bytesOf('AD', W(gmode), '290400'),
      { branch: BEQ, to: 'on' },
      bytesOf('A9FFFF 8F', L(0), '8F', L(2)),
      { label: 'on' },
      bytesOf('4C', abs(base + offset('frame'))),
    ])
    parts.push(['stopGlue', stopGlue], ['stopFrame', stopFrame])
  }
  parts.push(['scout', scout])
  const entries = {} as Record<GtEntry, number>
  let at = 0
  for (const [key, bytes] of parts) {
    if (key !== 'give' && key !== 'take' && key !== 'mul') entries[key as GtEntry] = at
    at += bytes.length
  }
  return { code: bytesOf(...parts.map(([, bytes]) => bytes)), entries }
}

function giveawayPlaces(rom: Uint8Array): Placed[] | null {
  const env = gtEnv(rom)
  if (!env) return null
  const { sites } = env
  const jsl = (to: number, pad: number) => bytesOf('22', long(to), new Array(pad).fill(0xea))
  const originals: Record<GtSite, Uint8Array> = {
    glue: bytesOf('A4', env.a2, '8C', word(env.puckc)),
    steal: bytesOf('98 4A 8D', word(env.lastplayer)),
    pass: bytesOf('8A 4A 8D', word(env.lastplayer)),
    dump: bytesOf('8A 4A 8D', word(env.lastplayer)),
    shot: bytesOf('8A 4A 8D', word(env.lastplayer)),
    fall: bytesOf('A9FFFF 8D', word(env.puckc)),
    injury: bytesOf('A9FFFF 8D', word(env.puckc)),
    goalie: new Uint8Array(4),
    wide: bytesOf('AD', word(0x0edf + env.ram.shift), '85', env.d0),
    touch: bytesOf('A4', env.a2, 'C01800'),
    frame: new Uint8Array(4),
    goal: new Uint8Array(6),
  }
  const pads: Record<GtSite, number> = { glue: 1, steal: 1, pass: 1, dump: 1, shot: 1, fall: 2, injury: 2, goalie: 0, wide: 1, touch: 1, frame: 0, goal: 2 }
  let probe = gtCode(env, 0, new Uint8Array(3))
  let base: number
  let hotCold = rom.slice(sites.scout + 1, sites.scout + 4)
  // ChkShotStat, from the goalie's jsl (or, with a version that has it in, the block's jml); ChkOffsides, from
  // pucknorm's jsl, and collflag, from checkgoal's sta (or, with this version in, the frame's jml and the net's sta).
  let check = rom.slice(sites.goalie + 1, sites.goalie + 4)
  let offsides = rom.slice(sites.frame + 1, sites.frame + 4)
  let collflag = rom.slice(sites.goal + 4, sites.goal + 6)
  let version = GT_NOW
  // The jml's address in a block at `at` (the goalie's entry: lda, cmp, bne, lda, sta, then jml); the frame's jml
  // (its last, just before the net's entry) and the net's sta (lda #$FFFF, then sta collflag).
  const checkIn = (at: number, block: { entries: Record<GtEntry, number> }) => rom.slice(at + block.entries.goalie + 17, at + block.entries.goalie + 20)
  const offsidesIn = (at: number, block: { entries: Record<GtEntry, number> }) => rom.slice(at + block.entries.goal - 3, at + block.entries.goal)
  const collflagIn = (at: number, block: { entries: Record<GtEntry, number> }) => rom.slice(at + block.entries.goal + 4, at + block.entries.goal + 6)
  if (!same(rom, sites.glue, originals.glue)) {
    // In: the block from the glue's call, and Create_HotCold_Table from the clear's jml at its end; this version's
    // block, or an earlier one's.
    if (rom[sites.glue] !== 0x22) return null
    const called = loRomOffset(rom[sites.glue + 3], readU16(rom, sites.glue + 1))
    // (From this version the call goes to the stoppage's part for the pickup.)
    const blockAt = (block: { code: Uint8Array; entries: Record<GtEntry, number> }) => called - (block.entries.stopGlue ?? block.entries.glue)
    const holds = (v: number) => {
      const block = gtCode(env, 0, new Uint8Array(3), v)
      const at = blockAt(block)
      if (at < 0) return false
      const ends = rom.slice(at + block.code.length - 3, at + block.code.length)
      const now = v >= GT_NET
      const full = gtCode(env, at, ends, v, v >= GT_WIDE ? checkIn(at, block) : check, now ? offsidesIn(at, block) : offsides, now ? collflagIn(at, block) : collflag)
      return same(rom, at, full.code)
    }
    version = [GT_NOW, GT_NET, GT_WIDE, 1, 0].find(holds) ?? GT_NOW
    probe = gtCode(env, 0, new Uint8Array(3), version)
    base = blockAt(probe)
    if (base < 0) return null
    hotCold = rom.slice(base + probe.code.length - 3, base + probe.code.length)
    if (version >= GT_WIDE) check = checkIn(base, probe)
    if (version >= GT_NET) {
      offsides = offsidesIn(base, probe)
      collflag = collflagIn(base, probe)
    }
  } else {
    base = farRoom(rom, sites.glue, originals.glue, probe.code.length)
    if (base < 0) return null
  }
  originals.goalie = bytesOf('22', check)
  originals.frame = bytesOf('22', offsides)
  originals.goal = bytesOf('A9FFFF 8D', collflag)
  const { code, entries } = gtCode(env, base, hotCold, version, check, offsides, collflag)
  // The places an earlier version has the game's own code at: the goalie's touch and the swing before 18 November; a
  // goalie's touch at a2touchpuck, pucknorm's frame and checkgoal's net before this one.
  const unhooked = (key: GtSite) => (version < GT_WIDE && (key === 'goalie' || key === 'wide')) || (version < GT_NET && (key === 'touch' || key === 'frame' || key === 'goal'))
  // From this version, the pickup and the frame go through the stoppage's parts first.
  const entry = (key: GtSite): GtEntry => (key === 'dump' ? 'pass' : key === 'injury' ? 'fall' : version >= GT_NOW && key === 'glue' ? 'stopGlue' : version >= GT_NOW && key === 'frame' ? 'stopFrame' : key)
  return [
    ...(Object.keys(originals) as GtSite[]).map((key) => ({
      at: sites[key],
      original: originals[key],
      hacked: unhooked(key) ? originals[key] : jsl(base + entries[entry(key)], pads[key]),
    })),
    { at: sites.scout, original: bytesOf('22', hotCold), hacked: jsl(base + entries.scout, 0) },
    { at: base, original: unused(code.length), hacked: code, ...(version < GT_NOW ? { earlier: true } : {}) },
  ]
}

// ------------------------------------------------- giveaways and takeaways in the team stats
// Game Stats has a row more, "Give/Take": each team's giveaways / takeaways,
// as the game's own a/b rows (kind $11, shown with penalties on or off). The
// game reads its rows' numbers from low RAM (lda $0000,y): DisplayStats .5's two
// tay / lda $0000,y become jsl to code that reads the four totals from their
// RAM, anything else as before. The three lists (TeamStatNames,
// TeamStatNamesNoPen and TeamStatSources) are copied with the row added, after
// a note of where the ROM's own are, and DisplayStats' lda #bank / lda #list
// point at the copies; StatsReport's two row counts (listcount) are one more.
const GT_ROW_NAME = '  Give/Take  '
const GT_SHOWN_HEADER = 9

interface GtShownEnv {
  read: [number, number]
  names: number
  sources: number
  counts: [number, number]
}

function gtShownEnv(rom: Uint8Array): GtShownEnv | null {
  // DisplayStats .5: lda [a0] / inc a0 x2 / clc / adc a2 / tay / lda $0000,y / sta d0 / jsl PushNumber / lda [a0] / sta d1; and lda a2 / clc / adc d1.
  const first = findCodeAll(rom, 'a7..e6..e6..1865..' + '........' + '85..22......a7..85..a9')
  const second = findCodeAll(rom, 'a5..1865..' + '........' + '85..22......22')
  // .t1: lda #bank / sta a0+2 / lda #TeamStatSources / sta a0 / lda curitem / sta d0 / lda [a0] / bpl.
  const sources = findCodeAll(rom, 'a9..0085..a9....85..ad....85..a7..1003')
  // .t2: lda #bank / sta a1+2 / lda #TeamStatNames / sta a1 / lda.l OptPen / bne / lda #bank / sta a1+2 / lda #TeamStatNamesNoPen.
  const names = findCodeAll(rom, 'a9..0085..a9....85..af......d0..a9..0085..a9....')
  // StatsReport: lda #rows / sta listcount / lda #$10 / sta statpenrows / lda.l OptPen / bne / lda #rows / sta listcount.
  const counts = findCodeAll(rom, 'a9..008d(....)a910008d....af......d0..a9..008d(....)')
  if (first.length !== 1 || second.length !== 1 || sources.length !== 1 || counts.length !== 1) return null
  if (counts[0].groups[0] !== counts[0].groups[1]) return null
  const near = names.filter((found) => found.at < sources[0].at && sources[0].at - found.at < 0x80)
  if (near.length !== 1) return null
  return { read: [first[0].at + 9, second[0].at + 5], names: near[0].at, sources: sources[0].at, counts: [counts[0].at + 1, counts[0].at + 19] }
}

// A list of `rows` strings (a length word, 2 + the text, then the text) at `at`, as bytes.
function stringList(rom: Uint8Array, at: number, rows: number): Uint8Array | null {
  if (at < 0) return null
  let end = at
  for (let i = 0; i < rows; i++) {
    const length = readU16(rom, end)
    if (length < 2 || length > 40) return null
    end += length
  }
  return rom.slice(at, end)
}

function giveawayShownPlaces(rom: Uint8Array): Placed[] | null {
  const env = gtEnv(rom)
  const shown = gtShownEnv(rom)
  if (!env || !shown) return null
  const { ram } = env
  const totals = (ram.at + GT_TOTALS) & 0xffff
  const readOriginal = hexBytes('A8B90000')
  const isIn = !same(rom, shown.read[0], readOriginal)
  const n = shown.names
  // The ROM's own lists: names bank and address, no-penalty bank and address, sources bank and address.
  let base = -1
  let own: Uint8Array
  if (isIn) {
    if (rom[shown.read[0]] !== 0x22) return null
    base = loRomOffset(rom[shown.read[0] + 3], readU16(rom, shown.read[0] + 1)) - GT_SHOWN_HEADER
    if (base < 0) return null
    own = rom.slice(base, base + GT_SHOWN_HEADER)
  } else {
    own = bytesOf(rom[n + 1], rom.slice(n + 6, n + 8), rom[n + 17], rom.slice(n + 22, n + 24), rom[shown.sources + 1], rom.slice(shown.sources + 6, shown.sources + 8))
  }
  const rowsOn = rom[shown.counts[0]] - (isIn ? 1 : 0)
  const rowsOff = rom[shown.counts[1]] - (isIn ? 1 : 0)
  const row = bytesOf(word(2 + GT_ROW_NAME.length), new TextEncoder().encode(GT_ROW_NAME))
  const namesOn = stringList(rom, loRomOffset(own[0], readU16(own, 1)), rowsOn)
  const namesOff = stringList(rom, loRomOffset(own[3], readU16(own, 4)), rowsOff)
  const sourcesAt = loRomOffset(own[6], readU16(own, 7))
  if (!namesOn || !namesOff || sourcesAt < 0) return null
  let sourcesEnd = sourcesAt
  while (readU16(rom, sourcesEnd) !== 0xffff) {
    sourcesEnd += 6
    if (sourcesEnd - sourcesAt > 6 * 40) return null
  }
  // tay / the totals: lda.l from their RAM (phx / tyx / plx); else lda $0000,y as the game.
  const readCode = asm65([
    bytesOf('A8 C0', word(totals)),
    { branch: BCC, to: 'n' },
    bytesOf('C0', word(totals + 8)),
    { branch: BCS, to: 'n' },
    bytesOf('DA BB BF', word(0), ram.bank, 'FA 6B'),
    { label: 'n' },
    bytesOf('B90000 6B'),
  ])
  const sources = bytesOf(rom.slice(sourcesAt, sourcesEnd), word(0x11), word(totals), word(totals + 4), 'FFFF FFFF FFFF')
  const length = GT_SHOWN_HEADER + readCode.length + namesOn.length + namesOff.length + 2 * row.length + sources.length
  if (!isIn) {
    base = farRoom(rom, shown.read[0], readOriginal, length)
    if (base < 0) return null
  }
  const onAt = base + GT_SHOWN_HEADER + readCode.length
  const offAt = onAt + namesOn.length + row.length
  const sourcesNew = offAt + namesOff.length + row.length
  const block = bytesOf(own, readCode, namesOn, row, namesOff, row, sources)
  const operand = (place: number, bank: number, address: number, to: number): Placed[] => [
    { at: place + 1, original: Uint8Array.of(bank), hacked: Uint8Array.of(loRomBank(to, 0x80)) },
    { at: place + 6, original: Uint8Array.from(word(address)), hacked: Uint8Array.from(word(loRomAddress(to))) },
  ]
  return [
    ...shown.read.map((site) => ({ at: site, original: readOriginal, hacked: bytesOf('22', long(base + GT_SHOWN_HEADER)) })),
    ...operand(n, own[0], readU16(own, 1), onAt),
    ...operand(n + 16, own[3], readU16(own, 4), offAt),
    ...operand(shown.sources, own[6], readU16(own, 7), sourcesNew),
    { at: shown.counts[0], original: Uint8Array.of(rowsOn), hacked: Uint8Array.of(rowsOn + 1) },
    { at: shown.counts[1], original: Uint8Array.of(rowsOff), hacked: Uint8Array.of(rowsOff + 1) },
    { at: base, original: unused(block.length), hacked: block },
  ]
}

// ------------------------------------------------- giveaways and takeaways in Player Stats
// Two sort columns after Penalties (or the checks), as on the Genesis:
// "[Giveaways ]" (6) and "[Takeaways ]" (7), each skater's row his name, G, A
// and Pts (the game's own row code, copied, as the time on ice page does) and
// his giveaways (GV) and takeaways (TK) where Sh and PM were, from the counts
// (giveaways). Then the time on ice page, when it is on too, as column 8. The
// time on ice page's five places, with code of their own that shows any mix of
// the three; the block starts with what the places held without the pages (the
// game's code, never the time on ice page's), so the pages come out to the
// game's, or to the time on ice page as its own hack has it. With the pages in,
// the time on ice page is two bytes: the last column (7 or 8) and Takeaways'
// "]". Penalties' title ends in "]". Offered where the time on ice page is.
const GP_TITLES = ['[Giveaways ]', '[Takeaways ]', '[Time On Ice']
const GP_HEADER = '  Player         G  A Pt GV TK'
// The block's note: the row's and title's places as the game has them, the compare's .t1x and .6 (not its code, which
// would be found as the game's), the header's place, then the last column and Penalties' end.
const GP_NOTE = 4 + 4 + 4 + 10 + 2
type PageParts = NonNullable<ReturnType<typeof statPageParts>>

function gpBlock(parts: PageParts, base: number, toi: boolean, note: Uint8Array): { block: Uint8Array; entries: { row: number; title: number; compare: number; header: number }; takeawaysEnd: number } {
  const { ptoi, statcolumn, skater, head, tail, setPal, printx, toStatsPage, d0, statstemp, pushTime, headerBank, headerAddress, a1, header } = parts
  const pushWrap = head.slice(164, 167)
  const d1 = 0xa9
  // The counts' RAM, as the original game's layout has it (the pages are offered only there).
  const env = GT_RAM[0]
  const give = bytesOf(word((env.at + GT_GIVE) & 0xffff), env.bank)
  const take = bytesOf(word((env.at + GT_TAKE) & 0xffff), env.bank)
  const count = (column: number, x: number, array: Uint8Array) =>
    bytesOf('A9', word(column), '22', setPal, 'A9', word(x), '8D', printx, 'DA 8A 0A AA BF', array, '85', d0, 'FA A90200 85', d1, '22', pushWrap, '22', toStatsPage)
  const row = asm65([
    bytesOf('AD', word(statcolumn), 'C90600'),
    { branch: BCS, to: 't' },
    bytesOf('5C', long(skater)),
    { label: 't' },
    bytesOf('C90800'),
    { branch: BNE, to: 'g' },
    { brl: 'i' },
    { label: 'g' },
    head,
    count(6, 0x1a, give),
    count(7, 0x1d, take),
    tail,
    { label: 'i' },
    head,
    bytesOf('A90800 22', setPal, 'A91A00 8D', printx, 'DA 8A 0A AA BF', ptoi, '85', d0, 'FA 22', pushTime, 'A7', a1, 'C90600'),
    { branch: BNE, to: 'p' },
    bytesOf('EE', printx),
    { label: 'p' },
    bytesOf('22', toStatsPage),
    tail,
  ])
  const words = (array: Uint8Array) => bytesOf('8A 0A AA BF', array, '85', d0, '98 0A AA BF', array, 'C5', d0)
  const swap = bytesOf('A90100 8D', statstemp, '18 6B')
  const compare = asm65([
    'C90500',
    { branch: BNE, to: 'n' },
    '38 6B',
    { label: 'n' },
    'C90600',
    { branch: BEQ, to: 'g' },
    'C90700',
    { branch: BEQ, to: 't' },
    'C90800',
    { branch: BEQ, to: 'i' },
    { branch: BRA, to: 'z' },
    { label: 'g' },
    words(give),
    { branch: BEQ, to: 'z' },
    { branch: BCC, to: 'z' },
    swap,
    { label: 't' },
    words(take),
    { branch: BEQ, to: 'z' },
    { branch: BCC, to: 'z' },
    swap,
    { label: 'i' },
    words(ptoi),
    { branch: BEQ, to: 'z' },
    { branch: BCC, to: 'z' },
    swap,
    { label: 'z' },
    bytesOf('9C', statstemp, '18 6B'),
  ])
  // The code's lengths, for where the texts go after it.
  const titleCode = (at: (i: number) => number) =>
    asm65([
      bytesOf('A5', d0, 'C90600'),
      { branch: BCC, to: 'o' },
      { branch: BEQ, to: 'a' },
      'C90700',
      { branch: BEQ, to: 'b' },
      bytesOf('A9', word(loRomAddress(at(2)))),
      { branch: BRA, to: 's' },
      { label: 'a' },
      bytesOf('A9', word(loRomAddress(at(0)))),
      { branch: BRA, to: 's' },
      { label: 'b' },
      bytesOf('A9', word(loRomAddress(at(1)))),
      { label: 's' },
      bytesOf('85', a1, 'A9', loRomBank(base, 0x80), '00 85', a1 + 2, '6B'),
      { label: 'o' },
      bytesOf('5C', parts.original.title.slice(1)),
    ])
  const headerCode = (ours: number, toiHeader: number) =>
    asm65([
      bytesOf('AD', word(statcolumn), 'C90600'),
      { branch: BCS, to: 'm' },
      bytesOf('A9', headerBank, '00 85', a1 + 2, 'A9', word(headerAddress), '85', a1, '6B'),
      { label: 'm' },
      'C90800',
      { branch: BEQ, to: 'i' },
      bytesOf('A9', loRomBank(base, 0x80), '00 85', a1 + 2, 'A9', word(loRomAddress(ours)), '85', a1, '6B'),
      { label: 'i' },
      bytesOf('A9', loRomBank(base, 0x80), '00 85', a1 + 2, 'A9', word(loRomAddress(toiHeader)), '85', a1, '6B'),
    ])
  const text = (s: string) => new TextEncoder().encode(s)
  const prefix = parts.headerPrefix
  const titleLength = titleCode(() => base).length
  const headerLength = headerCode(base, base).length
  const at = { row: GP_NOTE, title: 0, compare: 0, header: 0, texts: 0 }
  at.title = at.row + row.length
  at.compare = at.title + titleLength
  at.header = at.compare + compare.length
  at.texts = at.header + headerLength
  const titleAt = (i: number) => base + at.texts + 14 * i
  const oursAt = titleAt(3)
  const toiHeaderAt = oursAt + prefix.length + GP_HEADER.length
  const titles = bytesOf(...GP_TITLES.map((title, i) => bytesOf(word(14), text(i === 1 && !toi ? '[Takeaways  ' : title))))
  void header
  const block = bytesOf(note, row, titleCode(titleAt), compare, headerCode(oursAt, toiHeaderAt), titles, prefix, text(GP_HEADER), prefix, text(TOI_HEADER))
  return { block, entries: { row: base + at.row, title: base + at.title, compare: base + at.compare, header: base + at.header }, takeawaysEnd: base + at.texts + 14 + 13 }
}

interface PagesIn {
  places: Placed[]
  toiToggle: Placed[]
}

// The pages' places, for a ROM with them in (from their block) or without (as it is now, the time on ice page in or not).
function giveawayPagesWork(rom: Uint8Array): PagesIn | null {
  if (ownIceTime(rom)) return null
  // DrawStatsList_rows' jsl .3, or a hack's jsl in its place.
  const rows = findCodeAll(rom, 'ad(....)f00622(......)800422')
  if (rows.length !== 1) return null
  const rowSite = rows[0].at + 5
  const callTo = (at: number) => loRomOffset(rom[at + 3], readU16(rom, at + 1))
  const target = callTo(rowSite)
  const statcolumn = rows[0].groups[0]
  // The pages' row code: lda statcolumn / cmp #6 / bcs (the time on ice page's has beq).
  const isIn = target >= GP_NOTE && same(rom, target, bytesOf('AD', word(statcolumn), 'C90600 B0'))
  const base = isIn ? target - GP_NOTE : -1
  // The ROM without the pages: the game's places put back from the note (the block left, so the time on ice page's code is not put over it).
  let plain = rom
  let toi = false
  // The time on ice page's places as it is in now (without the pages), or as it would go in (with them).
  let toiNow: Placed[] | null = null
  if (isIn) {
    const note = rom.slice(base, base + GP_NOTE)
    plain = rom.slice()
    plain.set(note.slice(0, 4), rowSite)
    // The other three places by the code around them (as statPageParts finds them, its own hooks in their place here).
    const column = hexOf(Uint8Array.from(word(statcolumn)))
    const titles = findCodeAll(rom, "a9..0085..a9....85..22......22......ae")
    const compares = findCodeAll(rom, "22......b0..4c....eaea")
    const headers = findCodeAll(rom, "ad" + column + "f0..a5..48a5..48" + "22......eaeaeaeaeaea22......6885")
    if (titles.length !== 1 || compares.length !== 1 || headers.length !== 1) return null
    plain.set(note.slice(4, 8), titles[0].at + 10)
    plain.set(bytesOf('C9 0500 D003 4C', note.slice(8, 10), '4C', note.slice(10, 12)), compares[0].at)
    plain.set(note.slice(12, 22), headers[0].at + 11)
    const scratchParts = statPageParts(plain)
    if (!scratchParts) return null
    toi = rom[scratchParts.rightSite] === 8
    plain[scratchParts.rightSite] = note[22]
    plain[scratchParts.penaltiesEnd] = note[23]
  } else {
    toiNow = timeOnIceShownPlaces(rom)
    toi = !!toiNow && toiNow.every((place) => holds(rom, place, 'hacked'))
    if (toi) {
      plain = rom.slice()
      for (const place of toiNow!) if (place.original) plain.set(place.original, place.at)
    }
  }
  const parts = statPageParts(plain)
  if (!parts) return null
  // Without the pages: the game's, or the time on ice page as its own hack puts it in (its code kept clear of the block).
  let before = plain
  let toiCode: Placed[] = []
  if (toi) {
    const toiPlaces = isIn ? timeOnIceShownPlaces(plain) : toiNow
    if (!toiPlaces) return null
    before = isIn ? plain.slice() : rom
    if (isIn) for (const place of toiPlaces) before.set(place.hacked, place.at)
    const sites = new Set([parts.rowSite, parts.titleSite, parts.cmpSite, parts.headerSite, parts.rightSite, parts.penaltiesEnd])
    toiCode = toiPlaces.filter((place) => !sites.has(place.at)).map((place) => ({ at: place.at, original: place.hacked, hacked: unused(place.hacked.length) }))
  }
  const note = bytesOf(parts.original.row, parts.original.title, word(parts.t1x), word(parts.six), parts.original.header, plain[parts.rightSite], plain[parts.penaltiesEnd])
  const length = gpBlock(parts, 0, toi, note).block.length
  let room = base
  if (!isIn) {
    for (const bank of [0x9b, 0x80, loRomBank(parts.rowSite, 0x80)]) {
      if (room >= 0) break
      const start = (bank & 0x7f) << 15
      if (start < rom.length) room = roomInBank(rom, start, length)
    }
    if (room < 0) return null
  }
  const { block, entries, takeawaysEnd } = gpBlock(parts, room, toi, note)
  const call = (to: number, pad: number) => bytesOf('22', long(to), new Array(pad).fill(0xea))
  const at = (site: number, hacked: Uint8Array): Placed => ({ at: site, original: before.slice(site, site + hacked.length), hacked })
  const places: Placed[] = [
    at(parts.rowSite, call(entries.row, 0)),
    at(parts.titleSite, call(entries.title, 0)),
    at(parts.cmpSite, bytesOf(call(entries.compare, 0), 'B0', parts.bcs, '4C', word(parts.eight), 'EAEA')),
    at(parts.headerSite, call(entries.header, 6)),
    at(parts.rightSite, Uint8Array.of(toi ? 8 : 7)),
    at(parts.penaltiesEnd, new TextEncoder().encode(']')),
    ...toiCode,
    { at: room, original: unused(block.length), hacked: block },
  ]
  const toiToggle: Placed[] = [
    { at: parts.rightSite, original: Uint8Array.of(7), hacked: Uint8Array.of(8) },
    { at: takeawaysEnd, original: new TextEncoder().encode(' '), hacked: new TextEncoder().encode(']') },
  ]
  return isIn ? { places, toiToggle } : { places, toiToggle: [] }
}

// The pages, if they are in.
function giveawayPagesIn(rom: Uint8Array): PagesIn | null {
  const rows = findCodeAll(rom, 'ad(....)f00622(......)800422')
  if (rows.length !== 1) return null
  const site = rows[0].at + 5
  const target = loRomOffset(rom[site + 3], readU16(rom, site + 1))
  if (target < GP_NOTE || !same(rom, target, bytesOf('AD', word(rows[0].groups[0]), 'C90600 B0'))) return null
  return giveawayPagesWork(rom)
}

function giveawayPagesPlaces(rom: Uint8Array): Placed[] | null {
  // McMarkis's builds, with Player Stats pages of their own.
  if (only(rom, CLEAR_PLAYER_CHECKS) >= 0) return withGoalieColumn(rom, mcPagesPlaces(rom))
  return withGoalieColumn(rom, giveawayPagesWork(rom)?.places ?? null)
}

// In McMarkis's 2 MB and SA-1 builds, whose Player Stats has pages of its own after Penalties (Checks For and
// Checks Agst, and in the SA-1 builds Time On Ice; NHL94SNES-SA1, used with his permission): Giveaways and
// Takeaways after his last page, his code left as it is and called for his pages. His builds go to his own code
// for columns 6 and up at four places, each chained here: DrawStatsList_rows' jsl .3 (his .3 starts lda statcolumn
// / cmp #6 / bcc / jml his rows, then the game's row), SortPlayerStats' jsl AdvanceStringPtr (his titles are the
// game's list made longer), ComparePlayerStats' cmp #6 / bcc / jsl his compare (Z clear to swap) / beq / jmp .7 /
// jmp .6, and DrawStatsList's jsl his header (a1 set to the column's header). PlayerStatsScreen_right's last column
// is two more, and his last title ends in "]" (shortened to fit: Checks Agst as his SA-1 builds have it, Checks
// Agt; Time On Ice as Ice Time). The block's note: the four places as they were, his last column and his last title.
const MC_NOTE = 4 * 4 + 1 + 12
const MC_LAST_TITLES: Record<string, string> = { '[Checks Agst': '[Checks Agt]', '[Checks Agt]': '[Checks Agt]', '[Time On Ice': '[ Ice Time ]' }

interface McPageEnv {
  statcolumn: number
  last: number
  rightSite: number
  rowSite: number
  titleSite: number
  cmpSite: number
  headerSite: number
  a1: number
}

function mcPageEnv(rom: Uint8Array): McPageEnv | null {
  const rows = findCodeAll(rom, 'ad(....)f00622(......)800422')
  if (rows.length !== 1) return null
  const statcolumn = rows[0].groups[0]
  const column = hexOf(Uint8Array.from(word(statcolumn)))
  const rights = findCodeAll(rom, 'ad' + column + 'c9(..)0030034c')
  const titles = findCodeAll(rom, 'a9(..)0085(..)a9(....)85(..)22......22......ae')
  const compares = findCodeAll(rom, 'c90600900922......f0034c....4c....')
  const headers = findCodeAll(rom, 'ad' + column + 'f0..a5..48a5..48' + '22......22......6885')
  if (rights.length !== 1 || titles.length !== 1 || compares.length !== 1 || headers.length !== 1) return null
  const [titleBank, a1hi, titleList, a1lo] = titles[0].groups
  if (a1hi !== a1lo + 2) return null
  if (loRomOffset(titleBank, titleList) < 0) return null
  return {
    statcolumn,
    last: rights[0].groups[0],
    rightSite: rights[0].at + 4,
    rowSite: rows[0].at + 5,
    titleSite: titles[0].at + 10,
    cmpSite: compares[0].at + 5,
    headerSite: headers[0].at + 11,
    a1: a1lo,
  }
}

function mcPagesPlaces(rom: Uint8Array): Placed[] | null {
  const env = mcPageEnv(rom)
  const moved = shift(rom)
  const ram = GT_RAM.find((layout) => layout.shift === moved)
  if (!env || !ram) return null
  const callTo = (at: number) => loRomOffset(rom[at + 3], readU16(rom, at + 1))
  if ([env.rowSite, env.titleSite, env.cmpSite, env.headerSite].some((site) => rom[site] !== 0x22)) return null
  // In: the block from the row's call, and what the places held from its note.
  const rowTarget = callTo(env.rowSite)
  const ours = rowTarget >= MC_NOTE && same(rom, rowTarget, bytesOf('AD', word(env.statcolumn), 'C9')) && rom[rowTarget + 6] === 0xb0
  const base = ours ? rowTarget - MC_NOTE : -1
  const note = ours
    ? rom.slice(base, base + MC_NOTE)
    : null
  const last = note ? note[16] : rom[env.rightSite]
  if (last < 6 || last > 12) return null
  const first = last + 1
  // His last title (a length word of 14, then 12 letters).
  const titles = findCodeAll(rom, 'a9(..)0085..a9(....)85..22......22......ae')[0]
  const lastTitle = loRomOffset(titles.groups[0], titles.groups[1]) + 14 * last
  if (readU16(rom, lastTitle) !== 14) return null
  const ownTitle = note ? note.slice(17, 29) : rom.slice(lastTitle + 2, lastTitle + 14)
  const shortened = MC_LAST_TITLES[new TextDecoder().decode(ownTitle)]
  if (!shortened) return null
  const before = note ?? bytesOf(rom.slice(env.rowSite, env.rowSite + 4), rom.slice(env.titleSite, env.titleSite + 4), rom.slice(env.cmpSite, env.cmpSite + 4), rom.slice(env.headerSite, env.headerSite + 4), last, ownTitle)
  // The game's row, after his check (lda statcolumn / cmp #6 / bcc / jml, 12 bytes).
  const skater = loRomOffset(before[3], readU16(before, 1))
  if (skater < 0 || !same(rom, skater, bytesOf('AD', word(env.statcolumn), 'C90600 9004 5C'))) return null
  const game = skater + 12
  if (!same(rom, game, hexBytes('5AA5A948A9FFFF22'))) return null
  const head = rom.slice(game, game + 171)
  const tail = rom.slice(game + 247, game + 259)
  if (head[163] !== 0x22 || head[167] !== 0x22 || tail[0] !== 0xa9 || tail[11] !== 0x6b) return null
  const setPal = head.slice(8, 11), printx = head.slice(15, 17), toStatsPage = head.slice(24, 27), d0 = head[18], pushWrap = head.slice(164, 167)
  const d1 = 0xa9
  const a1 = env.a1
  const give = bytesOf(word((ram.at + GT_GIVE) & 0xffff), ram.bank)
  const take = bytesOf(word((ram.at + GT_TAKE) & 0xffff), ram.bank)
  const count = (column: number, x: number, array: Uint8Array) =>
    bytesOf('A9', word(column), '22', setPal, 'A9', word(x), '8D', printx, 'DA 8A 0A AA BF', array, '85', d0, 'FA A90200 85', d1, '22', pushWrap, '22', toStatsPage)
  const row = asm65([
    bytesOf('AD', word(env.statcolumn), 'C9', word(first)),
    { branch: BCS, to: 'g' },
    bytesOf('5C', before.slice(1, 4)),
    { label: 'g' },
    head,
    count(first, 0x1a, give),
    count(first + 1, 0x1d, take),
    tail,
  ])
  const words = (array: Uint8Array) => bytesOf('8A 0A AA BF', array, '85', d0, '98 0A AA BF', array, 'C5', d0)
  // Z clear to swap, as his compare: the later player's count more than the earlier's.
  const compare = asm65([
    bytesOf('C9', word(first)),
    { branch: BCS, to: 'm' },
    bytesOf('5C', before.slice(9, 12)),
    { label: 'm' },
    { branch: BNE, to: 't' },
    words(give),
    { branch: BRA, to: 'r' },
    { label: 't' },
    words(take),
    { label: 'r' },
    { branch: BEQ, to: 'z' },
    { branch: BCC, to: 'z' },
    bytesOf('A90100 6B'),
    { label: 'z' },
    bytesOf('A90000 6B'),
  ])
  const text = (s: string) => new TextEncoder().encode(s)
  const headerPrefix = hexBytes('23009F0109')
  const at = { row: MC_NOTE, title: 0, compare: 0, header: 0, texts: 0 }
  const titleCode = (giveAt: number, takeAt: number, bank: number) =>
    asm65([
      bytesOf('A5', d0, 'C9', word(first)),
      { branch: BCC, to: 'o' },
      { branch: BEQ, to: 'a' },
      bytesOf('A9', word(loRomAddress(takeAt))),
      { branch: BRA, to: 's' },
      { label: 'a' },
      bytesOf('A9', word(loRomAddress(giveAt))),
      { label: 's' },
      bytesOf('85', a1, 'A9', bank, '00 85', a1 + 2, '6B'),
      { label: 'o' },
      bytesOf('5C', before.slice(5, 8)),
    ])
  const headerCode = (oursAt: number, bank: number) =>
    asm65([
      bytesOf('22', before.slice(13, 16), 'AD', word(env.statcolumn), 'C9', word(first)),
      { branch: BCC, to: 'r' },
      bytesOf('A9', bank, '00 85', a1 + 2, 'A9', word(loRomAddress(oursAt)), '85', a1),
      { label: 'r' },
      '6B',
    ])
  const build = (room: number) => {
    const bank = loRomBank(room, 0x80)
    at.title = at.row + row.length
    at.compare = at.title + titleCode(room, room, bank).length
    at.header = at.compare + compare.length
    at.texts = at.header + headerCode(room, bank).length
    const giveAt = room + at.texts
    const takeAt = giveAt + 14
    const headerAt = takeAt + 14
    return bytesOf(
      before,
      row, titleCode(giveAt, takeAt, bank), compare, headerCode(headerAt, bank),
      word(14), text('[Giveaways ]'), word(14), text('[Takeaways  '), headerPrefix, text(GP_HEADER),
    )
  }
  let room = base
  const length = build(0).length
  if (!ours) {
    for (const bank of [0x9b, 0x80, 0xa0, loRomBank(env.rowSite, 0x80)]) {
      const start = (bank & 0x7f) << 15
      if (start < rom.length) room = roomInBank(rom, start, length)
      if (room >= 0) break
    }
    if (room < 0) return null
  }
  const block = build(room)
  const call = (to: number) => bytesOf('22', long(to))
  return [
    { at: env.rowSite, original: before.slice(0, 4), hacked: call(room + at.row) },
    { at: env.titleSite, original: before.slice(4, 8), hacked: call(room + at.title) },
    { at: env.cmpSite, original: before.slice(8, 12), hacked: call(room + at.compare) },
    { at: env.headerSite, original: before.slice(12, 16), hacked: call(room + at.header) },
    { at: env.rightSite, original: Uint8Array.of(last), hacked: Uint8Array.of(last + 2) },
    { at: lastTitle + 2, original: ownTitle, hacked: text(shortened) },
    { at: room, original: unused(block.length), hacked: block },
  ]
}

// The Goalies page with each goalie's giveaways (GV), as the Genesis shows them, since the SNES lists goalies on no
// other page. Its row is full, so goals against and shots against take two digits (a game's never reach 100) and the
// save percentage moves left: GA at 18, Sh at 21, Ptg at 24 and its "%" at 27, GV at 29, under "GA Sh Ptg  GV".
// DrawStatsList_rows' jsl .4 calls a copy of .4 with those places and the GV after; DrawStatsList's lda #bank / lda
// #GoalieGaShPtgTxt point at the new header. The block starts with .4's address and the header's bank and address.
const GOALIE_HEADER = '  Goalie         GA Sh Ptg  GV'
const GOALIE_NOTE = 6

function goaliePlaces(rom: Uint8Array): Placed[] | null {
  const moved = shift(rom)
  const ram = GT_RAM.find((layout) => layout.shift === moved)
  const rows = findCodeAll(rom, 'ad(....)f00622(......)800422')
  if (!ram || rows.length !== 1) return null
  const site = rows[0].at + 11
  if (rom[site] !== 0x22) return null
  const target = loRomOffset(rom[site + 3], readU16(rom, site + 1))
  const isGoalieRow = (at: number) => at >= 0 && same(rom, at, hexBytes('5AA5A948A9FFFF22'))
  // In: the note before the copy says where the game's .4 is.
  const noted = target >= GOALIE_NOTE ? loRomOffset(rom[target - GOALIE_NOTE + 2], readU16(rom, target - GOALIE_NOTE)) : -1
  const isIn = noted !== target && isGoalieRow(noted) && isGoalieRow(target)
  const four = isIn ? noted : target
  if (!isGoalieRow(four)) return null
  // DrawStatsList .t1: lda #bank / sta a1+2 / lda #GoalieGaShPtgTxt / sta a1 / jsl print / pla, its text "  Goalie".
  const headers = findCodeAll(rom, 'a9(..)0085..a9(....)85..22......6885..6885..ad').filter((found) => {
    // The game's header or this one, which starts the same.
    const text = loRomOffset(found.groups[0], found.groups[1])
    return text >= 0 && new TextDecoder().decode(rom.slice(text + 5, text + 13)) === '  Goalie'
  })
  if (headers.length !== 1) return null
  const headerSite = headers[0].at
  const [headerBank, headerAddress] = isIn ? [rom[target - GOALIE_NOTE + 3], readU16(rom, target - GOALIE_NOTE + 4)] : headers[0].groups
  const headerText = loRomOffset(headerBank, headerAddress)
  // The game's .4, to its pla / sta d1 / ply / rtl.
  let end = four
  while (end < four + 300 && !same(rom, end, hexBytes('6885A97A6B'))) end++
  if (end >= four + 300) return null
  const code = Array.from(rom.slice(four, end))
  // Each of .4's places: lda #x / sta printx, and the width after it (lda #3 / sta d1) where it is two.
  let from = 0
  const place = (x: number, to: number, width?: number) => {
    const at = code.findIndex((b, i) => i >= from && b === 0xa9 && code[i + 1] === x && code[i + 2] === 0 && code[i + 3] === 0x8d)
    if (at < 0) return false
    code[at + 1] = to
    from = at + 4
    if (width === undefined) return true
    const w = code.findIndex((b, i) => i >= from && b === 0xa9 && code[i + 1] === 3 && code[i + 2] === 0 && code[i + 3] === 0x85 && code[i + 4] === 0xa9)
    if (w < 0) return false
    code[w + 1] = width
    from = w + 5
    return true
  }
  if (!place(0x12, 0x12, 2) || !place(0x16, 0x15, 2) || !place(0x1b, 0x18) || !place(0x1e, 0x1b)) return null
  // The save percentage's cmp #0 / beq / jsl Div16U: Div16U changes X, which GV reads (the player's stats index), so
  // it is kept around the call (phx / plx, the beq two further). Match Viewer found the first goalie showing another
  // word: only a goalie with shots against reaches the division. NOSE4Web's first version (14 November 2026) had not.
  const divide = code.findIndex((b, i) => b === 0xc9 && code[i + 1] === 0 && code[i + 2] === 0 && code[i + 3] === 0xf0 && code[i + 4] === 0x0a && code[i + 5] === 0x22)
  if (divide < 0) return null
  code.splice(divide + 3, 6, 0xf0, 0x0c, 0xda, ...code.slice(divide + 5, divide + 9), 0xfa)
  const printxAt = code.findIndex((b, i) => b === 0xa9 && code[i + 1] === 0x12 && code[i + 3] === 0x8d)
  const printx = code.slice(printxAt + 4, printxAt + 6)
  // PushNumberWrap and PrintToStatsPage, as .4 calls them after its first number.
  const push = code.findIndex((b, i) => i > printxAt && b === 0x22)
  if (printxAt < 0 || push < 0 || code[push + 4] !== 0x22) return null
  const pushWrap = code.slice(push + 1, push + 4)
  const print = code.slice(push + 5, push + 8)
  const give = bytesOf(word((ram.at + GT_GIVE) & 0xffff), ram.bank)
  const gv = bytesOf('A9 1D00 8D', printx, 'DA 8A 0A AA BF', give, '85A5 FA A90200 85A9 22', pushWrap, '22', print)
  const header = bytesOf(rom.slice(headerText, headerText + 5), new TextEncoder().encode(GOALIE_HEADER))
  const body = bytesOf(code, gv, '6885A97A6B')
  const length = GOALIE_NOTE + body.length + header.length
  let base = isIn ? target - GOALIE_NOTE : -1
  if (!isIn) {
    for (const bank of [0x9b, 0x80, 0xa0, loRomBank(site, 0x80)]) {
      const start = (bank & 0x7f) << 15
      if (start < rom.length) base = roomInBank(rom, start, length)
      if (base >= 0) break
    }
    if (base < 0) return null
  }
  const headerAt = base + GOALIE_NOTE + body.length
  const block = bytesOf(word(loRomAddress(four)), loRomBank(four, 0x80), headerBank, word(headerAddress), body, header)
  return [
    { at: site, original: bytesOf('22', long(four)), hacked: bytesOf('22', long(base + GOALIE_NOTE)) },
    { at: headerSite + 1, original: Uint8Array.of(headerBank), hacked: Uint8Array.of(loRomBank(headerAt, 0x80)) },
    { at: headerSite + 6, original: Uint8Array.from(word(headerAddress)), hacked: Uint8Array.from(word(loRomAddress(headerAt))) },
    { at: base, original: unused(block.length), hacked: block },
  ]
}

// The pages' places and the goalies' column, the column's room looked for with the pages in, but not in room the pages
// free (the time on ice page's code), which holds that code until they go in.
function withGoalieColumn(rom: Uint8Array, places: Placed[] | null): Placed[] | null {
  if (!places) return null
  const work = rom.slice()
  for (const place of places) if (!place.hacked.every((b) => b === 0xff)) work.set(place.hacked, place.at)
  const goalies = goaliePlaces(work)
  return goalies && [...places, ...goalies]
}

// ------------------------------------------------------------ NHL shootout
// As on the Genesis (hacks.ts, nhlShootout): three rounds, then sudden death,
// over as soon as one team cannot catch up. The SNES's visitors shoot first.
// PlayShootout's loop: stz shootoutdecider becomes inc (so ShootoutWonBy, where
// every attempt ends, judges each one); the decider set after the visitors'
// turn (lda round / cmp #5 / bmi / lda #1 / sta decider) becomes jsl to the
// rule / bcs to the loop's end / nops; the round's end (lda round / cmp #6 /
// bmi .loop / lda tmscore / cmp tmscore+2 / beq .loop, after inc round) becomes
// jsl / bcs to the end / bra .loop / nops. ShootoutWonBy's "scores differ"
// (lda tmscore / sec / sbc tmscore+2) becomes jsl / nops, so "<team> Wins!"
// shows after the shot that settles it. The rule, after the visitors' shot in
// round r (3 or less): over when they lead by more than the home team's shots
// left (4 - r) or trail by more than their own (3 - r); after the home team's,
// when either leads by more than 3 - r (any lead past round 3). One piece of
// code: +0 ShootoutWonBy's entry (BA_Team says who shot), +10 the visitors',
// +12 the round's end (round - 1, as it is already counted on).
function nhlShootoutPlaces(rom: Uint8Array): Placed[] | null {
  // The loop: stz decider / visitors' turn / decider after round 5 / home turn / inc round / round end; or the hack's.
  const plain = findCodeAll(rom, '9c(....)a90200(..)(..)64(..)22......ad(....)c905003006a901008d....64..a9020085..22......22......ee(....)ad....c9060030caad(....)cd(....)f0c29c')
  const hooked = findCodeAll(rom, 'ee(....)a90200(..)(..)64(..)22......22(......)b02aeaeaeaeaeaeaeaea64..a9020085..22......22......ee(....)22......b00a80caeaeaeaeaeaeaeaea9c')
  if (plain.length + hooked.length !== 1) return null
  const isIn = hooked.length === 1
  const at = (plain[0] ?? hooked[0]).at
  const decider = (plain[0] ?? hooked[0]).groups[0]
  const round = isIn ? hooked[0].groups[5] : plain[0].groups[4]
  // The visitors' turn's jsl calls 10 bytes into the code.
  const codeAt = isIn ? loRomOffset(rom[at + 17], readU16(rom, at + 15)) - 10 : -1
  const score = isIn ? readU16(rom, codeAt + 29) : plain[0].groups[6]
  if (!isIn && plain[0].groups[7] !== score + 2) return null
  // ShootoutWonBy: lda decider / bne / jmp .3 / lda tmscore / sec / sbc tmscore+2 / bne / jmp; or the hack's jsl / nops.
  const deciderHex = hexOf(Uint8Array.from(word(decider)))
  const wonPlain = findCodeAll(rom, 'ad' + deciderHex + 'd0034c....ad' + hexOf(Uint8Array.from(word(score))) + '38ed....d0034c')
  const wonHooked = findCodeAll(rom, 'ad' + deciderHex + 'd0034c....22......eaeaead0034c')
  if (wonPlain.length + wonHooked.length !== 1) return null
  const wonSite = (wonPlain[0] ?? wonHooked[0]).at + 8
  // BA_Team: the turn's lda a2 / beq / lda #2 / sta BA_Team.
  const teams = findCodeAll(rom, '9c(....)a5..f006a902008d(....)22')
  const team = teams.find(({ groups }) => groups[0] === groups[1])?.groups[0]
  if (team === undefined) return null
  const r = word(round), s = word(score), s2 = word(score + 2)
  const code = asm65([
    // +0 ShootoutWonBy: the visitors (BA_Team 2) or the home team, this round.
    bytesOf('AD', word(team)), { branch: BNE, to: 'away' }, bytesOf('AD', r), { branch: BRA, to: 'full' },
    // +10 the visitors' turn; +12 the round's end, the round already counted on.
    { branch: BRA, to: 'away' }, bytesOf('AD', r, '3A'), { branch: BRA, to: 'full' },
    { label: 'away' },
    bytesOf('A90300 38 ED', r), { branch: BMI, to: 'no2' },
    bytesOf('48 AD', s, '38 ED', s2, '48 38 E303'), { branch: BEQ, to: 'a2' }, { branch: BPL, to: 'yes' },
    { label: 'a2' }, bytesOf('A90000 38 E301 38 E303 3A'), { branch: BEQ, to: 'no' }, { branch: BMI, to: 'no' }, { branch: BRA, to: 'yes' },
    { label: 'full' },
    bytesOf('49FFFF 1A 18 690300'), { branch: BPL, to: 'ok' }, bytesOf('A90000'),
    { label: 'ok' },
    bytesOf('48 AD', s, '38 ED', s2, '48 38 E303'), { branch: BEQ, to: 'f2' }, { branch: BPL, to: 'yes' },
    { label: 'f2' }, bytesOf('A90000 38 E301 38 E303'), { branch: BEQ, to: 'no' }, { branch: BMI, to: 'no' },
    { label: 'yes' }, bytesOf('68 68 A90100 38 6B'),
    { label: 'no' }, bytesOf('68 68'),
    { label: 'no2' }, bytesOf('A90000 18 6B'),
  ])
  const original = {
    start: bytesOf('9C', word(decider)),
    away: bytesOf('AD', r, 'C90500 3006 A90100 8D', word(decider)),
    end: bytesOf('AD', r, 'C90600 30CA AD', s, 'CD', s2, 'F0C2'),
    won: bytesOf('AD', s, '38 ED', s2),
  }
  const room = isIn ? codeAt : (() => {
    for (const bank of [0x9b, 0x80, loRomBank(at, 0x80)]) {
      const start = (bank & 0x7f) << 15
      const found = start < rom.length ? roomInBank(rom, start, code.length) : -1
      if (found >= 0) return found
    }
    return -1
  })()
  if (room < 0) return null
  const call = (offset: number) => bytesOf('22', long(room + offset))
  return [
    { at, original: original.start, hacked: bytesOf('EE', word(decider)) },
    { at: at + 14, original: original.away, hacked: bytesOf(call(10), 'B02A EAEAEAEAEAEAEAEA') },
    { at: at + 46, original: original.end, hacked: bytesOf(call(12), 'B00A 80CA EAEAEAEAEAEAEAEA') },
    { at: wonSite, original: original.won, hacked: bytesOf(call(0), 'EAEAEA') },
    { at: room, original: unused(code.length), hacked: code },
  ]
}

// ---------------------------------------------------------------- choppy ice
// As on the Genesis (hacks.ts, choppyIce): the puck slows a little more as the
// period goes on, up to a quarter more by its end, fresh again each period.
// updateplayers' .1xx multiplies Xvel and Yvel by the friction factor in d2
// (out of 256; the gliding puck's is $FF at the usual timestep). Its ldx Xvel,y /
// lda d2 becomes jsl / nop to code that, for the puck (Y = $1C), takes one off d2
// on L of every 16 updates (L the quarters of the period gone, 0 to 4, from
// PerTimeTotal and gameclock), chosen by bits 8-11 of the puck's X fraction (its
// low bits step by 16, so they never change: Match Viewer found the first
// version, which used them, doubled the friction from the first quarter),
// then does the ldx / lda. So by the period's end one update in four has $FE,
// a quarter more friction on average (Match Viewer's reading of the code).
function choppyIcePlaces(rom: Uint8Array): Placed[] | null {
  // .1xx: ldx Xvel,y / lda d2 / jsl Mul16x8HiXS / sta Xvel,y / the same for Y / tyx / .10 ... clc / adc Xfrac,x;
  // or the hack's jsl / nop in place of the first ldx / lda.
  const tail = '22......99....be....a5..22......99....bbad....85..bd....f0..aaa5..22......a6..a5..187d(....)'
  const plain = findCodeAll(rom, 'be(....)a5(..)' + tail)
  const hooked = findCodeAll(rom, '22(......)ea' + tail)
  if (plain.length + hooked.length !== 1) return null
  const site = (plain[0] ?? hooked[0]).at
  const codeAt = plain.length ? -1 : loRomOffset(rom[site + 3], readU16(rom, site + 1))
  // The hack's code ends ldx Xvel,y / lda d2 / rtl, 6 bytes from its end, which says what they were.
  const xvel = plain.length ? plain[0].groups[0] : readU16(rom, codeAt + CHOPPY_LENGTH - 5)
  const d2 = plain.length ? plain[0].groups[1] : rom[codeAt + CHOPPY_LENGTH - 2]
  const xfrac = (plain[0] ?? hooked[0]).groups[plain.length ? 2 : 1]
  // GetPeriodTimeRemaining: lda gsp / xba / and #$FF00 / asl x6 / ora PerTimeTotal / sec / sbc gameclock.
  const clocks = findCodeAll(rom, 'ad....eb2900ff0a0a0a0a0a0a0d(....)38ed(....)')
  if (clocks.length !== 1) return null
  const [total, clock] = clocks[0].groups
  const code = asm65([
    bytesOf('C01C00'), { branch: BNE, to: 'plain' },
    bytesOf('AD', word(total)), { branch: BEQ, to: 'plain' },
    bytesOf('38 AD', word(total), 'ED', word(clock)), { branch: BMI, to: 'plain' }, { branch: BEQ, to: 'plain' },
    bytesOf('0A 0A A20000'),
    { label: 'loop' },
    bytesOf('CD', word(total)), { branch: BCC, to: 'done' },
    bytesOf('ED', word(total), 'E8 E00400'), { branch: BCC, to: 'loop' },
    { label: 'done' },
    // Bits 8-11 of the X fraction: its low bits only ever step by 16 (velstep is the frame time x 16), so they stay put.
    bytesOf('8A 48 B9', word(xfrac + 1), '290F00 C301 68'), { branch: BCS, to: 'plain' },
    bytesOf('A5', d2, '3A 85', d2),
    { label: 'plain' },
    bytesOf('BE', word(xvel), 'A5', d2, '6B'),
  ])
  if (code.length !== CHOPPY_LENGTH) return null
  return withFarCode(rom, site, bytesOf('BE', word(xvel), 'A5', d2), 1, code)
}
const CHOPPY_LENGTH = 64

// ------------------------------------------------------------ skating and the puck
// Stopping and turning, as on the Genesis (hacks.ts, turnRate): stopna, the slowing of a skater who stops or reverses
// (from dostop, noturn0 and goalieacc), takes ($70 + legstr) x timestep off each axis of his speed: lda #$0070 / clc /
// adc legstr,x / ldx timestep / jsl Mul8U / sta r2 / plx. The $70 becomes the number wanted (the Genesis takes a flat
// 150 a frame). Mul8U multiplies 8 bits, so the number plus a goalie's doubled leg strength (up to 30) stays under 256.
export const SNES_TURN_RATE_ORIGINAL = 0x70
const STOP_SITE = 'a9....187d....ae....22......85..fa'
function turnRatePlaces(rom: Uint8Array, amount?: number): Placed[] | null {
  const found = only(rom, STOP_SITE)
  if (found < 0) return null
  const now = readU16(rom, found + 1)
  const [least, most] = SNES_AMOUNT_RANGES.turnRate
  if (now !== SNES_TURN_RATE_ORIGINAL && (now < least || now > most)) return null
  // Turned on without a number (as when every hack is chosen): the Genesis's 150, unless the ROM has its own already.
  const value = amount !== undefined && amount !== SNES_AMOUNT_OFF.turnRate ? amount : now !== SNES_TURN_RATE_ORIGINAL ? now : 150
  return [{ at: found + 1, original: bytesOf(word(SNES_TURN_RATE_ORIGINAL)), hacked: bytesOf(word(value)), amount: value }]
}

// Speed burst, as on the Genesis (hacks.ts, speedBurst): burst (A without the puck) works its push out from the
// player's energy after the burst's cost (or $1000 with Auto line changes): lda d0 / ldx #$0233 / jsl Mul16U / ldx a3 /
// lda r2+2 / sta burstspeed, 35 at full energy, then adds push x the facing's dirtab (200) to his speed. The jsl
// Mul16U becomes jsl to code that puts the number wanted in r2+2 instead; the code ends with a jml to Mul16U, never
// run, which keeps its address for taking the hack out.
const BURST_SITE = '22......af......f0..a5..38e9....85..22......af......c90200d005a9001085..a5..a23302'
const BURST_CODE_LENGTH = 10
function speedBurstPlaces(rom: Uint8Array, amount?: number): Placed[] | null {
  const found = findCodeAll(rom, BURST_SITE + '22......a6..a5(..)85..')
  if (found.length !== 1) return null
  const site = found[0].at + BURST_SITE.length / 2
  const r2high = found[0].groups[0]
  const target = loRomOffset(rom[site + 3], readU16(rom, site + 1))
  const isIn = target >= 0 && target + BURST_CODE_LENGTH <= rom.length && rom[target] === 0xa9 && rom[target + 2] === 0 && same(rom, target + 3, bytesOf('85', r2high, '6B 5C'))
  const mul = isIn ? rom.slice(target + 7, target + 10) : rom.slice(site + 1, site + 4)
  // Taken out (0) or turned on without a number: the ROM's, else 24.
  const value = amount || (isIn ? rom[target + 1] : 24)
  const [least, most] = SNES_AMOUNT_RANGES.speedBurst
  if (value < Math.max(least, 1) || value > most) return null
  const code = bytesOf('A9', word(value), '85', r2high, '6B 5C', mul)
  const placed = withFarCode(rom, site, bytesOf('22', mul), 0, code)
  if (!placed) return null
  placed[1].amount = value
  return placed
}

// Puck friction, as on the Genesis (hacks.ts, puckFriction), on the same scale: a sliding puck (and any gliding
// object: a skater receiving a pass) loses 1/2^n of its speed a frame, n = 9 in the original game. updateplayers
// slows each object by multiplying its speed by a byte out of 256 for the frame step (timestep, 1-10 frames; usually
// 2), from table .22 for a gliding one ($FF, $FF, $FE, ...: 1/256 a 2-frame step, so 1/512 a frame, the Genesis's
// 9): lda.l .22-1,x / and #$FF / sta d2, then .1xx multiplies Xvel and Yvel by d2. The lda.l becomes jsl to code
// with its own table: for n under 9, 256 x (1 - 1/2^n)^timestep; for 10 to 12, the original table on only one
// update in 2, 4 or 8 (by gameloop's count of frames, gameframes), the others skipping .1xx's slowing altogether
// (the jsl's return dropped, tyx, jml .10), as the table cannot hold less than 1/256. Choppy ice, which hooks .1xx,
// adds to it as before. The code keeps the lda.l's address and n after its table.
const FRICTION_HEAD = '29ff0085..'
const FRICTION_TAIL = '22......99....be....a5..22......99....bb'
const FRICTION_TABLE_AT = 27
const FRICTION_CODE_LENGTH = FRICTION_TABLE_AT + 14
function puckFrictionTable(n: number, original: Uint8Array): number[] {
  if (n >= 9) return [...original]
  return Array.from({ length: 10 }, (_, i) => Math.min(255, Math.max(1, Math.round(256 * (1 - 2 ** -n) ** (i + 1)))))
}
function puckFrictionPlaces(rom: Uint8Array, amount?: number): Placed[] | null {
  const found = ['bf', '22'].flatMap((head) => ['be....a5..', '22......ea'].flatMap((mid) => findCodeAll(rom, `${head}......${FRICTION_HEAD}${mid}${FRICTION_TAIL}`)))
  // gameloop: lda Vcount / sec / sbc OldVcount / beq / inc gameframes / lda #60 / ldx gameframes.
  const frames = findCodeAll(rom, 'a5..38ed....f0..ee(....)a93c00ae(....)22')
  if (found.length !== 1 || frames.length !== 1 || frames[0].groups[0] !== frames[0].groups[1]) return null
  const site = found[0].at
  const dot10 = site + 9 + 25
  const target = loRomOffset(rom[site + 3], readU16(rom, site + 1))
  const isIn = rom[site] === 0x22
  if (isIn && (target < 0 || target + FRICTION_CODE_LENGTH > rom.length || rom[target] !== 0xbf || rom[target + 4] !== 0x48)) return null
  const lda = isIn ? rom.slice(target + FRICTION_TABLE_AT + 10, target + FRICTION_TABLE_AT + 13) : rom.slice(site + 1, site + 4)
  const tableAt = loRomOffset(lda[2], readU16(lda, 0)) + 1
  if (tableAt < 1 || tableAt + 10 > rom.length) return null
  const [least, most] = SNES_AMOUNT_RANGES.puckFriction
  // Taken out (9) or turned on without a number: the ROM's, else 8.
  const value = amount !== undefined && amount !== SNES_AMOUNT_OFF.puckFriction ? amount : isIn ? rom[target + FRICTION_TABLE_AT + 13] : 8
  if (value < least || value > most || value === SNES_AMOUNT_OFF.puckFriction) return null
  const table = puckFrictionTable(value, rom.slice(tableAt, tableAt + 10))
  const code = (room: number) =>
    asm65([
      bytesOf('BF', long(room + FRICTION_TABLE_AT - 1), '48 AD', word(frames[0].groups[0]), '29', word(value > 9 ? (1 << (value - 9)) - 1 : 0)),
      { branch: BEQ, to: 'keep' },
      bytesOf('68 68 E220 68 C220 BB 5C', long(dot10)),
      { label: 'keep' },
      bytesOf('68 6B', table, lda, value),
    ])
  // The code holds its own address, so it is made once its room is known.
  const placed = withFarCode(rom, site, bytesOf('BF', lda), 0, unused(FRICTION_CODE_LENGTH))
  if (!placed) return null
  placed[1].hacked = code(placed[1].at)
  if (placed[1].hacked.length !== FRICTION_CODE_LENGTH) return null
  placed[1].amount = value
  return placed
}

// --------------------------------------------------------------- clutch time
// As on the Genesis (hacks.ts, clutchTime): in the last 2:00 of the third
// period with the score within a goal, everyone on the ice plays half a rating
// point better, +1 (of 0-15, 2.5 to a point) to every working rating but
// aggression. setplayer builds each through its .8 (hot / cold, clamp 0-15),
// stat number Y - r3 (aggression 11); .8's end (rep / and #$FF / rtl; the hot
// and cold bug fix changes its middle) becomes jml to code that adds it,
// capped at 15. Gameloop's dec gameclock / lda CwdExciteLvl becomes jsl / nops
// to code that, as the clock reaches 2:00 in a close third, adds the +1 to the
// 12 players' stored ratings (the arrays setplayer's .8 results go to; aioff
// and aidef are left to the next rebuild, being stored inverted). The pass
// keeps X, Gameloop's count of frames to tick (NOSE4Web's first version did
// not, so the clock ran out at 2:00, Match Viewer found: recognised, and
// replaced when the hacks are next applied). Found by the code around them,
// so it goes into every build. From Match Viewer's reading.
function clutchTimePlaces(rom: Uint8Array): Placed[] | null {
  // .8: sta r3+2 / tya / clc / adc r3 / tay / sep / lda HotColdTable,y / ... / cmp #$0F / bcc / lda #$0F / then
  // rep / and #$FF / rtl, or the hack's jml / nops.
  // The hot and cold bug fix makes its lda HotColdTable,y / lsr / lsr a jsr / nop / nop.
  const ends = ['b9....4a4a', '20....eaea'].flatMap((middle) => [
    ...findCodeAll(rom, '85(..)981865(..)a8e220' + middle + '89..f0..09..1865..10..a900c90f9002a90fc22029ff006b'),
    ...findCodeAll(rom, '85(..)981865(..)a8e220' + middle + '89..f0..09..1865..10..a900c90f9002a90f5c(......)eaea'),
  ])
  if (ends.length !== 1) return null
  const eight = ends[0].at
  const [, r3] = ends[0].groups
  const endSite = eight + 33
  // setplayer's late test: lda gsp / sec / sbc #2 / bmi / bne / jsl GetPeriodTime / lsr d0 / lda d0 / sec / sbc
  // gameclock / beq / bpl / lda tmscore / sec / sbc tmscore+2.
  // (The comeback bonus fix makes its bpl a bmi.)
  const tests = findCodeAll(rom, 'ad(....)38e9020030..d0..22......46..a5..38ed(....)f0......ad(....)38ed(....)')
  if (tests.length !== 1) return null
  const [gsp, clock, score, score2] = tests[0].groups
  if (score2 !== score + 2) return null
  // The arrays .8's results go to: jsl .8 / sta array,x, in setplayer's order (aggression the last).
  const arrays = findCodeAll(rom, '22' + hexOf(Uint8Array.from(long(eight))) + '9d(....)').map(({ groups }) => groups[0])
  if (arrays.length !== 10) return null
  const boosted = arrays.slice(0, 9)
  // Gameloop: dec gameclock / lda CwdExciteLvl / clc / adc #$FFFD; or the hack's jsl / nops.
  const clockHex = hexOf(Uint8Array.from(word(clock)))
  const ticks = [...findCodeAll(rom, 'ce' + clockHex + 'ad(....)1869fdff'), ...findCodeAll(rom, '22(......)eaea1869fdff')]
  if (ticks.length !== 1) return null
  const tickSite = ticks[0].at
  const close = (out: string): Asm65 => [
    bytesOf('AD', word(gsp), 'C90200'), { branch: BNE, to: out },
    bytesOf('AD', word(clock), 'C97900'), { branch: BCS, to: out },
    bytesOf('AD', word(score), '38 ED', word(score + 2)), { branch: BPL, to: out + 'p' }, bytesOf('49FFFF 1A'),
    { label: out + 'p' }, bytesOf('C90200'), { branch: BCS, to: out },
  ]
  const calc = asm65([
    bytesOf('C220 29FF00 48 98 38 E5', r3, 'C90B00'), { branch: BEQ, to: 'out' },
    ...close('out'),
    bytesOf('68 1A C91000'), { branch: BCC, to: 'r' }, bytesOf('A90F00'),
    { label: 'r' }, '6B',
    { label: 'out' }, bytesOf('68 6B'),
  ])
  // The tick: the CwdExciteLvl address comes from the game's lda, or from the end of the hack's code.
  const plainTick = rom[tickSite] === 0xce
  const tickCode = plainTick ? -1 : loRomOffset(rom[tickSite + 3], readU16(rom, tickSite + 1))
  // The pass is last, with its own ending, so the tests' branches stay short: the first lda CwdExciteLvl is at 47.
  const crowd = plainTick ? ticks[0].groups[0] : readU16(rom, tickCode + 48)
  const tickOf = (keepX: boolean) => asm65([
    bytesOf('CE', word(clock), 'AD', word(clock), 'C97800'), { branch: BNE, to: 'x' },
    ...close('x'),
    { branch: BRA, to: 'pass' },
    { label: 'x' }, bytesOf('AD', word(crowd), '6B'),
    { label: 'pass' }, keepX ? 'DA A21600' : 'A21600',
    { label: 'loop' },
    ...boosted.flatMap((array, i) => [bytesOf('BD', word(array), '1A C91000'), { branch: BCS, to: 's' + i }, bytesOf('9D', word(array)), { label: 's' + i }]),
    bytesOf('CA CA'), { branch: BPL, to: 'loop' },
    keepX ? 'FA' : [],
    bytesOf('AD', word(crowd), '6B'),
  ])
  const tick = tickOf(true)
  if (tick.length !== CLUTCH_TICK_LENGTH(boosted.length)) return null
  // NOSE4Web's first version, which lost X: recognised where it is in.
  const first = plainTick ? null : tickOf(false)
  const earlier = first !== null && tickCode >= 0 && same(rom, tickCode, first)
  // .8's end: jml (no return on the stack, its rtl ends it), so placed here rather than by withFarCode (jsl).
  const endOriginal = hexBytes('C22029FF006B')
  const endIn = !same(rom, endSite, endOriginal)
  if (endIn && rom[endSite] !== 0x5c) return null
  const calcRoom = endIn ? loRomOffset(rom[endSite + 3], readU16(rom, endSite + 1)) : farRoom(rom, endSite, endOriginal, calc.length)
  if (calcRoom < 0) return null
  const one: Placed[] = [
    { at: endSite, original: endOriginal, hacked: bytesOf('5C', long(calcRoom), 'EAEA') },
    { at: calcRoom, original: unused(calc.length), hacked: calc },
  ]
  // The tick's room looked for with that in.
  const work = rom.slice()
  for (const place of one) work.set(place.hacked, place.at)
  const two = withFarCode(work, tickSite, bytesOf('CE', word(clock), 'AD', word(crowd)), 2, earlier ? first : tick)
  if (!two) return null
  return earlier ? [...one, two[0], { ...two[1], earlier: true }] : [...one, ...two]
}
const CLUTCH_TICK_LENGTH = (arrays: number) => 64 + arrays * 12

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
// McMarkis's 2 MB and SA-1 builds, and NOSE4Web's fights on the 1 MB game with
// his later fix ($7E:FE80 there), also mark a player hurt in a fight in
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

function shootoutInjuryPlaces(rom: Uint8Array, noFight = false): Placed[] | null {
  const s = shift(rom)
  const ram = SHOOTOUT_RAM.find((layout) => layout.shift === s)
  if (s === null || !ram) return null
  // The saved tmpdst: the saved run starts at $15D3.
  const saved = bytesOf(word(ram.low + 0x1852 - 0x15d3), ram.bank)
  // fightinj, where FightInjuredKeep reads it (lda.l fightinjany / beq / phx / phy / ldx), and PlayShootout's
  // jsl StartGame_go (after its two jsl InitShooters).
  // (McMarkis's builds: fightinj $E74E; NOSE4Web's 1 MB fights, with his fix brought over: $7E:FE80.)
  const keeps = noFight ? [] : findCodeAll(rom, 'af....(..)f0..da5aa23300bf(....)(..)')
  if (keeps.length > 1) return null
  const fightBank = keeps.length === 1 ? keeps[0].groups[2] : -1
  if (fightBank >= 0 && FIGHT_COPY[fightBank] === undefined) return null
  const fightinj = fightBank >= 0 ? bytesOf(word(keeps[0].groups[1]), fightBank) : null
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

// ------------------------------------------------------ organ after a pause
// As on the Genesis (hacks.ts, organResume). The SNES game sequences its songs
// on the 65816 (SoundUpdate, every NMI); the SPC700 only plays what it is
// sent. The song is all in low RAM: SongPtr ($07ED), TempoAcc and TempoTick
// ($07F5), MusicOn ($07F3), TrackCount ($0801), the track tables
// ($0804-$08F1), its bank (direct page $58) and the sample set (direct page
// $34); SoundLock ($07E5) keeps SoundUpdate out. The pause (Pausemode)
// fades the sound out (jsl FadeOutSound), which at the end of the fade
// clears all of it, and on the way out resets the sound (jsl SoundInit), and
// nothing starts the song again.
// - The jsl FadeOutSound becomes a jsl to code that keeps the song's state,
//   248 bytes, then goes on to FadeOutSound.
// - The jsl SoundInit becomes a jsl to code that calls SoundInit, then, where
//   a song was playing and the sample set is the same (a replay with music on
//   leaves the menu's), puts it all back, so the song carries on.
// The two are one block. The places are found by the code around them, and
// the calls' own targets kept, so it is the same in every build: the kept
// state at $7E:FF00 in the LoROM builds and $40:5C00 in the SA-1 ones (whose
// low variables are $6000 on), both found unused by the NHL94 Match Viewer
// project through whole games, the pause menu, replays and the menus.
const ORGAN_RAM = [
  { shift: 0, at: 0x7eff00 },
  { shift: 0x6000, at: 0x405c00 },
]
const ORGAN_SAVE_SITE = 'a2000822......fa22......ad....48ad....4822'
const ORGAN_RESTORE_SITE = 'a900008f......9c....9c....22......22......22......22......da'
const long24 = (value: number) => [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff]
// The two pieces: save (going on to FadeOutSound at `fade`) and restore (calling SoundInit at `init`).
function organCode(moved: number, kept: number, fade: number, init: number): { save: Uint8Array; restore: Uint8Array } {
  const at = (address: number) => word(address + moved)
  const [lock, on, count, song, tempo, tracks] = [0x07e5, 0x07f3, 0x0801, 0x07ed, 0x07f5, 0x0804].map(at)
  const s = (offset: number) => long24(kept + offset)
  const save = bytesOf(
    '08 DA E2 20 C2 10 CE', lock,
    'AD', on, '8F', s(4), 'AD', count, '8F', s(5), 'A5 58 8F', s(6),
    'C2 20 AD', song, '8F', s(0), 'AD', tempo, '8F', s(2), 'A5 34 8F', s(8),
    'A2 EC 00 BD', tracks, '9F', s(10), 'CA CA 10 F5',
    'E2 20 EE', lock, 'FA 28 5C', long24(fade),
  )
  // Past the sample set test (bne), to the end of the body.
  const rest = bytesOf(
    'E2 20 CE', lock, 'AF', s(5), '8D', count, 'AF', s(6), '85 58',
    'C2 20 AF', s(0), '8D', song, 'AF', s(2), '8D', tempo,
    'A2 EC 00 BF', s(10), '9D', tracks, 'CA CA 10 F5',
    'E2 20 AF', s(4), '8D', on, 'A9 00 8F', s(4), 'EE', lock,
  )
  const body = bytesOf('C2 20 A5 34 CF', s(8), 'D0', rest.length, rest)
  const restore = bytesOf('22', long24(init), '08 DA E2 20 C2 10 AF', s(4), 'F0', body.length, body, 'FA 28 6B')
  return { save, restore }
}
// The prefixes the two pieces start with, to know a ROM that has them.
const ORGAN_SAVE_START = hexBytes('08DAE220C210CE')
const ORGAN_SAVE_LENGTH = 76
function organPlaces(rom: Uint8Array): Placed[] | null {
  const moved = shift(rom)
  const ram = ORGAN_RAM.find((layout) => layout.shift === moved)
  const saveFound = only(rom, ORGAN_SAVE_SITE)
  const restoreFound = only(rom, ORGAN_RESTORE_SITE)
  if (!ram || saveFound < 0 || restoreFound < 0) return null
  const [saveSite, restoreSite] = [saveFound + 8, restoreFound + 25]
  const target = (site: number) => loRomOffset(rom[site + 3], readU16(rom, site + 1))
  const operand = (offset: number) => rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16)
  // In a ROM that has it, the calls' own targets are in the code: the save's jml at its end, the restore's jsl at
  // its start.
  const block = target(saveSite)
  const isIn = block >= 0 && block + ORGAN_SAVE_LENGTH < rom.length && same(rom, block, ORGAN_SAVE_START)
  const fade = isIn ? operand(block + ORGAN_SAVE_LENGTH - 3) : operand(saveSite + 1)
  const init = isIn ? operand(block + ORGAN_SAVE_LENGTH + 1) : operand(restoreSite + 1)
  const { save, restore } = organCode(ram.shift, ram.at, fade, init)
  if (save.length !== ORGAN_SAVE_LENGTH) return null
  const placed = withFarCode(rom, saveSite, bytesOf('22', long24(fade)), 0, bytesOf(save, restore))
  if (!placed) return null
  const room = placed[1].at
  if (isIn && loRomOffset(rom[restoreSite + 3], readU16(rom, restoreSite + 1)) !== room + save.length) return null
  return [
    ...placed,
    { at: restoreSite, original: bytesOf('22', long24(init)), hacked: bytesOf('22', word(loRomAddress(room + save.length)), loRomBank(room + save.length, 0x80)) },
  ]
}

// The referee's code for each level, A times the multiplier, padded with NOPs to one length; none for the original.
const REFEREE_OFF = 2
const REFEREE_INTERFERENCE = [1, 2, 2, 3, 4]
const REFEREE_LENGTH = 13
const refereeCodes = (d0: number): (Uint8Array | null)[] =>
  [
    // x32: asl x5
    '0A0A0A0A0A',
    // x21: sta d0 / asl x2 / clc / adc d0 (x5) / asl x2 / clc / adc d0
    `85${hex8(d0)} 0A0A 18 65${hex8(d0)} 0A0A 18 65${hex8(d0)}`,
    null,
    // x11: sta d0 / asl x2 / clc / adc d0 (x5) / asl / clc / adc d0
    `85${hex8(d0)} 0A0A 18 65${hex8(d0)} 0A 18 65${hex8(d0)}`,
    // x7: sta d0 / asl x3 / sec / sbc d0
    `85${hex8(d0)} 0A0A0A 38 E5${hex8(d0)}`,
  ].map((text) => {
    if (text === null) return null
    const code = bytesOf(text, '6B')
    return bytesOf(code, new Array(REFEREE_LENGTH - code.length).fill(0xea))
  })
const hex8 = (value: number) => value.toString(16).padStart(2, '0')

// ------------------------------------------------------------- three stars
// As on the Genesis (hacks.ts, threeStars): a fuller way of choosing the three stars. ShowThreeStars scores each
// player of both teams (X 0-25 home, 26-51 visitors, as the per-player stats are kept) with its .17, a jsl'd
// subroutine: the goal margin, then for a skater the overtime winner's bonus and goals x 11000, assists x 10100 and
// shots x 10; for a goalie (the team's first places) +32000 for 3% or less of the shots going in, and 75000 more for
// none. That .17 starts stz a2 / lda #2; those 5 bytes become jsl to new code / rtl. The new code scores as the
// Genesis option does: the margin; a skater the overtime bonus as before, goals, assists, shots and the checks he
// gave (NOSE4Web's bodycheck counts at $168E, or the 2 MB builds' own pchf); a goalie who faced a shot, each shot
// faced (one fewer when his team is behind), half a skater's assist weight, a shutout bonus when neither he nor his
// team let in a goal, and goals against x -11000. The packing of the score for the comparisons, as .17's .3xx.
// Choice 1 has the Genesis weights for line changes off, 2 for line changes on. Found by .17's code.
export const SNES_STAR_TEXTS = ["The original game's", 'Improved, for line changes off', 'Improved, for line changes on']
const STARS17 =
  '85(..)e01a0030..a9020085(..)64..a4..b9(....)a4..38f9....85(..)a90000e9000085..ec(....)30..ec(....)d0..a90b0085(..)a9b07185..20....' +
  'e220bd(....)c22029ff00daa2f82a22......fa20....e220bd(....)c22029ff00daa2742722......fa20....' +
  'e220bd(....)c22029ff00daa20a0022......fa20....80..a5..4822......a5..daa2280022......fa85..'
// The byte offset in STARS17 of the end of `marker` (the long address that follows it).
const starsAt = (marker: string) => (STARS17.replace(/[()]/g, '').indexOf(marker) + marker.length) / 2
interface StarWeights {
  goal: number
  assist: number
  shotFor: number
  check: number
  goalsAgainst: number
  shotsAgainst: number
  shutout: number
}
// A shot faced weighs less than on the Genesis (Match Viewer, 2026-11-20): with the Genesis's 4000 (4500), at about 30
// shots a team, a goalie was first star in all 28 SNES games played and took 2 of the 3 stars (the original: 9 of 20
// and 11 of 60); at 1500 (1700), 16 of 20 and 26 of 60. Rescoring those games, 800 matched the original's share and
// 1000 gave goalies a little more; 900 (1170, the skaters' 1.3 times) sits between, and a 30-shot shutout still leads.
const STAR_WEIGHTS: StarWeights[] = [
  { goal: 11000, assist: 7000, shotFor: 500, check: 500, goalsAgainst: 11000, shotsAgainst: 900, shutout: 16000 },
  { goal: 14300, assist: 9100, shotFor: 650, check: 650, goalsAgainst: 11000, shotsAgainst: 1170, shutout: 20800 },
]
// NOSE4Web's earlier versions: the Genesis's weights (19 November 2026), then 1500 / 1700 (20 November): recognised,
// and brought up to date.
const EARLIER_SHOT_WEIGHTS = [
  [4000, 4500],
  [1500, 1700],
]
function threeStarsPlaces(rom: Uint8Array, amount?: number): Placed[] | null {
  const found = findCodeAll(rom, STARS17)
  if (found.length !== 1) return null
  const [a1, a2, tmscore, d0, goalieEnd, otScorer, r2High, tmgoals, tmassists, tmpshots] = found[0].groups
  const r2 = r2High - 2
  const at = found[0].at
  const longAt = (marker: string) => rom.subarray(at + starsAt(marker), at + starsAt(marker) + 3)
  const mul16u = longAt('a2f82a22')
  const site = at - 5
  const original = bytesOf('64', a2, 'A9 0200')
  const isIn = rom[site] === 0x22 && rom[site + 4] === 0x6b
  if (!isIn && !same(rom, site, original)) return null
  // Each player's checks given: the 2 MB builds' own count, else NOSE4Web's (the Vault's) bodycheck counts.
  // The variables' shift read from .17's own tmscore ($178E in the original game).
  const own = only(rom, CLEAR_PLAYER_CHECKS)
  const checks = own >= 0 ? bytesOf('BF', rom.subarray(own + 8, own + 11)) : bytesOf('BD', word(BODYCHECKS_GIVEN + tmscore - 0x178e))
  const add = bytesOf('A5', d0, '18 65', r2, '85', d0, 'A5', d0 + 2, '65', r2 + 2, '85', d0 + 2)
  const sub = bytesOf('A5', d0, '38 E5', r2, '85', d0, 'A5', d0 + 2, 'E5', r2 + 2, '85', d0 + 2)
  // A times the weight into r2 (Mul16U, X kept).
  const times = (weight: number) => bytesOf('DA A2', word(weight), '22', mul16u, 'FA')
  const byte = (load: Uint8Array) => bytesOf('E2 20', load, 'C2 20 29 FF00')
  const term = (load: Uint8Array, weight: number) => bytesOf(byte(load), times(weight), add)
  const codeFor = (w: StarWeights) =>
    asm65([
      // a2 his team, a1 the other, as .17 sets them; d0 the goal margin, 32 bits.
      bytesOf('64', a2, 'A9 0200 85', a1, 'E0 1A00'),
      { branch: BMI, to: 'team' },
      bytesOf('A9 0200 85', a2, '64', a1),
      { label: 'team' },
      bytesOf('A4', a2, 'B9', word(tmscore), 'A4', a1, '38 F9', word(tmscore), '85', d0, 'A9 0000 E9 0000 85', d0 + 2),
      bytesOf('EC', word(goalieEnd)),
      { branch: BPL, to: 'skater' },
      { brl: 'goalie' },
      { label: 'skater' },
      bytesOf('EC', word(otScorer)),
      { branch: BNE, to: 'counts' },
      bytesOf('A9 0B00 85', r2 + 2, 'A9 B071 85', r2, add),
      { label: 'counts' },
      term(bytesOf('BD', word(tmgoals)), w.goal),
      term(bytesOf('BD', word(tmassists)), w.assist),
      term(bytesOf('BD', word(tmpshots)), w.shotFor),
      term(checks, w.check),
      { brl: 'pack' },
      { label: 'goalie' },
      byte(bytesOf('BD', word(tmpshots))),
      { branch: BEQ, to: 'pack' },
      bytesOf('A4', d0 + 2),
      { branch: BPL, to: 'faced' },
      '3A',
      { label: 'faced' },
      times(w.shotsAgainst),
      add,
      byte(bytesOf('BD', word(tmassists))),
      times(w.assist),
      bytesOf('46', r2 + 2, '66', r2, add),
      byte(bytesOf('BD', word(tmgoals))),
      { branch: BNE, to: 'against' },
      bytesOf('A4', a1, 'B9', word(tmscore)),
      { branch: BNE, to: 'pack' },
      bytesOf('A9', word(w.shutout), '85', r2, '64', r2 + 2, add),
      { branch: BRA, to: 'pack' },
      { label: 'against' },
      times(w.goalsAgainst),
      sub,
      // .3xx: the high word doubled with the low word's top bit, the low word's 15 bits.
      { label: 'pack' },
      bytesOf('A5', d0 + 2, '0A 85', d0 + 2, 'A5', d0, '0A A5', d0 + 2, '69 0000 85', d0 + 2, 'A5', d0, '29 FF7F 85', d0, '6B'),
    ])
  const codes = STAR_WEIGHTS.map(codeFor)
  const firstCodes = EARLIER_SHOT_WEIGHTS.flatMap((weights) => STAR_WEIGHTS.map((w, i) => codeFor({ ...w, shotsAgainst: weights[i] })))
  let room = -1
  let first = -1
  // No amount (or 0, taking it out): the choice the ROM holds.
  const asked = amount === 1 || amount === 2
  let choice = asked ? amount : 1
  if (isIn) {
    room = loRomOffset(rom[site + 3], readU16(rom, site + 1))
    if (!asked) {
      const which = codes.findIndex((code) => same(rom, room, code))
      first = which >= 0 ? -1 : firstCodes.findIndex((code) => same(rom, room, code))
      choice = which >= 0 ? which + 1 : first >= 0 ? (first % 2) + 1 : 1
    }
  } else {
    for (const bank of [0x9b, 0x80, loRomBank(site, 0x80)]) {
      const start = (bank & 0x7f) << 15
      if (start < rom.length) room = roomInBank(rom, start, codes[0].length)
      if (room >= 0) break
    }
  }
  if (room < 0) return null
  return [
    { at: site, original, hacked: bytesOf('22', word(loRomAddress(room)), loRomBank(room, 0x80), '6B') },
    { at: room, original: unused(codes[0].length), hacked: first >= 0 ? firstCodes[first] : codes[choice - 1], amount: choice, ...(first >= 0 ? { earlier: true } : {}) },
  ]
}

// ------------------------------------------------------------------ goalies
// As on the Genesis (hacks.ts, goalieHold, goalieWidth, goalieOut, goalieLine), from the SNES code (puckglue,
// assgoalie, doinput) and Match Viewer's reading (SNES_SHOOTING 5.4):
// - The hold: puckglue starts a goalie's count when he takes the puck (lda #140 / sta temp5,y; 5 for a catch in a
//   dive), and assgoalie's .15 counts it down by the frames (lda temp5,x / sec / sbc d7 / sta temp5,x / bpl) and
//   whistles when it runs out, for the computer's goalie and a person's alike. The 140 becomes the frames wanted.
//   For no whistle (0), as the Genesis's skips a person's goalie's count, .15's lda / sec / sbc becomes jsl to code
//   that leaves a person's goalie's count (playerpad,x >= 0) alone while it is above 5: the whistle line (which sets
//   it to 0 first) and a catch in a dive are still whistled, and the computer's goalie counts as before.
// - The dive catch (diveHold): puckglue's lda #5 after cmp #SPAgdive / bne becomes the frames wanted. With no
//   whistle (the hook above), a person's goalie's count above 5 is left alone, so a dive hold over 5 is never
//   whistled for him either; the computer's goalie counts it down.
// - The whistle line: just before, a goalie holding the puck nearer centre ice than 187 (lda Ypos,x / cmp #187 /
//   bpl / cmp #-187 / bmi, else stz temp5,x) is whistled at once. Only a person's goalie gets there, as the
//   computer's is always in his crease (211 or more out) when he reaches it; hence the line's top, 210.
// - The range: assgoalie's .2 clears goalieflags bit 1 while he is within 48 of the middle (lda Xpos,x / cmp #-48 /
//   bmi / cmp #49 / bpl) and 228 or more from centre (sta r0 / cmp #228 / bmi). With the bit set, a person's goalie
//   without the puck gets no pad control (doinput .13) and .11 skates him back to his net; the Genesis stops him at
//   its edge instead. The computer's goalie reads the same bit when he picks a save, so the new code changes the
//   box only for a person's goalie: the lda / cmp #-48 becomes jsl to code that loads 0 (inside), -49 or 49 for
//   him by the new width, his x for the computer's, and does the cmp; sta r0 / cmp #228 becomes jsl to code that
//   compares with the new distance for him, 228 for the computer's. assgoalietopuck's copy of the box is only for
//   the computer's goalie, and stays.
// Found by the code around them; the SA-1 builds' variables are elsewhere, read from that code.
interface GoalieEnv {
  playerpad: number
  xpos: number
  temp5: number
  d7: number
  holdValue: number
  diveValue: number
  holdSite: number
  line: number
  widthSite: number
  outSite: number
}
function goalieEnv(rom: Uint8Array): GoalieEnv | null {
  // assgoalie .5: ldy playerpad,x / bpl / lda Xpos,x / cmp #-53.
  const pad = findCodeAll(rom, 'bc(....)10..bd(....)c9cbff')
  // puckglue: ldy a2 / lda #140 / sta temp5,y / lda SPA,y / cmp #SPAgdive / bne / lda #5 (the dive's, diveHold).
  const hold = findCodeAll(rom, 'a491a9....99....b9....c9....d006a9....')
  // The whistle line, its stz temp5,x, .15 (either way) and, after the whistle, the think timer's sbc d7.
  const line = findCodeAll(rom, 'bd....c9....10..c9....30..9e(....)80..a9ffff9d....80..6b............9d....10..a9....85..22......bd....f0..4c....bd....38e5(..)')
  // .2's box, either way, before .4's jsl check4bench.
  const box = findCodeAll(rom, '............30..c9310010..bd....890080f00449ffff1a..........30..a9fdff3d....9d....22')
  if ([pad, hold, line, box].some((found) => found.length !== 1)) return null
  const [playerpad, xpos] = pad[0].groups
  const [temp5, d7] = line[0].groups
  return { playerpad, xpos, temp5, d7, holdValue: hold[0].at + 3, diveValue: hold[0].at + 17, holdSite: line[0].at + 27, line: line[0].at, widthSite: box[0].at, outSite: box[0].at + 25 }
}
const goalieHoldOriginal = (env: GoalieEnv) => bytesOf('BD', word(env.temp5), '38 E5', env.d7)
const goalieHoldCode = (env: GoalieEnv) =>
  asm65([
    bytesOf('BD', word(env.playerpad)),
    { branch: BMI, to: 'count' },
    bytesOf('BD', word(env.temp5), 'C9 0600'),
    { branch: BCC, to: 'count' },
    bytesOf('BD', word(env.temp5), '6B'),
    { label: 'count' },
    goalieHoldOriginal(env),
    '6B',
  ])
const goalieWidthOriginal = (env: GoalieEnv) => bytesOf('BD', word(env.xpos), 'C9 D0FF')
// The width is at +9 (cmp #-width).
const goalieWidthCode = (env: GoalieEnv, width: number) =>
  asm65([
    bytesOf('BD', word(env.playerpad)),
    { branch: BMI, to: 'computer' },
    bytesOf('BD', word(env.xpos), 'C9', word(-width & 0xffff)),
    { branch: BMI, to: 'left' },
    bytesOf('C9', word(width + 1)),
    { branch: BPL, to: 'right' },
    'A9 0000',
    { branch: BRA, to: 'test' },
    { label: 'left' },
    'A9 CFFF',
    { branch: BRA, to: 'test' },
    { label: 'right' },
    'A9 3100',
    { branch: BRA, to: 'test' },
    { label: 'computer' },
    bytesOf('BD', word(env.xpos)),
    { label: 'test' },
    'C9 D0FF 6B',
  ])
const goalieOutOriginal = (r0: number) => bytesOf('85', r0, 'C9 E400')
// The distance is at +10.
const goalieOutCode = (env: GoalieEnv, r0: number, out: number) =>
  asm65([bytesOf('85', r0, 'BD', word(env.playerpad)), { branch: BMI, to: 'computer' }, bytesOf('A5', r0, 'C9', word(out), '6B'), { label: 'computer' }, bytesOf('A5', r0, 'C9 E400 6B')])
// The new code a jsl at `site` calls, or -1.
const farTarget = (rom: Uint8Array, site: number) => (rom[site] === 0x22 ? loRomOffset(rom[site + 3], readU16(rom, site + 1)) : -1)

function goalieHoldPlaces(rom: Uint8Array, amount?: number): Placed[] | null {
  const env = goalieEnv(rom)
  if (!env) return null
  const now = readU16(rom, env.holdValue)
  const hooked = rom[env.holdSite] === 0x22
  if (hooked ? now !== SNES_GOALIE_HOLD : now < 1 || now > 0x7fff || !same(rom, env.holdSite, goalieHoldOriginal(env))) return null
  // Turned on without a number (as when every hack is chosen): no whistle, unless the ROM has its own already.
  const value = amount ?? (hooked ? 0 : now !== SNES_GOALIE_HOLD ? now : 0)
  const frames: Placed = { at: env.holdValue, original: bytesOf(word(SNES_GOALIE_HOLD)), hacked: bytesOf(word(value || SNES_GOALIE_HOLD)), amount: value }
  if (value !== 0 && !hooked) return [frames]
  const far = withFarCode(rom, env.holdSite, goalieHoldOriginal(env), 2, goalieHoldCode(env))
  if (!far) return null
  // Another number where the ROM has no whistle (as when taking it out by its original number): the hook goes.
  return value === 0 ? [frames, ...far] : [frames, ...far.map((place) => ({ ...place, hacked: place.original! }))]
}

function diveHoldPlaces(rom: Uint8Array, amount?: number): Placed[] | null {
  const env = goalieEnv(rom)
  if (!env) return null
  const now = readU16(rom, env.diveValue)
  if (now < 1 || now > 0x7fff) return null
  // Turned on without a number (as when every hack is chosen): half a second, unless the ROM has its own already.
  const value = amount ?? (now !== SNES_DIVE_HOLD ? now : 30)
  return [{ at: env.diveValue, original: bytesOf(word(SNES_DIVE_HOLD)), hacked: bytesOf(word(value)), amount: value }]
}

function goalieWidthPlaces(rom: Uint8Array, amount?: number): Placed[] | null {
  const env = goalieEnv(rom)
  if (!env) return null
  const code = farTarget(rom, env.widthSite)
  if (code < 0 && !same(rom, env.widthSite, goalieWidthOriginal(env))) return null
  const now = code < 0 ? SNES_GOALIE_WIDTH : (0x10000 - readU16(rom, code + 9)) & 0xffff
  const value = amount ?? (now !== SNES_GOALIE_WIDTH ? now : 60)
  const far = withFarCode(rom, env.widthSite, goalieWidthOriginal(env), 2, goalieWidthCode(env, value))
  return far && [{ ...far[0], amount: value }, far[1]]
}

function goalieOutPlaces(rom: Uint8Array, amount?: number): Placed[] | null {
  const env = goalieEnv(rom)
  if (!env) return null
  const code = farTarget(rom, env.outSite)
  const r0 = code < 0 ? rom[env.outSite + 1] : rom[code + 1]
  if (code < 0 && !same(rom, env.outSite, goalieOutOriginal(r0))) return null
  const now = code < 0 ? SNES_GOALIE_OUT : readU16(rom, code + 10)
  const value = amount ?? (now !== SNES_GOALIE_OUT ? now : 200)
  const far = withFarCode(rom, env.outSite, goalieOutOriginal(r0), 1, goalieOutCode(env, r0, value))
  return far && [{ ...far[0], amount: value }, far[1]]
}

function goalieLinePlaces(rom: Uint8Array, amount?: number): Placed[] | null {
  const env = goalieEnv(rom)
  if (!env) return null
  const now = readU16(rom, env.line + 4)
  if (now > SNES_GOALIE_LINE_MOST && now !== SNES_GOALIE_LINE) return null
  if (readU16(rom, env.line + 9) !== (-now & 0xffff)) return null
  const value = amount ?? (now !== SNES_GOALIE_LINE ? now : 150)
  return [
    { at: env.line + 4, original: bytesOf(word(SNES_GOALIE_LINE)), hacked: bytesOf(word(value)), amount: value },
    { at: env.line + 9, original: bytesOf(word(-SNES_GOALIE_LINE & 0xffff)), hacked: bytesOf(word(-value & 0xffff)) },
  ]
}

const RELOCATED: Partial<Record<SnesHack, Relocate>> = {
  goalieHold: (rom, _source, amount) => goalieHoldPlaces(rom, amount),
  diveHold: (rom, _source, amount) => diveHoldPlaces(rom, amount),
  goalieWidth: (rom, _source, amount) => goalieWidthPlaces(rom, amount),
  goalieOut: (rom, _source, amount) => goalieOutPlaces(rom, amount),
  goalieLine: (rom, _source, amount) => goalieLinePlaces(rom, amount),
  organResume: (rom) => organPlaces(rom),
  // Put in before the fights (which go in last), it is the version without fightinj: recognised as that too.
  shootoutInjuries: (rom) => {
    const places = shootoutInjuryPlaces(rom)
    if (!places || places.every((place) => holds(rom, place, 'hacked'))) return places
    const plain = shootoutInjuryPlaces(rom, true)
    return plain && plain.every((place) => holds(rom, place, 'hacked')) ? plain : places
  },
  oneTimerFix: (rom) => oneTimerPlaces(rom),
  shotFix: (rom) => shotPlaces(rom),
  lockedChangeFix: (rom) => lockedChangePlaces(rom),
  lockedDefenceFix: (rom) => lockedDefencePlaces(rom),
  openNetFix: (rom) => openNetPlaces(rom),
  timeOnIce: (rom) => timeOnIcePlaces(rom),
  timeOnIceShown: (rom) => timeOnIceShownPlaces(rom),
  giveaways: (rom) => giveawayPlaces(rom),
  giveawaysShown: (rom) => giveawayShownPlaces(rom),
  giveawayPages: (rom) => giveawayPagesPlaces(rom),
  nhlShootout: (rom) => nhlShootoutPlaces(rom),
  choppyIce: (rom) => choppyIcePlaces(rom),
  speedBurst: (rom, _source, amount) => speedBurstPlaces(rom, amount),
  turnRate: (rom, _source, amount) => turnRatePlaces(rom, amount),
  puckFriction: (rom, _source, amount) => puckFrictionPlaces(rom, amount),
  clutchTime: (rom) => clutchTimePlaces(rom),
  fightTime: (rom, _source, amount) => fightTimePlaces(rom, amount),
  threeStars: (rom, _source, amount) => threeStarsPlaces(rom, amount),
  creaseIcing: (rom) => {
    const found = icingEnv(rom)
    return found && withFarCode(rom, found.mark, creaseMarkOriginal(found.env), 2, creaseCode(found.env))
  },
  hybridIcing: (rom) => {
    const found = icingEnv(rom)
    return found && withFarCode(rom, found.call, bytesOf('22', found.env.puckIChk), 0, hybridCode(found.env))
  },
  // As on the Genesis (hacks.ts): a2touchpuck arms icing at its end, lda #ifok / tsb iflags / rtl, after the
  // short-handed test (sec / sbc d0 / sta d0 / lda d0 / bmi). The lda #$0004 becomes lda #$0000, so the tsb
  // sets nothing: icing is never armed, PuckIChk never marks a crossing, updateplayers has none to wave off and
  // the goalie plays the puck as any loose one. No icing within the crease and hybrid icing then do nothing.
  noIcing: (rom) => {
    const found = only(rom, '38e5..85..a5..30..a9....0c....6b')
    return found < 0 ? null : [{ at: found + 10, original: hexBytes('0400'), hacked: hexBytes('0000') }]
  },
  // The game clock takes $0AAA from its fraction every frame and a second when that borrows: 60 / $0AAA x
  // $10000 = 24 frames a second, two and a half times a real clock, as on the Genesis (hacks.ts). Real time
  // takes $0444 instead (60 frames a second), in Gameloop and in the highlights' own copy of the loop
  // (SaveRegsStartHL2): lda gameclock / beq / lda gameclock+2 / sec / sbc #$0AAA / sta gameclock+2 / bcs (the
  // dec gameclock after it is not part of the pattern: clutch time calls its code there). The penalty box keeps
  // its own second (Match Viewer): updatepentime takes the frames from Penaltytimer and, when it runs out, adds
  // 24 back (lda Penaltytimer / sec / sbc d7 / sta / bpl / adc #$0018 / sta / lda #$0020 / tsb sflags3), and
  // that tick also counts attack-zone time, power-play time and time on ice; real time adds 60 ($3C). NOSE4Web's
  // first version left it at 24 (a minor ended 48 seconds of the clock in): recognised, and brought up to date
  // when the hacks are next applied. The penalty shot's limit is 1000 frames (SetupPenaltyShot: lda #1 / sta
  // PenShotActive / lda #1000 / sta pstimer / jsl / rtl), 16.7 real seconds; the Genesis's counts in game time, so
  // there real time makes it 2.5 times longer, and so it does here: 2500 frames (puckfaceoff2 jmp's to it; whether
  // the shootouts' attempts go through it too is for Match Viewer to confirm). A ROM from before either change (clock only, 19-20 November 2026) is recognised.
  realTime: (rom) => {
    const found = findCodeAll(rom, 'ad....f0..ad(....)38e9....8d(....)b0').filter(({ groups }) => groups[0] === groups[1])
    const box = findCodeAll(rom, 'ad(....)38e5..8d(....)10..69..008d(....)a92000').filter(({ groups }) => groups[0] === groups[1] && groups[1] === groups[2])
    const shot = findCodeAll(rom, 'a901008d....a9....8d....22......6b')
    if (found.length !== 2 || box.length !== 1 || shot.length !== 1) return null
    const clock = found.map(({ at }) => ({ at: at + 10, original: hexBytes('AA0A'), hacked: hexBytes('4404') }))
    const clockIn = clock.every((place) => holds(rom, place, 'hacked'))
    // Each added later: where the clock is in and it is not, an earlier version.
    const later = (at: number, original: string, hacked: string): Placed =>
      clockIn && same(rom, at, hexBytes(original)) ? { at, original: hexBytes(original), hacked: hexBytes(original), earlier: true } : { at, original: hexBytes(original), hacked: hexBytes(hacked) }
    return [...clock, later(box[0].at + 12, '1800', '3C00'), later(shot[0].at + 7, 'E803', 'C409')]
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
    // The Stars of the Game, after the restore (Match Viewer, 2026-11-20): the game queues them (PenEOG) only as a
    // period's clock ends with the score not tied, so after a shootout they never came. ShowThreeStars (found from
    // InProgress's jsl for PenDataEOG) picks them from the restored stats and prints them into the text map;
    // QueueTextDMA, which the play loop calls, sends the map to the screen; WaitFrames (X frames, Y 1) shows them for
    // 3 seconds over the rink, beside the winner's banner, before PeriodOver fades out.
    const showStars = only(rom, 'c9....d00422......a7..29ff00')
    const textDma = only(rom, 'ad....3025a80a69f43785..a9..0085')
    const waitFrames = only(rom, '22......cad0f988d0f66b')
    if (showStars < 0 || textDma < 0 || waitFrames < 0) return null
    const farCall = (at: number) => bytesOf('22', word(loRomAddress(at)), loRomBank(at, 0x80))
    const stars = bytesOf('C230', '22', rom.slice(showStars + 6, showStars + 9), farCall(textDma), 'A2', word(SHOOTOUT_STARS_FRAMES), 'A00100', farCall(waitFrames))
    // `extras`: with the 2 MB builds' player stats saved too; NOSE4Web's of the morning of 12 November 2026 had not.
    // `withStars`: with the Stars of the Game; NOSE4Web's before 21 November 2026 had not.
    const runOf = (extras: boolean, withStars = true) => bytesOf(
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
      'FA', 'BF', long(score), '1A', '9F', long(score), 'FA', '8A', '8F', gsp, b, 'AB', '3B', '18', '690300', '1B', withStars ? stars : [], '5C', periodOver,
    )
    // The code as it is in, where it is (to take out, or to read), or as it is to go in.
    const shape = now && (choice === 0 || choice === now) ? now : choice
    const hookLength = shape === 1 ? SHOOTOUT_A_LENGTH : SHOOTOUT_B_LENGTH
    // In, the version is the one whose Exit Shootout lock (after RUN) the exit's jsl calls.
    const locksAt = (runLength: number) => now && codeAt >= 0 && rom[sites.exit] === 0x22 && readU16(rom, sites.exit + 1) === (loRomAddress(codeAt + hookLength + runLength) & 0xffff)
    const versions = [[true, true], [false, true], [true, false], [false, false]] as const
    const inRom = now ? versions.find(([e, w]) => (e || extra) && locksAt(runOf(e, w).length)) : undefined
    const [extras, withStars] = inRom ?? [true, true]
    const run = runOf(extras, withStars)
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
      { at: codeRoom, original: unused(length), hacked: bytesOf(hook, run, lock), ...(extras && withStars ? {} : { earlier: true }) },
    ]
  },
  // Referee strictness, as on the Genesis (hacks.ts, referees). checkagr rolls d0 = randomd0((20 - Agr) x 16), doubled
  // for a pad player and halved near the puck, and its callers call holding, hooking, tripping, charging or roughing
  // when d0 is small. The x 16 is four asl a (16-bit A, after lda.w #$0014 / sec / sbc.w aggress,x, before sta.b d0):
  // they become a jsl to code that multiplies A by 32, 21, 11 or 7 (shifts and adds through d0, which is stored right
  // after) and returns: about 50%, 76%, 145% and 229% of the calls. The original game is no hook. Goalie
  // interference (checkint .ci) calls when randoma8(20 - Agr) is under 2 (cmp.w #$0002 / bcs .rtl), so its threshold
  // takes the nearest whole step: 1, 2, 2, 3, 4 (50%, 100%, 100%, 150%, 200%). The code is the same length at every
  // level. Its amount is the choice, SNES_REFEREE_TEXTS.
  referees: (rom, _source, amount) => {
    const agr = only(rom, 'a9140038fd....' + '........' + '85..bd....300206..')
    const int = only(rom, 'a9140038fd....22......c9..00b0')
    if (agr < 0 || int < 0) return null
    const site = agr + 7
    const d0 = rom[agr + 12]
    if (rom[agr + 19] !== d0) return null
    const codes = refereeCodes(d0)
    const original = hexBytes('0A0A0A0A')
    // The level in the ROM: none (the original game), or the one whose code its jsl calls.
    const target = rom[site] === 0x22 ? loRomOffset(rom[site + 3], readU16(rom, site + 1)) : -1
    const now = same(rom, site, original) ? REFEREE_OFF : codes.findIndex((code) => code && target >= 0 && same(rom, target, code))
    if (now < 0) return null
    // Turned on without a choice (as when every hack is chosen): strict, unless the ROM has its own already.
    const choice = amount ?? (now === REFEREE_OFF ? 3 : now)
    const code = codes[choice === REFEREE_OFF ? 3 : choice]!
    const placed = withFarCode(rom, site, original, 0, code)
    if (!placed) return null
    return [
      { ...placed[0], amount: choice },
      placed[1],
      { at: int + 12, original: hexBytes('0200'), hacked: Uint8Array.of(REFEREE_INTERFERENCE[choice], 0) },
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
  // burst (the A button without the puck, with line changes on): jsl getpde; lda.l OptLine / beq; lda d0 / sec / sbc #$CC; sta d0;
  // jsl setpde, then full energy with Auto. The cost becomes 0.
  // McMarkis's 2 MB builds count each team's shots off the post (tmposts, Game Stats' Posts): PostCount, which
  // checkgoal's post branch calls, credits the team of lastplayer, the last player to touch the puck. But lastplayer
  // holds a player's number (every writer stores it after lsr a), and PostCount takes it as his offset (ldx lastplayer
  // / cpx #$0018 / lda pfteam,x), so it read the team of the player at half that number: a shot off the post went to
  // the wrong team most of the time (Match Viewer, from a league game: Finland's three posts all went to the Czechs).
  // The ldx / cpx (6 bytes) becomes a jsl to lda lastplayer / asl a / tax / cpx #$0018 / rtl (the bcs after reads the
  // carry the cpx left). Since doshot sets lastplayer to the shooter, a shot straight off the post counts for his team.
  postsFix: (rom) => {
    const plain = only(rom, 'ad....d020da' + 'ae....e01800' + 'b016bd....f005a20200')
    const hooked = only(rom, 'ad....d020da' + '22......eaea' + 'b016bd....f005a20200')
    const site = (plain >= 0 ? plain : hooked) + 6
    if ((plain >= 0) === (hooked >= 0)) return null
    // The lastplayer address: from the ldx, or from the code the jsl calls.
    const code = plain >= 0 ? -1 : loRomOffset(rom[site + 3], readU16(rom, site + 1))
    if (hooked >= 0 && (code < 0 || code + 9 > rom.length || rom[code] !== 0xad || !same(rom, code + 3, hexBytes('0AAAE018006B')))) return null
    const lastplayer = plain >= 0 ? readU16(rom, site + 1) : readU16(rom, code + 1)
    return withFarCode(rom, site, bytesOf('AE', word(lastplayer), 'E01800'), 2, bytesOf('AD', word(lastplayer), '0AAAE018006B'))
  },
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
    const spa = only(rom, 'a491a9....99....b9....c9....')
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
  barrPick: (rom) => {
    const found = only(rom, 'c90800b0..9c....c9..00b0..a9ffff8d')
    return found < 0 ? null : [{ at: found + 8, original: hexBytes('C90400'), hacked: hexBytes('C90000') }]
  },
  // Its addresses from the code neither way changes: hotextreme and hotterteam
  // from the threshold, VisTeam and the sums from the visitors' branch before
  // it, and RandomWord from deflect's jsl.
  barrCoin: (rom) => {
    const found = only(rom, 'c90800b0..9c....c9..00b0..a9ffff8d')
    const random = only(rom, 'a9ffff8d....22......29ff1f38e90010')
    if (found < 0 || random < 0 || rom[found - 13] !== 0xad || rom[found - 10] !== 0x8d || rom[found - 4] !== 0x38) return null
    const at = (o: number) => rom[o] | (rom[o + 1] << 8)
    const [extreme, hotter, visitors, sum] = [at(found + 6), at(found + 17), at(found - 12), at(found - 2)]
    return [
      {
        at: found - 30,
        original: bytesOf('A90100 8D', word(extreme), 'AD', word(sum), '38 ED', word(sum + 2), '3002 800D'),
        hacked: bytesOf('9C', word(extreme), '22', rom.slice(random + 7, random + 10), '1006 AD', word(visitors), '8D', word(hotter), '6B EA'),
      },
    ]
  },
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
    // tya / lsr / inc (team 0 pad 1, team 2 pad 2), in the same three bytes. The table stays, unread. NOSE4Web's
    // before that fix (in moved builds: the table read, and the team as ldy $91+shift, absolute) is its earlier
    // version, replaced when asked.
    const padOf = (address: number, table: boolean) => (table ? bytesOf('B9', word(address + 0x53)) : hexBytes('98 4A 1A'))
    const checkOriginal = bytesOf('A491 B9', tmgoalie)
    const checkCode = (address: number, earlier?: boolean) =>
      bytesOf(
        'A20000', earlier ? bytesOf('AC', word(0x91 + s)) : direct(s, 'AC', 0x91), 'B9', tmgoalie, 'C900FF D001 60', padOf(address, earlier || snesCodeInPlace(rom)), 'DD', word(0x1c84 + s), 'F009 E8 E8 E00400 D0F1 802D BD', word(counts),
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
    const earlier = checkAt >= 0 && !snesCodeInPlace(rom) && same(rom, checkAt, checkCode(loRomAddress(checkAt), true))
    return [
      { at: site, original: checkOriginal, hacked: bytesOf('20', word(loRomAddress(checkRoom)), 'EAEA') },
      { at: checkRoom, original: unused(CHECK_LENGTH), hacked: checkCode(loRomAddress(checkRoom), earlier || undefined), ...(earlier ? { earlier: true } : {}) },
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

// The injured out of the shootout without its fightinj step where the ROM now has fightinj (the fights put in after
// it): out, and in again with the step.
function refreshShootoutInjuries(rom: Uint8Array): void {
  const plain = shootoutInjuryPlaces(rom, true)
  const full = shootoutInjuryPlaces(rom)
  if (!plain || !full || !plain.every((place) => holds(rom, place, 'hacked')) || full.every((place) => holds(rom, place, 'hacked'))) return
  for (const place of plain) if (place.original) rom.set(place.original, place.at)
  for (const place of shootoutInjuryPlaces(rom) ?? []) rom.set(place.hacked, place.at)
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
  // A build with its own checks pages in Player Stats (columns 6 and 7) has no room for NOSE4Web's TOI page.
  if (!ownIceTime(rom) && only(rom, CLEAR_PLAYER_CHECKS) >= 0 && !choices.timeOnIceShown) {
    notOffered.timeOnIceShown = OWN_STAT_PAGES
    if (unknown.includes('timeOnIceShown')) unknown.splice(unknown.indexOf('timeOnIceShown'), 1)
  }
  // Only McMarkis's 2 MB builds count posts: elsewhere the fix is not offered, and not other code in the way.
  if (unknown.includes('postsFix') && only(rom, 'ad....d020da' + '..........00' + 'b016bd....f005a20200') < 0) {
    notOffered.postsFix = NO_POSTS
    unknown.splice(unknown.indexOf('postsFix'), 1)
  }
  if (ownIceTime(rom)) {
    // Its own count is not other code in the way: the hack is off, and not offered.
    for (const hack of ['timeOnIce', 'timeOnIceShown'] as const) {
      if (choices[hack]) continue
      notOffered[hack] = OWN_ICE_TIME
      if (unknown.includes(hack)) unknown.splice(unknown.indexOf(hack), 1)
    }
  }
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
  // NOSE4Web's earlier fights (without the pairing of the fighters' majors, or the fix for a player hurt in a fight)
  // are replaced whenever the fights are applied.
  const fightUpgrade = wanted.fighting === true && choices.fighting && snesFightState(project.bytes)?.kind === 'in' && (snesFightState(project.bytes) as { earlier?: boolean }).earlier === true
  const fightToggles = wanted.fighting !== undefined && (wanted.fighting !== choices.fighting || fightUpgrade) && !unknown.includes('fighting')
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
  const fightChanges = fightWanted !== undefined && (fightWanted !== choices.fighting || fightUpgrade || (fightWanted && bonus !== undefined && bonus !== had?.fighting))
  if (fightChanges && unknown.includes('fighting')) throw new SnesHackError(`${SNES_HACK_TITLES.fighting} cannot be changed: ${snesFightBlocked(project.bytes) ?? 'this ROM has other code in its place.'}`)
  let rom = project.bytes.slice()
  if (fightChanges && !fightWanted) {
    // The injured out of the shootout reads fightinj where the fights have it: out with it first, then in again
    // without it if it stays.
    const full = choices.shootoutInjuries ? shootoutInjuryPlaces(rom) : null
    const wasFull = !!full && full.every((place) => holds(rom, place, 'hacked'))
    if (wasFull) for (const place of full!) if (place.original) rom.set(place.original, place.at)
    rom = (withoutSnesFight(rom) as typeof rom).slice()
    if (wasFull && wanted.shootoutInjuries !== false) for (const place of shootoutInjuryPlaces(rom) ?? []) rom.set(place.hacked, place.at)
  }
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
    const reAmount = want === true && choices[hack] && ((isAmount(hack) && amount !== undefined && amount !== had?.[hack]) || update)
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
  // The injured out of the shootout, put in before the fights, again with their fightinj step.
  if (out !== rom) refreshShootoutInjuries(out)
  syncFightPairing(out)
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
export const RECOMMENDED_SNES_FIXES: SnesHack[] = ['ppPkFix', 'comebackFix', 'penaltyShotFixes', 'extraAttackerFix', 'secondAssist', 'regainAssist', 'stickShots', 'defenceControl', 'lockedChangeFix', 'lockedDefenceFix',
  'awarenessFix', 'oneTimerFix', 'shotFix', 'bodychecks', 'bodychecksShown', 'goaliePoke', 'skipEaIntro', 'skipPucksIntro', 'creaseIcing']

// `choices` with the recommended fixes on, except where this ROM has other code.
// `notOffered`: hacks this build does not take (its own bodycheck counts, say), left as they are too.
export function withRecommendedSnesFixes(choices: SnesHackChoices, unknown: SnesHack[], notOffered: SnesHack[] = []): SnesHackChoices {
  const next = { ...choices }
  for (const hack of RECOMMENDED_SNES_FIXES) if (!unknown.includes(hack) && !notOffered.includes(hack)) next[hack] = true
  // One that needs another this ROM cannot take (the checks shown without their counts) stays as it was.
  for (const [needer, needed] of Object.entries(NEEDS) as [SnesHack, SnesHack][]) if (next[needer] && !next[needed]) next[needer] = choices[needer]
  return next
}

// The order the Hacks page has them in.
const SNES_PAGE_ORDER: SnesHack[] = [
  'hotColdFix', 'ppPkFix', 'comebackFix', 'faceoffFix', 'penaltyShotFixes', 'extraAttackerFix', 'yButtonFix', 'awarenessFix', 'oneTimerFix', 'shotFix', 'lockedChangeFix', 'lockedDefenceFix', 'openNetFix', 'secondAssist', 'stickShots', 'timeOnIce', 'timeOnIceShown', 'postsFix', 'nhlShootout', 'choppyIce', 'clutchTime',
  'bodychecks', 'bodychecksShown', 'regainAssist', 'forwardsAndDefence', 'showMaxBoost', 'manualPullGoalie',
  'defenceControl', 'oneMinutePenalties', 'thirtySecondPeriods', 'fourthPeriodOvertime', 'seasonOvertime', 'referees', 'noInterference', 'noPenaltyShots', 'noGoalPosts', 'creaseIcing', 'hybridIcing', 'hitEnergy', 'holdEnergy', 'injuryBonus', 'noSkatingDrain', 'freeBurst', 'energySpeed', 'goaliePoke', 'skipEaIntro', 'skipPucksIntro', 'barrPick', 'barrCoin', 'organResume',
  'realTime', 'noIcing',
  'goalieHold', 'diveHold', 'goalieWidth', 'goalieOut', 'goalieLine',
  'speedBurst', 'turnRate', 'puckFriction',
]

// Whether Edit Lines may put any skater at any position in this ROM.
export function snesAnyPosition(project: Pick<RomProject, 'game' | 'bytes'>): boolean {
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
  return snesHackStateChanges(detectSnesHacks(before), detectSnesHacks(after))
}

// The same from two states, such as a season's start (season.ts) and now.
export function snesHackStateChanges(was: Pick<SnesHackState, 'choices' | 'unknown' | 'amounts'>, now: Pick<SnesHackState, 'choices' | 'unknown' | 'amounts'>): string[] {
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
