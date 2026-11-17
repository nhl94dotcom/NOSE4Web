import { discordPost } from './discord'
import type { GameConfig } from './games'
import { readU16, readU32, writeU16 } from './bytes'
import {
  assemble,
  assistFixes,
  BCHECK_TEXTS,
  HACK_RANGES,
  holdSeconds,
  hooked,
  hookedFix,
  INJURY_TEXTS,
  NHL_SHOOTOUT_CODE,
  numberPart,
  PASS_CODE,
  readSite,
  site,
  switchPart,
  writeHook,
  writeSite,
  type Asm,
  type BCheckPenaltiesOff,
  type Hook,
  type Injuries,
  type Part,
  type ThreeStars,
} from './hacks'
import { clockTime, fightTimeText, penaltyLengths, penaltyTimeText } from './penaltytime'
import type { HackSheet } from './hacksheet'
import { FIGHT95_AT, FIGHT95_BLOCK, FIGHT95_CHOICES_AT, FIGHT95_HOOKS, FIGHT95_LABELS_AT } from './nhl95fightdata'
import type { RomProject } from './rom'
import { claimSpace95, fullRomReason } from './space'

// Hacks to NHL '95 for the Genesis. NHL 94's hacks are made for NHL 94's code;
// these are NHL '95's own, or NHL 94's where NHL '95 has the same code at
// other addresses (the NHL95Genesis disassembly).

// The on-or-off hacks, then NHL 94's settings: numbers, and choices of a few ways. NO_NHL95_HACKS has NHL '95's own
// values, read from its code.
export interface Nhl95HackChoices {
  fighting: boolean
  fightingOff: boolean
  fightingArcade: boolean
  secondAssist: boolean
  oneTimerAssist: boolean
  regainAssist: boolean
  aggressionFix: boolean
  comebackFix: boolean
  rocketFix: boolean
  openNetFix: boolean
  blindRingFix: boolean
  seasonOvertime: boolean
  seasonShootout: boolean
  seasonShootoutNow: boolean
  nhlShootout: boolean
  threeOnThree: boolean
  threeOnThreeAll: boolean
  runawayFix: boolean
  goaliePullFix: boolean
  snipingFix: boolean
  penaltyShotTableFix: boolean
  penaltyShotFixes: boolean
  organResume: boolean
  passFix: boolean
  ppPkFix: boolean
  faceoffFix: boolean
  awarenessFix: boolean
  stickShots: boolean
  anyPosition: boolean
  // Statistics. NHL '95 has no earlier bodycheck counts to keep, so they are off or on.
  threeStars: ThreeStars
  bodychecks: 'off' | 'on'
  timeOnIce: boolean
  giveaways: boolean
  // Rules.
  realTime: boolean
  penaltySeconds: number
  fightSeconds: number
  noIcing: boolean
  hybridIcing: boolean
  delayedCalls: boolean
  bCheckPenaltiesOff: BCheckPenaltiesOff
  injuries: Injuries
  shootoutInjuries: boolean
  fourthPeriodOvertime: number
  // Energy and injury risk.
  stamina: boolean
  energyDrain: number
  energyRecovery: number
  noSkatingDrain: boolean
  burstEnergy: number
  hitEnergy: number
  holdEnergy: number
  injuryBonus: number
  injuryCap: number
  // Goalies.
  goalieHold: number
  goalieWidth: number
  goalieOut: number
  goalieLine: number
  goalieDelay: number
  // Skating and the puck.
  speedBurst: number
  turnRate: number
  puckFriction: number
  choppyIce: boolean
}
export type Nhl95Hack = keyof Nhl95HackChoices
// In the order they are taken out and put in: the one-timer fix takes over a
// place the second-assist fix calls from, as in NHL 94; fighting, whose code
// has a place of its own, goes in before the others claim free space, and
// before the extra period length, which sets its count in fighting's copy of
// the Game Setup choices; giveaways before the time on ice, whose Player Stats
// page their pages take in.
export const NHL95_HACKS: Nhl95Hack[] = [
  'fighting', 'fightingOff', 'fightingArcade', 'secondAssist', 'oneTimerAssist', 'regainAssist', 'aggressionFix', 'comebackFix', 'rocketFix', 'openNetFix', 'blindRingFix', 'seasonOvertime', 'seasonShootout', 'seasonShootoutNow', 'nhlShootout', 'threeOnThree', 'threeOnThreeAll', 'runawayFix', 'goaliePullFix', 'snipingFix', 'penaltyShotTableFix', 'penaltyShotFixes', 'organResume', 'passFix', 'ppPkFix', 'faceoffFix', 'awarenessFix', 'stickShots', 'anyPosition',
  'threeStars', 'bodychecks', 'realTime', 'penaltySeconds', 'fightSeconds', 'noIcing', 'hybridIcing', 'delayedCalls', 'bCheckPenaltiesOff', 'injuries', 'shootoutInjuries', 'fourthPeriodOvertime',
  'stamina', 'energyDrain', 'energyRecovery', 'noSkatingDrain', 'burstEnergy', 'hitEnergy', 'injuryBonus', 'injuryCap', 'holdEnergy',
  'goalieHold', 'goalieWidth', 'goalieOut', 'goalieLine', 'goalieDelay', 'speedBurst', 'turnRate', 'puckFriction', 'choppyIce', 'giveaways', 'timeOnIce',
]
export const NO_NHL95_HACKS: Nhl95HackChoices = {
  fighting: false,
  fightingOff: false,
  fightingArcade: false,
  secondAssist: false,
  oneTimerAssist: false,
  regainAssist: false,
  aggressionFix: false,
  comebackFix: false,
  rocketFix: false,
  openNetFix: false,
  blindRingFix: false,
  seasonOvertime: false,
  seasonShootout: false,
  seasonShootoutNow: false,
  nhlShootout: false,
  threeOnThree: false,
  threeOnThreeAll: false,
  runawayFix: false,
  goaliePullFix: false,
  snipingFix: false,
  penaltyShotTableFix: false,
  penaltyShotFixes: false,
  organResume: false,
  passFix: false,
  ppPkFix: false,
  faceoffFix: false,
  awarenessFix: false,
  stickShots: false,
  anyPosition: false,
  threeStars: 'original',
  bodychecks: 'off',
  timeOnIce: false,
  giveaways: false,
  realTime: false,
  penaltySeconds: 60,
  fightSeconds: 0,
  noIcing: false,
  hybridIcing: false,
  delayedCalls: false,
  bCheckPenaltiesOff: 'original',
  injuries: 'original',
  shootoutInjuries: false,
  fourthPeriodOvertime: 0,
  stamina: false,
  energyDrain: 33,
  energyRecovery: 9,
  noSkatingDrain: false,
  burstEnergy: 204,
  hitEnergy: 0,
  holdEnergy: 0,
  injuryBonus: 0,
  injuryCap: 10,
  goalieHold: 140,
  goalieWidth: 36,
  goalieOut: 231,
  goalieLine: 170,
  goalieDelay: 17,
  speedBurst: 0,
  turnRate: 150,
  // The puck's own: NHL '95 takes 1/128 of its speed a frame, where NHL 94 takes 1/512 from the puck and gliding skaters alike.
  puckFriction: 7,
  choppyIce: false,
}
// The numbers, each from the least to the most it can be: NHL 94's ranges.
export type Nhl95NumberHack = { [K in Nhl95Hack]: Nhl95HackChoices[K] extends number ? K : never }[Nhl95Hack]
const NUMBER_HACKS = NHL95_HACKS.filter((hack): hack is Nhl95NumberHack => typeof NO_NHL95_HACKS[hack] === 'number')
export const NHL95_HACK_RANGES = Object.fromEntries(NUMBER_HACKS.map((hack) => [hack, HACK_RANGES[hack]])) as Record<Nhl95NumberHack, [number, number]>
// The choices of a few ways, in the words of their menus (NHL 94's).
export const NHL95_HACK_CHOICES = {
  threeStars: { original: "The original game's", linesOff: 'Improved, for line changes off', linesOn: 'Improved, for line changes on' },
  bodychecks: { off: 'Off', on: 'On' },
  bCheckPenaltiesOff: BCHECK_TEXTS,
  injuries: INJURY_TEXTS,
} satisfies { [K in Nhl95Hack]?: Record<Nhl95HackChoices[K] & string, string> }
export type Nhl95ChoiceHack = keyof typeof NHL95_HACK_CHOICES

export interface Nhl95HackState {
  choices: Nhl95HackChoices
  // Hacks whose code in this ROM is neither the original game's nor the hack's. They are never changed.
  unknown: Nhl95Hack[]
}

// NHL 94's titles where the fix is NHL 94's.
export const NHL95_HACK_TITLES: Record<Nhl95Hack, string> = {
  fighting: 'Fighting',
  fightingOff: 'Fighting starts Off',
  fightingArcade: 'Fighting starts in Arcade Mode',
  secondAssist: 'Second-assist bug fix',
  oneTimerAssist: 'One-timer assist fix',
  regainAssist: 'Regained-puck assist fix',
  aggressionFix: 'Aggression bug fix',
  comebackFix: 'Comeback bonus fix',
  rocketFix: 'Rocket pass fix',
  openNetFix: 'One-timer open net fix',
  blindRingFix: 'Five-hole blind ring fix',
  seasonOvertime: 'Overtime until a goal in the regular season',
  seasonShootout: 'A shootout for tied regular-season games, after overtime',
  seasonShootoutNow: 'A shootout for tied regular-season games, after period 3',
  nhlShootout: 'The NHL shootout: three rounds, then sudden death',
  threeOnThree: '3 on 3 overtime, outside the playoffs',
  threeOnThreeAll: '3 on 3 overtime, playoffs included',
  runawayFix: 'Runaway speed fix',
  goaliePullFix: 'Computer goalie pull fix',
  snipingFix: 'Pulled-goalie sniping fix',
  penaltyShotTableFix: 'Penalty shot table fix',
  penaltyShotFixes: 'Penalty shot fixes',
  organResume: 'Organ music after a pause',
  passFix: 'Pass direction fix',
  ppPkFix: 'Power play and penalty kill fix',
  faceoffFix: 'Faceoff spot fix',
  awarenessFix: "Computer forwards' awareness fix",
  stickShots: 'Count stick deflections as shots',
  anyPosition: 'Any skater at any position',
  threeStars: 'Three stars',
  bodychecks: 'Bodycheck statistics',
  timeOnIce: 'Time on ice in Player Stats',
  giveaways: 'Giveaways and takeaways',
  realTime: 'Real-time clock',
  penaltySeconds: 'Penalty time',
  fightSeconds: 'Fighting penalty time',
  noIcing: 'No icing',
  hybridIcing: 'Hybrid icing',
  delayedCalls: 'Calls during a delayed penalty',
  bCheckPenaltiesOff: 'B-checks with penalties off',
  injuries: 'Injuries',
  shootoutInjuries: 'The injured sit out the shootout',
  fourthPeriodOvertime: 'Extra period length with its own overtime',
  stamina: 'Unlimited stamina',
  energyDrain: 'Energy lost on the ice',
  energyRecovery: 'Energy gained on the bench',
  noSkatingDrain: 'Skating costs no energy',
  burstEnergy: 'Energy a C-button burst costs',
  hitEnergy: 'Energy lost when knocked down',
  holdEnergy: 'Energy lost when held or hooked',
  injuryBonus: 'Injury risk added by each knockdown',
  injuryCap: 'Most injury risk knockdowns can add',
  goalieHold: 'Goalie hold time',
  goalieWidth: 'Goalie range to each side',
  goalieOut: 'Goalie range up the ice',
  goalieLine: 'Goalie whistle line',
  goalieDelay: 'Goalie control delay',
  speedBurst: 'Speed burst',
  turnRate: 'Stopping and turning',
  puckFriction: 'Puck friction',
  choppyIce: 'Choppy ice',
}

const hex =(text: string) => Uint8Array.from(text.replace(/\s/g, '').match(/../g)!.map((pair) => parseInt(pair, 16)))

// ------------------------------------------------------------ assist fixes
// a2touchpuck ($8142C) and onetimershot are NHL 94's instruction for
// instruction, with the team struct's last-touch list at the same offsets, so
// they have the same three assist bugs (the NHL94 Match Viewer project found
// them in NHL '95's code), and NHL 94's fixes (hacks.ts) go in as they are:
// a2touchpuck's move.w tmtouch2(a0),tmtouch3(a0) at $81476 and onetimershot's
// at $82F28; its cmp.w tmtouch1(a0),d0 / beq.w .same at $81464, .same at
// $81492. The WN95HL's ROMs have them at the same places. Each is changed
// only where its bytes are the original game's or the fix's.
//
// Their code goes after the ROM's last used byte, or where something else is
// at the very end, as the WN95HL's ROMs keep tiles and text there, at the start
// of the long run of unused bytes before it (claimBeforeTail).
function placeCode(work: { rom: Uint8Array }, code: Uint8Array): number {
  // work.rom is the hacks' own copy of the ROM, so room is claimed in it rather than in another copy.
  const claimed = claimSpace95(work.rom, code.length, true, true, true)
  if (!claimed) throw new Nhl95HackError(`There is no room left in this ROM for the code this needs.${fullRomReason(work.rom)}`)
  work.rom = claimed.rom
  work.rom.set(code, claimed.at)
  return claimed.at
}
// A part made the first time it is wanted (the constants it uses come later in the file), then kept: the parts
// hold nothing of a ROM, so one does for every ROM.
const once = <T>(make: () => T): (() => T) => {
  let made: T | undefined
  return () => (made ??= make())
}
const assist = assistFixes({ assist: [0x81476, 0x82f28], regain: 0x81464, regainSame: 0x81492 }, placeCode)
const rocket = once(() => hookedFix(ROCKET_HOOK, ROCKET_CODE, ROCKET_EDITS, placeCode))
const ring = once(() => hookedFix(RING_HOOK, RING_CODE_95, RING_EDITS, placeCode))
const ringState = (rom: Uint8Array) => (RING_AROUND.every((around) => matches(rom, around.at, around.bytes)) ? ring().detect(rom) : undefined)

// ------------------------------------------ fixes of one or two instructions
// NHL 94's (hacks.ts), where NHL '95's code is the same instruction for
// instruction, with what follows it, in the original game and the WN95HL's
// ROMs:
// - Aggression (setplayer, $83C7C): move.b d3,aggress(a3) / andi.b #$F,aggress(a3)
//   keeps the last four bits of a 0-30 rating, so it wraps; the fix calls
//   ClampNibble, just after it as in NHL 94 (so the same bsr.w +$A), halves it
//   and stores it.
// - The comeback bonus (setplayer, $83A2C): the test of the clock against half
//   the period is bgt where it should be blt.
// - A one-timer at an open net (shotdiradj, $84ED2): the clr.w d0 that aims it
//   just under the crossbar becomes moveq #8,d0, the aim with no goalie.
const SWITCHES: Partial<Record<Nhl95Hack, { at: number; original: Uint8Array; hacked: Uint8Array }>> = {
  aggressionFix: { at: 0x83c7c, original: hex('1743 0073 022B 000F 0073'), hacked: hex('6100 000A E20B 1743 0073') },
  comebackFix: { at: 0x83a2c, original: hex('6E00 0026'), hacked: hex('6D00 0026') },
  openNetFix: { at: 0x84ed2, original: hex('4240 B87C 002C'), hacked: hex('7008 B87C 002C') },
  // NHL 94's fixes at NHL '95's places (the same code there):
  // - CPgoalie ($83662) pulls a computer goalie in the last minute only when
  //   exactly two behind (bmi / cmp #2 / bne at $83674); ble / bgt pulls him
  //   one or two behind, as NHL 94's fix does.
  goaliePullFix: { at: 0x83674, original: hex('6B00 E3E6 B07C 0002 6600 E3DE'), hacked: hex('6F00 E3E6 B07C 0002 6E00 E3DE') },
  // - doshot: within range, a shot by a team whose goalie is off the ice goes
  //   exactly where aimed (jsr ReadGoaliePulled / bmi.w .perf at $84CCC); the
  //   bmi becomes NOPs, so it takes the accuracy roll as any other shot.
  snipingFix: { at: 0x84ccc, original: hex('6B00 008C'), hacked: hex('4E71 4E71') },
  // - PenShotPenalties ($89FFC), the penalty shot for each foul, read by
  //   PenShotChk with (a0,d0.w) one place too far along: words 10 to 17 move
  //   along one, as in NHL 94, so each foul gives its own.
  penaltyShotTableFix: { at: 0x8a010, original: hex('0038 003C 0036 003A 002E 0030 0034 FFFF'), hacked: hex('FFFF 0038 003C 0036 003A 002E 0030 0034') },
  // - setplayer ($839D8): a team's power play and penalty kill bonuses (PPBonus $CAF0, PKBonus $CAF1) are read from
  //   the wrong halves of its byte 1, as in NHL 94; NHL 94's change in the same room, with NHL '95's addresses.
  ppPkFix: {
    at: 0x839d8,
    original: hex('11E8 0001 CAF0 0238 000F CAF0 6000 000E 1028 0001 E808 4400 11C0 CAF1'),
    hacked: hex('1028 0001 E808 11C0 CAF0 4E71 6000 000E 700F C028 0001 4400 11C0 CAF1'),
  },
  // - SelectLinePlayer ($952F8), Edit Lines' list for a slot: bgt.w .n / add.w d0,d1 at $95312 lists only forwards for
  //   a forward slot and only defencemen for a defence one, as NHL 94's ($83A4). NOPs list every skater for each.
  //   NHL '95 saves a line's raw player bytes (SaveTeamLines $95A90), so unlike NHL 94 nothing else is needed: a
  //   defenceman saved at forward loads as himself.
  anyPosition: { at: 0x95312, original: hex('6E00 000C D240'), hacked: hex('4E71 4E71 4E71') },
}
// What must come before and after each, as NHL '95 has it, for it to be the place.
const AROUND: Partial<Record<Nhl95Hack, { at: number; bytes: Uint8Array }[]>> = {
  aggressionFix: [
    { at: 0x83c76, bytes: hex('4EB9 0008 3CDE') }, // jsr AttributeCalc
    { at: 0x83c86, bytes: hex('4E75 4A03 6A00 0004 4243 B63C 001E') },
  ],
  comebackFix: [{ at: 0x83a20, bytes: hex('4EB9 0007 D4CA E248 B078 C022') }],
  openNetFix: [{ at: 0x84ecc, bytes: hex('6100 004C D845') }],
  goaliePullFix: [
    { at: 0x8366c, bytes: hex('3029 000C 906A 000C') }, // move.w tmscore(a1),d0 / sub.w tmscore(a2),d0
    { at: 0x83680, bytes: hex('0C78 003C C022') },
  ],
  snipingFix: [
    { at: 0x84cc6, bytes: hex('4EB9 0007 CB0A') }, // jsr ReadGoaliePulled
    { at: 0x84cd0, bytes: hex('0838 0000 BF00') },
  ],
  penaltyShotTableFix: [{ at: 0x9ef02, bytes: hex('207C 0008 9FFC') }], // PenShotChk's movea.l #PenShotPenalties,a0
  ppPkFix: [
    { at: 0x839ce, bytes: hex('4EB9 0007 D894 6700 0012') }, // jsr chkpk2 / beq.w .pk
    { at: 0x839f4, bytes: hex('1028 0002 0200 000F') }, // d0 loaded afresh after either
  ],
  anyPosition: [
    { at: 0x9530a, bytes: hex('0242 0007 B47C 0002') }, // andi.w #7,d2 / cmp.w #2,d2
    { at: 0x95318, bytes: hex('4EB9 0008 38F2') }, // jsr GetPlayerCount
  ],
}

