import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyHacks, detectHacks, NO_HACKS } from '../src/core/hacks'
import { buildRom, openRom } from '../src/core/rom'
import { applySnesHacks, detectSnesHacks } from '../src/core/sneshacks'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { league30Rom?: string; otherRoms?: string[]; snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['nhl94.bin', ...(local.league30Rom ? [local.league30Rom] : []), ...(local.otherRoms ?? [])].filter((name) => existsSync(path(name)))
const snesNames = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
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
    expect(hex(on.bytes, base + 0x272 - 10, 10)).toBe('3c2b0052bc78b7aa4e75')
    // updateplayers' first: movem, then nothing in a highlight (btst #gmhl,(gmode).w).
    expect(hex(on.bytes, base + 0x122, 14)).toBe('48e7f8800838000' + '4c2ea66000136')
    expect(detectHacks(on.bytes).choices).toEqual({ ...NO_HACKS, skateMarks: true })
    expect(Buffer.compare(buildRom(applyHacks(on, NO_HACKS)), buildRom(rom))).toBe(0)
  })

  it("recognises the first version (no highlight test) and puts this one in its place", () => {
    const rom = open('nhl94.bin')
    const on = applyHacks(rom, { ...NO_HACKS, skateMarks: true }).bytes.slice()
    const base = u32(on, 0x15fa8 + 2)
    // The first version: the same without the 10 bytes of the highlight test, where it was.
    const first = Buffer.concat([on.subarray(base, base + 0x126), on.subarray(base + 0x130, base + 0x272)])
    on.fill(0xff, base, base + 0x272)
    on.set(first, base)
    const project = openRom(buildRom({ ...rom, bytes: on }))
    expect(detectHacks(on).choices.skateMarks).toBe(true)
    expect(Buffer.compare(buildRom(applyHacks(project, NO_HACKS)), buildRom(rom))).toBe(0)
    const updated = applyHacks(project, { ...NO_HACKS, skateMarks: true })
    expect(Buffer.from(updated.bytes).toString('hex')).toContain('48e7f8800838000' + '4c2ea6600')
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

const far = (b: Uint8Array, at: number) => ((b[at + 3] & 0x7f) << 15) | ((b[at + 1] | (b[at + 2] << 8)) & 0x7fff)

describe.skipIf(!existsSync(path('NHL94.smc')))('skate marks (SNES)', () => {
  it("updateplayers' .11, BuildRinkMap's end and setupice's LoadCenterIce call one block of code", () => {
    const rom = open('NHL94.smc')
    expect(hex(rom.bytes, 0xf8834, 4)).toBe('ad710d38')
    expect(hex(rom.bytes, 0xdc256, 4)).toBe('88d0d56b')
    expect(hex(rom.bytes, 0xfb72a, 4)).toBe('227cc19b')
    const on = applySnesHacks(rom, { skateMarks: true }).bytes
    expect(on[0xf8834]).toBe(0x22)
    const code = far(on, 0xf8834)
    expect(on[0xdc256]).toBe(0x5c)
    expect(far(on, 0xdc256)).toBe(code + 0x203)
    expect(far(on, 0xfb72a)).toBe(code + 0x252)
    // Players only (cpx #$18); not in a highlight (gmode $15D4 bit $10) or the scoreboard view ($15DA).
    expect(hex(on, code, 19)).toBe('e01800900382f601add415291000f00382eb01')
    // The ROM's DMAToVRAM; BuildRinkMap's .loop ($9B:C22E, ldx #0); then lda puckx / sec / rtl.
    expect(hex(on, code + 0x1ec, 4)).toBe('221f8980')
    expect(hex(on, code + 0x1fe, 5)).toBe('ad710d386b')
    expect(hex(on, code + 0x206, 4)).toBe('5c2ec29b')
    // A new game: the count 0, the period kept, then LoadCenterIce.
    expect(hex(on, code + 0x252, 18)).toBe('a900008f00f47fad30168f02f47f5c7cc19b')
    expect(detectSnesHacks(on).choices.skateMarks).toBe(true)
    expect(Buffer.compare(buildRom(applySnesHacks(openRom(buildRom({ ...rom, bytes: on })), { skateMarks: false })), buildRom(rom))).toBe(0)
  })

  snesNames.forEach((name) => {
    it(`${name}: in the builds laid out like the original game; goes in and comes out`, () => {
      const rom = open(name)
      const state = detectSnesHacks(rom.bytes)
      if (rom.bytes[0x7fd5] === 0x23) {
        expect(state.notOffered?.skateMarks).toMatch(/SA-1/)
        expect(state.unknown).not.toContain('skateMarks')
        return
      }
      expect(state.unknown).not.toContain('skateMarks')
      const on = openRom(buildRom(applySnesHacks(rom, { skateMarks: true })))
      expect(detectSnesHacks(on.bytes).choices.skateMarks).toBe(true)
      expect(Buffer.compare(buildRom(applySnesHacks(on, { skateMarks: false })), buildRom(rom))).toBe(0)
    })
  })
})
