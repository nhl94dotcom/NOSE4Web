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

describe.skipIf(!existsSync(path('nhl94.bin')))('fighting penalty time (Genesis)', () => {
  it(".3's store calls code that gives the fighting penalties the set time", () => {
    const rom = open('nhl94.bin')
    expect(hex(rom.bytes, 0x1232c, 8)).toBe('358200660242efff')
    const on = applyHacks(rom, { ...NO_HACKS, fightSeconds: 150 })
    expect(u16(on.bytes, 0x1232c)).toBe(0x4eb9)
    const code = (u16(on.bytes, 0x1232e) << 16) | u16(on.bytes, 0x12330)
    // (a0) $26 or $28: keep d2's flags, the time 150 ($96); then the store and the andi.
    expect(hex(on.bytes, code, 30)).toBe('0c100026670' + '60c10002866080242300000420096358200660242efff4e75')
    expect(detectHacks(on.bytes).choices.fightSeconds).toBe(150)
    // With the penalty time too, each where it is.
    const both = applyHacks(on, { ...NO_HACKS, fightSeconds: 150, penaltySeconds: 30 })
    expect(detectHacks(both.bytes).choices).toEqual({ ...NO_HACKS, fightSeconds: 150, penaltySeconds: 30 })
    expect(Buffer.compare(buildRom(applyHacks(both, NO_HACKS)), buildRom(rom))).toBe(0)
  })
})

describe.skipIf(!existsSync(path('NHL94.smc')))('fighting penalty time (SNES)', () => {
  it("InProgress's .6 calls code that gives the fighting penalties the set time", () => {
    const rom = open('NHL94.smc')
    expect(hex(rom.bytes, 0xf3628, 4)).toBe('1865a5a8')
    const on = applySnesHacks(rom, {}, false, { fightTime: 150 }).bytes
    expect(on[0xf3628]).toBe(0x22)
    const code = ((on[0xf362b] & 0x7f) << 15) | ((on[0xf3629] | (on[0xf362a] << 8)) & 0x7fff)
    // clc / adc d0 / tay; lda [a0] / and #$FF; $2A or $2C: lda #$2096 / sta d2; rtl.
    expect(hex(on, code, 25)).toMatch(/^1865a5a8a7..29ff00c92a00f005c92c00d005a9962085..6b$/)
    expect(detectSnesHacks(on).amounts?.fightTime).toBe(150)
    const both = applySnesHacks(openRom(buildRom({ ...rom, bytes: on })), {}, false, { penaltyTime: 30 })
    expect(detectSnesHacks(both.bytes).amounts).toMatchObject({ fightTime: 150, penaltyTime: 30 })
    const changed = applySnesHacks(both, {}, false, { fightTime: 240 })
    expect(detectSnesHacks(changed.bytes).amounts?.fightTime).toBe(240)
    const back = applySnesHacks(changed, {}, false, { fightTime: 0, penaltyTime: 60 })
    expect(Buffer.compare(buildRom(back), buildRom(rom))).toBe(0)
  })

  snesNames.forEach((name) => {
    it(`${name}: goes in and comes out`, () => {
      const rom = open(name)
      expect(detectSnesHacks(rom.bytes).unknown).not.toContain('fightTime')
      const on = openRom(buildRom(applySnesHacks(rom, {}, false, { fightTime: 120 })))
      expect(detectSnesHacks(on.bytes).amounts?.fightTime).toBe(120)
      // McMarkis's builds' FightCoincidental pairs the fighters at the set time, not 5:00.
      const before = Buffer.from(rom.bytes).toString('hex')
      if (/a5..c92c21d0..da84..a23400/.test(before)) {
        const after = Buffer.from(on.bytes).toString('hex')
        expect(after).toMatch(/a5..c97820d0..da84..a23400/)
        expect(after).toMatch(/29ff07c97800f0/)
      }
      expect(Buffer.compare(buildRom(applySnesHacks(on, {}, false, { fightTime: 0 })), buildRom(rom))).toBe(0)
    })
  })
})