// ------------------------------------------------- computer forwards' awareness
// NHL 94's (hacks.ts, awarenessFix): asswingo ($80C2C) and asscentero ($80F34), what computer wingers and centres do
// on offence, reload at intervals from aidef ($6B), Defensive Awareness, where the others on offence use aioff ($6A).
// The operand's low byte becomes $6A at each.
const AWARE_PLACES = [
  { at: 0x80c2f, around: [{ at: 0x80c24, bytes: hex('9F2B 0040 6A00 010E 176B 00') }, { at: 0x80c30, bytes: hex('0040 0838 0006 BF02') }] },
  { at: 0x80f37, around: [{ at: 0x80f2c, bytes: hex('9F2B 0040 6A00 00D6 176B 00') }, { at: 0x80f38, bytes: hex('0040 0838 0006 BF02') }] },
]
function awareState(rom: Uint8Array): boolean | undefined {
  if (!AWARE_PLACES.every((place) => place.around.every((around) => matches(rom, around.at, around.bytes)))) return undefined
  const bytes = AWARE_PLACES.map((place) => rom[place.at])
  if (bytes.every((byte) => byte === 0x6b)) return false
  return bytes.every((byte) => byte === 0x6a) ? true : undefined
}
const setAware = (rom: Uint8Array, on: boolean) => AWARE_PLACES.forEach((place) => (rom[place.at] = on ? 0x6a : 0x6b))

// ------------------------------------------------------------ faceoff spot
// NHL 94's (hacks.ts, faceoffFix). Stop4Pen ($8901C) puts a faceoff on a dot only when play stopped past the hash
// marks (y beyond +-$AF), else where the puck was. Its 86 bytes from movem.w d0-d1,-(sp) at $8907A to addq.w #4,sp
// become a call to NHL 94's code with NHL '95's rink and addresses: PenBuf $BFCE, SortCords $AC62, fox/foy
// $BB9A/$BB9C, end dots at x +-$4D, y +-$D7, blue lines at y +-$56; and the neutral-zone dots at x +-$53 (83), y +-$41,
// where NHL '95 draws them (Match Viewer measured them; NHL 94 uses one x for both). The original drops a neutral-zone
// faceoff at x +-70, about 13 pixels inside the drawn dot, as its limitfo ($88F06) does for one moved out of an end:
// with the fix limitfo's x ($88F5C, move.w #$46,d0) is 83 too.
const FACEOFF_HOOK = {
  at: 0x8907a,
  original: hex(
    '48A7 C000 B07C 004D 6D00 0006 303C 004D B07C FFB3 6E00 0006 303C FFB3 B27C 00AF 6D00 0012 323C 00D7 303C 004D 4A57 6A00 0004 4440 B27C FF51 6E00 0012 323C FF29 303C 004D 4A57 6A00 0004 4440 31C0 BB9A 31C1 BB9C 584F',
  ),
}
const FACEOFF_CODE = hex(
  '2F09 327CBFCE 4A51 6740 4A59 66FC 5949 0C11000E 676C 0C110012 652E 0C11002B 6428 0C110014 6722 4241 12290001 0241007F EF41 327CAC62 083100071062 6606 323C00D7 6004 323CFF29 4A40 6B04 704D 6002 70B3 B27C0056 6E1C B27CFFAA 6D1C 4A40 6B04 7053 6002 70AD 4A41 6B04 7241 6014 72BF 6010 323C00D7 600A 323CFF29 6004 7000 7200 31C0BB9A 31C1BB9C 225F 4E75',
)
const FACEOFF_AROUND = [
  { at: 0x8901c, bytes: hex('08F8 0000 BEF0 6600 00B2') }, // Stop4Pen
  { at: 0x890d0, bytes: hex('4EB9 0008 8F06') }, // jsr limitfo
  { at: 0x88f56, bytes: hex('31FC 0041 BB9C') }, // limitfo's move.w #$41,(foy).w, before its x
]
const FACEOFF_EDITS = [{ at: 0x88f5c, original: hex('303C 0046'), hacked: hex('303C 0053') }]
const faceoff = once(() => hookedFix(FACEOFF_HOOK, FACEOFF_CODE, FACEOFF_EDITS, placeCode))
const faceoffState = (rom: Uint8Array) => (FACEOFF_AROUND.every((around) => matches(rom, around.at, around.bytes)) ? faceoff().detect(rom) : undefined)

// ------------------------------------------------- stick deflections as shots
// NHL 94's (hacks.ts, stickShots). puckstick's .stdef ($7BA02: jsr a2touchpuck / bra.w deflect) counts no shot when
// a shot comes off the goalie's stick. NHL 94's code, with NHL '95's gmode $BEF0, sflags2 $BEF4, shotplayer $BAD6,
// ChkShotStat's .addShot $8AC7A, a2touchpuck $8142C and deflect $7BD4C.
const STICK_HOOK = { at: 0x7ba02, original: hex('4EB9 0008 142C 6000 0342') }
const STICK_CODE = hex(
  '4A6A 0034 662A 0838 0000 BEF0 6622 0838 0004 BEF0 661A 08B8 0004 BEF4 6712 487A 0010 48E7 C070 3038 BAD6 4EF9 0008 AC7A 4EB9 0008 142C 588F 4EF9 0007 BD4C',
)
const STICK_AROUND = [
  { at: 0x7b9f8, bytes: hex('3F3C 0006 4EB9 0006 77AC') }, // move.w #SFXstdef,-(sp) / jsr sfx
  { at: 0x8ac66, bytes: hex('48E7 C070 0678 0064 B4B4 0678 000A B4BA 3038 BAD6') }, // ChkShotStat, before .addShot
]
const stick = once(() => hookedFix(STICK_HOOK, STICK_CODE, [], placeCode))
const stickState = (rom: Uint8Array) => (STICK_AROUND.every((around) => matches(rom, around.at, around.bytes)) ? stick().detect(rom) : undefined)

function switchState(rom: Uint8Array, hack: Nhl95Hack): boolean | undefined {
  const place = SWITCHES[hack]!
  if (!(AROUND[hack] ?? []).every((around) => matches(rom, around.at, around.bytes))) return undefined
  if (matches(rom, place.at, place.hacked)) return true
  return matches(rom, place.at, place.original) ? false : undefined
}

// ---------------------------------------------------- five-hole blind ring
// NHL 94's (hacks.ts, the blind ring). checkpuckcoll hands a low loose puck in
// a goalie's stick box to puckstick and skips the body test (bsr.w puckstick /
// bra.w .exit at $7B6B8), but puckstick takes it for a goalie only within 8
// units of his blade (cmp.l #$40,d0), so between nothing touches the puck.
// NHL '95's box is a square of +-14 ($E; goalies are never in a one-timer),
// and its distance test compares with the address of ChkStickSqP, not its
// value ($FFFFDC76 at $7B6A2), so always passes: the dead area runs from 8
// units straight out to about 20 at the box's corners, where NHL 94's ring was
// 8 to 14 (Match Viewer, from the code). NHL 94's fix sends that case on to
// the body test (.chkbody, then puckgoalie for a goalie) instead; anything
// else calls puckstick as before, the highlights (gmode bit 4) included. Its
// code with NHL '95's puckc ($B3C2), gmode ($BEF0) and puckstick ($7B904),
// the same instructions, so the same branches. d0 is the squared distance
// there, as in NHL 94. The hook: jsr / bne.s .exit ($7B710).
const RING_HOOK = { at: 0x7b6b8, original: hex('6100 024A 6000') }
const RING_EDITS = [{ at: 0x7b6be, original: hex('0052'), hacked: hex('6650') }]
const RING_CODE_95 = hex('4A6A 0034 661C 4A78 B3C2 6A16 0838 0004 BEF0 660E 0C80 0000 0040 6306 003C 0004 4E75 4EB9 0007 B904 023C 00FB 4E75')
// What must be around it for it to be the place: cmp.l d1,d0 / bhi.w .chkbody before, .chkbody's tst.w position(a2) after.
const RING_AROUND = [
  { at: 0x7b6b2, bytes: hex('B081 6200 000A') },
  { at: 0x7b6c0, bytes: hex('4A6A 0034 6700') },
]

// ------------------------------------------ overtime until a goal
// NHL 94's (hacks.ts, seasonTies 'overtime'). A regular-season game is over
// after one overtime in two places: PeriodOver sets gsp to 4, game over, at
// .0 ($8CB9E), and the end of a period (clockcont_0's .10, $8CCDA) sends the
// end of overtime to .eog with beq.s after tst.w (OptPlayMode).w. In NHL '95
// both first let a season's playoff games (GameFlags bit 3 with SeasonDay+1
// bit 5) play on, as the exhibition playoffs (OptPlayMode not 0) do. With
// both gone, a tied regular-season game plays overtime after overtime, each
// ResetClock's overtime for OptPlayMode 0 (10:00 retail, 5:00 in W18), until a
// goal, as the playoffs do. Match Viewer played it on both (a961bb7).
const PERIOD_OVER = { at: 0x8cb9e, original: hex('31FC 0004 C020'), overtime: hex('4E71 4E71 4E71') }
const END_OF_OVERTIME = { at: 0x8ccda, original: hex('67AC'), overtime: hex('4E71') }
// What must be around the places for them to be the original game's (and the WN95HL's).
const TIES_AROUND = [
  // PeriodOver: btst #5,(SeasonDay+1).w; bne.w .1 before .0; .1's tie test after it.
  { at: 0x8cb94, bytes: hex('0838 0005 D1A7 6600 0008') },
  // clockcont_0 .10: tst.w (OptPlayMode).w before; .eop_ex's move.w #PenEOP,d0 after.
  { at: 0x8ccd2, bytes: hex('6600 0008 4A78 CC4C') },
  { at: 0x8ccdc, bytes: hex('303C') },
  // NextShooter: btst #3,(gmode2).w; beq.w .0 before its jmp ExitToOpening.
  { at: 0x9dd3e, bytes: hex('0838 0003 BF00 6700 0008') },
]

// Or a shootout, as NHL 94's (hacks.ts, seasonTies 'shootout' and 'shootoutNow'),
// with NHL '95's addresses. NHL '95's Shootout mode starts one as NHL 94's does
// (gmode2 bit 0, ClearShootout $9DA50, Create_HotCold_Table $83E88 for both
// teams) and ends it the same way (NextShooter's jmp ExitToOpening at
// $9DD48, when CountShootoutGoals has set gmode2 bit 3), so NHL 94's code goes
// in with NHL '95's HmGoals ($C294), AwGoals ($C5FA), gmode2 ($BF00), gmode
// ($BEF0), gsp ($C020), ScoreSumbytes ($C02C), shootout goals ($D180, $D182),
// forceblack ($7A02A) and PeriodOver_sp ($9D18). Both team structs, $366
// each in NHL '95 ($6CC, $1B3 longs), and the scoring summary's length are kept
// while the shootout plays and put back after it, the winners given one goal
// more; NHL 94's copy of its plus-minus hack's log is left out (NHL '95 has no
// such hack). The mark and the kept structs need RAM no game writes: the
// NHL94 Match Viewer project found $FFDC84-$FFFC03 unchanged through whole
// games, shootouts and season screens on the original and W18, and
// $FFF000-$FFF6CF untouched outside the shootout (NHL 94's $FFF082 could not
// be assumed: NHL '95 keeps a copy of its save RAM in main RAM). The fighting
// patch's RAM is at $FFE800-$FFE879.
const SHOOTOUT_MARK = 0xf000
const SHOOTOUT_SAVE = 0xf002
const word = (value: number) => value.toString(16).toUpperCase().padStart(4, '0')
//   move.w (HmGoals).w,d0; cmp.w (AwGoals).w,d0; bne.s .x; btst #0,(gmode2).w; bne.s .x
//   bset #0,(gmode2).w; st (mark).w; movem.l d0-d7/a0-a6,-(sp)
//   lea (tmstruct).w,a0; lea (save).w,a1; move.w #$1B2,d0; .l move.l (a0)+,(a1)+; dbf d0,.l
//   move.w (ScoreSumbytes).w,(a1); bclr #1,(gmode).w; jsr ClearShootout
//   lea (tmstruct).w,a0; jsr Create_HotCold_Table; lea (AwShots).w,a0; jsr Create_HotCold_Table
//   movem.l (sp)+,d0-d7/a0-a6; .x rts
const SHOOTOUT_START_95 = hex(
  `3038 C294 B078 C5FA 6650 0838 0000 BF00 6648 08F8 0000 BF00 50F8 ${word(SHOOTOUT_MARK)} 48E7 FFFE 41F8 C288 43F8 ${word(SHOOTOUT_SAVE)} ` +
    '303C 01B2 22D8 51C8 FFFC 32B8 C02C 08B8 0001 BEF0 4EB9 0009 DA50 41F8 C288 4EB9 0008 3E88 41F8 C5EE 4EB9 0008 3E88 4CDF 7FFF 4E75',
)
//   addq.l #4,sp; tst.b (mark).w; beq.s .title; cmpi.w #3,(gsp).w; beq.s .ours; .title jmp ExitToOpening
//   .ours sf (mark).w; lea (save).w,a0; lea (tmstruct).w,a1; move.w #$1B2,d0; .l move.l (a0)+,(a1)+; dbf d0,.l
//   move.w (a0),(ScoreSumbytes).w; move.w (homeshootgoals).w,d0; cmp.w (awayshootgoals).w,d0; bgt.s .home
//   addq.w #1,(AwGoals).w; bra.s .done; .home addq.w #1,(HmGoals).w
//   .done andi.b #$F4,(gmode2).w; move.w #4,(gsp).w; jsr forceblack; jmp PeriodOver_sp
const SHOOTOUT_END_95 = hex(
  `588F 4A38 ${word(SHOOTOUT_MARK)} 6708 0C78 0003 C020 6706 4EF9 0008 CD02 51F8 ${word(SHOOTOUT_MARK)} 41F8 ${word(SHOOTOUT_SAVE)} 43F8 C288 ` +
    '303C 01B2 22D8 51C8 FFFC 31D0 C02C 3038 D180 B078 D182 6E06 5278 C5FA 6004 5278 C294 0238 00F4 BF00 31FC 0004 C020 4EB9 0007 A02A 4EF9 0000 9D18',
)
const SHOOTOUT_END_AT = 0x9dd48
const SHOOTOUT_END_ORIGINAL = hex('4EF9 0008 CD02')
// The shootout straight after period 3: PeriodOver's tie test (.1, $8CBA4) becomes a call to code that, in a
// regular-season game (OptPlayMode 0, and not a season's playoffs) with period 3 just over (gsp 3), runs the start
// code first, then makes the same test, so the beq after it sees its result.
//   tst.w (OptPlayMode).w; bne.s .t; btst #3,(GameFlags).w; beq.s .r; btst #5,(SeasonDay+1).w; bne.s .t
//   .r cmpi.w #3,(gsp).w; bne.s .t; jsr start; .t move.w (HmGoals).w,d0; sub.w (AwGoals).w,d0; rts
const TIE_TEST_AT = 0x8cba4
const TIE_TEST_ORIGINAL = hex('3038 C294 9078 C5FA')
const nowCode95 = (start: number) =>
  hex(`4A78 CC4C 661E 0838 0003 BF08 6708 0838 0005 D1A7 660E 0C78 0003 C020 6606 4EB9 ${start.toString(16).padStart(8, '0')} 3038 C294 9078 C5FA 4E75`)

type Ties = 'tie' | 'overtime' | 'shootout' | 'shootoutNow'
const read32 = (rom: Uint8Array, at: number) => ((rom[at] << 24) | (rom[at + 1] << 16) | (rom[at + 2] << 8) | rom[at + 3]) >>> 0
// Where a jsr at `at` (then `nops` NOPs) calls, if it calls `code`.
function calls(rom: Uint8Array, at: number, nops: number, code: (target: number) => Uint8Array): number | null {
  if (rom[at] !== 0x4e || rom[at + 1] !== 0xb9) return null
  for (let i = 0; i < nops; i++) if (rom[at + 6 + i * 2] !== 0x4e || rom[at + 7 + i * 2] !== 0x71) return null
  const target = read32(rom, at + 2)
  return target < rom.length && matches(rom, target, code(target)) ? target : null
}
const startAt = (rom: Uint8Array, at: number) => calls(rom, at, 0, () => SHOOTOUT_START_95)
const endAt = (rom: Uint8Array) => calls(rom, SHOOTOUT_END_AT, 0, () => SHOOTOUT_END_95)
// The code the tie test calls for the shootout after period 3, and the start code it calls.
function nowAt(rom: Uint8Array): { now: number; start: number } | null {
  if (rom[TIE_TEST_AT] !== 0x4e || rom[TIE_TEST_AT + 1] !== 0xb9 || rom[TIE_TEST_AT + 6] !== 0x4e || rom[TIE_TEST_AT + 7] !== 0x71) return null
  const now = read32(rom, TIE_TEST_AT + 2)
  if (now + 0x2e > rom.length) return null
  const start = read32(rom, now + 0x20)
  return matches(rom, now, nowCode95(start)) && start < rom.length && matches(rom, start, SHOOTOUT_START_95) ? { now, start } : null
}

function tiesState(rom: Uint8Array): Ties | undefined {
  if (!TIES_AROUND.every((around) => matches(rom, around.at, around.bytes))) return undefined
  const eop = matches(rom, END_OF_OVERTIME.at, END_OF_OVERTIME.original) ? 'original' : matches(rom, END_OF_OVERTIME.at, END_OF_OVERTIME.overtime) ? 'nop' : null
  const po = matches(rom, PERIOD_OVER.at, PERIOD_OVER.original) ? 'original' : matches(rom, PERIOD_OVER.at, PERIOD_OVER.overtime) ? 'nop' : startAt(rom, PERIOD_OVER.at) !== null ? 'start' : null
  const tie = matches(rom, TIE_TEST_AT, TIE_TEST_ORIGINAL) ? 'original' : nowAt(rom) !== null ? 'now' : null
  const end = matches(rom, SHOOTOUT_END_AT, SHOOTOUT_END_ORIGINAL) ? 'original' : endAt(rom) !== null ? 'end' : null
  const is = (e: string, p: string, t: string, n: string) => eop === e && po === p && tie === t && end === n
  if (is('original', 'original', 'original', 'original')) return 'tie'
  if (is('nop', 'nop', 'original', 'original')) return 'overtime'
  if (is('nop', 'start', 'original', 'end')) return 'shootout'
  if (is('original', 'original', 'now', 'end')) return 'shootoutNow'
  return undefined
}

const UNUSED = 0xff
function removeTies(work: { rom: Uint8Array }): void {
  const rom = work.rom
  const now = nowAt(rom)
  if (now !== null) {
    rom.fill(UNUSED, now.now, now.now + 0x2e)
    rom.fill(UNUSED, now.start, now.start + SHOOTOUT_START_95.length)
  }
  const start = startAt(rom, PERIOD_OVER.at)
  if (start !== null) rom.fill(UNUSED, start, start + SHOOTOUT_START_95.length)
  const end = endAt(rom)
  if (end !== null) rom.fill(UNUSED, end, end + SHOOTOUT_END_95.length)
  rom.set(PERIOD_OVER.original, PERIOD_OVER.at)
  rom.set(END_OF_OVERTIME.original, END_OF_OVERTIME.at)
  rom.set(TIE_TEST_ORIGINAL, TIE_TEST_AT)
  rom.set(SHOOTOUT_END_ORIGINAL, SHOOTOUT_END_AT)
}

const jsrTo = (target: number) => hex(`4EB9 ${target.toString(16).padStart(8, '0')}`)
function applyTies(work: { rom: Uint8Array }, value: Ties): void {
  if (value === 'tie') return
  if (value === 'overtime') {
    work.rom.set(PERIOD_OVER.overtime, PERIOD_OVER.at)
    work.rom.set(END_OF_OVERTIME.overtime, END_OF_OVERTIME.at)
    return
  }
  // The code first: placing it can replace work.rom with a larger copy.
  const end = placeCode(work, SHOOTOUT_END_95)
  work.rom.set(jsrTo(end), SHOOTOUT_END_AT)
  const start = placeCode(work, SHOOTOUT_START_95)
  if (value === 'shootout') {
    work.rom.set(END_OF_OVERTIME.overtime, END_OF_OVERTIME.at)
    work.rom.set(jsrTo(start), PERIOD_OVER.at)
    return
  }
  const now = placeCode(work, nowCode95(start))
  work.rom.set(Uint8Array.from([...jsrTo(now), 0x4e, 0x71]), TIE_TEST_AT)
}

