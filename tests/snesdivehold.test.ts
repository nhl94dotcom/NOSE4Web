import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildRom, openRom } from '../src/core/rom'
import { findCodeAll } from '../src/core/snes'
import { applySnesHacks, detectSnesHacks, SNES_AMOUNT_OFF, SNES_AMOUNT_RANGES, SNES_HACK_TITLES, snesAmountText } from '../src/core/sneshacks'
import { expectSameBytes } from './samebytes'

// The goalie hold after a dive catch: puckglue's lda #5 after cmp #SPAgdive / bne, found by the code around it.
const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
const changes = (a: Uint8Array, b: Uint8Array) => a.reduce((list, byte, i) => (byte !== b[i] ? [...list, i] : list), [] as number[])
// ldy a2 / lda #140 / sta temp5,y / lda SPA,y / cmp #SPAgdive / bne +6 / lda #n.
const PUCKGLUE = 'a491a9....99....b9....c9....d006a9....'
const diveAt = (rom: Uint8Array) => {
  const found = findCodeAll(rom, PUCKGLUE)
  expect(found.length).toBe(1)
  return found[0].at + 17
}

describe('the SNES goalie hold after a dive catch', () => {
  it('is 5 frames in the original game, from 1 to 3600, shown in seconds', () => {
    expect(SNES_AMOUNT_OFF.diveHold).toBe(5)
    expect(SNES_AMOUNT_RANGES.diveHold).toEqual([1, 3600])
    expect(SNES_HACK_TITLES.diveHold).toBe('Goalie hold after a dive catch')
    expect(snesAmountText('diveHold', 30)).toBe('0.5 seconds')
  })
})

describe.skipIf(names.length === 0)('the SNES goalie hold after a dive catch in each ROM', () => {
  it.each(names)('is the lda #5 after the dive test in %s, and only it changes', (name) => {
    const rom = open(name)
    const at = diveAt(rom.bytes)
    if (name === 'NHL94.smc') expect(at).toBe(0xf1ae8)
    expect(hex(rom.bytes, at - 1, 3)).toBe('a90500')
    const before = detectSnesHacks(rom.bytes)
    expect(before.unknown).not.toContain('diveHold')
    expect([before.choices.diveHold, before.amounts?.diveHold]).toEqual([false, 5])
    const on = applySnesHacks(rom, {}, false, { diveHold: 30 })
    expect(changes(on.bytes, rom.bytes)).toEqual([at])
    expect(hex(on.bytes, at - 1, 3)).toBe('a91e00')
    const read = detectSnesHacks(on.bytes)
    expect([read.choices.diveHold, read.amounts?.diveHold]).toEqual([true, 30])
    expect(detectSnesHacks(buildRom(on)).amounts?.diveHold).toBe(30)
    // The other goalie settings still find their places.
    expect(read.unknown.filter((hack) => hack.startsWith('goalie'))).toEqual([])
    const again = applySnesHacks(on, {}, false, { diveHold: 600 })
    expect(hex(again.bytes, at - 1, 3)).toBe('a95802')
    expectSameBytes(applySnesHacks(on, { diveHold: false }).bytes, rom.bytes)
    expectSameBytes(applySnesHacks(again, {}, false, { diveHold: 5 }).bytes, rom.bytes)
    expect(() => applySnesHacks(rom, {}, false, { diveHold: 0 })).toThrow(/1 to 3600/)
  })

  it.each(names)('goes with the goalie hold time in %s, either way round', (name) => {
    const rom = open(name)
    const at = diveAt(rom.bytes)
    for (const goalieHold of [0, 300]) {
      const holdFirst = applySnesHacks(applySnesHacks(rom, {}, false, { goalieHold }), {}, false, { diveHold: 120 })
      const diveFirst = applySnesHacks(applySnesHacks(rom, {}, false, { diveHold: 120 }), {}, false, { goalieHold })
      expectSameBytes(holdFirst.bytes, diveFirst.bytes)
      const both = detectSnesHacks(holdFirst.bytes)
      expect([both.amounts?.goalieHold, both.amounts?.diveHold]).toEqual([goalieHold, 120])
      expect(hex(holdFirst.bytes, at - 1, 3)).toBe('a97800')
      // The hold time's bytes are as without the dive's.
      const holdOnly = applySnesHacks(rom, {}, false, { goalieHold })
      expect(changes(holdFirst.bytes, holdOnly.bytes)).toEqual([at])
      expectSameBytes(applySnesHacks(holdFirst, { diveHold: false }).bytes, holdOnly.bytes)
      expectSameBytes(applySnesHacks(holdFirst, { goalieHold: false }).bytes, applySnesHacks(rom, {}, false, { diveHold: 120 }).bytes)
    }
  })

  it('is left alone where the code is not there exactly once', () => {
    const rom = open(names[0])
    const at = diveAt(rom.bytes)
    const twice = rom.bytes.slice()
    // A second copy of puckglue's lines in room the game does not use (the end of the ROM).
    twice.set(rom.bytes.subarray(at - 17, at + 2), twice.length - 64)
    const state = detectSnesHacks(twice)
    expect(state.unknown).toContain('diveHold')
    expect(() => applySnesHacks({ ...rom, bytes: twice }, {}, false, { diveHold: 30 })).toThrow()
  })
})
