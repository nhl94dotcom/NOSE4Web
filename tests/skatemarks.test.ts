import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyHacks, detectHacks, NO_HACKS } from '../src/core/hacks'
import { buildRom, openRom } from '../src/core/rom'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { league30Rom?: string; otherRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['nhl94.bin', ...(local.league30Rom ? [local.league30Rom] : []), ...(local.otherRoms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
const u16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1]
const u32 = (b: Uint8Array, o: number) => ((u16(b, o) << 16) | u16(b, o + 2)) >>> 0

describe.skipIf(!existsSync(path('nhl94.bin')))('skate marks (Genesis)', () => {
  it('hooks the two row sites, setvideo and updateplayers to one block of code', () => {
    const rom = open('nhl94.bin')
    expect(detectHacks(rom.bytes).choices.skateMarks).toBe(false)
    const on = applyHacks(rom, { ...NO_HACKS, skateMarks: true })
    const base = u32(on.bytes, 0x15fa8 + 2)
    expect(u16(on.bytes, 0x15fa8)).toBe(0x4eb9)
    expect(u32(on.bytes, 0x15fde + 2)).toBe(base)
    expect(u32(on.bytes, 0x15ecc + 2)).toBe(base + 4)
    expect(hex(on.bytes, 0x15ed2, 2)).toBe('4e71')
    expect(u32(on.bytes, 0xacba + 2)).toBe(base + 8)
    expect(hex(on.bytes, 0xacc0, 2)).toBe('4e71')
    // Three bra.w to the entries; the row site starts with the lea it replaces.
    expect(hex(on.bytes, base, 16)).toBe('6000000a600000a06000011843f00004')
    // setvideo's: movea.w #DMAList,a5 / jsr updatescroll.
    expect(hex(on.bytes, base + 0xa6, 10)).toBe('3a7cb8b44eb900015f34')
    // updateplayers' ends with the two instructions it replaces.
    expect(hex(on.bytes, base + 0x268 - 10, 10)).toBe('3c2b0052bc78b7aa4e75')
    expect(detectHacks(on.bytes).choices).toEqual({ ...NO_HACKS, skateMarks: true })
    expect(Buffer.compare(buildRom(applyHacks(on, NO_HACKS)), buildRom(rom))).toBe(0)
  })

  it('goes with choppy ice, the three-round shootout and time on ice', () => {
    const rom = open('nhl94.bin')
    const all = applyHacks(rom, { ...NO_HACKS, skateMarks: true, choppyIce: true, nhlShootout: true, timeOnIce: true })
    expect(detectHacks(all.bytes).choices).toMatchObject({ skateMarks: true, choppyIce: true, nhlShootout: true, timeOnIce: true })
    const off = applyHacks(openRom(buildRom(all)), { ...NO_HACKS, choppyIce: true, nhlShootout: true, timeOnIce: true })
    expect(detectHacks(off.bytes).choices.skateMarks).toBe(false)
  })

  it("with chaos's fighting patch", () => {
    const rom = open('nhl94.bin')
    const both = applyHacks(rom, { ...NO_HACKS, fighting: 'on', skateMarks: true })
    expect(detectHacks(both.bytes).choices).toMatchObject({ fighting: 'on', skateMarks: true })
    expect(detectHacks(applyHacks(openRom(buildRom(both)), { ...NO_HACKS, fighting: 'on' }).bytes).choices.skateMarks).toBe(false)
  })

  names.forEach((name) => {
    it(`${name}: offered only with the original rink code and tiles; goes in and comes out`, () => {
      const rom = open(name)
      const state = detectHacks(rom.bytes)
      if (name.includes('EVO')) {
        expect(state.unknown).toContain('skateMarks')
        return
      }
      expect(state.unknown).not.toContain('skateMarks')
      const on = openRom(buildRom(applyHacks(rom, { ...state.choices, skateMarks: true })))
      expect(detectHacks(on.bytes).choices).toEqual({ ...state.choices, skateMarks: true })
      // Taken out, as the ROM is with its own hacks put in again.
      expect(Buffer.compare(buildRom(applyHacks(on, state.choices)), buildRom(applyHacks(rom, state.choices)))).toBe(0)
    })
  })
})