// ------------------------------------------------------------ NHL shootout
// NHL 94's (hacks.ts, nhlShootout): three rounds, then sudden death, over as
// soon as one team cannot catch up. CountShootoutGoals ($9DD94) makes NHL 94's
// test after each attempt, 32 bytes at $9DD98, with NHL '95's shootoutteam
// ($D1A0, its low byte $D1A1), shootoutround ($D184) and shootout goals ($D180,
// $D182); then, as in NHL 94, bset #3,(gmode2).w and jsr EndShootout. So NHL
// 94's code goes in with those four addresses, called from the first 6 bytes;
// its beq.w .switch stays, and the rest of the test become NOPs.
const NHL_SO_HOOK = { at: 0x9dd98, original: hex('0838 0000 D1A1') }
const NHL_SO_EDITS = [
  { at: 0x9dd9e, original: hex('6700 0028'), hacked: hex('6700 0028') },
  { at: 0x9dda2, original: hex('0C78 0005 D184 6D00 001E 3038 D180 B078 D182 6700 0012'), hacked: hex('4E71 4E71 4E71 4E71 4E71 4E71 4E71 4E71 4E71 4E71 4E71') },
]
// NHL 94's four addresses in its code, by where each is (the word operand of cmpi.w / move.w / cmp.w / btst), and
// NHL '95's for each: shootoutround, the two teams' shootout goals and shootoutteam's low byte. Each place must hold
// NHL 94's, so that a change to NHL 94's code cannot put an address where one is not.
const NHL_SO_ADDRESSES: [number, number, number][] = [
  [2, 0xd578, 0xd184],
  [10, 0xd574, 0xd180],
  [14, 0xd576, 0xd182],
  [20, 0xd595, 0xd1a1],
]
function nhlSoCode(): Uint8Array {
  const code = NHL_SHOOTOUT_CODE.slice()
  for (const [at, was, now] of NHL_SO_ADDRESSES) {
    if (((code[at] << 8) | code[at + 1]) !== was) throw new Error("NHL 94's shootout code is not as NHL '95's version of it expects.")
    code.set([now >> 8, now & 0xff], at)
  }
  return code
}
const NHL_SO_CODE = nhlSoCode()
// What must follow it: bset #3,(gmode2).w; jsr EndShootout.
const NHL_SO_AFTER = { at: 0x9ddb8, bytes: hex('08F8 0003 BF00 4EB9') }
const nhlSo = once(() => hookedFix(NHL_SO_HOOK, NHL_SO_CODE, NHL_SO_EDITS, placeCode))
const nhlSoState = (rom: Uint8Array) => (matches(rom, NHL_SO_AFTER.at, NHL_SO_AFTER.bytes) ? nhlSo().detect(rom) : undefined)

// ------------------------------------------------------- 3 on 3 overtime
// NHL 94's (hacks.ts, threeOnThree; see its notes for how each part works and
// the three things Match Viewer's tests put right): in overtime each team
// plays its goalie, C, LW and RD, a penalty giving the other team a skater
// more (4 on 3, then 5 on 3), 4 on 4 after a penalty ends to the next
// stoppage, then 3 on 3 again. NHL '95 has the same code at these places (a
// research reading of the NHL95Genesis disassembly, every hook's bytes the
// same in the WN95HL's ROMs), and NHL 94's code goes in with NHL '95's
// addresses: sflags7 $BF02 (bit 1, overtime), gmode2 $BF00, the team structs
// at $C288, $366 each (the home team's tmap from the away struct -$342; tmap
// $C2AC and $C612), the players' tmpdst at $68, the box list at $9C,
// InProgress_ap $89514, priolist $83E16.
// - priolist's three readers: releasepl ($8966A), getlinee ($8A392) and
//   SetPlList ($83790).
// - InProgress's two calls of InProgress_ap at $894C6.
// - The overtime mark, bset #1,sflags7 at $9DCC, the end of PeriodOver_sp
//   just before StartPer (NHL 94's is in StartPer).
// - The faceoff's .apl row at $888E8.
// - GetLowestPen's tmap test at $9F560.
// - setpersonel's second pass at $83754.
// 'Outside the playoffs' tests the play mode, and a season's playoff games as
// NHL '95's own PeriodOver does (GameFlags bit 3 with $D1A7 bit 5).
const OT3_PRIO_HOOKS = [0x8966a, 0x8a392, 0x83790].map((at) => ({ at, original: hex('207C 0008 3E16') }))
const OT3_RECOUNT_HOOK = { at: 0x894c6, original: hex('347C C288 6100 0048 D4FC 0366 6100 0040') }
const OT3_START_HOOK = { at: 0x9dcc, original: hex('08F8 0001 BF02') }
const OT3_FACEOFF_HOOK = { at: 0x888e8, original: hex('4444 5C44 E744') }
const OT3_BOX_HOOK = { at: 0x9f560, original: hex('0C6B 0006 0024') }
const OT3_PERS_HOOK = { at: 0x83754, original: hex('D6FC 0080 4A2B 0061 5BCB FFF6 6A00 0004 304B 4A6B 0034 5ACB FFE8') }
const OT3_PRIO_ALL = hex('207C 0008 3E16 0838 0001 BF02 670C 0838 0000 BF00 6604 41FA 0004 4E75 0004 0302 0105 06FF')
const OT3_RECOUNT_ALL = hex('0838 0001 BF02 6700 008A 0838 0000 BF00 6600 0080 48E7 3C00 347C C288 6100 008A 3601 3A04 D4FC 0366 6100 007E 3403 9441 6A02 7400 5842 7006 9044 0C40 0003 6C02 7003 B440 6F02 3400 3542 0024 3401 9443 6A02 7400 5842 7006 9045 0C40 0003 6C02 7003 B440 6F02 3400 3542 FCBE 302A 0024 322A FCBE 3401 5442 B042 6F04 3542 0024 3400 5442 B242 6F04 3542 FCBE 4CDF 003C 4E75 347C C288 4EB9 0008 9514 D4FC 0366 4EB9 0008 9514 4E75 7200 7800 7032 4A72 0068 6F20 5244 08B2 0005 0068 0832 0006 0068 6610 0832 0004 0068 6608 0C41 0002 6702 5241 5540 6AD6 4E75')
const OT3_START_ALL = hex('08F8 0001 BF02 0838 0000 BF00 6600 0080 48E7 3C00 347C C288 6100 0082 3601 3A04 D4FC 0366 6100 0076 3403 9441 6A02 7400 5842 7006 9044 0C40 0003 6C02 7003 B440 6F02 3400 3542 0024 3401 9443 6A02 7400 5842 7006 9045 0C40 0003 6C02 7003 B440 6F02 3400 3542 FCBE 302A 0024 322A FCBE 3401 5442 B042 6F04 3542 0024 3400 5442 B242 6F04 3542 FCBE 4CDF 003C 4E75 31FC 0006 C2AC 31FC 0006 C612 4E75 7200 7800 7032 4A72 0068 6F20 5244 08B2 0005 0068 0832 0006 0068 6610 0832 0004 0068 6608 0C41 0002 6702 5241 5540 6AD6 4E75')
const OT3_FACEOFF_ALL = hex('0838 0001 BF02 670C 0838 0000 BF00 6604 7800 4E75 4444 5C44 E744 4E75')
const OT3_BOX_ALL = hex('0838 0001 BF02 6722 0838 0000 BF00 661A 41EB 009C 4242 1418 6B0C 0833 0006 2068 66F4 7401 4E75 4242 4E75 0C6B 0006 0024 4E75')
const OT3_PERS_ALL = hex('0838 0001 BF02 6748 0838 0000 BF00 6640 48E7 C040 91C8 7005 224B D2FC 0080 4A29 0061 6A18 7200 1229 0066 6B08 D241 4A72 1068 6E08 2049 4A69 0034 6A0E 51C8 FFDC 2008 6606 4CDF 0203 6006 4CDF 0203 4E75 D6FC 0080 4A2B 0061 5BCB FFF6 6A00 0004 304B 4A6B 0034 5ACB FFE8 4E75')
const OT3_PRIO_SEASON = hex('207C 0008 3E16 0838 0001 BF02 6722 0838 0000 BF00 661A 4A78 CC4C 6614 0838 0003 BF08 6708 0838 0005 D1A7 6604 41FA 0004 4E75 0004 0302 0105 06FF')
const OT3_RECOUNT_SEASON = hex('0838 0001 BF02 6700 00A4 0838 0000 BF00 6600 009A 4A78 CC4C 6600 0092 0838 0003 BF08 670A 0838 0005 D1A7 6600 0080 48E7 3C00 347C C288 6100 008A 3601 3A04 D4FC 0366 6100 007E 3403 9441 6A02 7400 5842 7006 9044 0C40 0003 6C02 7003 B440 6F02 3400 3542 0024 3401 9443 6A02 7400 5842 7006 9045 0C40 0003 6C02 7003 B440 6F02 3400 3542 FCBE 302A 0024 322A FCBE 3401 5442 B042 6F04 3542 0024 3400 5442 B242 6F04 3542 FCBE 4CDF 003C 4E75 347C C288 4EB9 0008 9514 D4FC 0366 4EB9 0008 9514 4E75 7200 7800 7032 4A72 0068 6F20 5244 08B2 0005 0068 0832 0006 0068 6610 0832 0004 0068 6608 0C41 0002 6702 5241 5540 6AD6 4E75')
const OT3_START_SEASON = hex('08F8 0001 BF02 0838 0000 BF00 6600 009A 4A78 CC4C 6600 009E 0838 0003 BF08 670A 0838 0005 D1A7 6600 008C 48E7 3C00 347C C288 6100 0082 3601 3A04 D4FC 0366 6100 0076 3403 9441 6A02 7400 5842 7006 9044 0C40 0003 6C02 7003 B440 6F02 3400 3542 0024 3401 9443 6A02 7400 5842 7006 9045 0C40 0003 6C02 7003 B440 6F02 3400 3542 FCBE 302A 0024 322A FCBE 3401 5442 B042 6F04 3542 0024 3400 5442 B242 6F04 3542 FCBE 4CDF 003C 4E75 31FC 0006 C2AC 31FC 0006 C612 4E75 7200 7800 7032 4A72 0068 6F20 5244 08B2 0005 0068 0832 0006 0068 6610 0832 0004 0068 6608 0C41 0002 6702 5241 5540 6AD6 4E75')
const OT3_FACEOFF_SEASON = hex('0838 0001 BF02 6722 0838 0000 BF00 661A 4A78 CC4C 6614 0838 0003 BF08 6708 0838 0005 D1A7 6604 7800 4E75 4444 5C44 E744 4E75')
const OT3_BOX_SEASON = hex('0838 0001 BF02 6738 0838 0000 BF00 6630 4A78 CC4C 662A 0838 0003 BF08 6708 0838 0005 D1A7 661A 41EB 009C 4242 1418 6B0C 0833 0006 2068 66F4 7401 4E75 4242 4E75 0C6B 0006 0024 4E75')
const OT3_PERS_SEASON = hex('0838 0001 BF02 675E 0838 0000 BF00 6656 4A78 CC4C 6650 0838 0003 BF08 6708 0838 0005 D1A7 6640 48E7 C040 91C8 7005 224B D2FC 0080 4A29 0061 6A18 7200 1229 0066 6B08 D241 4A72 1068 6E08 2049 4A69 0034 6A0E 51C8 FFDC 2008 6606 4CDF 0203 6006 4CDF 0203 4E75 D6FC 0080 4A2B 0061 5BCB FFF6 6A00 0004 304B 4A6B 0034 5ACB FFE8 4E75')

type Ot3 = 'off' | 'season' | 'all'
const makeOt3Parts = (choice: Exclude<Ot3, 'off'>) => {
  const all = choice === 'all'
  return [
    ...OT3_PRIO_HOOKS.map((hook) => hookedFix(hook, all ? OT3_PRIO_ALL : OT3_PRIO_SEASON, [], placeCode)),
    hookedFix(OT3_RECOUNT_HOOK, all ? OT3_RECOUNT_ALL : OT3_RECOUNT_SEASON, [], placeCode),
    hookedFix(OT3_START_HOOK, all ? OT3_START_ALL : OT3_START_SEASON, [], placeCode),
    hookedFix(OT3_FACEOFF_HOOK, all ? OT3_FACEOFF_ALL : OT3_FACEOFF_SEASON, [], placeCode),
    hookedFix(OT3_BOX_HOOK, all ? OT3_BOX_ALL : OT3_BOX_SEASON, [], placeCode),
    hookedFix(OT3_PERS_HOOK, all ? OT3_PERS_ALL : OT3_PERS_SEASON, [], placeCode),
  ]
}
const ot3Season = once(() => makeOt3Parts('season'))
const ot3All = once(() => makeOt3Parts('all'))
const ot3Parts = (choice: Exclude<Ot3, 'off'>) => (choice === 'all' ? ot3All() : ot3Season())

function ot3State(rom: Uint8Array): Ot3 | undefined {
  if (ot3Parts('all').every((part) => part.detect(rom) === false)) return 'off'
  for (const choice of ['season', 'all'] as const) if (ot3Parts(choice).every((part) => part.detect(rom) === true)) return choice
  return undefined
}

function removeOt3(rom: Uint8Array) {
  for (const choice of ['season', 'all'] as const) for (const part of ot3Parts(choice)) part.remove(rom)
}

function applyOt3(work: { rom: Uint8Array }, choice: Ot3) {
  if (choice !== 'off') for (const part of ot3Parts(choice)) part.apply(work, true)
}

// ------------------------------------------------------- runaway speed fix
// NHL 94's (hacks.ts, runawayFix). pfdoff (pflags bit 0) makes a skater slow
// far less each frame, for a computer skater gliding onto a pass, a one-timer,
// and a skater knocked into the boards; three ways leave it on. At NHL '95's
// places, the same code:
// - asspassrec's branch for a person's skater (bne.w at $81972) goes to .exit
//   ($81A3C: bclr #pfdoff, then assexit) rather than past it.
// - The end of a fall clears pf3fall (pflags3 bit 5) at three places in NHL
//   '95 ($A5C6, $A5F2, $A60E; NHL 94 has one); each also clears pfdoff where
//   pf3fall was set.
// - EndOneTimer clears pf3onetimer at $82F64; it also clears pfdoff.
// NHL '95's speed burst already clears pfdoff (NHL 94's does not), so bursts
// do not stack there, but the glide is still left on.
const RUNAWAY_FALL_HOOKS = [0xa5c6, 0xa5f2, 0xa60e].map((at) => ({ at, original: hex('08AB 0005 0064') }))
const RUNAWAY_FALL_CODE = hex('08AB 0005 0064 6706 08AB 0000 0062 4E75')
const RUNAWAY_ONETIMER_HOOK = { at: 0x82f64, original: hex('08AB 0003 0064') }
const RUNAWAY_ONETIMER_CODE = hex('08AB 0003 0064 08AB 0000 0062 4E75')
const RUNAWAY_EDITS = [{ at: 0x81974, original: hex('FBEA'), hacked: hex('00C8') }]
// What must be around: btst #pfjoycon / bne.w before the branch, and .exit where it is to go.
const RUNAWAY_AROUND = [
  { at: 0x8196c, bytes: hex('082B 0003 0062 6600') },
  { at: 0x81a3c, bytes: hex('08AB 0000 0062 4EF9 0008 155E') },
]
const runawayParts = once(() => [
  ...RUNAWAY_FALL_HOOKS.map((hook) => hookedFix(hook, RUNAWAY_FALL_CODE, [], placeCode)),
  hookedFix(RUNAWAY_ONETIMER_HOOK, RUNAWAY_ONETIMER_CODE, RUNAWAY_EDITS, placeCode),
])
function runawayState(rom: Uint8Array): boolean | undefined {
  if (!RUNAWAY_AROUND.every((around) => matches(rom, around.at, around.bytes))) return undefined
  const states = runawayParts().map((part) => part.detect(rom))
  if (states.every((state) => state === false)) return false
  return states.every((state) => state === true) ? true : undefined
}

// ---------------------------------------------------- penalty shot fixes
// NHL 94's two (hacks.ts, penaltyShotFixes), at NHL '95's places, the same code:
// - The repeated penalty shot: puckshootout's .initflags ($9E64E) clears
//   BA_PS_flags ($BEF8) bits 2, 4, 5 and 6 but not 3, the penalty shot's own,
//   so a whistle that is not one of its endings sends the game back to it.
//   andi.b #$83 clears bits 2 to 6, then NOPs.
// - The ghost puck: a puck that went out of play keeps pfnc (pflags bit 2,
//   $B3C4) into the penalty shot. SetupPenaltyShot ($9ED4E) clears it, after
//   its movea.w tmsort(a2),a3 / moveq #5,d4 at $9ED52.
const PS_HOOK = { at: 0x9ed52, original: hex('366A 0022 7805') }
const PS_CODE = hex('366A 0022 7805 08B8 0002 B3C4 4E75')
const PS_EDITS = [
  {
    at: 0x9e64e,
    original: hex('08B8 0002 BEF8 08B8 0004 BEF8 08B8 0005 BEF8 08B8 0006 BEF8'),
    hacked: hex('0238 0083 BEF8 4E71 4E71 4E71 4E71 4E71 4E71 4E71 4E71 4E71'),
  },
]
const psFixes = once(() => hookedFix(PS_HOOK, PS_CODE, PS_EDITS, placeCode))

