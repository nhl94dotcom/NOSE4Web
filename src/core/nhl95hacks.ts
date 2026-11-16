import { discordPost } from './discord'
import type { GameConfig } from './games'
import { assistFixes, hookedFix, PASS_CODE } from './hacks'
import type { HackSheet } from './hacksheet'
import type { RomProject } from './rom'
import { claimBeforeTail, claimSpace, fullRomReason } from './space'

// Hacks to NHL '95 for the Genesis. NHL 94's hacks are made for NHL 94's code;
// these are NHL '95's own, or NHL 94's where NHL '95 has the same code at
// other addresses (the NHL95Genesis disassembly).

export type Nhl95Hack =
  | 'secondAssist'
  | 'oneTimerAssist'
  | 'regainAssist'
  | 'aggressionFix'
  | 'comebackFix'
  | 'rocketFix'
  | 'openNetFix'
  | 'blindRingFix'
  | 'passFix'
// In the order they are taken out and put in: the one-timer fix takes over a
// place the second-assist fix calls from, as in NHL 94.
export const NHL95_HACKS: Nhl95Hack[] = ['secondAssist', 'oneTimerAssist', 'regainAssist', 'aggressionFix', 'comebackFix', 'rocketFix', 'openNetFix', 'blindRingFix', 'passFix']
export type Nhl95HackChoices = Record<Nhl95Hack, boolean>
export const NO_NHL95_HACKS: Nhl95HackChoices = {
  secondAssist: false,
  oneTimerAssist: false,
  regainAssist: false,
  aggressionFix: false,
  comebackFix: false,
  rocketFix: false,
  openNetFix: false,
  blindRingFix: false,
  passFix: false,
}

export interface Nhl95HackState {
  choices: Nhl95HackChoices
  // Hacks whose code in this ROM is neither the original game's nor the hack's. They are never changed.
  unknown: Nhl95Hack[]
}

// NHL 94's titles where the fix is NHL 94's.
export const NHL95_HACK_TITLES: Record<Nhl95Hack, string> = {
  secondAssist: 'Second-assist bug fix',
  oneTimerAssist: 'One-timer assist fix',
  regainAssist: 'Regained-puck assist fix',
  aggressionFix: 'Aggression bug fix',
  comebackFix: 'Comeback bonus fix',
  rocketFix: 'Rocket pass fix',
  openNetFix: 'One-timer open net fix',
  blindRingFix: 'Five-hole blind ring fix',
  passFix: 'Pass direction fix',
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
  const claimed = claimSpace(work.rom, code.length, true) ?? claimBeforeTail(work.rom, code.length)
  if (!claimed) throw new Nhl95HackError(`There is no room left in this ROM for the code this needs.${fullRomReason(work.rom)}`)
  work.rom = claimed.rom
  work.rom.set(code, claimed.at)
  return claimed.at
}
const assist = assistFixes({ assist: [0x81476, 0x82f28], regain: 0x81464, regainSame: 0x81492 }, placeCode)
const rocket = () => hookedFix(ROCKET_HOOK, ROCKET_CODE, ROCKET_EDITS, placeCode)
const ring = () => hookedFix(RING_HOOK, RING_CODE_95, RING_EDITS, placeCode)
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
}
// What must come before and after each, as NHL '95 has it, for it to be the place.
const AROUND: Partial<Record<Nhl95Hack, { at: number; bytes: Uint8Array }[]>> = {
  aggressionFix: [
    { at: 0x83c76, bytes: hex('4EB9 0008 3CDE') }, // jsr AttributeCalc
    { at: 0x83c86, bytes: hex('4E75 4A03 6A00 0004 4243 B63C 001E') },
  ],
  comebackFix: [{ at: 0x83a20, bytes: hex('4EB9 0007 D4CA E248 B078 C022') }],
  openNetFix: [{ at: 0x84ecc, bytes: hex('6100 004C D845') }],
}

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

// --------------------------------------------------------------- the page

export function nhl95HacksSupported(game: GameConfig): boolean {
  return game.platform === 'genesis' && game.edition === 95
}

