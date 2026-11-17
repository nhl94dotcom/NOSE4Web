import { discordPost } from './discord'
import type { GameConfig } from './games'
import { assistFixes, hookedFix, NHL_SHOOTOUT_CODE, PASS_CODE } from './hacks'
import type { HackSheet } from './hacksheet'
import { FIGHT95_AT, FIGHT95_BLOCK, FIGHT95_CHOICES_AT, FIGHT95_HOOKS, FIGHT95_LABELS_AT } from './nhl95fightdata'
import type { RomProject } from './rom'
import { claimSpace95, fullRomReason } from './space'

// Hacks to NHL '95 for the Genesis. NHL 94's hacks are made for NHL 94's code;
// these are NHL '95's own, or NHL 94's where NHL '95 has the same code at
// other addresses (the NHL95Genesis disassembly).

export type Nhl95Hack =
  | 'fighting'
  | 'fightingOff'
  | 'fightingArcade'
  | 'secondAssist'
  | 'oneTimerAssist'
  | 'regainAssist'
  | 'aggressionFix'
  | 'comebackFix'
  | 'rocketFix'
  | 'openNetFix'
  | 'blindRingFix'
  | 'seasonOvertime'
  | 'seasonShootout'
  | 'seasonShootoutNow'
  | 'nhlShootout'
  | 'threeOnThree'
  | 'threeOnThreeAll'
  | 'runawayFix'
  | 'goaliePullFix'
  | 'snipingFix'
  | 'penaltyShotTableFix'
  | 'penaltyShotFixes'
  | 'organResume'
  | 'passFix'
  | 'ppPkFix'
  | 'faceoffFix'
  | 'awarenessFix'
  | 'stickShots'
// In the order they are taken out and put in: the one-timer fix takes over a
// place the second-assist fix calls from, as in NHL 94; fighting, whose code
// has a place of its own, goes in before the others claim free space.
export const NHL95_HACKS: Nhl95Hack[] = ['fighting', 'fightingOff', 'fightingArcade', 'secondAssist', 'oneTimerAssist', 'regainAssist', 'aggressionFix', 'comebackFix', 'rocketFix', 'openNetFix', 'blindRingFix', 'seasonOvertime', 'seasonShootout', 'seasonShootoutNow', 'nhlShootout', 'threeOnThree', 'threeOnThreeAll', 'runawayFix', 'goaliePullFix', 'snipingFix', 'penaltyShotTableFix', 'penaltyShotFixes', 'organResume', 'passFix', 'ppPkFix', 'faceoffFix', 'awarenessFix', 'stickShots']
export type Nhl95HackChoices = Record<Nhl95Hack, boolean>
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
}

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
}

const hex = (text: string) => Uint8Array.from(text.replace(/\s/g, '').match(/../g)!.map((pair) => parseInt(pair, 16)))

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

// --------------------------------------------------------------- the page

export function nhl95HacksSupported(game: GameConfig): boolean {
  return game.platform === 'genesis' && game.edition === 95
}

export function detectNhl95Hacks(rom: Uint8Array): Nhl95HackState {
  const ties = tiesState(rom)
  const ot3 = ot3State(rom)
  const fight = fightMode(rom)
  const found: Record<Nhl95Hack, boolean | undefined> = {
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
  }
  return {
    choices: Object.fromEntries(NHL95_HACKS.map((hack) => [hack, found[hack] ?? false])) as Nhl95HackChoices,
    unknown: NHL95_HACKS.filter((hack) => found[hack] === undefined),
  }
}

export class Nhl95HackError extends Error {}