// --------------------------------------------------- organ after a pause
// NHL 94's option (hacks.ts, organResume), made for NHL '95's own sound
// driver (sound95.asm), which sequences songs on the 68000 in eight slots
// (SndSeqPtr $FFFDFE, SndSeqPos $FFFE1E, SndSeqId $FFFE3E, SndSeqWait
// $FFFE4E, SndSeqTempo $FFFE5E, SndSeqFrac $FFFE6E, SndSeqState $FFFE7E)
// and sends the Z80 each event. The pause (Pausemode, $7E36C) stops every
// song (SoundOff) and at its end reloads the Z80 program, so nothing plays
// on. The organ songs ($32-$55, PlayingSong $FFCFD8) are notes after one or
// two program changes.
// - The pause's btst #0,(sflags).w at $7E38C, the first thing after its
//   vblank wait, calls code that keeps the playing organ song's slot (its
//   pointer, position, wait, tempo, fraction and running status) at $FFF800,
//   22 bytes, where the pause is the player's (sfpz) and plays no music on
//   through it (sflags9 bit 5 clear); then the btst.
// - Its move.w (Vcount).w,(OldVcount).w at $7E4BC, after the fade back in on
//   every way out, calls code that, with the sound driver on ($FFFDFC is
//   $1234), puts the song back in its slot (or the first free one), first
//   sending the Z80 the slot's reset and the song's controllers and program
//   changes up to the kept place, as the reload lost them; then the move.
// The free RAM is in what the NHL94 Match Viewer project found unused
// ($FFDC84-$FFFC03), clear of the fighting patch and the shootouts.
const ORGAN_SAVE_HOOK = { at: 0x7e38c, original: hex('0838 0000 BEF2') }
const ORGAN_RESTORE_HOOK = { at: 0x7e4bc, original: hex('31F8 AC56 AC58') }
const ORGAN_SAVE = hex(
  '40E7 46FC 2700 48E7 E0C0 43F8 F800 32BC FFFF 0838 0000 BEF2 676A 0838 0005 BF06 6662 3238 CFD8 0C41 0032 6D58 0C41 0055 ' +
  '6E52 41F8 FE3E 7007 B258 57C8 FFFC 6644 3341 0002 7207 9240 3001 D040 3400 D442 41F8 FE3E 2370 20C0 0004 0CA9 FFFF FFFF ' +
  '0004 6720 2370 20E0 0008 3370 0010 000C 3370 0020 000E 3370 0030 0010 2370 2040 0012 3281 4CDF 0307 46DF 0838 0000 BEF2 ' +
  '4E75',
)
const ORGAN_RESTORE = hex(
  '48E7 FFF0 43F8 F800 3211 6B00 013A 32BC FFFF 0C78 1234 FDFC 6600 012C 41F8 FE3E 3401 D442 D442 0CB0 FFFF FFFF 20C0 671C ' +
  '7200 7400 0CB0 FFFF FFFF 20C0 670E 5241 5842 0C41 0008 6DEC 6000 00FC 45F8 FDFC 3F12 4252 3801 760C E76C 3004 4840 303C ' +
  '01FF 6100 00EE 2669 0004 2C29 0008 7A00 1A13 E14D 1A2B 0001 DA85 5485 7600 3E3C 0FFF BA86 6C00 0086 4A33 5800 6A04 5285 ' +
  '60F6 5285 4A33 5800 6A06 1633 5800 5285 1003 0200 00F0 0C00 0090 6610 5485 4A33 5800 6A04 5285 60F6 5285 604C 0C00 00B0 ' +
  '6620 0C33 0075 5800 6714 3004 1033 5801 4840 1033 5800 E148 1003 6100 0076 5485 6026 0C00 00C0 6706 0C00 00E0 6614 3004 ' +
  '4840 1033 5800 E148 1003 6100 0056 5285 6006 0C03 00FF 6704 51CF FF78 3002 E248 41F8 FE3E 31A9 0002 0000 21A9 0008 20E0 ' +
  '31A9 000C 0010 31A9 000E 0020 31A9 0010 0030 21A9 0012 2040 21A9 0004 20C0 31E9 0002 CFD8 349F 4CDF 0FFF 31F8 AC56 AC58 ' +
  '4E75 48E7 6000 2200 343C 7FFF 2001 4EB9 0000 B4DC 4A40 57CA FFF4 4CDF 0006 4E75',
)
// What must be as NHL '95 has it: the wait and SoundOff's call before the first, the fade wait before and the
// pause's end after the second, and SndPutZ80Cmd, which the code calls.
const ORGAN_AROUND = [
  { at: 0x7e3a0, bytes: hex('4EB9') },
  { at: 0x7e4b6, bytes: hex('4A78 B940 6AFA') },
  { at: 0x7e4c2, bytes: hex('31DF AC16 4E75') },
  { at: 0xb4dc, bytes: hex('48E7 4080') },
]
const organSave = once(() => hookedFix(ORGAN_SAVE_HOOK, ORGAN_SAVE, [], placeCode))
const organRestore = once(() => hookedFix(ORGAN_RESTORE_HOOK, ORGAN_RESTORE, [], placeCode))
function organState(rom: Uint8Array): boolean | undefined {
  if (!ORGAN_AROUND.every((around) => matches(rom, around.at, around.bytes))) return undefined
  const [save, restore] = [organSave().detect(rom), organRestore().detect(rom)]
  if (save === false && restore === false) return false
  return save === true && restore === true ? true : undefined
}

// ------------------------------------------------------- rocket pass fix
// passtoa0 ($847BA here; input95.asm) works out when a pass meets its
// receiver in whole eighths of a second, rounding toward zero, as NHL 94's
// does, so it has NHL 94's rocket pass (hacks.ts, the rocket pass fix). NHL
// '95 adds one thing after the time is found: with GameFlags ($BF08) bit 1 set
// (the slow, flat pass) the time is four times as long, and a lift of 12 or
// more is cleared. NHL 94's fix, Match Viewer's, goes in as it is up to the
// lift ($00-$47 of its code, which works the time out in 64ths of a second);
// the end is NHL '95's, the same steps on the 64ths: four times as long with
// the flag, the lift in whole eighths (12 at most, cleared with the flag), at
// NHL '95's puckvz ($B38E). Then the receiver's wait. It is a signed byte,
// which asspassrec counts down with bpl, so a wait over 127 is taken as over
// already and the receiver goes back to his own play. The original's wait
// passes 127 only on passes over about 2.3 s; with the slow pass's four times
// and the exact time, from about half a second. Match Viewer played three
// ways: with no cap fewer slow passes were caught (original game 64 against 75,
// WN95HL 88 against 91); capped at 127 the original game caught 100, but the
// WN95HL's ROM 77, its receivers standing still up to 2.1 s and leaving before
// a slow puck came, where uncapped they gave up and their own play often took
// them to it. So the wait is the original's (the 64ths' whole eighths x 8 - 10,
// four times with the flag) where that is over 127, the receiver giving up as
// in the original, and otherwise the exact one, at most 127. The hook takes the 74 bytes from the time's loop to .5 ($84804);
// after it the wait comes from the code in d0 (.5's move.w d2,d0 / asl.w
// #3,d0 / subi.w #10,d0 become NOPs), the puck's no-touch time is it less 6
// as before, and as in NHL 94 where he will be is / 16 (asr.l #4 for #1) and
// the speed / 15 t (mulu.w #$F, for #$78).
const ROCKET_HOOK = {
  at: 0x847ba,
  original: hex(
    '3400 4440 9444 48C2 85C5 5ACB FFF4 6600 0004 5242 B47C 0018 6300 0004 7418 0838 0001 BF08 6700 0004 E542 11C2 B38E ' +
      'B47C 000C 6D00 0016 11FC 000C B38E 0838 0001 BF08 6700 0006 4278 B38E',
  ),
}
const ROCKET_CODE = Uint8Array.from([
  ...PASS_CODE.subarray(0, 0x48),
  // d1 the time as the original has it, the 64ths' whole eighths; then the slow pass's four times on both.
  ...hex('3202 E649 0838 0001 BF08 6704 E542 E541'),
  // The lift, as NHL '95 makes it.
  ...hex('3002 E648 11C0 B38E B07C 000C 6D12 11FC 000C B38E 0838 0001 BF08 6704 4278 B38E'),
  // $78, where both lift paths end: the wait in d0. The original's (eighths x 8 - 10) where that is over 127,
  // so the receiver gives up as he would there; otherwise the exact one (64ths - 10), at most 127.
  ...hex('E741 0441 000A B27C 007F 6E10 3002 0440 000A B07C 007F 6F02 707F 4E75 3001 4E75'),
])
const ROCKET_EDITS = [
  // The wait is in d0 from the code above.
  { at: 0x84804, original: hex('3002 E740 0440 000A'), hacked: hex('4E71 4E71 4E71 4E71') },
  { at: 0x8481c, original: hex('E280'), hacked: hex('E880') },
  { at: 0x8482c, original: hex('E281'), hacked: hex('E881') },
  { at: 0x8483a, original: hex('C4FC 0078'), hacked: hex('C4FC 000F') },
]

// ------------------------------------------------------------- pass fix
// The NHL94 Match Viewer project's reading of NHL '95's code. vtoa ($7C586)
// turns the pad's direction into one of the eight ways a pass can go. NHL
// '95's version scales one of the two axes differently from NHL 94's
// (lsr.w #1,d0 at $7C5B8), so the eight ways are not split as NHL 94 splits
// them: Match Viewer measured 26 degrees round left and right where NHL 94
// has 63. asl.w #2,d0 in its place gives NHL 94's directions. vtoa has 36
// callers, and the change is to all of them; Match Viewer played it on the
// WN95HL's ROM.

// vtoa, from its movem to the instruction before the one changed: the same in
// the original game and the WN95HL's ROMs.
const VTOA_AT = 0x7c586
const VTOA = hex('48E7 2080 3400 8441 6700 0046 4242 4A40 6A00 0008 4440 08C2 0000 4A41 6A00 0008 4441 08C2 0001 E341 B041 6200 0006 08C2 0002')
const PASS_AT = 0x7c5b8
const ORIGINAL = hex('E248') // lsr.w #1,d0
const FIXED = hex('E548') // asl.w #2,d0
// After it: cmp.w d0,d1 / bhi.w +6 / bset #3,d2.
const AFTER = hex('B240 6200 0006 08C2 0003')

const matches = (rom: Uint8Array, at: number, bytes: Uint8Array) => at + bytes.length <= rom.length && bytes.every((b, i) => rom[at + i] === b)

function passFixState(rom: Uint8Array): boolean | undefined {
  if (!matches(rom, VTOA_AT, VTOA) || !matches(rom, PASS_AT + 2, AFTER)) return undefined
  if (matches(rom, PASS_AT, FIXED)) return true
  return matches(rom, PASS_AT, ORIGINAL) ? false : undefined
}

// ---------------------------------------------------------------- fighting
// Vancecookcobxin's fighting patch (nhl95fightdata.ts, FIGHTING_ROM_PATCH.md): EA's unused
// fight frames brought back with the NHL 2026 - 94 Edition's fight engine, and a
// Fighting row on the Game Setup screen (Off, On, On - Arcade Mode; On at
// power-on), its setting at $FFCC63 and its engine's RAM at $FFE800. Its code
// and tables must be at $1E0000 (its jumps and pointers are to there), free
// in the original game, the 34-team ROM and the WN95HL's. Its thirteen hooks
// are changed only where all are the original game's or all the patch's. The
// Game Setup screen's choice counts and row labels are copied into its tables
// from the ROM's own, as the patch's build does.
const FIGHT_HOOKS = FIGHT95_HOOKS.map((h) => ({ at: h.at, original: hex(h.original), patched: hex(h.patched) }))
const FIGHT_CODE = hex(FIGHT95_BLOCK)
const FIGHT_END = FIGHT95_AT + FIGHT_CODE.length
const SETUP_CHOICES = 0x85eaa
const SETUP_LABELS = 0x86be8
const SETUP_ROWS = 8
const SETUP_LABEL_BYTES = 16

// Match Viewer's fix to the patch: its willingness test builds the opponent's
// hits term in d1 (-2 x his hits) and then calls the routine at $1E04D2 for
// the 8 or 16 by period length, which loads the period length into d1 and so
// overwrites it: on 5- and 10-minute periods no fight could ever start, on
// 20-minute ones hits played no part. That routine uses d2 instead, which
// neither of its callers has live there.
const FIGHT_FIX = [
  { at: 0x1e04d2, original: hex('3238'), fixed: hex('3438') }, // move.w (PeriodLength).w,d1 -> d2
  { at: 0x1e04d6, original: hex('0C41'), fixed: hex('0C42') }, // cmpi.w #$4B0,d1 -> d2
  { at: 0x1e04e0, original: hex('0C41'), fixed: hex('0C42') }, // cmpi.w #$1A4,d1 -> d2
  { at: 0x1e04ea, original: hex('0C41'), fixed: hex('0C42') }, // cmpi.w #$78,d1 -> d2
]

// setup_defaults ($1E0E2E): jsr the game's own defaults, then move.w #1,($FFCC62).w, the Fighting row On at
// power-on. The row's choices are 0 Off, 1 On, 2 On - Arcade Mode; the two start options make it #0 or #2.
const FIGHT_START_AT = 0x1e0e36
type FightStart = 0 | 1 | 2
const FIGHT_STARTS: FightStart[] = [1, 0, 2]

function fightCode(rom: Uint8Array, fixed = true, start: FightStart = 1): Uint8Array {
  const code = FIGHT_CODE.slice()
  code.set(rom.subarray(SETUP_CHOICES, SETUP_CHOICES + SETUP_ROWS), FIGHT95_CHOICES_AT - FIGHT95_AT)
  code.set(rom.subarray(SETUP_LABELS, SETUP_LABELS + SETUP_ROWS * SETUP_LABEL_BYTES), FIGHT95_LABELS_AT - FIGHT95_AT)
  if (fixed) for (const f of FIGHT_FIX) code.set(f.fixed, f.at - FIGHT95_AT)
  code.set([0, start], FIGHT_START_AT - FIGHT95_AT)
  return code
}

const fightHooked = (rom: Uint8Array) => FIGHT_HOOKS.every((h) => matches(rom, h.at, h.patched))

// The patch as it came, without Match Viewer's fix (a ROM made with its own IPS): on, and replaced by the fixed
// one whenever the hacks are applied.
const fightUnfixed = (rom: Uint8Array) => rom.length >= FIGHT_END && fightHooked(rom) && matches(rom, FIGHT95_AT, fightCode(rom, false))

// Fighting: not in the ROM (null), or in it with the Fighting row starting at 0, 1 or 2.
function fightMode(rom: Uint8Array): FightStart | null | undefined {
  if (rom.length < FIGHT_END) return undefined
  if (FIGHT_HOOKS.every((h) => matches(rom, h.at, h.original))) return null
  if (!fightHooked(rom)) return undefined
  if (fightUnfixed(rom)) return 1
  // The fixed code, built once: all of it as the ROM's but the start setting's word, which says which it is.
  const code = fightCode(rom)
  const word = FIGHT_START_AT - FIGHT95_AT
  if (!code.every((byte, i) => i === word || i === word + 1 || rom[FIGHT95_AT + i] === byte)) return undefined
  const start = (rom[FIGHT_START_AT] << 8) | rom[FIGHT_START_AT + 1]
  return FIGHT_STARTS.find((s) => s === start)
}

// The choices from fightMode: fighting in, or (with `start`) in with that start setting.
function fightIs(mode: FightStart | null | undefined, start?: FightStart): boolean | undefined {
  if (mode === undefined) return undefined
  return start === undefined ? mode !== null : mode === start
}

function removeFight(rom: Uint8Array) {
  if (fightIs(fightMode(rom)) !== true) return
  for (const h of FIGHT_HOOKS) rom.set(h.original, h.at)
  rom.fill(0xff, FIGHT95_AT, FIGHT_END)
}

function applyFight(rom: Uint8Array, on: boolean, start: FightStart) {
  if (!on) return
  for (let at = FIGHT95_AT; at < FIGHT_END; at++) {
    if (rom[at] !== 0xff) throw new Error(`Fighting: its code goes at $1E0000, and this ROM has other data there ($${at.toString(16).toUpperCase()}).`)
  }
  rom.set(fightCode(rom, true, start), FIGHT95_AT)
  for (const h of FIGHT_HOOKS) rom.set(h.patched, h.at)
}

// ------------------------------------------------------ NHL 94's settings
// NHL 94's numbers, switches and hooks (hacks.ts, under "play", the rules and
// the statistics), where NHL '95 has the same instructions at other places: a
// research reading of the NHL95Genesis disassembly, each place's bytes the
// same in the original game and the WN95HL's ROMs (but the injuries, below).
// The code put in is NHL 94's with NHL '95's addresses: gmode $BEF0, sflags7
// $BF02, OptLine $CC5C, OptPlayMode $CC4C, gsp $C020, gameclock $C022,
// PerTimeTotal $C026, getpde $7CAD0, setpde $7DBCA, SetSPA $8BC9A, tmpde $34.
type Work = { rom: Uint8Array }
const OP_JSR = 0x4eb9
const OP_NOP = 0x4e71
const BEQ = 0x67
const BNE = 0x66
const BGT = 0x6e
const BCC = 0x64
const BLS = 0x63
const ascii = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0))
const erase = (rom: Uint8Array, at: number, length: number) => rom.fill(UNUSED, at, at + length)
// Code put in, and a hook pointed at it. The code first: placing it can replace work.rom with a larger copy.
function hookTo(work: Work, from: Hook, code: Uint8Array): number {
  const target = placeCode(work, code)
  writeHook(work.rom, from, target)
  return target
}
// Where a hook calls (jsr, then NOPs for the rest of its bytes), whatever is there.
function hookTarget(rom: Uint8Array, from: Hook): number | null {
  if (readU16(rom, from.at) !== OP_JSR) return null
  for (let o = 6; o < from.original.length; o += 2) if (readU16(rom, from.at + o) !== OP_NOP) return null
  const target = readU32(rom, from.at + 2)
  return target < rom.length ? target : null
}
// A part that is only itself where its surroundings are NHL '95's.
const within = <T>(part: Part<T>, around: { at: number; bytes: Uint8Array }[]): Part<T> => ({
  ...part,
  detect: (rom) => (around.every((each) => matches(rom, each.at, each.bytes)) ? part.detect(rom) : undefined),
})

// Energy: setpde's store (stamina), .sube's drain each 128 frames on the ice and its tst.w OptLine / bne.w (no
// skating drain), the bench's addi.w (recovery; NHL '95's tmpde is $34, NHL 94's $32), burst's subi.w.
const stamina95 = switchPart(0x7dbd2, hex('3580'), hex('6002'))
const energyDrain95 = numberPart([site(0x8c1c2, '0440')], NO_NHL95_HACKS.energyDrain)
const energyRecovery95 = numberPart([site(0x7db62, '0672')], NO_NHL95_HACKS.energyRecovery)
const noSkatingDrain95 = switchPart(0x8c1a8, hex('6600'), hex('6000'))
const burstEnergy95 = numberPart([site(0xaa96, '0440')], NO_NHL95_HACKS.burstEnergy)

// Goalies: the hold count's start, and assgoaliectrl's count down (the computer goalie's, at $7FF5C, is left as in
// NHL 94); the box a goalie a person controls keeps to without the puck; the line he is whistled past.
const holdFrames95 = numberPart([site(0x7bb46, '357C')], NO_NHL95_HACKS.goalieHold)
const holdCounted95 = switchPart(0x830fa, hex('9F6B'), hex('6002'))
const goalieHold95: Part<number> = {
  detect(rom) {
    const [frames, never] = [holdFrames95.detect(rom), holdCounted95.detect(rom)]
    if (frames === undefined || never === undefined || frames === 0) return undefined
    return never ? 0 : frames
  },
  remove(rom) {
    holdFrames95.remove(rom)
    holdCounted95.remove(rom)
  },
  apply(work, value) {
    if (value === 0) holdCounted95.apply(work, true)
    else holdFrames95.apply(work, value)
  },
}
const goalieWidth95 = numberPart([site(0x8b8ea, '0C53'), site(0x8b908, '0C53', true)], NO_NHL95_HACKS.goalieWidth)
const goalieOut95 = numberPart([site(0x8b922, '0C6B'), site(0x8b92c, '0C6B', true)], NO_NHL95_HACKS.goalieOut)
const goalieLine95 = numberPart([site(0x8301e, 'B27C'), site(0x83026, 'B27C', true)], NO_NHL95_HACKS.goalieLine)
// The B-hold count's start (bholdtimer $FFBB04, pads 3 and 4 $FFBB06): two move.w #$1111 and six move.b #$11.
const DELAY_WORDS95 = [0xa1e4, 0xa1ea]
const DELAY_BYTES95 = [0x83f07, 0x83f11, 0x84115, 0x8411f, 0x84143, 0x8416b]
const goalieDelay95: Part<number> = {
  detect(rom) {
    if (!DELAY_WORDS95.every((at) => matches(rom, at - 2, hex('31FC'))) || !DELAY_BYTES95.every((at) => matches(rom, at - 3, hex('11FC 00')))) return undefined
    const values = [...DELAY_WORDS95.flatMap((at) => [rom[at], rom[at + 1]]), ...DELAY_BYTES95.map((at) => rom[at])]
    return values.every((value) => value === values[0]) && values[0] >= 1 && values[0] <= 0x80 ? values[0] : undefined
  },
  remove: (rom) => goalieDelay95.apply({ rom }, NO_NHL95_HACKS.goalieDelay),
  apply(work, value) {
    for (const at of DELAY_WORDS95) work.rom.set([value, value], at)
    for (const at of DELAY_BYTES95) work.rom[at] = value
  },
}

