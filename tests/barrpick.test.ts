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