export function detectNhl95Hacks(rom: Uint8Array): Nhl95HackState {
  const found: Record<Nhl95Hack, boolean | undefined> = {
    secondAssist: assist.secondAssist.detect(rom),
    oneTimerAssist: assist.oneTimerAssist.detect(rom),
    regainAssist: assist.regainAssist.detect(rom),
    aggressionFix: switchState(rom, 'aggressionFix'),
    comebackFix: switchState(rom, 'comebackFix'),
    rocketFix: rocket().detect(rom),
    openNetFix: switchState(rom, 'openNetFix'),
    blindRingFix: ringState(rom),
    passFix: passFixState(rom),
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
  for (const hack of change) {
    if (unknown.includes(hack)) throw new Nhl95HackError(`${NHL95_HACK_TITLES[hack]}: this ROM's code there is not the original game's, so it is left as it is.`)
  }
  if (change.length === 0) return project
  const want: Nhl95HackChoices = { ...choices, ...Object.fromEntries(change.map((hack) => [hack, wanted[hack]])) }
  const work = { rom: project.bytes.slice() }
  // Every known hack comes out, then those wanted go in, as for NHL 94.
  const steps: [Nhl95Hack, () => void, () => void][] = [
    ['secondAssist', () => assist.secondAssist.remove(work.rom), () => assist.secondAssist.apply(work, want.secondAssist)],
    ['oneTimerAssist', () => assist.oneTimerAssist.remove(work.rom), () => assist.oneTimerAssist.apply(work, want.oneTimerAssist, want.secondAssist)],
    ['regainAssist', () => assist.regainAssist.remove(work.rom), () => assist.regainAssist.apply(work, want.regainAssist)],
    ...(['aggressionFix', 'comebackFix', 'openNetFix'] as const).map((hack): [Nhl95Hack, () => void, () => void] => {
      const place = SWITCHES[hack]!
      return [hack, () => work.rom.set(place.original, place.at), () => want[hack] && work.rom.set(place.hacked, place.at)]
    }),
    ['rocketFix', () => rocket().remove(work.rom), () => rocket().apply(work, want.rocketFix)],
    ['blindRingFix', () => ring().remove(work.rom), () => ring().apply(work, want.blindRingFix)],
    ['passFix', () => work.rom.set(ORIGINAL, PASS_AT), () => want.passFix && work.rom.set(FIXED, PASS_AT)],
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
  secondAssist: 'When two players pass back and forth before a goal, the second assist is now credited.',
  oneTimerAssist: "A one-timer goal keeps its assists when the shooter's stick touched the pass before he shot.",
  regainAssist: 'A player who wins the puck back himself and passes to the scorer gets his assist.',
  aggressionFix:
    'Aggression works as the rating reads: a higher rating means more penalties, where the original game mixes the values up (a 4 plays like a 1).',
  comebackFix:
    'A team tied or behind in the third period gets its comeback boost in the second half of the period, as intended, not the first.',
  blindRingFix:
    "A loose puck close to the goalie's stick but not on its blade now meets the goalie, where the original game lets it through untouched, the way some five-hole goals go in.",
  openNetFix:
    'A one-timer at an open net, with the goalie out of position, is aimed at the middle of the net, not just under the crossbar, where it often sailed over.',
  rocketFix:
    'Passes go at their own speed: the game no longer sends some of them up to twice as fast, or many times faster, when it rounds the time a pass takes to reach its man. Slow flat passes stay four times as slow.',
  passFix:
    "A pass goes the way the pad points, split into the eight directions as NHL 94 splits them. NHL '95 splits them differently, so with the pad between straight across and a diagonal a pass can go another way than in NHL 94. The same routine also turns skaters for other things, which change the same way.",
}

// Where each is shown: the page's sections, and the hack sheet's.
export const NHL95_HACK_SECTIONS: { id: string; title: string; hacks: Nhl95Hack[] }[] = [
  { id: 'statistics', title: 'Statistics', hacks: ['secondAssist', 'oneTimerAssist', 'regainAssist'] },
  { id: 'ratings', title: 'Ratings', hacks: ['aggressionFix', 'comebackFix'] },
  { id: 'play', title: 'How the game plays', hacks: ['rocketFix', 'openNetFix', 'blindRingFix', 'passFix'] },
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