// Skating: burst's lsr.w #7,d0 becomes moveq #n,d0; the turn's four adds and subtracts.
const BURST_AT95 = 0xaaac
const speedBurst95: Part<number> = {
  detect(rom) {
    if (matches(rom, BURST_AT95, hex('EE48'))) return 0
    const value = rom[BURST_AT95 + 1]
    return rom[BURST_AT95] === 0x70 && value >= 1 && value <= 0x7f ? value : undefined
  },
  remove: (rom) => rom.set(hex('EE48'), BURST_AT95),
  apply: (work, value) => void (value > 0 && work.rom.set([0x70, value], BURST_AT95)),
}
const turnRate95 = numberPart([site(0x8bb28, '066B'), site(0x8bb36, '046B'), site(0x8bb50, '066B'), site(0x8bb5e, '046B')], NO_NHL95_HACKS.turnRate)
// The puck's friction. NHL '95 gives the puck its own, move.w #7,d2 at $8BBC6 (1/128 of its speed a frame), where NHL
// 94's moveq #9,d2 is shared with every gliding skater; NHL '95's gliders keep their own moveq #9 ($8BBBA). So this
// changes the puck alone.
const FRICTION_SITE95 = site(0x8bbc8, '343C')
const puckFriction95: Part<number> = {
  detect(rom) {
    const value = readSite(rom, FRICTION_SITE95)
    return value !== undefined && value >= 1 && value <= 12 ? value : undefined
  },
  remove: (rom) => writeSite(rom, FRICTION_SITE95, NO_NHL95_HACKS.puckFriction),
  apply: (work, value) => writeSite(work.rom, FRICTION_SITE95, value),
}
// Choppy ice: updateplayers' 76 bytes from the X slowing on ($8BBCA) become a call to NHL 94's code with NHL '95's
// own (its puck has its own friction; a skater not gliding and not skating slows by one step more, as NHL '95 does),
// which returns past them, to $8BC16.
const CHOPPY_HOOK95: Hook = {
  at: 0x8bbca,
  original: hex(
    '302B 0028 6700 0032 4A6B 0034 6600 001E 0C6B 000E 0052 6700 0014 4A42 6700 000E 0C6B 22BA 0058 6700 0004 5342 E460 6600 0004 7001 916B 0028 302B 002A 6700 000E E460 6600 0004 7001 916B 002A',
  ),
}
const CHOPPY_CODE95 = hex(
  '48E7 5400 7600 0C6B 000E 0052 6622 3238 C026 671C 3A01 9A78 C022 6F14 E545 0285 0000 FFFF 8AC1 3605 0C43 0004 6302 7604 302B 0028 6748 4A6B 0034 6616 0C6B 000E 0052 670E 4A42 670A 0C6B 22BA 0058 6702 5342 E460 6602 7001 4A43 671E 3200 6A02 4441 C2C3 7A00 1A2B 0003 0245 000F D245 E849 4A40 6A02 4441 D041 916B 0028 302B 002A 672C E460 6602 7001 4A43 671E 3200 6A02 4441 C2C3 7A00 1A2B 0003 0245 000F D245 E849 4A40 6A02 4441 D041 916B 002A 4CDF 002A 2EBC 0008 BC16 4E75',
)
const choppyIce95 = once(() => hookedFix(CHOPPY_HOOK95, CHOPPY_CODE95, [], placeCode))

// ----------------------------------------------------- energy from hits
// The knockdown hook at FallDown's .cont2 ($7B14A: tst.w position(a3) / beq.w .chkpos, returning to .chkpos $7B184
// for a goalie hitter), and holdcheck's move.w #SPAflail,d1 / jsr SetSPA ($7B02C, 10 bytes: jsr and two NOPs).
const HIT_HOOK95: Hook = { at: 0x7b14a, original: hex('4A6B 0034 6700 0034') }
const HOLD_HOOK95: Hook = { at: 0x7b02c, original: hex('323C 1F68 4EB9 0008 BC9A') }
const CLOCK95 = '0838 0000 BEF0'
const ENERGY_TESTS95: Asm = ['4A78 CC5C', { branch: BNE, to: 'done' }, '0838 0004 BF02', { branch: BNE, to: 'done' }]
const takeEnergy95 = (amount: number) => `4EB9 0007 CAD0 0440 ${word(amount)} 4EB9 0007 DBCA`
const valueAt = (code: (value: number) => Uint8Array) => code(0x1234).findIndex((byte, i, all) => byte === 0x12 && all[i + 1] === 0x34)
const hitCode95 = (amount: number) =>
  assemble([
    CLOCK95,
    { branch: BNE, to: 'done' },
    ...ENERGY_TESTS95,
    '4A6A 0034',
    { branch: BEQ, to: 'done' },
    '0C6B 000B 0052',
    { branch: BGT, to: 'done' },
    `48E7 E0F0 264A ${takeEnergy95(amount)} 4CDF 0F07`,
    { label: 'done' },
    '4A6B 0034',
    { branch: BNE, to: 'return' },
    '2EBC 0007 B184',
    { label: 'return' },
    '4E75',
  ])
const HIT_VALUE95 = valueAt(hitCode95)
const holdCode95 = (amount: number) =>
  assemble([
    CLOCK95,
    { branch: BNE, to: 'flail' },
    '4A78 CC5C',
    { branch: BNE, to: 'flail' },
    '0838 0004 BF02',
    { branch: BNE, to: 'flail' },
    `48E7 E0F0 ${takeEnergy95(amount)} 4CDF 0F07`,
    { label: 'flail' },
    '323C 1F68 4EF9 0008 BC9A',
  ])
const HOLD_VALUE95 = valueAt(holdCode95)
const holdEnergy95: Part<number> = {
  detect(rom) {
    if (matches(rom, HOLD_HOOK95.at, HOLD_HOOK95.original)) return 0
    const to = hookTarget(rom, HOLD_HOOK95)
    if (to === null || to + HOLD_VALUE95 + 2 > rom.length) return undefined
    const value = readU16(rom, to + HOLD_VALUE95)
    return matches(rom, to, holdCode95(value)) ? value : undefined
  },
  remove(rom) {
    const value = holdEnergy95.detect(rom)
    if (!value) return
    erase(rom, hookTarget(rom, HOLD_HOOK95)!, holdCode95(value).length)
    rom.set(HOLD_HOOK95.original, HOLD_HOOK95.at)
  },
  apply: (work, value) => void (value > 0 && hookTo(work, HOLD_HOOK95, holdCode95(value))),
}

// ------------------------------------------------ injury risk from knockdowns
// NHL 94's (hacks.ts, the injury risk). The counts: a byte a player, 32 a team, at $FFF700 ($FFF000-$FFF6CF is the
// season shootout's, $FFF800 the organ's, $FFE800 the fighting patch's, $FFEA00 the giveaways'). The roll: FallDown's
// cmp.w impact(a2),d0 / bgt.w .snd at $7B47C. NHL '95 rolls 0 to 399 against the impact where NHL 94 rolls 0 to 159,
// so a bonus and a cap mean what they do in NHL 94: the code adds them x 2.5 (count x bonus, capped, then x 5 / 2,
// rounded), the same extra chance (bonus / 160) a knockdown. Each game: StartGame's jsr clearTeamStats ($9C34).
// Each intermission: PeriodOver's addq.w #1,(gsp).w / bchg #1,(gmode).w ($8CB64).
const COUNT_OF_A2_95: Asm = ['7200 122A 0066 082A 0006 0062', { branch: BEQ, to: 'home' }, '0641 0020', { label: 'home' }, '41F8 F700 D0C1']
const countingHitCode95 = (amount: number) =>
  assemble([
    '48E7 E0F0',
    CLOCK95,
    { branch: BNE, to: 'done' },
    '4A6A 0034',
    { branch: BEQ, to: 'done' },
    '0C6B 000B 0052',
    { branch: BGT, to: 'done' },
    ...COUNT_OF_A2_95,
    '5210',
    { branch: BCC, to: 'counted' },
    '5310',
    { label: 'counted' },
    ...(amount > 0 ? [...ENERGY_TESTS95, `264A ${takeEnergy95(amount)}`] : []),
    { label: 'done' },
    '4CDF 0F07 4A6B 0034',
    { branch: BNE, to: 'return' },
    '2EBC 0007 B184',
    { label: 'return' },
    '4E75',
  ])
const COUNTING_VALUE95 = valueAt(countingHitCode95)
interface HitHook {
  energy: number
  counting: boolean
}
function readHitHook95(rom: Uint8Array): (HitHook & { length: number }) | null {
  const to = hookTarget(rom, HIT_HOOK95)
  if (to === null) return null
  const energy = (at: number) => (to + at + 2 <= rom.length ? readU16(rom, to + at) : 0)
  const candidates: [Uint8Array, HitHook][] = [
    [hitCode95(energy(HIT_VALUE95)), { energy: energy(HIT_VALUE95), counting: false }],
    [countingHitCode95(0), { energy: 0, counting: true }],
    [countingHitCode95(energy(COUNTING_VALUE95)), { energy: energy(COUNTING_VALUE95), counting: true }],
  ]
  for (const [code, value] of candidates) if ((value.counting || value.energy > 0) && matches(rom, to, code)) return { ...value, length: code.length }
  return null
}
const hitHook95: Part<HitHook> = {
  detect(rom) {
    if (matches(rom, HIT_HOOK95.at, HIT_HOOK95.original)) return { energy: 0, counting: false }
    const found = readHitHook95(rom)
    return found ? { energy: found.energy, counting: found.counting } : undefined
  },
  remove(rom) {
    const found = readHitHook95(rom)
    if (!found) return
    erase(rom, hookTarget(rom, HIT_HOOK95)!, found.length)
    rom.set(HIT_HOOK95.original, HIT_HOOK95.at)
  },
  apply(work, value) {
    if (value.counting) hookTo(work, HIT_HOOK95, countingHitCode95(value.energy))
    else if (value.energy > 0) hookTo(work, HIT_HOOK95, hitCode95(value.energy))
  },
}
const ROLL_HOOK95: Hook = { at: 0x7b47c, original: hex('B06A 0032 6E00 0078') }
const rollCode95 = (bonus: number, cap: number) =>
  assemble([
    '48E7 6080',
    ...COUNT_OF_A2_95,
    `7400 1410 C4FC ${word(bonus)} 0C42 ${word(cap)}`,
    { branch: BLS, to: 'capped' },
    `343C ${word(cap)}`,
    { label: 'capped' },
    // mulu.w #5,d2 / addq.w #1,d2 / lsr.w #1,d2: x 2.5, rounded.
    'C4FC 0005 5242 E24A',
    'D46A 0032 B042 4CDF 0106',
    { branch: BGT, to: 'safe' },
    '4E75',
    { label: 'safe' },
    '2EBC 0007 B4FA 4E75',
  ])
const ROLL_BONUS95 = rollCode95(0x1234, 0).findIndex((byte, i, all) => byte === 0x12 && all[i + 1] === 0x34)
const ROLL_CAP95 = rollCode95(0, 0x1234).findIndex((byte, i, all) => byte === 0x12 && all[i + 1] === 0x34)
const GAME_HOOK95: Hook = { at: 0x9c34, original: hex('4EB9 0000 AE48') }
const GAME_CODE95 = hex('48E7 8080 41F8 F700 703F 4218 51C8 FFFC 4CDF 0101 4EF9 0000 AE48')
const PERIOD_HOOK95: Hook = { at: 0x8cb64, original: hex('5278 C020 0878 0001 BEF0') }
const PERIOD_CODE95 = hex('48E7 C080 41F8 F700 703F 1210 E209 10C1 51C8 FFF8 4CDF 0103 5278 C020 0878 0001 BEF0 4E75')
interface InjuryRisk {
  bonus: number
  cap: number
}
function rollTarget95(rom: Uint8Array): number | null {
  const to = hookTarget(rom, ROLL_HOOK95)
  if (to === null || to + ROLL_CAP95 + 2 > rom.length) return null
  return matches(rom, to, rollCode95(readU16(rom, to + ROLL_BONUS95), readU16(rom, to + ROLL_CAP95))) ? to : null
}
const injuryRisk95: Part<InjuryRisk> = {
  detect(rom) {
    if ([ROLL_HOOK95, GAME_HOOK95, PERIOD_HOOK95].every((each) => matches(rom, each.at, each.original))) return { bonus: 0, cap: NO_NHL95_HACKS.injuryCap }
    const roll = rollTarget95(rom)
    if (roll === null || hooked(rom, GAME_HOOK95, GAME_CODE95) === null || hooked(rom, PERIOD_HOOK95, PERIOD_CODE95) === null) return undefined
    return { bonus: readU16(rom, roll + ROLL_BONUS95), cap: readU16(rom, roll + ROLL_CAP95) }
  },
  remove(rom) {
    const roll = rollTarget95(rom)
    const game = hooked(rom, GAME_HOOK95, GAME_CODE95)
    const period = hooked(rom, PERIOD_HOOK95, PERIOD_CODE95)
    if (roll === null || game === null || period === null) return
    erase(rom, roll, rollCode95(0, 0).length)
    erase(rom, game, GAME_CODE95.length)
    erase(rom, period, PERIOD_CODE95.length)
    for (const each of [ROLL_HOOK95, GAME_HOOK95, PERIOD_HOOK95]) rom.set(each.original, each.at)
  },
  apply(work, value) {
    if (value.bonus <= 0) return
    hookTo(work, ROLL_HOOK95, rollCode95(value.bonus, value.cap))
    hookTo(work, GAME_HOOK95, GAME_CODE95)
    hookTo(work, PERIOD_HOOK95, PERIOD_CODE95)
  },
}

// ------------------------------------------------------------------ rules
// The clocks: the game clock's and the shootout clock's subi.w #$AAA, and the penalty clock's addi.w #$18 (NHL 94's
// three, the same instructions).
const CLOCK_SITES95 = [site(0x7a384, '0478'), site(0x89568, '0678'), site(0x7a3cc, '0478')]
const CLOCK_VALUES95 = { original: [0x0aaa, 0x0018, 0x0aaa], realTime: [0x0444, 0x003c, 0x0444] }
const realTime95: Part<boolean> = {
  detect(rom) {
    const values = CLOCK_SITES95.map((each) => readSite(rom, each))
    if (values.every((value, i) => value === CLOCK_VALUES95.original[i])) return false
    return values.every((value, i) => value === CLOCK_VALUES95.realTime[i]) ? true : undefined
  },
  remove: (rom) => CLOCK_SITES95.forEach((each, i) => writeSite(rom, each, CLOCK_VALUES95.original[i])),
  apply: (work, value) => void (value && CLOCK_SITES95.forEach((each, i) => writeSite(work.rom, each, CLOCK_VALUES95.realTime[i]))),
}
// The box time: penalty95's ext.w d2 / mulu.w #60,d2 / bset #13,d2 ($89428).
const PENALTY_TIME95 = 0x8942c
const penaltySeconds95: Part<number> = {
  detect(rom) {
    if (!matches(rom, PENALTY_TIME95 - 4, hex('4882 C4FC')) || !matches(rom, PENALTY_TIME95 + 2, hex('08C2 000D'))) return undefined
    const value = readU16(rom, PENALTY_TIME95)
    return value >= 1 && value <= 255 ? value : undefined
  },
  remove: (rom) => writeU16(rom, PENALTY_TIME95, NO_NHL95_HACKS.penaltySeconds),
  apply: (work, value) => writeU16(work.rom, PENALTY_TIME95, value),
}
// A fight's box time: .3's move.w d2,tmpdst(a2,d0.w) / andi.w #$EFFF,d2 ($89448; NHL '95's tmpdst is $68).
const FIGHT_TIME_HOOK95: Hook = { at: 0x89448, original: hex('3582 0068 0242 EFFF') }
const fightTimeCode95 = (seconds: number) => hex(`0C10 0026 6706 0C10 0028 6608 0242 3000 0042 ${word(seconds & 0xfff)} 3582 0068 0242 EFFF 4E75`)
const fightSeconds95: Part<number> = {
  detect(rom) {
    if (matches(rom, FIGHT_TIME_HOOK95.at, FIGHT_TIME_HOOK95.original)) return 0
    const to = hookTarget(rom, FIGHT_TIME_HOOK95)
    if (to === null || to + 30 > rom.length) return undefined
    const seconds = readU16(rom, to + 0x12)
    return seconds >= 1 && seconds < 0x1000 && matches(rom, to, fightTimeCode95(seconds)) ? seconds : undefined
  },
  remove(rom) {
    const seconds = fightSeconds95.detect(rom)
    if (!seconds) return
    erase(rom, hookTarget(rom, FIGHT_TIME_HOOK95)!, 30)
    rom.set(FIGHT_TIME_HOOK95.original, FIGHT_TIME_HOOK95.at)
  },
  apply: (work, value) => void (value > 0 && hookTo(work, FIGHT_TIME_HOOK95, fightTimeCode95(value))),
}
// No icing: a2touchpuck's bset #ifok,(iflags).w ($81538), before its rts; bra.s to the rts, or the forum's bra.s +2.
const ICING95 = { at: 0x81538, original: hex('08F8 0002 BB86'), hacked: hex('6004 0002 BB86'), forum: hex('6002 0002 BB86') }
const noIcing95 = within<boolean>(
  {
    detect: (rom) => (matches(rom, ICING95.at, ICING95.original) ? false : matches(rom, ICING95.at, ICING95.hacked) || matches(rom, ICING95.at, ICING95.forum) ? true : undefined),
    remove: (rom) => rom.set(ICING95.original, ICING95.at),
    apply: (work, value) => void (value && work.rom.set(ICING95.hacked, ICING95.at)),
  },
  [{ at: 0x8153e, bytes: hex('4E75') }],
)
// Hybrid icing: PuckIChk's bset #ifcgl,(iflags).w ($89B32); the end-zone dots at y +-$D7, SortCords $AC62, iflags $BB86,
// AddPenalty $89140.
const HYBRID_HOOK95: Hook = { at: 0x89b32, original: hex('08F8 0000 BB86') }
const HYBRID_CODE95 = hex(
  '48E7 F880 08F8 0000 BB86 363C 00D7 0838 0001 BB86 6602 4443 307C AC62 0C38 0006 BB87 6D04 D0FC 0300 6146 3202 307C AC62 0C38 0006 BB87 6C04 D0FC 0300 6132 B441 6E22 4CDF 011F 2F0B 4240 1038 BB87 EF40 367C AC62 D6C0 303C 000C 4EB9 0008 9140 265F 4E75 08B8 0002 BB86 4CDF 011F 4E75 343C 7FFF 7805 4A68 0034 6F20 0828 0002 0063 6618 3028 0014 9043 4A43 6B02 4440 4A40 6A02 7000 B042 6C02 3400 D0FC 0080 51CC FFD4 4E75',
)
const hybridIcing95 = once(() => within(hookedFix(HYBRID_HOOK95, HYBRID_CODE95, [], placeCode), [{ at: 0x89b38, bytes: hex('4E75') }]))
// Calls during a delayed penalty: checkagr's btst #2,(sflags9).w ($89A10) becomes bra.w to its rts ($89A2C).
const delayedCalls95 = within(switchPart(0x89a10, hex('0838 0002'), hex('6000 001A')), [
  { at: 0x89a14, bytes: hex('BF06 6600 0010') },
  { at: 0x89a28, bytes: hex('303C 007F 4E75') },
])
// B-checks with penalties off: Bcheck's bne.w and beq.w .checkdir.
const BCHECK_SITES95 = [0x7af3c, 0x7af46]
const BCHECK_BYTES95: Record<BCheckPenaltiesOff, string[]> = {
  original: ['6600 0030', '6700 0026'],
  asPenaltiesOn: ['6000 0030', '6700 0026'],
  forum: ['6700 0030', '6600 0026'],
}
const bCheckPenaltiesOff95: Part<BCheckPenaltiesOff> = {
  detect: (rom) => (Object.keys(BCHECK_BYTES95) as BCheckPenaltiesOff[]).find((value) => BCHECK_SITES95.every((at, i) => matches(rom, at, hex(BCHECK_BYTES95[value][i])))),
  remove: (rom) => BCHECK_SITES95.forEach((at, i) => rom.set(hex(BCHECK_BYTES95.original[i]), at)),
  apply: (work, value) => BCHECK_SITES95.forEach((at, i) => work.rom.set(hex(BCHECK_BYTES95[value][i]), at)),
}
// Injuries: FallDown's btst #gmclock / bne.w ($7B48A), setInjuryType's three tests ($9F078 sflags13, $9F088 .not0,
// $9F0A0 the game's), FallDown's jsr setInjuryType ($7B49C) and move.w #4,(InjCntDown).w ($7B4C8). The WN95HL's ROMs
// already have every injury for the game. The long fall: the jsr becomes bra.w .snd ($7B4FA), and SPAinjuryfall
// ($7E88: its flags word at $7E98, then its two lists of 12 words, $7E9A and $7EB2) a back fall that gets up after
// 300 ticks.
const INJURY_SITES95 = [0x7b48a, 0x9f078, 0x9f088, 0x9f0a0, 0x7b49c, 0x7b4c8]
const INJURY_KEPT95 = ['4EB9 0009 F012', '31FC 0004 C016']
const INJURY_BYTES95: Record<Injuries, string[]> = {
  original: ['6600 006E', '6600 0022', '6600 0012', '6700 0018', ...INJURY_KEPT95],
  never: ['6000 006E', '6600 0022', '6600 0012', '6700 0018', ...INJURY_KEPT95],
  penaltyOnly: ['6600 006E', '6600 0022', '6600 0012', '6700 0018', '4E71 4E71 4E71', '4E71 4E71 4E71'],
  period: ['6600 006E', '4E71 4E71', '4E71 4E71', '6700 0018', ...INJURY_KEPT95],
  game: ['6600 006E', '6600 0022', '6000 0012', '6000 0018', ...INJURY_KEPT95],
  longFall: ['6600 006E', '6600 0022', '6600 0012', '6700 0018', '6000 005C 4E71', '31FC 0004 C016'],
}
const FALL_AT95 = 0x7e98
const FALL95 = {
  original: hex('0303 00E3 0006 00E4 0006 00E5 0008 037A 0006 037B 0006 037C FFFA 00F7 0006 00F8 0006 00F9 0008 037E 0006 037F 0006 0380 FFFA'),
  longFall: hex('0000 00E3 0006 00E4 0006 00E5 0008 00E6 012C 00E7 0008 0041 FFF8 00F7 0006 00F8 0006 00F9 0008 00FA 012C 00FB 0008 0045 FFF8'),
}
const injuries95: Part<Injuries> = {
  detect(rom) {
    const value = (Object.keys(INJURY_BYTES95) as Injuries[]).find((each) => INJURY_SITES95.every((at, i) => matches(rom, at, hex(INJURY_BYTES95[each][i]))))
    if (value === 'longFall') return matches(rom, FALL_AT95, FALL95.longFall) ? value : undefined
    return value
  },
  remove(rom) {
    INJURY_SITES95.forEach((at, i) => rom.set(hex(INJURY_BYTES95.original[i]), at))
    if (matches(rom, FALL_AT95, FALL95.longFall)) rom.set(FALL95.original, FALL_AT95)
  },
  apply(work, value) {
    if (value === 'longFall') {
      if (!matches(work.rom, FALL_AT95, FALL95.original)) throw new Nhl95HackError('A long fall instead of an injury needs the injury animation as the original game has it.')
      work.rom.set(FALL95.longFall, FALL_AT95)
    }
    INJURY_SITES95.forEach((at, i) => work.rom.set(hex(INJURY_BYTES95[value][i]), at))
  },
}
// The injured out of the season shootout: NextShooter's move.w 0(a0,d0.w),(BA_Skater_Offset).w ($9DD82), with the
// season shootout's mark ($FFF000) and kept team structs ($FFF002; tmpdst at $68, the visitors' $366 on).
const SHOOTOUT_INJURY_HOOK95: Hook = { at: 0x9dd82, original: hex('31F0 0000 D00E') }
const SHOOTOUT_INJURY_CODE95 = hex(
  `4A38 ${word(SHOOTOUT_MARK)} 6756 0C78 0003 C020 664E 48E7 7040 43F8 ${word(SHOOTOUT_SAVE + 0x68)} B1FC FFFF D194 6604 43E9 0366 7604 3400 3230 0000 D241 3231 1000 0C41 FFFC 670A 4A41 6F16 0801 000C 6710 5440 0C40 000A 6D02 7000 51CB FFDA 3002 31F0 0000 D00E 4CDF 020E 4E75 31F0 0000 D00E 4E75`,
)
const shootoutInjuries95 = once(() => hookedFix(SHOOTOUT_INJURY_HOOK95, SHOOTOUT_INJURY_CODE95, [], placeCode))