export function applyNhl95Hacks(project: RomProject, wanted: Partial<Nhl95HackChoices>): RomProject {
  if (!nhl95HacksSupported(project.game)) throw new Nhl95HackError("These hacks are for NHL '95 only.")
  const { choices, unknown } = detectNhl95Hacks(project.bytes)
  const change = NHL95_HACKS.filter((hack) => wanted[hack] !== undefined && wanted[hack] !== choices[hack])
  // The fighting patch without Match Viewer's fix is put in again with it.
  if (choices.fighting && wanted.fighting === true && fightUnfixed(project.bytes)) change.push('fighting')
  for (const hack of change) {
    if (unknown.includes(hack)) throw new Nhl95HackError(`${NHL95_HACK_TITLES[hack]}: this ROM's code there is not the original game's, so it is left as it is.`)
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
  // Every known hack comes out, then those wanted go in, as for NHL 94.
  const steps: [Nhl95Hack, () => void, () => void][] = [
    ['fighting', () => removeFight(work.rom), () => applyFight(work.rom, want.fighting, want.fightingOff ? 0 : want.fightingArcade ? 2 : 1)],
    ['fightingArcade', () => {}, () => {}],
    // Part of fighting's code, put in with it.
    ['fightingOff', () => {}, () => {}],
    ['secondAssist', () => assist.secondAssist.remove(work.rom), () => assist.secondAssist.apply(work, want.secondAssist)],
    ['oneTimerAssist', () => assist.oneTimerAssist.remove(work.rom), () => assist.oneTimerAssist.apply(work, want.oneTimerAssist, want.secondAssist)],
    ['regainAssist', () => assist.regainAssist.remove(work.rom), () => assist.regainAssist.apply(work, want.regainAssist)],
    ...(['aggressionFix', 'comebackFix', 'openNetFix', 'goaliePullFix', 'snipingFix', 'penaltyShotTableFix', 'ppPkFix'] as const).map((hack): [Nhl95Hack, () => void, () => void] => {
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

// "Pass direction fix: off to on.", for each hack that differs.
export function nhl95HackStateChanges(was: Pick<Nhl95HackState, 'choices' | 'unknown'>, now: Pick<Nhl95HackState, 'choices' | 'unknown'>): string[] {
  const onOff = (value: boolean) => (value ? 'on' : 'off')
  return NHL95_HACKS.filter((hack) => (was.choices[hack] ?? false) !== now.choices[hack] && !was.unknown.includes(hack) && !now.unknown.includes(hack)).map(
    (hack) => `${NHL95_HACK_TITLES[hack]}: ${onOff(was.choices[hack] ?? false)} to ${onOff(now.choices[hack])}.`,
  )
}

export function nhl95HackDifferences(before: Uint8Array, after: Uint8Array): string[] {
  return nhl95HackStateChanges(detectNhl95Hacks(before), detectNhl95Hacks(after))
}

// What each hack means for how the game plays, in plain words, for a league's owners.
export const NHL95_HACK_TEXTS: Record<Nhl95Hack, string> = {
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
  { id: 'statistics', title: 'Statistics', hacks: ['secondAssist', 'oneTimerAssist', 'regainAssist', 'stickShots'] },
  { id: 'ratings', title: 'Ratings', hacks: ['aggressionFix', 'ppPkFix', 'comebackFix', 'awarenessFix'] },
  { id: 'play', title: 'How the game plays', hacks: ['rocketFix', 'openNetFix', 'blindRingFix', 'passFix', 'runawayFix', 'goaliePullFix', 'snipingFix'] },
  { id: 'rules', title: 'Rules', hacks: ['seasonOvertime', 'seasonShootout', 'seasonShootoutNow', 'nhlShootout', 'threeOnThree', 'threeOnThreeAll', 'faceoffFix', 'penaltyShotTableFix', 'penaltyShotFixes'] },
  { id: 'fighting', title: 'Fighting', hacks: ['fighting', 'fightingOff', 'fightingArcade'] },
  { id: 'sound', title: 'Sound', hacks: ['organResume'] },
]

// The hacks this ROM has, as a short post for a league's Discord.
export function nhl95HacksForDiscord(rom: Uint8Array, name: string): string {
  const { choices, unknown } = detectNhl95Hacks(rom)
  const lines = NHL95_HACKS.filter((hack) => choices[hack] && !unknown.includes(hack)).map((hack) => `- **${NHL95_HACK_TITLES[hack]}**`)
  return discordPost(name, lines, NHL95_HACKS.filter((hack) => unknown.includes(hack)).map((hack) => NHL95_HACK_TITLES[hack]))
}

// The same, each hack explained, as a hack sheet (hacksheet.ts).
export function nhl95HackSheet(rom: Uint8Array, name: string): HackSheet {
  const { choices, unknown } = detectNhl95Hacks(rom)
  const sections = NHL95_HACK_SECTIONS.map((section) => ({
    heading: section.title,
    items: section.hacks.filter((hack) => choices[hack] && !unknown.includes(hack)).map((hack) => ({ title: NHL95_HACK_TITLES[hack], text: NHL95_HACK_TEXTS[hack] })),
  })).filter((section) => section.items.length > 0)
  return { name, game: "NHL '95 for the Genesis", sections, unread: NHL95_HACKS.filter((hack) => unknown.includes(hack)).map((hack) => NHL95_HACK_TITLES[hack]) }
}
