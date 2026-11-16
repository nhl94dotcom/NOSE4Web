import { discordPost } from './discord'
import type { GameConfig } from './games'
import type { HackSheet } from './hacksheet'
import type { RomProject } from './rom'

// Hacks to NHL '95 for the Genesis. NHL 94's hacks are made for NHL 94's code
// and are not offered here; these are NHL '95's own.
//
// The pass direction fix (the NHL94 Match Viewer project's reading of NHL '95's
// code). vtoa ($7C586) turns the pad's direction into one of the eight ways a
// pass can go. NHL '95's version scales one of the two axes differently from
// NHL 94's (lsr.w #1,d0 at $7C5B8), so the eight ways are not split as NHL
// 94 splits them: Match Viewer measured 26 degrees round left and right where
// NHL 94 has 63. asl.w #2,d0 in its place
// gives NHL 94's directions. vtoa has 36 callers, and the change is to all of
// them; Match Viewer played it on the WN95HL's ROM.

export type Nhl95Hack = 'passFix'
export const NHL95_HACKS: Nhl95Hack[] = ['passFix']
export type Nhl95HackChoices = Record<Nhl95Hack, boolean>
export const NO_NHL95_HACKS: Nhl95HackChoices = { passFix: false }

export interface Nhl95HackState {
  choices: Nhl95HackChoices
  // Hacks whose code in this ROM is neither the original game's nor the hack's. They are never changed.
  unknown: Nhl95Hack[]
}

export const NHL95_HACK_TITLES: Record<Nhl95Hack, string> = {
  passFix: 'Pass direction fix',
}

const hex = (text: string) => Uint8Array.from(text.replace(/\s/g, '').match(/../g)!.map((pair) => parseInt(pair, 16)))

// vtoa, from its movem to the instruction before the one changed: the same in
// the original game and the WN95HL's ROMs.
const VTOA_AT = 0x7c586
const VTOA = hex('48E7 2080 3400 8441 6700 0046 4242 4A40 6A00 0008 4440 08C2 0000 4A41 6A00 0008 4441 08C2 0001 E341 B041 6200 0006 08C2 0002')
const PASS_AT = 0x7c5b8
const ORIGINAL = hex('E248') // lsr.w #1,d0
const FIXED = hex('E548') // asl.w #2,d0
// After it: cmp.w d0,d1 / bhi.w +6 / bset #3,d2.
const AFTER = hex('B240 6200 0006 08C2 0003')

export function nhl95HacksSupported(game: GameConfig): boolean {
  return game.platform === 'genesis' && game.edition === 95
}

const matches = (rom: Uint8Array, at: number, bytes: Uint8Array) => at + bytes.length <= rom.length && bytes.every((b, i) => rom[at + i] === b)

export function detectNhl95Hacks(rom: Uint8Array): Nhl95HackState {
  const around = matches(rom, VTOA_AT, VTOA) && matches(rom, PASS_AT + 2, AFTER)
  const passFix = around && matches(rom, PASS_AT, FIXED)
  const known = around && (passFix || matches(rom, PASS_AT, ORIGINAL))
  return { choices: { passFix }, unknown: known ? [] : ['passFix'] }
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
  const rom = project.bytes.slice()
  if (change.includes('passFix')) rom.set(wanted.passFix ? FIXED : ORIGINAL, PASS_AT)
  return { ...project, bytes: rom }
}

// "Pass direction fix: off to on.", for each hack that differs.
export function nhl95HackStateChanges(was: Pick<Nhl95HackState, 'choices' | 'unknown'>, now: Pick<Nhl95HackState, 'choices' | 'unknown'>): string[] {
  const onOff = (value: boolean) => (value ? 'on' : 'off')
  return NHL95_HACKS.filter((hack) => was.choices[hack] !== now.choices[hack] && !was.unknown.includes(hack) && !now.unknown.includes(hack)).map(
    (hack) => `${NHL95_HACK_TITLES[hack]}: ${onOff(was.choices[hack])} to ${onOff(now.choices[hack])}.`,
  )
}

export function nhl95HackDifferences(before: Uint8Array, after: Uint8Array): string[] {
  return nhl95HackStateChanges(detectNhl95Hacks(before), detectNhl95Hacks(after))
}

// What each hack means for how the game plays, in plain words, for a league's owners.
export const NHL95_HACK_TEXTS: Record<Nhl95Hack, string> = {
  passFix:
    "A pass goes the way the pad points, split into the eight directions as NHL 94 splits them. NHL '95 splits them differently, so with the pad between straight across and a diagonal a pass can go another way than in NHL 94. The same routine also turns skaters for other things, which change the same way.",
}

// The hacks this ROM has, as a short post for a league's Discord.
export function nhl95HacksForDiscord(rom: Uint8Array, name: string): string {
  const { choices, unknown } = detectNhl95Hacks(rom)
  const lines = NHL95_HACKS.filter((hack) => choices[hack] && !unknown.includes(hack)).map((hack) => `- **${NHL95_HACK_TITLES[hack]}**`)
  return discordPost(name, lines, NHL95_HACKS.filter((hack) => unknown.includes(hack)).map((hack) => NHL95_HACK_TITLES[hack]))
}

// The same, each hack explained, as a hack sheet (hacksheet.ts).
export function nhl95HackSheet(rom: Uint8Array, name: string): HackSheet {
  const { choices, unknown } = detectNhl95Hacks(rom)
  const items = NHL95_HACKS.filter((hack) => choices[hack] && !unknown.includes(hack)).map((hack) => ({ title: NHL95_HACK_TITLES[hack], text: NHL95_HACK_TEXTS[hack] }))
  return {
    name,
    game: "NHL '95 for the Genesis",
    sections: items.length > 0 ? [{ heading: 'How the game plays', items }] : [],
    unread: NHL95_HACKS.filter((hack) => unknown.includes(hack)).map((hack) => NHL95_HACK_TITLES[hack]),
  }
}