// The extra period length: ResetClock's tst.w (OptPlayMode).w / bne.w .set ($7D4AE), before move.w #600,d0 (the
// overtime). Exhibition playoffs, and a season's playoff games (GameFlags bit 3 with SeasonDay+1 bit 5), keep theirs,
// as in the original. The Per. Length row's count goes from 3 to 4 in Game Setup's choices ($85EAD), Season Setup's
// ($8F786) and, with fighting in, the fighting patch's copy of Game Setup's ($1E0E73), which its menu reads. After the
// code, 'N4' and the count before, as NHL 94's.
const OT4_HOOK95: Hook = { at: 0x7d4ae, original: hex('4A78 CC4C 6600 0006') }
const ot4Code95 = (seconds: number, before: number) =>
  hex(`4A78 CC4C 661C 0838 0003 BF08 6708 0838 0005 D1A7 6610 0C78 0003 CC54 6608 303C ${word(seconds)} 5C97 4E75 4E75 4E34 ${word(before)}`)
const OT4_VALUE95 = 0x20
const OT4_BEFORE95 = 0x2a
const OT4_LENGTH95 = 0x2c
const OT4_COUNTS95 = [0x85ead, 0x8f786]
const OT4_FIGHT_COUNT95 = FIGHT95_CHOICES_AT + (OT4_COUNTS95[0] - SETUP_CHOICES)
function ot4Target95(rom: Uint8Array): number | null {
  const to = hookTarget(rom, OT4_HOOK95)
  if (to === null || to + OT4_LENGTH95 > rom.length) return null
  return matches(rom, to, ot4Code95(readU16(rom, to + OT4_VALUE95), readU16(rom, to + OT4_BEFORE95))) ? to : null
}
function setPeriodChoices95(rom: Uint8Array, count: number) {
  for (const at of OT4_COUNTS95) rom[at] = count
  if (rom.length >= FIGHT_END && fightHooked(rom)) rom[OT4_FIGHT_COUNT95] = count
}
const fourthPeriodOvertime95 = within<number>(
  {
    detect(rom) {
      if (matches(rom, OT4_HOOK95.at, OT4_HOOK95.original)) return 0
      const to = ot4Target95(rom)
      return to === null ? undefined : readU16(rom, to + OT4_VALUE95)
    },
    remove(rom) {
      const to = ot4Target95(rom)
      if (to === null) return
      const before = readU16(rom, to + OT4_BEFORE95)
      erase(rom, to, OT4_LENGTH95)
      rom.set(OT4_HOOK95.original, OT4_HOOK95.at)
      setPeriodChoices95(rom, before)
    },
    apply(work, value) {
      if (value <= 0) return
      hookTo(work, OT4_HOOK95, ot4Code95(value, work.rom[OT4_COUNTS95[0]]))
      setPeriodChoices95(work.rom, 4)
    },
  },
  [{ at: 0x7d4b6, bytes: hex('303C') }],
)

// ------------------------------------------------------------- statistics
// Three stars: CalcTeamStarScores ($95C8A), NHL 94's fuller formula in its $9E bytes, with NHL '95's team struct
// offsets and a player's checks from +$11E, which NHL '95 counts itself (the bodycheck counts below keep them so).
const STARS_AT95 = 0x95c8a
const starsCode95 = (assist: number, shotFor: number, goal: number, check: number, shutout: number, shotsAgainst: number) =>
  hex(
    `324A 362A 000C 966B 000C 48C3 7819 4EB9 0007 CB4E 4440 D044 2883 4241 122A 00D0 C2FC ${word(assist)} 4242 142A 00EA B840 6200 0026 D394 C4FC ${word(shotFor)} D594 4241 122A 00B6 C2FC ${word(goal)} D394 4241 122A 011E C2FC ${word(check)} D394 6000 003A BA69 0138 6200 0032 4A42 6700 002C E281 D394 4241 122A 00B6 4A41 6600 0008 0694 0000 ${word(shutout)} C3FC D508 D394 4A43 6A00 0004 5382 C4FC ${word(shotsAgainst)} D594 5449 524A 584C 51CC FF84 4E75 FFFF FFFF FFFF`,
  )
const STARS95: Record<ThreeStars, Uint8Array> = {
  original: hex(
    '324A 362A 000C 966B 000C 48C3 7819 4EB9 0007 CB4E 4440 D044 2883 B840 6200 003C 4241 122A 00B6 C2FC 2AF8 D394 4241 122A 00D0 C2FC 2774 D394 4241 122A 00EA C2FC 000A 4A43 6600 000E C2FC 0064 D394 4281 D269 0138 D394 6000 003A BA69 0138 6200 0032 4241 122A 00B6 C2FC 0064 4242 142A 00EA 6700 001E 82C2 B27C 0004 6200 0014 0694 0000 7D00 4A41 6600 0008 0694 0001 24F8 5449 524A 584C 51CC FF7E 4E75',
  ),
  linesOff: starsCode95(7000, 500, 11000, 500, 16000, 4000),
  linesOn: starsCode95(9100, 650, 14300, 650, 20800, 4500),
}
const threeStars95: Part<ThreeStars> = {
  detect: (rom) => (Object.keys(STARS95) as ThreeStars[]).find((choice) => matches(rom, STARS_AT95, STARS95[choice])),
  remove: (rom) => rom.set(STARS95.original, STARS_AT95),
  apply: (work, value) => work.rom.set(STARS95[value], STARS_AT95),
}
// Bodychecks: FallDown's .AddChktoPlayerStats ($7B164), where NHL '95 already adds 1 to the checker's +$11E, goes
// through code that also adds 1 to his +$104, his penalty minutes, while the clock runs; the penalty's add to them
// ($8941E) goes; Player Stats' PIM heading and Penalty Minutes title become Chk and Checks For.
const CHECK_HOOK95: Hook = { at: 0x7b164, original: hex('5268 0010 4240 102B 0066 D0C0 5228 011E') }
const CHECK_CODE95 = hex('5268 0010 4240 102B 0066 D0C0 5228 011E 0839 0000 00FF BEF0 6604 5228 0104 4E75')
const PIM95 = { at: 0x8941e, original: hex('D532 0000'), hacked: hex('4E71 4E71') }
const PIM_AROUND95 = [
  { at: 0x8941a, bytes: hex('0640 0104') },
  { at: 0x89422, bytes: hex('0440 0104') },
]
const STAT_TEXTS95 = [
  { at: 0x92b01, original: ascii('PIM'), hacked: ascii('Chk') },
  { at: 0x92b76, original: ascii('Penalty Minutes'), hacked: ascii('   Checks For  ') },
]
const bodychecks95 = within<'off' | 'on'>(
  {
    detect(rom) {
      if (matches(rom, CHECK_HOOK95.at, CHECK_HOOK95.original) && matches(rom, PIM95.at, PIM95.original)) return 'off'
      return matches(rom, PIM95.at, PIM95.hacked) && hooked(rom, CHECK_HOOK95, CHECK_CODE95) !== null ? 'on' : undefined
    },
    remove(rom) {
      const target = hooked(rom, CHECK_HOOK95, CHECK_CODE95)
      if (target === null) return
      erase(rom, target, CHECK_CODE95.length)
      rom.set(CHECK_HOOK95.original, CHECK_HOOK95.at)
      rom.set(PIM95.original, PIM95.at)
      for (const text of STAT_TEXTS95) if (matches(rom, text.at, text.hacked)) rom.set(text.original, text.at)
    },
    apply(work, value) {
      if (value !== 'on') return
      for (const text of STAT_TEXTS95) work.rom.set(text.hacked, text.at)
      hookTo(work, CHECK_HOOK95, CHECK_CODE95)
      work.rom.set(PIM95.hacked, PIM95.at)
    },
  },
  PIM_AROUND95,
)

// Time on ice in Player Stats: NHL 94's five places (hacks.ts, timeOnIce) at NHL '95's, with its time on ice at +$138,
// the sort ($D276, $AC40, $AC44) and print routines' addresses.
type ToiKey = 'col' | 'title' | 'head' | 'get' | 'row'
const TOI_HOOKS95: Record<ToiKey, Hook> = {
  col: { at: 0x926f2, original: hex('B07C FFFF 6DF0 B07C 0004 6EEA') },
  title: { at: 0x92826, original: hex('43FA 02DC 7001 D078 D276 4EB9 0007 CB38') },
  head: { at: 0x927f4, original: hex('4EB9 0007 C6E6') },
  get: { at: 0x92a32, original: hex('3400 301F B042') },
  row: { at: 0x92980, original: hex('7204 4EB9 0007 D154') },
}
const TOI_CODES95: Record<ToiKey, Uint8Array> = {
  col: hex('0C40 FFFF 6D14 4A47 6608 0C40 0005 6E0A 4E75 0C40 0004 6E02 4E75 588F 4EF9 0009 26E8'),
  title: hex('43F9 0009 2B04 7001 D078 D276 0C78 0005 D276 6606 43FA 0028 7000 4EB9 0007 CB38 0C78 0004 D276 6614 4A47 6610 5378 AC40 43FA 0022 7000 4EB9 0007 CB38 4E75 0016 5B20 2020 2054 696D 6520 4F6E 2049 6365 2020 2020 0004 005D'),
  head: hex('0C78 0005 D276 6624 0C43 0003 6D1E 6618 31FC C000 AC44 2F09 43FA 0018 4EB9 0007 C6E6 225F D2D1 4E75 D2D1 4E75 4EF9 0007 C6E6 000A 2020 2020 2054 4F49'),
  get: hex('3400 302F 0004 2F57 0002 548F 0C41 0005 661A 3400 D442 0642 0138 3432 2000 0C42 176F 6304 343C 176F 588F 4E75 B042 4E75'),
  row: hex('0C78 0005 D276 6632 0C45 0003 6D2C 4240 1014 7205 4EB9 0009 2A24 3002 4EB9 0007 D0BC 5678 AC40 31FC C000 AC44 4EB9 0007 C822 43FA 000E 7A04 4E75 7204 4EF9 0007 D154 0002'),
}
const TOI_KEYS95 = Object.keys(TOI_HOOKS95) as ToiKey[]
const toiParts95 = TOI_KEYS95.map((key) => ({ key, part: hookedFix(TOI_HOOKS95[key], TOI_CODES95[key], [], placeCode) }))

