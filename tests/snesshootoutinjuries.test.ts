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
  expect(hex(b, at + 4, 2)).toBe('eaea')
  return off(b[at + 3], b[at + 1] | (b[at + 2] << 8))
}

describe.skipIf(!existsSync(path('NHL94.smc')))('SNES: the injured sit out the shootout', () => {
  // PlayShootout's .t1x (the visitors) and .t1xx (home): tay / sep #$20 / lda list,y.
  const AWAY = 0x48fb
  const HOME = 0x4926

  it("each turn's shooter: past the listed players out for the game, as the saved tmpdst has them", () => {
    const rom = open('NHL94.smc')
    expect(hex(rom.bytes, AWAY, 8)).toBe('a8e220b9791dc220')
    expect(hex(rom.bytes, HOME, 8)).toBe('a8e220b9711dc220')
    const on = applySnesHacks(rom, { shootoutInjuries: true }).bytes
    for (const [site, list, team] of [[AWAY, '791d', '3400'], [HOME, '711d', '0000']] as const) {
      const code = hex(on, target(on, site), 70)
      // tay, then the season shootout's mark ($7E:F0F0).
      expect(code.startsWith('a8aff0f07e29ff00f0')).toBe(true)
      // The listed player's saved tmpdst ($7E:F100 + $27F, his team's half) tested for $FFFC.
      expect(code).toContain(`3a0a1869${team}aabf7ff37ec9fcff`)
      // Back to the original: sep #$20 / lda list,y / rtl.
      expect(code).toContain(`e220b9${list}6b`)
    }
    expect(detectSnesHacks(on).choices.shootoutInjuries).toBe(true)
    expect(Buffer.compare(buildRom(applySnesHacks(openRom(buildRom({ ...rom, bytes: on })), { shootoutInjuries: false })), buildRom(rom))).toBe(0)
  })

  it('goes with every other SNES hack, in and out', () => {
    const rom = open('NHL94.smc')
    const state = detectSnesHacks(rom.bytes)
    for (const hack of SNES_HACKS) {
      if (hack === 'shootoutInjuries' || state.unknown.includes(hack)) continue
      let base
      try {
        base = applySnesHacks(rom, { [hack]: true })
      } catch {
        continue
      }
      const both = applySnesHacks(base, { shootoutInjuries: true })
      const read = detectSnesHacks(both.bytes)
      expect(read.unknown, hack).toEqual(detectSnesHacks(base.bytes).unknown)
      expect(read.choices[hack], hack).toBe(true)
      expect(read.choices.shootoutInjuries, hack).toBe(true)
      expect(Buffer.compare(buildRom(applySnesHacks(both, { shootoutInjuries: false })), buildRom(base)), hack).toBe(0)
    }
  })

  // The SA-1 builds: the lists at +$6000, the saved state in bank $40.
  const sa1 = names.find((name) => /SA1/.test(name))
  it.skipIf(!sa1)('on the SA-1 build: its lists and its saved state', () => {
    const on = applySnesHacks(open(sa1!), { shootoutInjuries: true }).bytes
    const all = Buffer.from(on).toString('hex')
    expect(all).toContain('aabf8f4a40c9fcff')
    expect(all).toContain('e220b9797d6b')
  })

  names.forEach((name) => {
    it(`${name}: goes in and comes out`, () => {
      const rom = open(name)
      expect(detectSnesHacks(rom.bytes).unknown).not.toContain('shootoutInjuries')
      const on = openRom(buildRom(applySnesHacks(rom, { shootoutInjuries: true })))
      expect(detectSnesHacks(on.bytes).choices.shootoutInjuries).toBe(true)
      expect(Buffer.compare(buildRom(applySnesHacks(on, { shootoutInjuries: false })), buildRom(rom))).toBe(0)
    })
  })
})
