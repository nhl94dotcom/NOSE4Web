import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildRom, openRom } from '../src/core/rom'
import { applySnesHacks, detectSnesHacks, SNES_HACKS } from '../src/core/sneshacks'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
const off = (bank: number, address: number) => ((bank & 0x7f) << 15) | (address & 0x7fff)
const target = (b: Uint8Array, at: number) => {
  expect(b[at]).toBe(0x22)
  return off(b[at + 3], b[at + 1] | (b[at + 2] << 8))
}

describe.skipIf(!existsSync(path('NHL94.smc')))('SNES icing options', () => {
  // The original game's places (Match Viewer): PuckIChk's mark at $9E:F783, pucknorm's jsl PuckIChk.
  const MARK = 0xf7783
  const CALL = 0xf5d3f

  it('the crease: the mark calls code that drops icing within |x| 44, else marks; its rtl stays', () => {
    const rom = open('NHL94.smc')
    expect(hex(rom.bytes, MARK, 7)).toBe('a901000cf10c6b')
    const on = applySnesHacks(rom, { creaseIcing: true }).bytes
    expect(hex(on, MARK + 4, 3)).toBe('eaea6b')
    const code = target(on, MARK)
    // lda puckx / bpl / negate / cmp #$2D / bcs mark / trb ifok / rtl / tsb ifcgl / rtl.
    expect(hex(on, code, 27)).toBe('ad710d100449ffff1ac92d00b007a904001cf10c6b' + 'a90100' + '0cf10c')
    expect(detectSnesHacks(on).choices.creaseIcing).toBe(true)
    expect(Buffer.compare(buildRom(applySnesHacks(openRom(buildRom({ ...rom, bytes: on })), { creaseIcing: false })), buildRom(rom))).toBe(0)
  })

  it('hybrid: pucknorm calls code that calls PuckIChk, then decides a fresh crossing', () => {
    const rom = open('NHL94.smc')
    expect(hex(rom.bytes, CALL, 4)).toBe('2251f79e')
    const on = applySnesHacks(rom, { hybridIcing: true }).bytes
    const code = target(on, CALL)
    // lda iflags / pha / jsl PuckIChk / pla / bit #ifcgl.
    expect(hex(on, code, 15)).toBe('adf10c482251f79e68890100f0016b')
    const body = hex(on, code, 200)
    // AddPenalty with X and a3 the icer, d0 PenIcing; the wave-off trb ifok.
    expect(body).toContain('adf20c29ff000aaa8595a90c0085a5225eb89e')
    expect(body).toContain('a904001cf10c')
    // The objects' fields: position, pflags (unavailable $1000), Ypos, pfteam.
    expect(body).toContain('bd430f')
    expect(body).toContain('bd8312890010')
    expect(body).toContain('bdb70d38e305')
    expect(body).toContain('bd0315')
    expect(detectSnesHacks(on).choices.hybridIcing).toBe(true)
    expect(Buffer.compare(buildRom(applySnesHacks(openRom(buildRom({ ...rom, bytes: on })), { hybridIcing: false })), buildRom(rom))).toBe(0)
  })

  it('both together, in either order, and each comes out alone', () => {
    const rom = open('NHL94.smc')
    const both = applySnesHacks(applySnesHacks(rom, { creaseIcing: true }), { hybridIcing: true })
    const other = applySnesHacks(applySnesHacks(rom, { hybridIcing: true }), { creaseIcing: true })
    for (const r of [both, other]) {
      const read = detectSnesHacks(r.bytes)
      expect(read.choices.creaseIcing && read.choices.hybridIcing).toBe(true)
      expect(read.unknown).toEqual(detectSnesHacks(rom.bytes).unknown)
    }
    expect(detectSnesHacks(applySnesHacks(both, { creaseIcing: false }).bytes).choices.hybridIcing).toBe(true)
    expect(detectSnesHacks(applySnesHacks(both, { hybridIcing: false }).bytes).choices.creaseIcing).toBe(true)
    expect(Buffer.compare(buildRom(applySnesHacks(both, { creaseIcing: false, hybridIcing: false })), buildRom(rom))).toBe(0)
  })

  it('go with every other SNES hack, in and out', () => {
    const rom = open('NHL94.smc')
    const state = detectSnesHacks(rom.bytes)
    for (const hack of SNES_HACKS) {
      if (hack === 'creaseIcing' || hack === 'hybridIcing' || state.unknown.includes(hack)) continue
      let base
      try {
        base = applySnesHacks(rom, { [hack]: true })
      } catch {
        continue
      }
      const with2 = applySnesHacks(base, { creaseIcing: true, hybridIcing: true })
      const read = detectSnesHacks(with2.bytes)
      expect(read.unknown, hack).toEqual(detectSnesHacks(base.bytes).unknown)
      expect(read.choices[hack], hack).toBe(true)
      expect(read.choices.creaseIcing && read.choices.hybridIcing, hack).toBe(true)
      expect(Buffer.compare(buildRom(applySnesHacks(with2, { creaseIcing: false, hybridIcing: false })), buildRom(base)), hack).toBe(0)
    }
  })

  names.forEach((name) => {
    it(`${name}: both go in and come out`, () => {
      const rom = open(name)
      const state = detectSnesHacks(rom.bytes)
      expect(state.unknown).not.toContain('creaseIcing')
      expect(state.unknown).not.toContain('hybridIcing')
      const on = openRom(buildRom(applySnesHacks(rom, { creaseIcing: true, hybridIcing: true })))
      const read = detectSnesHacks(on.bytes)
      expect(read.choices.creaseIcing && read.choices.hybridIcing).toBe(true)
      expect(Buffer.compare(buildRom(applySnesHacks(on, { creaseIcing: false, hybridIcing: false })), buildRom(rom))).toBe(0)
    })
  })
})
