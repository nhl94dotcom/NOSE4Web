import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyHacks, detectHacks, NO_HACKS } from '../src/core/hacks'
import { buildRom, openRom } from '../src/core/rom'
import { applySnesHacks, detectSnesHacks } from '../src/core/sneshacks'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const snesNames = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
const u16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1]
const far = (b: Uint8Array, at: number) => ((b[at + 3] & 0x7f) << 15) | ((b[at + 1] | (b[at + 2] << 8)) & 0x7fff)

describe.skipIf(!existsSync(path('nhl94.bin')))('choppy ice (Genesis)', () => {
  it("updateplayers' slowing calls code that adds to the puck's as the period goes on", () => {
    const rom = open('nhl94.bin')
    expect(hex(rom.bytes, 0xac1c, 2)).toBe('7409')
    const on = applyHacks(rom, { ...NO_HACKS, choppyIce: true })
    expect(u16(on.bytes, 0xac1e)).toBe(0x4eb9)
    expect(hex(on.bytes, 0xac24, 34)).toBe('4e71'.repeat(17))
    const code = (u16(on.bytes, 0xac20) << 16) | u16(on.bytes, 0xac22)
    // The puck (SCnum 14); PerTimeTotal $C46C, gameclock $C468; L = 4 x gone / total, at most 4.
    expect(hex(on.bytes, code, 30)).toBe('48e7540076000c6b000e005266223238c46c671c3a019a78c4686f14e545')
    expect(detectHacks(on.bytes).choices).toEqual({ ...NO_HACKS, choppyIce: true })
    expect(Buffer.compare(buildRom(applyHacks(on, NO_HACKS)), buildRom(rom))).toBe(0)
    // With the Puck friction option, which changes the moveq before it.
    const both = applyHacks(rom, { ...NO_HACKS, choppyIce: true, puckFriction: 8 })
    expect(detectHacks(both.bytes).choices).toEqual({ ...NO_HACKS, choppyIce: true, puckFriction: 8 })
  })
})

describe.skipIf(!existsSync(path('NHL94.smc')))('choppy ice (SNES)', () => {
  it("updateplayers' .1xx calls code that adds to the puck's friction as the period goes on", () => {
    const rom = open('NHL94.smc')
    expect(hex(rom.bytes, 0xf877d, 5)).toBe('bec30ea5ad')
    const on = applySnesHacks(rom, { choppyIce: true }).bytes
    expect(on[0xf877d]).toBe(0x22)
    expect(on[0xf8781]).toBe(0xea)
    const code = far(on, 0xf877d)
    // cpy #$1C; PerTimeTotal $1C82, gameclock $1632; Xfrac $0D77; then ldx Xvel,y / lda d2 / rtl.
    expect(hex(on, code, 3)).toBe('c01c00')
    expect(hex(on, code + 10, 7)).toBe('38ad821ced3216')
    expect(hex(on, code + 58, 6)).toBe('bec30ea5ad6b')
    expect(detectSnesHacks(on).choices.choppyIce).toBe(true)
    expect(Buffer.compare(buildRom(applySnesHacks(openRom(buildRom({ ...rom, bytes: on })), { choppyIce: false })), buildRom(rom))).toBe(0)
  })

  snesNames.forEach((name) => {
    it(`${name}: goes in and comes out`, () => {
      const rom = open(name)
      expect(detectSnesHacks(rom.bytes).unknown).not.toContain('choppyIce')
      const on = openRom(buildRom(applySnesHacks(rom, { choppyIce: true })))
      expect(detectSnesHacks(on.bytes).choices.choppyIce).toBe(true)
      expect(Buffer.compare(buildRom(applySnesHacks(on, { choppyIce: false })), buildRom(rom))).toBe(0)
    })
  })
})