// Giveaways and takeaways: NHL 94's (hacks.ts, giveaways), with NHL '95's puckc $B3C2, lastplayer $BAD8, gmode $BEF0,
// gmode2 $BF00, sflags2 $BEF4, sflags3 $BEF6, SortCords $AC62 and team structs ($C288, the visitors' $C5EE); the RAM at
// $FFEA00 (the carrier's and forcer's spots and places), the counts at $FFEA10 and $FFEA50, the team totals at team
// struct +$2878 / +$287A. Its places: puckglue ($7BAB6), the steals ($7B9E6, $7C220), FallDown's st (puckc).w ($7B446),
// doshot ($84BE8), StartGame's .noso ($9CA0), DisplayStats' rows and tables ($922C2, $922D0, from the ROM's tables at
// $9240E and $924FC), dopass ($84502), and the scroll limits ($92120, $9212E). One more than NHL 94: NHL '95's
// FallDown drops the puck of a carrier who stumbles from a hit (bsr.w DropPuck / bra.w .hitter, $7B142) without the
// st (puckc).w the others pass through, so that call goes through code that marks the hitter as the forcer first.
const GT_BODY95 = hex(
  '6000 001E 6000 0100 6000 0110 6000 0136 6000 0146 6000 0168 6000 016C 6000 0114 302A 0052 31C0 B3C2 48E7 E0C0 0838 0004 BEF0 6600 0088 0838 0000 BF00 666C 0838 0004 BEF6 6664 3238 EA00 6B5E EF49 41F8 AC62 D0C1 1428 0062 122A 0062 B302 0802 0006 6746 3238 EA02 0C41 FFFE 672C 4A41 6B2E EF49 43F8 AC62 D2C1 4A69 0034 6720 1429 0062 102A 0062 B102 0802 0006 6610 1038 EA05 7402 612A 6010 4A6A 0034 670A 2248 1038 EA04 7400 6118 31EA 0052 EA00 11EA 0066 EA04 31FC FFFF EA02 4CDF 0307 4E75 0240 00FF 0C40 0020 6438 0829 0006 0062 6704 0640 0020 41F8 EA10 4A42 6704 41F8 EA50 0C30 00FF 0000 6704 5230 0000 41F8 EB00 0829 0006 0062 6704 41F8 EE66 5270 2000 4E75 31E8 0052 BAD8 31EA 0052 EA02 11EA 0066 EA05 4E75 50F8 B3C2 31EB 0052 EA02 11EB 0066 EA05 0838 0004 BEF0 4E75 50F8 B3C2 177C 0010 005E 31FC FFFE EA02 4E75 08F8 0004 BEF4 31FC FFFF EA00 31FC FFFF EA02 4E75 4278 C02C 4278 C196 21FC FFFF FFFF EA00 41F8 EA10 701F 4298 51C8 FFFC 42B8 EB00 42B8 EE66 4E75 7C0F 43FA 0000 4E75 3C3C 000B 43FA 0000 4E75 ' +
    // +$190, the stumble: the hitter is the forcer of the carrier he knocked down; then DropPuck, and on to .hitter.
    '3F00 302A 0052 B078 B3C2 660C 31EB 0052 EA02 11EB 0066 EA05 301F 4EB9 0007 C4F6 588F 4EF9 0007 B426',
)
const GT_TABLE_A95 = 0x182
const GT_TABLE_B95 = 0x18c
const GT_HOOKS95: [Hook, number][] = [
  [{ at: 0x7bab6, original: hex('302A 0052 31C0 B3C2') }, 0],
  [{ at: 0x7b9e6, original: hex('31E8 0052 BAD8') }, 4],
  [{ at: 0x7c220, original: hex('31E8 0052 BAD8') }, 4],
  [{ at: 0x7b446, original: hex('50F8 B3C2 0838 0004 BEF0') }, 8],
  [{ at: 0x84be8, original: hex('08F8 0004 BEF4') }, 0xc],
  [{ at: 0x9ca0, original: hex('4278 C02C 4278 C196') }, 0x10],
  [{ at: 0x922c2, original: hex('7C0E 43FA 0148') }, 0x14],
  [{ at: 0x922d0, original: hex('3C3C 000A 43FA 0226') }, 0x18],
  [{ at: 0x84502, original: hex('50F8 B3C2 177C 0010 005E') }, 0x1c],
  [{ at: 0x7b142, original: hex('6100 13B2 6000 02DE') }, 0x190],
]
const GT_LIMITS95 = [
  { at: 0x92120, original: 0x70, hacked: 0x80 },
  { at: 0x9212e, original: 0x30, hacked: 0x40 },
]
const GT_ROW95 = Uint8Array.from([...hex('0010'), ...ascii('Give/Takeaways'), ...hex('2878 287A')])
// A table of the ROM's: `rows` rows of a label and two offsets.
function gtTable95(rom: Uint8Array, at: number, rows: number): Uint8Array | null {
  let end = at
  for (let i = 0; i < rows; i++) {
    const length = readU16(rom, end)
    if (length < 2 || length > 40 || length % 2) return null
    end += length + 4
  }
  return rom.slice(at, end)
}
// The code, with the ROM's two tables and the row after each, its lea (pc)s' extension words set to them.
function gtCode95(rom: Uint8Array): Uint8Array | null {
  const withPen = gtTable95(rom, 0x9240e, 15)
  const noPen = gtTable95(rom, 0x924fc, 11)
  if (!withPen || !noPen) return null
  const code = new Uint8Array(GT_BODY95.length + withPen.length + noPen.length + 2 * GT_ROW95.length)
  code.set(GT_BODY95)
  let at = GT_BODY95.length
  const tableA = at
  code.set(withPen, at)
  code.set(GT_ROW95, (at += withPen.length))
  const tableB = (at += GT_ROW95.length)
  code.set(noPen, at)
  code.set(GT_ROW95, at + noPen.length)
  writeU16(code, GT_TABLE_A95, tableA - GT_TABLE_A95)
  writeU16(code, GT_TABLE_B95, tableB - GT_TABLE_B95)
  return code
}
function gtIn95(rom: Uint8Array): { base: number; length: number } | null {
  const base = hookTarget(rom, GT_HOOKS95[0][0])
  if (base === null) return null
  for (const [hook, entry] of GT_HOOKS95) if (hookTarget(rom, hook) !== base + entry) return null
  if (!GT_LIMITS95.every((l) => readU16(rom, l.at) === l.hacked)) return null
  const code = gtCode95(rom)
  return code && base + code.length <= rom.length && matches(rom, base, code) ? { base, length: code.length } : null
}
// Player Stats pages (game stats only): Giveaways and Takeaways past Penalty Minutes (or Checks For), then Time On Ice
// when it is on too, at the time on ice's five places (entries +0 col, +4 title, +8 head, +C get, +10 row).
const GP_CODES95 = [false, true].map((toi) => ({
  toi,
  code: hex(
    toi
      ? '6000 0012 6000 0030 6000 006E 6000 00D6 6000 012A 0C40 FFFF 6D14 4A47 6608 0C40 0007 6E0A 4E75 0C40 0004 6E02 4E75 588F 4EF9 0009 26E8 3038 D276 0C40 0005 6D0C 43FA 019A 5B40 4EF9 0007 CB38 43F9 0009 2B04 5240 4EB9 0007 CB38 0C78 0004 D276 6614 4A47 6610 5378 AC40 43FA 0156 7000 4EF9 0007 CB38 4E75 0C78 0005 D276 6D5E 0C43 0003 6D58 0C78 0007 D276 6732 2F09 43FA 0134 0C43 0004 6604 43FA 0130 31FC 8000 AC44 3038 D276 5540 B043 6606 31FC C000 AC44 4EB9 0007 C6E6 225F D2D1 4E75 0C43 0003 6614 31FC C000 AC44 2F09 43FA 0102 4EB9 0007 C6E6 225F D2D1 4E75 4EF9 0007 C6E6 3400 302F 0004 2F57 0002 548F 0C41 0005 6D42 0C41 0007 6722 327C EA10 0C41 0006 6604 43E9 0040 B4FC C288 6704 43E9 0020 4242 1431 0000 588F 4E75 3400 D442 0642 0138 3432 2000 0C42 176F 6304 343C 176F 588F 4E75 B042 4E75 0C78 0005 D276 6D74 0C45 0003 6D6E 0C78 0007 D276 673A 4240 1014 3205 5441 4EB9 0009 2A24 3002 7204 4EB9 0007 D154 31FC 8000 AC44 3005 5440 B078 D276 6606 31FC C000 AC44 4EB9 0007 C822 43FA 0038 4E75 4240 1014 7207 4EB9 0009 2A24 3002 4EB9 0007 D0BC 5678 AC40 31FC C000 AC44 4EB9 0007 C822 43FA 000E 7A04 4E75 7204 4EF9 0007 D154 0002 0004 005D 0006 2020 4756 0006 2020 544B 000A 2020 2020 2054 4F49 0016 5B20 2020 2047 6976 6561 7761 7973 2020 2020 205D 0016 5B20 2020 2054 616B 6561 7761 7973 2020 2020 205D 0016 5B20 2020 2054 696D 6520 4F6E 2049 6365 2020 2020'
      : '6000 0012 6000 0030 6000 006E 6000 00B0 6000 00E4 0C40 FFFF 6D14 4A47 6608 0C40 0006 6E0A 4E75 0C40 0004 6E02 4E75 588F 4EF9 0009 26E8 3038 D276 0C40 0005 6D0C 43FA 0116 5B40 4EF9 0007 CB38 43F9 0009 2B04 5240 4EB9 0007 CB38 0C78 0004 D276 6614 4A47 6610 5378 AC40 43FA 00DC 7000 4EF9 0007 CB38 4E75 0C78 0005 D276 6D38 0C43 0003 6D32 2F09 43FA 00C2 0C43 0004 6604 43FA 00BE 31FC 8000 AC44 3038 D276 5540 B043 6606 31FC C000 AC44 4EB9 0007 C6E6 225F D2D1 4E75 4EF9 0007 C6E6 3400 302F 0004 2F57 0002 548F 0C41 0005 6D22 327C EA10 0C41 0006 6604 43E9 0040 B4FC C288 6704 43E9 0020 4242 1431 0000 588F 4E75 B042 4E75 0C78 0005 D276 6D40 0C45 0003 6D3A 4240 1014 3205 5441 4EB9 0009 2A24 3002 7204 4EB9 0007 D154 31FC 8000 AC44 3005 5440 B078 D276 6606 31FC C000 AC44 4EB9 0007 C822 43FA 000C 4E75 7204 4EF9 0007 D154 0002 0004 005D 0006 2020 4756 0006 2020 544B 0016 5B20 2020 2047 6976 6561 7761 7973 2020 2020 205D 0016 5B20 2020 2054 616B 6561 7761 7973 2020 2020 2020',
  ),
}))
const GP_ENTRIES95: Record<ToiKey, number> = { col: 0, title: 4, head: 8, get: 0xc, row: 0x10 }
function gpPages95(rom: Uint8Array): { base: number; toi: boolean; length: number } | null {
  const base = hookTarget(rom, TOI_HOOKS95.col)
  if (base === null) return null
  for (const { toi, code } of GP_CODES95) {
    if (!matches(rom, base, code)) continue
    if (TOI_KEYS95.every((key) => hookTarget(rom, TOI_HOOKS95[key]) === base + GP_ENTRIES95[key])) return { base, toi, length: code.length }
  }
  return null
}
function removePages95(rom: Uint8Array): void {
  const found = gpPages95(rom)
  if (!found) return
  erase(rom, found.base, found.length)
  for (const key of TOI_KEYS95) rom.set(TOI_HOOKS95[key].original, TOI_HOOKS95[key].at)
}
// With giveaways on, the pages, where the five places are as the original game has them.
function applyPages95(work: Work, toi: boolean): void {
  if (!TOI_KEYS95.every((key) => matches(work.rom, TOI_HOOKS95[key].at, TOI_HOOKS95[key].original))) return
  const base = placeCode(work, GP_CODES95[toi ? 1 : 0].code)
  for (const key of TOI_KEYS95) writeHook(work.rom, TOI_HOOKS95[key], base + GP_ENTRIES95[key])
}
const giveaways95: Part<boolean> = {
  detect(rom) {
    if (gtIn95(rom) !== null) return true
    if (gpPages95(rom)) return undefined
    const original = GT_HOOKS95.every(([hook]) => matches(rom, hook.at, hook.original)) && GT_LIMITS95.every((l) => readU16(rom, l.at) === l.original)
    return original && gtCode95(rom) !== null ? false : undefined
  },
  remove(rom) {
    removePages95(rom)
    const found = gtIn95(rom)
    if (!found) return
    erase(rom, found.base, found.length)
    for (const [hook] of GT_HOOKS95) rom.set(hook.original, hook.at)
    for (const l of GT_LIMITS95) writeU16(rom, l.at, l.original)
  },
  apply(work, value) {
    if (!value) return
    const base = placeCode(work, gtCode95(work.rom)!)
    for (const [hook, entry] of GT_HOOKS95) writeHook(work.rom, hook, base + entry)
    for (const l of GT_LIMITS95) writeU16(work.rom, l.at, l.hacked)
  },
}
const timeOnIce95: Part<boolean> = {
  detect(rom) {
    const pages = gpPages95(rom)
    // The giveaway pages without the counting code: left alone, as giveaways are.
    if (pages) return gtIn95(rom) !== null ? pages.toi : undefined
    const states = toiParts95.map(({ part }) => part.detect(rom))
    if (states.every((state) => state === false)) return false
    return states.every((state) => state === true) ? true : undefined
  },
  remove(rom) {
    removePages95(rom)
    for (const { part } of toiParts95) part.remove(rom)
  },
  apply(work, value) {
    for (const { part } of toiParts95) part.apply(work, value)
  },
}

// The simple settings, each a part of its own.
const SETTINGS95: { [K in Nhl95Hack]?: () => Part<Nhl95HackChoices[K]> } = {
  threeStars: () => threeStars95,
  bodychecks: () => bodychecks95,
  realTime: () => realTime95,
  penaltySeconds: () => penaltySeconds95,
  fightSeconds: () => fightSeconds95,
  noIcing: () => noIcing95,
  hybridIcing: hybridIcing95,
  delayedCalls: () => delayedCalls95,
  bCheckPenaltiesOff: () => bCheckPenaltiesOff95,
  injuries: () => injuries95,
  shootoutInjuries: shootoutInjuries95,
  fourthPeriodOvertime: () => fourthPeriodOvertime95,
  stamina: () => stamina95,
  energyDrain: () => energyDrain95,
  energyRecovery: () => energyRecovery95,
  noSkatingDrain: () => noSkatingDrain95,
  burstEnergy: () => burstEnergy95,
  holdEnergy: () => holdEnergy95,
  goalieHold: () => goalieHold95,
  goalieWidth: () => goalieWidth95,
  goalieOut: () => goalieOut95,
  goalieLine: () => goalieLine95,
  goalieDelay: () => goalieDelay95,
  speedBurst: () => speedBurst95,
  turnRate: () => turnRate95,
  puckFriction: () => puckFriction95,
  choppyIce: choppyIce95,
}
const setting95 = <K extends Nhl95Hack>(hack: K): Part<Nhl95HackChoices[K]> => SETTINGS95[hack]!()

// --------------------------------------------------------------- the page

export function nhl95HacksSupported(game: GameConfig): boolean {
  return game.platform === 'genesis' && game.edition === 95
}

export function detectNhl95Hacks(rom: Uint8Array): Nhl95HackState {
  const ties = tiesState(rom)
  const ot3 = ot3State(rom)
  const fight = fightMode(rom)
  // The knockdown hook counts exactly when the injury risk is in.
  const hit = hitHook95.detect(rom)
  const risk = injuryRisk95.detect(rom)
  const injury = risk && hit && hit.counting === risk.bonus > 0 ? risk : undefined
  const found: { [K in Nhl95Hack]: Nhl95HackChoices[K] | undefined } = {
    fighting: fightIs(fight),
    fightingOff: fightIs(fight, 0),
    fightingArcade: fightIs(fight, 2),
    secondAssist: assist.secondAssist.detect(rom),
    oneTimerAssist: assist.oneTimerAssist.detect(rom),
    regainAssist: assist.regainAssist.detect(rom),
    aggressionFix: switchState(rom, 'aggressionFix'),
    comebackFix: switchState(rom, 'comebackFix'),
    rocketFix: rocket().detect(rom),
    openNetFix: switchState(rom, 'openNetFix'),
    blindRingFix: ringState(rom),
    seasonOvertime: ties === undefined ? undefined : ties === 'overtime',
    seasonShootout: ties === undefined ? undefined : ties === 'shootout',
    seasonShootoutNow: ties === undefined ? undefined : ties === 'shootoutNow',
    nhlShootout: nhlSoState(rom),
    threeOnThree: ot3 === undefined ? undefined : ot3 === 'season',
    threeOnThreeAll: ot3 === undefined ? undefined : ot3 === 'all',
    runawayFix: runawayState(rom),
    goaliePullFix: switchState(rom, 'goaliePullFix'),
    snipingFix: switchState(rom, 'snipingFix'),
    penaltyShotTableFix: switchState(rom, 'penaltyShotTableFix'),
    penaltyShotFixes: psFixes().detect(rom),
    organResume: organState(rom),
    passFix: passFixState(rom),
    ppPkFix: switchState(rom, 'ppPkFix'),
    faceoffFix: faceoffState(rom),
    awarenessFix: awareState(rom),
    stickShots: stickState(rom),
    anyPosition: switchState(rom, 'anyPosition'),
    threeStars: threeStars95.detect(rom),
    bodychecks: bodychecks95.detect(rom),
    timeOnIce: timeOnIce95.detect(rom),
    giveaways: giveaways95.detect(rom),
    realTime: realTime95.detect(rom),
    penaltySeconds: penaltySeconds95.detect(rom),
    fightSeconds: fightSeconds95.detect(rom),
    noIcing: noIcing95.detect(rom),
    hybridIcing: hybridIcing95().detect(rom),
    delayedCalls: delayedCalls95.detect(rom),
    bCheckPenaltiesOff: bCheckPenaltiesOff95.detect(rom),
    injuries: injuries95.detect(rom),
    shootoutInjuries: shootoutInjuries95().detect(rom),
    fourthPeriodOvertime: fourthPeriodOvertime95.detect(rom),
    stamina: stamina95.detect(rom),
    energyDrain: energyDrain95.detect(rom),
    energyRecovery: energyRecovery95.detect(rom),
    noSkatingDrain: noSkatingDrain95.detect(rom),
    burstEnergy: burstEnergy95.detect(rom),
    hitEnergy: hit?.energy,
    holdEnergy: holdEnergy95.detect(rom),
    injuryBonus: injury?.bonus,
    injuryCap: injury?.cap,
    goalieHold: goalieHold95.detect(rom),
    goalieWidth: goalieWidth95.detect(rom),
    goalieOut: goalieOut95.detect(rom),
    goalieLine: goalieLine95.detect(rom),
    goalieDelay: goalieDelay95.detect(rom),
    speedBurst: speedBurst95.detect(rom),
    turnRate: turnRate95.detect(rom),
    puckFriction: puckFriction95.detect(rom),
    choppyIce: choppyIce95().detect(rom),
  }
  return {
    choices: Object.fromEntries(NHL95_HACKS.map((hack) => [hack, found[hack] ?? NO_NHL95_HACKS[hack]])) as unknown as Nhl95HackChoices,
    unknown: NHL95_HACKS.filter((hack) => found[hack] === undefined),
  }
}

export class Nhl95HackError extends Error {}

// Why a value cannot be set, if it cannot: a number out of its range, or not one of a setting's choices.
function badValue(hack: Nhl95Hack, value: unknown): string | null {
  if (hack in NHL95_HACK_RANGES) {
    const [least, most] = NHL95_HACK_RANGES[hack as Nhl95NumberHack]
    return typeof value === 'number' && Number.isInteger(value) && value >= least && value <= most ? null : `${NHL95_HACK_TITLES[hack]} has to be a whole number from ${least} to ${most}.`
  }
  if (hack in NHL95_HACK_CHOICES) return typeof value === 'string' && value in NHL95_HACK_CHOICES[hack as Nhl95ChoiceHack] ? null : `${NHL95_HACK_TITLES[hack]}: "${String(value)}" is not one of its choices.`
  return typeof value === 'boolean' ? null : `${NHL95_HACK_TITLES[hack]} is on or off.`
}

export function applyNhl95Hacks(project: RomProject, wanted: Partial<Nhl95HackChoices>): RomProject {
  if (!nhl95HacksSupported(project.game)) throw new Nhl95HackError("These hacks are for NHL '95 only.")
  const { choices, unknown } = detectNhl95Hacks(project.bytes)
  const change = NHL95_HACKS.filter((hack) => wanted[hack] !== undefined && wanted[hack] !== choices[hack])
  // The fighting patch without Match Viewer's fix is put in again with it.
  if (choices.fighting && wanted.fighting === true && fightUnfixed(project.bytes)) change.push('fighting')
  for (const hack of change) {
    if (unknown.includes(hack)) throw new Nhl95HackError(`${NHL95_HACK_TITLES[hack]}: this ROM's code there is not the original game's, so it is left as it is.`)
    const bad = badValue(hack, wanted[hack])
    if (bad) throw new Nhl95HackError(bad)
  }
  if (change.length === 0) return project
  const want: Nhl95HackChoices = { ...choices, ...Object.fromEntries(change.map((hack) => [hack, wanted[hack]])) }
  if ([want.seasonOvertime, want.seasonShootout, want.seasonShootoutNow].filter(Boolean).length > 1) {
    throw new Nhl95HackError('Only one of overtime until a goal and the two shootouts can be on: they decide a tied game three different ways.')
  }
  if (want.threeOnThree && want.threeOnThreeAll) throw new Nhl95HackError('Only one of the two 3 on 3 overtime choices can be on.')
  if ((want.fightingOff || want.fightingArcade) && !want.fighting) throw new Nhl95HackError('The Fighting setting at power-on needs Fighting on.')
  if (want.fightingOff && want.fightingArcade) throw new Nhl95HackError('The Fighting setting at power-on is one of Off, On and On - Arcade Mode.')
  const work = { rom: project.bytes.slice() }
  const settingStep = <K extends Nhl95Hack>(hack: K): [Nhl95Hack, () => void, () => void] => [hack, () => setting95(hack).remove(work.rom), () => setting95(hack).apply(work, want[hack])]
  // Every known hack comes out, then those wanted go in, as for NHL 94.
  const steps: [Nhl95Hack, () => void, () => void][] = [
    ['fighting', () => removeFight(work.rom), () => applyFight(work.rom, want.fighting, want.fightingOff ? 0 : want.fightingArcade ? 2 : 1)],
    ['fightingArcade', () => {}, () => {}],
    // Part of fighting's code, put in with it.
    ['fightingOff', () => {}, () => {}],
    ['secondAssist', () => assist.secondAssist.remove(work.rom), () => assist.secondAssist.apply(work, want.secondAssist)],
    ['oneTimerAssist', () => assist.oneTimerAssist.remove(work.rom), () => assist.oneTimerAssist.apply(work, want.oneTimerAssist, want.secondAssist)],
    ['regainAssist', () => assist.regainAssist.remove(work.rom), () => assist.regainAssist.apply(work, want.regainAssist)],
    ...(['aggressionFix', 'comebackFix', 'openNetFix', 'goaliePullFix', 'snipingFix', 'penaltyShotTableFix', 'ppPkFix', 'anyPosition'] as const).map((hack): [Nhl95Hack, () => void, () => void] => {
      const place = SWITCHES[hack]!
      return [hack, () => work.rom.set(place.original, place.at), () => want[hack] && work.rom.set(place.hacked, place.at)]
    }),
    ['rocketFix', () => rocket().remove(work.rom), () => rocket().apply(work, want.rocketFix)],
    ['blindRingFix', () => ring().remove(work.rom), () => ring().apply(work, want.blindRingFix)],
    // The three for tied regular-season games share their places, so they are one step.
    [
      'seasonOvertime',
      () => removeTies(work),
      () => applyTies(work, want.seasonShootoutNow ? 'shootoutNow' : want.seasonShootout ? 'shootout' : want.seasonOvertime ? 'overtime' : 'tie'),
    ],
    ['nhlShootout', () => nhlSo().remove(work.rom), () => nhlSo().apply(work, want.nhlShootout)],
    // The two 3 on 3 choices share their places, so they are one step.
    ['threeOnThree', () => removeOt3(work.rom), () => applyOt3(work, want.threeOnThreeAll ? 'all' : want.threeOnThree ? 'season' : 'off')],
    ['threeOnThreeAll', () => {}, () => {}],
    ['runawayFix', () => runawayParts().forEach((part) => part.remove(work.rom)), () => runawayParts().forEach((part) => part.apply(work, want.runawayFix))],
    ['penaltyShotFixes', () => psFixes().remove(work.rom), () => psFixes().apply(work, want.penaltyShotFixes)],
    [
      'organResume',
      () => [organSave(), organRestore()].forEach((part) => part.remove(work.rom)),
      () => [organSave(), organRestore()].forEach((part) => part.apply(work, want.organResume)),
    ],
    ['passFix', () => work.rom.set(ORIGINAL, PASS_AT), () => want.passFix && work.rom.set(FIXED, PASS_AT)],
    ['awarenessFix', () => setAware(work.rom, false), () => want.awarenessFix && setAware(work.rom, true)],
    ['faceoffFix', () => faceoff().remove(work.rom), () => faceoff().apply(work, want.faceoffFix)],
    ['stickShots', () => stick().remove(work.rom), () => stick().apply(work, want.stickShots)],
    // NHL 94's settings.
    settingStep('threeStars'),
    settingStep('bodychecks'),
    settingStep('realTime'),
    settingStep('penaltySeconds'),
    settingStep('fightSeconds'),
    settingStep('noIcing'),
    settingStep('hybridIcing'),
    settingStep('delayedCalls'),
    settingStep('bCheckPenaltiesOff'),
    settingStep('injuries'),
    settingStep('shootoutInjuries'),
    // After fighting, whose copy of the Game Setup choices it sets too.
    settingStep('fourthPeriodOvertime'),
    settingStep('stamina'),
    settingStep('energyDrain'),
    settingStep('energyRecovery'),
    settingStep('noSkatingDrain'),
    settingStep('burstEnergy'),
    // The knockdown hook counts knockdowns for the injury risk, so the two go together.
    ['hitEnergy', () => hitHook95.remove(work.rom), () => hitHook95.apply(work, { energy: want.hitEnergy, counting: want.injuryBonus > 0 })],
    ['injuryBonus', () => injuryRisk95.remove(work.rom), () => injuryRisk95.apply(work, { bonus: want.injuryBonus, cap: want.injuryCap })],
    ['injuryCap', () => {}, () => {}],
    settingStep('holdEnergy'),
    settingStep('goalieHold'),
    settingStep('goalieWidth'),
    settingStep('goalieOut'),
    settingStep('goalieLine'),
    settingStep('goalieDelay'),
    settingStep('speedBurst'),
    settingStep('turnRate'),
    settingStep('puckFriction'),
    settingStep('choppyIce'),
    ['giveaways', () => giveaways95.remove(work.rom), () => giveaways95.apply(work, want.giveaways)],
    // With giveaways on, their Player Stats pages take the time on ice page in too.
    [
      'timeOnIce',
      () => timeOnIce95.remove(work.rom),
      () => (want.giveaways && !unknown.includes('giveaways') ? applyPages95(work, want.timeOnIce) : timeOnIce95.apply(work, want.timeOnIce)),
    ],
  ]
  const known = steps.filter(([hack]) => !unknown.includes(hack))
  try {
    for (const [, remove] of known) remove()
    for (const [, , apply] of known) apply()
  } catch (e) {
    throw new Nhl95HackError(e instanceof Error ? e.message : String(e))
  }
  return { ...project, bytes: work.rom }
}

