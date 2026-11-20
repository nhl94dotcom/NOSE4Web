import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { clockwiseRecords, clockwiseState } from '../src/core/clockwise'
import { detectHacks, hackRom, hacksSupported, NO_HACKS, type HackChoices } from '../src/core/hacks'
import { buildRom, openRom } from '../src/core/rom'
import { expectSameBytes } from './samebytes'

// Clockwise's sprite edit: NHL 94 at ../nhl94.bin, his IPS beside it, and the league ROMs named in local.json.
const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { league30Rom?: string; otherRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const leagueNames = [...(local.league30Rom ? [local.league30Rom] : []), ...(local.otherRoms ?? [])].filter((name) => existsSync(path(name)))
const ORIGINAL = path('nhl94.bin')
const IPS = path('NHL_94_sprite_edit_by_clockwise.ips')
const CDL = 'CDL_Season_12.bin'
const GDL = 'GDL_Season4.bin'
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const is = (rom: Uint8Array, at: number, bytes: Uint8Array) => bytes.every((byte, i) => rom[at + i] === byte)
const withChoices = (rom: Uint8Array, more: Partial<HackChoices>) => hackRom(rom, { ...detectHacks(rom).choices, ...more })
// Which records hold the original game's bytes, Clockwise's, or neither.
const tally = (rom: Uint8Array) => {
  const counts = { original: 0, patched: 0, own: 0 }
  for (const r of clockwiseRecords()) {
    if (is(rom, r.at, r.original)) counts.original++
    else if (is(rom, r.at, r.patched)) counts.patched++
    else counts.own++
  }
  return counts
}
// Where two ROMs of one size differ, outside the records.
const outsideDiffers = (a: Uint8Array, b: Uint8Array) => {
  const inRecord = new Uint8Array(a.length)
  for (const r of clockwiseRecords()) inRecord.fill(1, r.at, r.at + r.original.length)
  const out: number[] = []
  for (let i = 0; i < a.length; i++) if (!inRecord[i] && a[i] !== b[i]) out.push(i)
  return out
}

describe("Clockwise's sprite edit data", () => {
  it('has its 3,498 records in order, in the sprite tiles, each a change', () => {
    const records = clockwiseRecords()
    expect(records.length).toBe(3498)
    expect(records[0].at).toBe(0x5de91)
    const last = records.at(-1)!
    expect(last.at + last.original.length).toBe(0x9e0fb)
    for (let i = 0; i < records.length; i++) {
      const r = records[i]
      expect(r.patched.length).toBe(r.original.length)
      expect(r.original.length).toBeGreaterThan(0)
      expect(r.original.every((byte, j) => byte === r.patched[j])).toBe(false)
      if (i > 0) expect(r.at).toBeGreaterThanOrEqual(records[i - 1].at + records[i - 1].original.length)
    }
  })

  it('is unknown in a ROM too short for the tiles', () => {
    expect(clockwiseState(new Uint8Array(0x80000))).toBeUndefined()
  })
})

describe.skipIf(!existsSync(IPS) || !existsSync(ORIGINAL))("Clockwise's sprite edit against his IPS", () => {
  it('is the IPS without its header records, against the original game', () => {
    const ips = new Uint8Array(readFileSync(IPS))
    const original = new Uint8Array(readFileSync(ORIGINAL))
    expect(Buffer.from(ips.subarray(0, 5)).toString('latin1')).toBe('PATCH')
    const patched = original.slice()
    let i = 5
    let header = 0
    for (;;) {
      if (Buffer.from(ips.subarray(i, i + 3)).toString('latin1') === 'EOF' && (i + 3 === ips.length || i + 6 === ips.length)) break
      const at = (ips[i] << 16) | (ips[i + 1] << 8) | ips[i + 2]
      const size = (ips[i + 3] << 8) | ips[i + 4]
      i += 5
      let bytes: Uint8Array
      if (size === 0) {
        bytes = new Uint8Array((ips[i] << 8) | ips[i + 1]).fill(ips[i + 2])
        i += 3
      } else {
        bytes = ips.subarray(i, i + size)
        i += size
      }
      if (at < 0x200) header++
      else patched.set(bytes, at)
    }
    expect(header).toBe(5)
    expectSameBytes(hackRom(original, { ...NO_HACKS, clockwiseSprites: true }), patched)
  })
})

describe.skipIf(!existsSync(ORIGINAL))("Clockwise's sprite edit on the original game", () => {
  it('goes in at every record and comes out byte for byte', () => {
    const project = openRom(new Uint8Array(readFileSync(ORIGINAL)))
    const rom = project.bytes
    expect(detectHacks(rom)).toEqual({ choices: NO_HACKS, unknown: [] })
    expect(tally(rom)).toEqual({ original: 3498, patched: 0, own: 0 })
    const on = hackRom(rom, { ...NO_HACKS, clockwiseSprites: true })
    expect(tally(on)).toEqual({ original: 0, patched: 3498, own: 0 })
    expect(outsideDiffers(on, rom)).toEqual([])
    expect(detectHacks(on)).toEqual({ choices: { ...NO_HACKS, clockwiseSprites: true }, unknown: [] })
    expect(detectHacks(buildRom({ ...project, bytes: on })).choices.clockwiseSprites).toBe(true)
    // Again on: the same ROM.
    expectSameBytes(hackRom(on, { ...NO_HACKS, clockwiseSprites: true }), on)
    expectSameBytes(hackRom(on, NO_HACKS), rom)
  })

  it('refuses other net colours, as it redraws the nets for the rink colours', () => {
    const rom = new Uint8Array(readFileSync(ORIGINAL))
    expect(() => hackRom(rom, { ...NO_HACKS, clockwiseSprites: true, netColours: 'home' })).toThrow(/nets/)
  })

  it('goes with the fighting patch, head bleeding and the goalie stick fix, in either order', () => {
    const rom = openRom(new Uint8Array(readFileSync(ORIGINAL))).bytes
    const others: Partial<HackChoices> = { fighting: 'on', headBleeding: true, goalieBladeFix: true }
    const all = { ...NO_HACKS, ...others, clockwiseSprites: true }
    const together = hackRom(rom, all)
    expect(detectHacks(together)).toEqual({ choices: all, unknown: [] })
    expect(tally(together)).toEqual({ original: 0, patched: 3498, own: 0 })
    const withoutIt = hackRom(rom, { ...NO_HACKS, ...others })
    expect(together.length).toBe(withoutIt.length)
    expect(outsideDiffers(together, withoutIt)).toEqual([])
    // The others first, then this; this first, then the others.
    expectSameBytes(withChoices(withoutIt, { clockwiseSprites: true }), together)
    expectSameBytes(withChoices(hackRom(rom, { ...NO_HACKS, clockwiseSprites: true }), others), together)
    // Each by itself in turn.
    let stepped = rom
    for (const more of [{ clockwiseSprites: true }, { fighting: 'on' }, { goalieBladeFix: true }, { headBleeding: true }] as Partial<HackChoices>[]) stepped = withChoices(stepped, more)
    expectSameBytes(stepped, together)
    // Out again: this alone, the others alone, then everything.
    expectSameBytes(withChoices(together, { clockwiseSprites: false }), withoutIt)
    const onlyIt = withChoices(together, { fighting: 'none', headBleeding: false, goalieBladeFix: false })
    expectSameBytes(onlyIt, hackRom(rom, { ...NO_HACKS, clockwiseSprites: true }))
    expectSameBytes(hackRom(together, NO_HACKS), rom)
  })
})

describe.skipIf(!existsSync(path(CDL)))("Clockwise's sprite edit on a league ROM with art of its own", () => {
  it('keeps the league’s own art, and turning it off again gives the original game’s at the records', () => {
    const rom = open(CDL).bytes
    const before = tally(rom)
    expect(before).toEqual({ original: 3449, patched: 1, own: 48 })
    const state = detectHacks(rom)
    expect(state.unknown).not.toContain('clockwiseSprites')
    expect(state.choices.clockwiseSprites).toBe(false)
    const own = clockwiseRecords().filter((r) => !is(rom, r.at, r.original) && !is(rom, r.at, r.patched))
    const on = withChoices(rom, { clockwiseSprites: true })
    expect(detectHacks(on).choices).toEqual({ ...state.choices, clockwiseSprites: true })
    expect(tally(on)).toEqual({ original: 0, patched: 3450, own: 48 })
    for (const r of own) expect(on.subarray(r.at, r.at + r.original.length)).toEqual(rom.subarray(r.at, r.at + r.original.length))
    // The editor puts the league's other hacks in afresh (their code may move), so compare with the ROM as it does that.
    const same = withChoices(rom, {})
    expect(tally(same)).toEqual(before)
    expect(on.length).toBe(same.length)
    expect(outsideDiffers(on, same)).toEqual([])
    // Off: every record that has Clockwise's goes back to the original game's, his one that was in already too.
    const off = withChoices(on, { clockwiseSprites: false })
    expect(tally(off)).toEqual({ original: 3450, patched: 0, own: 48 })
    const fixed = same.slice()
    for (const r of clockwiseRecords()) if (is(same, r.at, r.patched)) fixed.set(r.original, r.at)
    expectSameBytes(off, fixed)
    // And on again: as before.
    expectSameBytes(withChoices(off, { clockwiseSprites: true }), on)
  })
})

describe.skipIf(!existsSync(path(GDL)))("Clockwise's sprite edit in a league ROM that has it", () => {
  it('reads on, and off gives the original game’s art at the records', () => {
    const rom = open(GDL).bytes
    expect(tally(rom)).toEqual({ original: 0, patched: 3498, own: 0 })
    expect(detectHacks(rom).choices.clockwiseSprites).toBe(true)
    const off = withChoices(rom, { clockwiseSprites: false })
    expect(tally(off)).toEqual({ original: 3498, patched: 0, own: 0 })
    expect(outsideDiffers(off, withChoices(rom, {}))).toEqual([])
    expectSameBytes(withChoices(off, { clockwiseSprites: true }), withChoices(rom, {}))
  })
})

describe.skipIf(leagueNames.length === 0)("Clockwise's sprite edit in the league ROMs", () => {
  it.each(leagueNames)('reads and goes into %s, changing only records with the original game’s art', (name) => {
    const project = open(name)
    if (!hacksSupported(project.game)) return
    const rom = project.bytes
    const state = detectHacks(rom)
    expect(state.unknown).not.toContain('clockwiseSprites')
    const before = tally(rom)
    expect(state.choices.clockwiseSprites).toBe(before.original === 0 && before.patched > 0)
    const on = withChoices(rom, { clockwiseSprites: true })
    expect(detectHacks(on).choices).toEqual({ ...state.choices, clockwiseSprites: before.patched + before.original > 0 })
    expect(tally(on)).toEqual({ original: 0, patched: before.original + before.patched, own: before.own })
    // Against the ROM with its own choices put in afresh, as the editor does.
    const same = withChoices(rom, {})
    expect(tally(same)).toEqual(before)
    expect(on.length).toBe(same.length)
    expect(outsideDiffers(on, same)).toEqual([])
  })
})
