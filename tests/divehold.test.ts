import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyHacks, detectHacks, HACK_RANGES, HACK_TITLES, hackValueText, hacksSupported, NO_HACKS } from '../src/core/hacks'
import { applyNhl95Hacks, detectNhl95Hacks, NHL95_HACK_RANGES, NHL95_HACK_TITLES, NO_NHL95_HACKS } from '../src/core/nhl95hacks'
import { buildRom, openRom } from '../src/core/rom'
import { expectSameBytes } from './samebytes'

// The goalie hold after a dive catch: puckglue's move.w #5,temp5(a2) after cmpi.w #SPAgdive,SPA(a2), in NHL 94
// and NHL '95 (Genesis).
const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { league30Rom?: string; otherRoms?: string[]; nhl95Roms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names94 = ['nhl94.bin', ...(local.league30Rom ? [local.league30Rom] : []), ...(local.otherRoms ?? [])].filter((name) => existsSync(path(name)))
const RETAIL95 = 'NHL95/NHL_95.bin'
const names95 = [RETAIL95, ...(local.nhl95Roms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
const changes = (a: Uint8Array, b: Uint8Array) => a.reduce((list, byte, i) => (byte !== b[i] ? [...list, i] : list), [] as number[])

describe('the goalie hold after a dive catch', () => {
  it('is 5 frames in the original games, from 1 to 3600, shown in seconds', () => {
    expect([NO_HACKS.diveHold, NO_NHL95_HACKS.diveHold]).toEqual([5, 5])
    expect([HACK_RANGES.diveHold, NHL95_HACK_RANGES.diveHold]).toEqual([
      [1, 3600],
      [1, 3600],
    ])
    expect([HACK_TITLES.diveHold, NHL95_HACK_TITLES.diveHold]).toEqual(['Goalie hold after a dive catch', 'Goalie hold after a dive catch'])
    expect(hackValueText('diveHold', { ...NO_HACKS, diveHold: 30 })).toBe('0.5 seconds')
  })
})

describe.skipIf(!existsSync(path('nhl94.bin')))('the goalie hold after a dive catch in NHL 94', () => {
  it('is the word after puckglue\'s dive test, and only it changes', () => {
    const rom = open('nhl94.bin')
    expect(hex(rom.bytes, 0x1530c, 22)).toBe('357c008c00480c6a02f4005866000008357c00050048')
    const on = applyHacks(rom, { ...NO_HACKS, diveHold: 30 })
    expect(changes(on.bytes, rom.bytes)).toEqual([0x1531f])
    expect(hex(on.bytes, 0x1531c, 4)).toBe('357c001e')
    expect(detectHacks(on.bytes)).toEqual({ choices: { ...NO_HACKS, diveHold: 30 }, unknown: [] })
    expect(detectHacks(buildRom(on)).choices.diveHold).toBe(30)
    expectSameBytes(applyHacks(on, NO_HACKS).bytes, rom.bytes)
    expect(() => applyHacks(rom, { ...NO_HACKS, diveHold: 0 })).toThrow(/1 to 3600/)
  })

  it('reads a number it cannot hold as unknown, and leaves it while other hacks change', () => {
    const rom = open('nhl94.bin')
    const odd = rom.bytes.slice()
    odd.set([0, 0], 0x1531e)
    const state = detectHacks(odd)
    expect(state.unknown).toContain('diveHold')
    const other = applyHacks({ ...rom, bytes: odd }, { ...state.choices, goalieHold: 300 })
    expect(hex(other.bytes, 0x1531e, 2)).toBe('0000')
    expect(detectHacks(other.bytes).choices.goalieHold).toBe(300)
  })

  it('goes with the goalie hold time, either way round', () => {
    const rom = open('nhl94.bin')
    for (const goalieHold of [0, 300]) {
      const both = { ...NO_HACKS, goalieHold, diveHold: 120 }
      const holdFirst = applyHacks(applyHacks(rom, { ...NO_HACKS, goalieHold }), both)
      const diveFirst = applyHacks(applyHacks(rom, { ...NO_HACKS, diveHold: 120 }), both)
      expectSameBytes(holdFirst.bytes, diveFirst.bytes)
      expect(detectHacks(holdFirst.bytes)).toEqual({ choices: both, unknown: [] })
      expect(hex(holdFirst.bytes, 0x1531c, 4)).toBe('357c0078')
      // No whistle skips a person's goalie's count (assgoaliectrl), so it leaves the start values as they are.
      expect(hex(holdFirst.bytes, 0x1530c, 4)).toBe(goalieHold === 0 ? '357c008c' : '357c012c')
      expect(hex(holdFirst.bytes, 0xd4c6, 2)).toBe(goalieHold === 0 ? '6002' : '9f6b')
      expectSameBytes(applyHacks(holdFirst, { ...both, diveHold: 5 }).bytes, applyHacks(rom, { ...NO_HACKS, goalieHold }).bytes)
      expectSameBytes(applyHacks(holdFirst, { ...both, goalieHold: 140 }).bytes, applyHacks(rom, { ...NO_HACKS, diveHold: 120 }).bytes)
    }
  })

  names94.forEach((name) => {
    it(`${name}: goes in and comes out, leaving the ROM as its own hacks make it`, () => {
      const rom = open(name)
      // Only the EVO builds, whose code is their own, take no hacks.
      expect(hacksSupported(rom.game)).toBe(!name.includes('EVO'))
      if (name.includes('EVO')) return
      const state = detectHacks(rom.bytes)
      expect(state.unknown).not.toContain('diveHold')
      expect(state.choices.diveHold).toBe(5)
      const on = openRom(buildRom(applyHacks(rom, { ...state.choices, diveHold: 30 })))
      expect(detectHacks(on.bytes).choices).toEqual({ ...state.choices, diveHold: 30 })
      const off = applyHacks(on, { ...detectHacks(on.bytes).choices, diveHold: 5 })
      expect(Buffer.compare(buildRom(off), buildRom(applyHacks(rom, state.choices)))).toBe(0)
    })
  })
})

describe.skipIf(names95.length === 0)("the goalie hold after a dive catch in NHL '95", () => {
  it.each(names95)('is the word after puckglue\'s dive test in %s, and only it changes', (name) => {
    const rom = open(name)
    expect(hex(rom.bytes, 0x7bb44, 22)).toBe('357c008c00480c6a1d4e005866000008357c00050048')
    const base = detectNhl95Hacks(rom.bytes).choices
    expect(base.diveHold).toBe(5)
    const on = applyNhl95Hacks(rom, { diveHold: 30 })
    expect(changes(on.bytes, rom.bytes)).toEqual([0x7bb57])
    expect(hex(on.bytes, 0x7bb54, 4)).toBe('357c001e')
    expect(detectNhl95Hacks(on.bytes)).toEqual({ choices: { ...base, diveHold: 30 }, unknown: [] })
    expect(detectNhl95Hacks(buildRom(on)).choices.diveHold).toBe(30)
    expectSameBytes(applyNhl95Hacks(on, { diveHold: 5 }).bytes, rom.bytes)
    expect(() => applyNhl95Hacks(rom, { diveHold: 0 })).toThrow(/1 to 3600/)
  })

  it.each(names95)('goes with the goalie hold time in %s, either way round', (name) => {
    const rom = open(name)
    const base = detectNhl95Hacks(rom.bytes).choices
    for (const goalieHold of [0, 300]) {
      const holdFirst = applyNhl95Hacks(applyNhl95Hacks(rom, { goalieHold }), { diveHold: 120 })
      const diveFirst = applyNhl95Hacks(applyNhl95Hacks(rom, { diveHold: 120 }), { goalieHold })
      expectSameBytes(holdFirst.bytes, diveFirst.bytes)
      expect(detectNhl95Hacks(holdFirst.bytes)).toEqual({ choices: { ...base, goalieHold, diveHold: 120 }, unknown: [] })
      expect(hex(holdFirst.bytes, 0x7bb54, 4)).toBe('357c0078')
      expect(hex(holdFirst.bytes, 0x830fa, 2)).toBe(goalieHold === 0 ? '6002' : '9f6b')
      expectSameBytes(applyNhl95Hacks(holdFirst, { diveHold: 5 }).bytes, applyNhl95Hacks(rom, { goalieHold }).bytes)
      expectSameBytes(applyNhl95Hacks(holdFirst, { goalieHold: 140 }).bytes, applyNhl95Hacks(rom, { diveHold: 120 }).bytes)
    }
  })
})
