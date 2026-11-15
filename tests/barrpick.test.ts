import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyHacks, detectHacks, NO_HACKS } from '../src/core/hacks'
import { openRom } from '../src/core/rom'
import { applySnesHacks, detectSnesHacks } from '../src/core/sneshacks'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
const changed = (a: Uint8Array, b: Uint8Array) => [...a.keys()].filter((i) => a[i] !== b[i])

describe.skipIf(!existsSync(path('nhl94.bin')))("Ron Barr's pick on the Genesis", () => {
  it("makes CompareHotColdTotals' cmp.w #$5E,d2 a cmp.w #0,d2, and takes it out again", () => {
    const rom = open('nhl94.bin')
    expect(hex(rom.bytes, 0xf735c, 12)).toBe('303cffffb47c005e6d000012')
    const on = applyHacks(rom, { ...NO_HACKS, barrPick: true })
    expect(changed(rom.bytes, on.bytes)).toEqual([0xf7363])
    expect(hex(on.bytes, 0xf7360, 4)).toBe('b47c0000')
    expect(detectHacks(on.bytes).choices.barrPick).toBe(true)
    expect(applyHacks(on, NO_HACKS).bytes).toEqual(rom.bytes)
  })
})

// The original, its headered copy, the 2 MB build and the SA-1 build: the same code, the RAM moved.
const SNES = ['NHL94.smc', 'NHL94_Classic.smc', 'nhl94snes_2026.sfc', 'nhl94snes_SA1.sfc'].filter((name) => existsSync(path(name)))

describe.skipIf(SNES.length === 0)("Ron Barr's pick on the SNES", () => {
  it("makes ScoutingReport's cmp #$0004 a cmp #$0000, in every build, and takes it out again", () => {
    for (const name of SNES) {
      const rom = open(name)
      const on = applySnesHacks(rom, { barrPick: true })
      const at = changed(rom.bytes, on.bytes)
      expect(at, name).toHaveLength(1)
      expect(hex(on.bytes, at[0] - 9, 12), name).toMatch(/^c90800b0..9c....c90000b0/)
      expect(detectSnesHacks(on.bytes).choices.barrPick, name).toBe(true)
      expect(applySnesHacks(on, { barrPick: false }).bytes, name).toEqual(rom.bytes)
    }
  })
})

describe.skipIf(!existsSync(path('nhl94.bin')))("Ron Barr's pick by a coin flip on the Genesis", () => {
  it('makes the awayhotter code a jsr randomd0 with the gap set to $5E, beside the pick every game, never with it', () => {
    const rom = open('nhl94.bin')
    const on = applyHacks(rom, { ...NO_HACKS, barrCoin: true })
    const at = changed(rom.bytes, on.bytes)
    expect(Math.min(...at)).toBeGreaterThanOrEqual(0xf7342)
    expect(Math.max(...at)).toBeLessThan(0xf735c)
    expect(hex(on.bytes, 0xf7342, 26)).toBe('303c00024eb90001108631c0bf50343c005e4e714e714e714e71')
    // randomd0, which the jsr calls, and the awayhotter it stores to, as the original's code has them.
    expect(hex(rom.bytes, 0x11086, 4)).toBe('48e7e000')
    expect(hex(rom.bytes, 0xf7342, 6)).toBe('31fc0000bf50')
    expect(detectHacks(on.bytes).choices).toMatchObject({ barrCoin: true, barrPick: false })
    expect(applyHacks(on, NO_HACKS).bytes).toEqual(rom.bytes)
    expect(() => applyHacks(rom, { ...NO_HACKS, barrCoin: true, barrPick: true })).toThrow(/cannot both be on/)
  })
})

describe.skipIf(SNES.length === 0)("Ron Barr's pick by a coin flip on the SNES", () => {
  it('makes the sums compared a jsl RandomWord, in every build, never with the pick every game', () => {
    for (const name of SNES) {
      const rom = open(name)
      const on = applySnesHacks(rom, { barrCoin: true })
      const at = changed(rom.bytes, on.bytes)
      const anchor = Buffer.from(rom.bytes).indexOf(Buffer.from('c90800b0', 'hex'), Math.min(...at))
      expect(Math.min(...at), name).toBeGreaterThanOrEqual(anchor - 30)
      expect(Math.max(...at), name).toBeLessThan(anchor - 13)
      const block = hex(on.bytes, anchor - 30, 17)
      expect(block, name).toMatch(/^9c(....)22(......)1006ad(....)8d(....)6bea$/)
      // Its addresses, from the code around it: hotextreme, VisTeam, hotterteam, and RandomWord from deflect's jsl.
      expect(block.slice(2, 6), name).toBe(hex(rom.bytes, anchor + 6, 2))
      expect(block.slice(20, 24), name).toBe(hex(rom.bytes, anchor - 12, 2))
      expect(block.slice(26, 30), name).toBe(hex(rom.bytes, anchor + 17, 2))
      const deflect = [...Buffer.from(rom.bytes).toString('hex').matchAll(/a9ffff8d....22(......)29ff1f38e90010/g)].filter((m) => m.index % 2 === 0)
      expect(deflect, name).toHaveLength(1)
      expect(block.slice(8, 14), name).toBe(deflect[0][1])
      expect(detectSnesHacks(on.bytes).choices, name).toMatchObject({ barrCoin: true, barrPick: false })
      expect(applySnesHacks(on, { barrCoin: false }).bytes, name).toEqual(rom.bytes)
      expect(() => applySnesHacks(rom, { barrCoin: true, barrPick: true }), name).toThrow(/Ron Barr's pick every game and Ron Barr's pick by a coin flip cannot both be on/)
    }
  })
})
