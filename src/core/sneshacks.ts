import type { RomProject } from './rom'
import { findCodeAll, loRomAddress, loRomBank, loRomOffset, snesCodeInPlace, snesHomeTeamAddress, splitSnesFile } from './snes'
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

interface Site {
  // The game's address.
  at: number
  original: string
  hacked: string
}

const free = (count: number) => 'FF'.repeat(count)
const minutes = (at: number): Site => ({ at, original: '02', hacked: '01' })

const SITES: Record<SnesHack, Site[]> = {
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
}

export const SNES_HACKS = Object.keys(SITES) as SnesHack[]

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
}

export type SnesHackChoices = Record<SnesHack, boolean>

export interface SnesHackState {
  choices: SnesHackChoices
  // Hacks whose places hold something else. They are never changed.
  unknown: SnesHack[]
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

type Relocate = (rom: Uint8Array, source: Uint8Array | null) => Placed[] | null

const RELOCATED: Partial<Record<SnesHack, Relocate>> = {
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
function placesOf(rom: Uint8Array, hack: SnesHack, source: Uint8Array | null, inPlace = snesCodeInPlace(rom)): Placed[] | null {
  if (inPlace) {
    return SITES[hack].map((site) => ({ at: loRomOffset(site.at >> 16, site.at & 0xffff), original: hexBytes(site.original), hacked: hexBytes(site.hacked) }))
  }
  return RELOCATED[hack]?.(rom, source) ?? null
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
  const choices = Object.fromEntries(
    SNES_HACKS.map((hack) => {
      const places = placesOf(rom, hack, null, inPlace)
      if (places && places.every((place) => holds(rom, place, 'original'))) return [hack, false]
      if (places && places.every((place) => holds(rom, place, 'hacked'))) return [hack, true]
      unknown.push(hack)
      return [hack, false]
    }),
  ) as SnesHackChoices
  return { choices, unknown }
}

export class SnesHackError extends Error {}

// The ROM with the hacks wanted put in or taken out. Hacks the ROM holds
// something else for are left as they are; asking to change one is an error.
export function applySnesHacks(project: RomProject, wanted: Partial<SnesHackChoices>): RomProject {
  const { choices, unknown } = detectSnesHacks(project.bytes)
  const rom = project.bytes.slice()
  const source = splitSnesFile(project.source)?.rom ?? null
  for (const hack of SNES_HACKS) {
    const want = wanted[hack]
    if (want === undefined || want === choices[hack]) continue
    if (unknown.includes(hack)) {
      throw new SnesHackError(`${SNES_HACK_TITLES[hack]} cannot be changed: this ROM has other code in its place.`)
    }
    // Each hack is placed in the ROM as the ones before it have left it, so that their new code does not overlap.
    const places = placesOf(rom, hack, source)
    if (!places) throw new SnesHackError(`${SNES_HACK_TITLES[hack]} cannot be changed: this ROM has no room for it.`)
    for (const place of places) {
      const bytes = want ? place.hacked : place.original
      if (!bytes) throw new SnesHackError(`${SNES_HACK_TITLES[hack]} cannot be taken out: this ROM had it when it was opened, so the code it replaced is not known.`)
      rom.set(bytes, place.at)
    }
  }
  // The 30-second periods add a choice to the menu's Period line, and the one-minute penalties change their lengths.
  return { ...project, bytes: rom, settings: refreshSnesSettings(project.bytes, rom, project.settings) }
}

// How the hacks in one SNES ROM differ from those in another.
export function snesHackDifferences(before: Uint8Array, after: Uint8Array): string[] {
  const [was, now] = [detectSnesHacks(before), detectSnesHacks(after)]
  const onOff = (value: boolean) => (value ? 'on' : 'off')
  return SNES_HACKS.filter((hack) => was.choices[hack] !== now.choices[hack] && !was.unknown.includes(hack) && !now.unknown.includes(hack)).map(
    (hack) => `${SNES_HACK_TITLES[hack]}: ${onOff(was.choices[hack])} to ${onOff(now.choices[hack])}.`,
  )
}

// For tests: a hack's places found by the code around them, as for a ROM
// whose code has moved, whatever the ROM.
export function relocatedSnesHack(rom: Uint8Array, hack: SnesHack): { at: number; original: Uint8Array | null; hacked: Uint8Array }[] | null {
  return RELOCATED[hack]?.(rom, null) ?? null
}