const lower = (text: string) => text[0].toLowerCase() + text.slice(1)
// A choice in words, as the lists of changes give it.
export function nhl95HackValueText<K extends Nhl95Hack>(hack: K, choices: Nhl95HackChoices): string {
  const value = choices[hack]
  if (hack === 'threeStars') return lower(NHL95_HACK_CHOICES.threeStars[choices.threeStars])
  if (hack === 'bCheckPenaltiesOff') return lower(BCHECK_TEXTS[choices.bCheckPenaltiesOff])
  if (hack === 'injuries') return lower(INJURY_TEXTS[choices.injuries])
  if (hack === 'goalieHold') return choices.goalieHold === 0 ? 'no whistle' : `${holdSeconds(choices.goalieHold)} seconds`
  if (hack === 'speedBurst' && choices.speedBurst === 0) return "the original game's"
  if (hack === 'penaltySeconds') return penaltyTimeText(choices.penaltySeconds)
  if (hack === 'fightSeconds') return fightTimeText(choices.fightSeconds)
  if (typeof value === 'number') return String(value)
  return value === true || value === 'on' ? 'on' : 'off'
}

// "Pass direction fix: off to on.", for each hack that differs.
export function nhl95HackStateChanges(was: Pick<Nhl95HackState, 'choices' | 'unknown'>, now: Pick<Nhl95HackState, 'choices' | 'unknown'>): string[] {
  const before: Nhl95HackChoices = { ...NO_NHL95_HACKS, ...was.choices }
  return NHL95_HACKS.filter((hack) => before[hack] !== now.choices[hack] && !was.unknown.includes(hack) && !now.unknown.includes(hack)).map(
    (hack) => `${NHL95_HACK_TITLES[hack]}: ${nhl95HackValueText(hack, before)} to ${nhl95HackValueText(hack, now.choices)}.`,
  )
}

export function nhl95HackDifferences(before: Uint8Array, after: Uint8Array): string[] {
  return nhl95HackStateChanges(detectNhl95Hacks(before), detectNhl95Hacks(after))
}

const more = (value: number, original: number, bigger: string, smaller: string) => (value > original ? bigger : smaller)
// An amount of energy as a share of full energy ($1000).
const energyText = (units: number) => `${Math.round((units / 4096) * 1000) / 10}%`
// The chance an injury risk adds, in 100 (of NHL 94's 160, which NHL '95's 400 is scaled to).
const chance = (impact: number) => Math.round((impact / 160) * 100)
const N = NO_NHL95_HACKS

// What each hack means for how the game plays, in plain words, for a league's owners: for a setting, as it is set.
export const NHL95_HACK_TEXTS: Record<Nhl95Hack, string | ((choices: Nhl95HackChoices) => string)> = {
  anyPosition: 'Edit Lines lists every skater for every position, so a defenceman can play forward or a forward defence.',
  threeStars: (c) =>
    `The three stars are chosen by a fuller formula: goals, assists, shots and checks for skaters, and goals against, shots faced and shutouts for goalies, made for line changes ${c.threeStars === 'linesOn' ? 'on' : 'off'}.`,
  bodychecks: "Each player's bodychecks are counted and shown in Player Stats as Chk, in place of penalty minutes.",
  timeOnIce: "Player Stats has a Time On Ice page (right past Penalty Minutes), sorted by each player's time on ice.",
  giveaways: "Each player's giveaways and takeaways are counted and shown on Player Stats pages of their own, and Game Stats shows each team's as Give/Takeaways.",
  realTime: 'The clocks count real seconds, so a period lasts as long as it says.',
  penaltySeconds: (c) =>
    `Penalties last ${c.penaltySeconds < N.penaltySeconds ? 'less' : 'longer'} than they say: each penalty minute is ${c.penaltySeconds} seconds in the box, so ${penaltyLengths(c.penaltySeconds)}. The penalty minutes in the statistics are as before.`,
  fightSeconds: (c) => `A fight keeps each fighter in the box ${clockTime(c.fightSeconds)}, whatever its minutes; the penalty minutes in the statistics are as before.`,
  noIcing: 'Icing is never called.',
  hybridIcing: 'Hybrid icing: decided as the puck crosses the goal line, by which team has a skater nearer the end-zone faceoff dots.',
  delayedCalls: 'While one team has a penalty pending, the other can be called too.',
  bCheckPenaltiesOff: (c) =>
    c.bCheckPenaltiesOff === 'forum'
      ? "B-checks with penalties off trip as they do with penalties on; with penalties on, the computer's B-checks trip less often (the forum's version)."
      : 'With penalties off, B-checks trip as they do with penalties on.',
  injuries: (c) =>
    c.injuries === 'never'
      ? 'Hits never injure: a player knocked down gets up as from any other check.'
      : c.injuries === 'longFall'
        ? 'A hit that would injure has the player stay down about 5 seconds and then get up and play on: no injury, and no penalty.'
        : c.injuries === 'penaltyOnly'
          ? 'A hit that would injure still draws the penalty, but nobody is hurt: the player lies on the ice for a while and then skates on.'
          : `Every injury keeps the player out for the ${c.injuries === 'game' ? 'rest of the game' : 'rest of the period'}, whoever made the hit.`,
  shootoutInjuries: 'In the shootout of a tied regular-season game, a skater injured for the game takes no attempt: the next on the list shoots.',
  fourthPeriodOvertime: (c) =>
    `Game Setup offers an extra period length, and a regular-season game played at it has ${clockTime(c.fourthPeriodOvertime)} of overtime; the other lengths and the playoffs keep theirs.`,
  stamina: 'With line changes on, players on the ice never tire, so lines change only when you want them to.',
  energyDrain: (c) => `Players tire ${more(c.energyDrain, N.energyDrain, 'faster', 'more slowly')} on the ice (${c.energyDrain}, where the original has ${N.energyDrain}).`,
  energyRecovery: (c) =>
    `Players get their energy back ${more(c.energyRecovery, N.energyRecovery, 'faster', 'more slowly')} on the bench (${c.energyRecovery}, where the original has ${N.energyRecovery}).`,
  noSkatingDrain: 'With line changes on, skating costs no energy: players tire only from what else is set to cost it, such as hits and speed bursts, and rest on the bench as usual.',
  burstEnergy: (c) =>
    c.burstEnergy === 0
      ? 'A speed burst costs no energy.'
      : `A speed burst costs ${c.burstEnergy} energy (${Math.round((c.burstEnergy / 4096) * 100)}% of full), where the original costs ${N.burstEnergy}.`,
  hitEnergy: (c) =>
    `With line changes on, a skater knocked down by a check or a poke check loses ${energyText(c.hitEnergy)} of his energy, so he slows and tires sooner; the original game takes none.`,
  holdEnergy: (c) => `With line changes on, a skater caught by a hold or hook loses ${energyText(c.holdEnergy)} of his energy; the original game takes none.`,
  injuryBonus: (c) =>
    `Each knockdown a skater takes makes a hit that can injure him about ${chance(c.injuryBonus)} in 100 more likely to, its own included (at most about ${chance(c.injuryCap)} in 100), and half of it wears off at each intermission; only the few hits that can injure in the original game are affected.`,
  injuryCap: (c) => `The injury risk knockdowns add is at most about ${chance(c.injuryCap)} in 100 more on a hit that can injure.`,
  goalieHold: (c) =>
    c.goalieHold === 0
      ? 'A goalie may hold the puck as long as he likes: there is no whistle for it.'
      : `A goalie may hold the puck ${holdSeconds(c.goalieHold)} seconds before the whistle, ${more(c.goalieHold, N.goalieHold, 'longer', 'shorter')} than the original game's ${holdSeconds(N.goalieHold)}.`,
  goalieWidth: (c) =>
    `A goalie you control may go ${more(c.goalieWidth, N.goalieWidth, 'wider', 'less far')} to either side of the net than in the original game (${c.goalieWidth}, where the original has ${N.goalieWidth}).`,
  goalieOut: (c) =>
    `A goalie you control may ${more(c.goalieOut, N.goalieOut, 'not come as far out of his net', 'come farther out of his net')} without the puck (to ${c.goalieOut} from centre ice, where the original has ${N.goalieOut}).`,
  goalieLine: (c) =>
    `A goalie you control may carry the puck ${more(c.goalieLine, N.goalieLine, 'less far', 'farther')} up the ice before the whistle (to ${c.goalieLine} from centre ice, where the original has ${N.goalieLine}).`,
  goalieDelay: (c) =>
    `B is held ${more(c.goalieDelay, N.goalieDelay, 'longer', 'for less time')} before a player takes the goalie: ${c.goalieDelay} counts of the game's timer, where the original game takes ${N.goalieDelay}.`,
  speedBurst: (c) => `The C-button speed burst gives every player the same push, ${c.speedBurst}, tired or not; the original gives a fresh player 32 and a tired one less.`,
  turnRate: (c) => `Skaters ${more(c.turnRate, N.turnRate, 'stop and turn more sharply', 'take a longer, sliding stop')} when they reverse (${c.turnRate}, where the original has ${N.turnRate}).`,
  puckFriction: (c) => `The puck slows ${c.puckFriction < N.puckFriction ? 'faster' : 'more slowly'} on the ice than in the original game; skaters glide as before.`,
  choppyIce: 'The puck slows a little more as each period wears on, up to a quarter more by its end, and the ice is fresh again after each intermission.',
  ppPkFix:
    "A team's power play and penalty kill ratings work as written: the game read them from the wrong halves of their byte, so teams meant to be weak at both had the best power play.",
  faceoffFix:
    "Every faceoff is on a dot, as today's NHL rules have it, where the original often holds one where play stopped, between the dots.",
  awarenessFix: 'Computer wingers and centres on offence use their Offensive Awareness, where the original uses their Defensive.',
  stickShots: "A hard low shot knocked away by the goalie's stick counts as a shot on goal, as one he catches does.",
  organResume: 'After a pause the organ carries on with its song from where it was, instead of staying quiet.',
  runawayFix:
    'A skater no longer glides on, barely slowing, after getting up from a fall into the boards or after you take him over with a pass coming.',
  goaliePullFix: 'In the last minute the computer pulls its goalie when one or two goals behind, not only when exactly two behind.',
  snipingFix:
    "A team whose goalie is off the ice no longer has every shot within range go exactly where aimed: it takes the shooter's accuracy roll as any other shot does.",
  penaltyShotTableFix: 'Each foul on a breakaway gives its own penalty shot, where the original calls every one as the next foul along.',
  penaltyShotFixes:
    'A penalty shot stopped by a stray whistle is no longer taken all over again, and a puck shot out just before a penalty shot no longer floats through everything.',
  threeOnThree:
    'Overtime is played 3 on 3, as in the NHL: each team plays its goalie, centre, left wing and right defenceman. A penalty gives the other team a skater more (4 on 3), and when it ends the teams play 4 on 4 to the next stoppage. Playoff games stay 5 on 5.',
  threeOnThreeAll:
    'Every overtime, playoffs included, is played 3 on 3: each team plays its goalie, centre, left wing and right defenceman. A penalty gives the other team a skater more (4 on 3), and when it ends the teams play 4 on 4 to the next stoppage.',
  fightingOff: 'The Game Setup screen starts with Fighting set to Off; players can still choose On or On - Arcade Mode.',
  fightingArcade: 'The Game Setup screen starts with Fighting set to On - Arcade Mode; players can still choose Off or On.',
  fighting:
    'Players can fight. A hard check between two players with Fighting ratings can start one, more often as a game gets rougher. Both get five minutes. Game Setup gets a Fighting setting: Off, On, or On - Arcade Mode (more fights).',
  secondAssist: 'When two players pass back and forth before a goal, the second assist is now credited.',
  oneTimerAssist: "A one-timer goal keeps its assists when the shooter's stick touched the pass before he shot.",
  regainAssist: 'A player who wins the puck back himself and passes to the scorer gets his assist.',
  aggressionFix:
    'Aggression works as the rating reads: a higher rating means more penalties, where the original game mixes the values up (a 4 plays like a 1).',
  comebackFix:
    'A team tied or behind in the third period gets its comeback boost in the second half of the period, as intended, not the first.',
  blindRingFix:
    "A loose puck close to the goalie's stick but not on its blade now meets the goalie, where the original game lets it through untouched, the way some five-hole goals go in.",
  nhlShootout:
    "Shootouts follow today's NHL rule: three rounds, then sudden death, over as soon as one team can't catch up, instead of the game's five rounds played out. For Shootout mode and the regular-season shootouts alike.",
  seasonShootout:
    'A regular-season game still tied after overtime is settled by a shootout, as in Shootout mode; the winners get one goal more, so it never ends in a tie.',
  seasonShootoutNow:
    'A regular-season game tied after period 3 goes straight to a shootout, with no overtime; the winners get one goal more, so it never ends in a tie.',
  seasonOvertime:
    'A regular-season game tied after overtime plays another overtime, and another, until someone scores, as playoff games do. It never ends in a tie.',
  openNetFix:
    'A one-timer at an open net, with the goalie out of position, is aimed at the middle of the net, not just under the crossbar, where it often sailed over.',
  rocketFix:
    'Passes go at their own speed: the game no longer sends some of them up to twice as fast, or many times faster, when it rounds the time a pass takes to reach its man. Slow flat passes stay four times as slow.',
  passFix:
    "Passes go to the teammate you're pointing at, as in NHL 94. In the original NHL '95 a pass now and then goes straight across instead of to a teammate off at an angle on that side, or back to a teammate behind the passer. The soft pass is unchanged.",
}

// Where each is shown: the page's sections, and the hack sheet's.
export const NHL95_HACK_SECTIONS: { id: string; title: string; hacks: Nhl95Hack[] }[] = [
  { id: 'statistics', title: 'Statistics', hacks: ['secondAssist', 'oneTimerAssist', 'regainAssist', 'stickShots', 'bodychecks', 'timeOnIce', 'giveaways', 'threeStars'] },
  { id: 'ratings', title: 'Ratings', hacks: ['aggressionFix', 'ppPkFix', 'comebackFix', 'awarenessFix'] },
  { id: 'play', title: 'How the game plays', hacks: ['rocketFix', 'openNetFix', 'blindRingFix', 'passFix', 'runawayFix', 'goaliePullFix', 'snipingFix'] },
  {
    id: 'rules',
    title: 'Rules',
    hacks: [
      'seasonOvertime', 'seasonShootout', 'seasonShootoutNow', 'nhlShootout', 'shootoutInjuries', 'threeOnThree', 'threeOnThreeAll', 'fourthPeriodOvertime', 'faceoffFix', 'penaltyShotTableFix', 'penaltyShotFixes',
      'penaltySeconds', 'realTime', 'noIcing', 'hybridIcing', 'delayedCalls', 'bCheckPenaltiesOff', 'injuries',
    ],
  },
  { id: 'fighting', title: 'Fighting', hacks: ['fighting', 'fightingOff', 'fightingArcade', 'fightSeconds'] },
  { id: 'energy', title: 'Energy and injury risk', hacks: ['stamina', 'energyDrain', 'energyRecovery', 'noSkatingDrain', 'burstEnergy', 'hitEnergy', 'holdEnergy', 'injuryBonus', 'injuryCap'] },
  { id: 'goalies', title: 'Goalies', hacks: ['goalieHold', 'goalieWidth', 'goalieOut', 'goalieLine', 'goalieDelay'] },
  { id: 'skating', title: 'Skating and the puck', hacks: ['speedBurst', 'turnRate', 'puckFriction', 'choppyIce'] },
  { id: 'lines', title: 'Edit Lines', hacks: ['anyPosition'] },
  { id: 'sound', title: 'Sound', hacks: ['organResume'] },
]

// What a ROM has that the original game does not: each hack on, and each setting not at the original's value.
const changed = ({ choices, unknown }: Nhl95HackState) => (hack: Nhl95Hack) => choices[hack] !== NO_NHL95_HACKS[hack] && !unknown.includes(hack)

// The hacks this ROM has, as a short post for a league's Discord.
export function nhl95HacksForDiscord(rom: Uint8Array, name: string): string {
  const state = detectNhl95Hacks(rom)
  const lines = NHL95_HACKS.filter(changed(state)).map((hack) => {
    const value = state.choices[hack]
    if (value === true || value === 'on') return `- **${NHL95_HACK_TITLES[hack]}**`
    // The original speed burst depends on how tired the player is, so there is no one number to give for it.
    if (typeof value === 'number' && hack !== 'speedBurst' && hack !== 'penaltySeconds') {
      return `- **${NHL95_HACK_TITLES[hack]}**: ${nhl95HackValueText(hack, state.choices)} (the original game has ${nhl95HackValueText(hack, NO_NHL95_HACKS)})`
    }
    return `- **${NHL95_HACK_TITLES[hack]}**: ${nhl95HackValueText(hack, state.choices)}`
  })
  return discordPost(name, lines, NHL95_HACKS.filter((hack) => state.unknown.includes(hack)).map((hack) => NHL95_HACK_TITLES[hack]))
}

// The same, each hack explained, as a hack sheet (hacksheet.ts).
export function nhl95HackSheet(rom: Uint8Array, name: string): HackSheet {
  const state = detectNhl95Hacks(rom)
  const text = (hack: Nhl95Hack) => {
    const explain = NHL95_HACK_TEXTS[hack]
    return typeof explain === 'string' ? explain : explain(state.choices)
  }
  const sections = NHL95_HACK_SECTIONS.map((section) => ({
    heading: section.title,
    items: section.hacks.filter(changed(state)).map((hack) => ({ title: NHL95_HACK_TITLES[hack], text: text(hack) })),
  })).filter((section) => section.items.length > 0)
  return { name, game: "NHL '95 for the Genesis", sections, unread: NHL95_HACKS.filter((hack) => state.unknown.includes(hack)).map((hack) => NHL95_HACK_TITLES[hack]) }
}
