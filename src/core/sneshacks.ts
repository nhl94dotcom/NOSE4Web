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
  | 'faceoffFix'
  | 'penaltyShotFixes'

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
  penaltyShotFixes: (rom) => penaltyShotFixes(rom),
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
function placesOf(rom: Uint8Array, hack: SnesHack, source: Uint8Array | null, inPlace = snesCodeInPlace(rom)): Placed[] | null {
  const sites = SITES[hack]
  if (inPlace && sites) {
    return sites.map((site) => ({ at: loRomOffset(site.at >> 16, site.at & 0xffff), original: hexBytes(site.original), hacked: hexBytes(site.hacked) }))
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

// For tests: the faceoff spot fix's new code, for these addresses.
export function snesFaceoffCode(penBuf: number, pfgoal: number, fox: number, foy: number): Uint8Array {
  return hexBytes(faceoffCode(penBuf, pfgoal, fox, foy))
}
