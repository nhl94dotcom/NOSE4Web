import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildRom, openRom } from '../src/core/rom'
import { applySnesHacks, detectSnesHacks, RECOMMENDED_SNES_FIXES } from '../src/core/sneshacks'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
const far = (b: Uint8Array, at: number) => ((b[at + 3] & 0x7f) << 15) | ((b[at + 1] | (b[at + 2] << 8)) & 0x7fff)

describe('SNES: B and L / R while the skater is busy', () => {
  it('both are among the recommended fixes', () => {
    expect(RECOMMENDED_SNES_FIXES).toContain('lockedChangeFix')
    expect(RECOMMENDED_SNES_FIXES).toContain('lockedDefenceFix')
  })
})

describe.skipIf(!existsSync(path('NHL94.smc')))('SNES: B and L / R while the skater is busy, in the ROM', () => {
  it("findpc's .4 ($9F:CC51) passes over the pad's own skater while he is locked", () => {
    const rom = open('NHL94.smc')
    expect(hex(rom.bytes, 0xfcc51, 9)).toBe('bdd4193004c5b5d03c')
    const on = applySnesHacks(rom, { lockedChangeFix: true }).bytes
    expect(on[0xfcc51]).toBe(0x22)
    expect(hex(on, 0xfcc55, 5)).toBe('eac5b5d03c')
    // lda playerpad,x / bmi take / cmp d4 / bne r / lda pfalock,x / beq take / lda #$FFFF / rtl / take: lda d4 / r: rtl
    expect(hex(on, far(on, 0xfcc51), 21)).toBe('bdd419300dc5b5d00bbde314f004a9ffff6ba5b56b')
    expect(detectSnesHacks(on).choices.lockedChangeFix).toBe(true)
    expect(Buffer.compare(buildRom(applySnesHacks(openRom(buildRom({ ...rom, bytes: on })), { lockedChangeFix: false })), buildRom(rom))).toBe(0)
  })

  it("doinput's .22 ($9F:C336) takes L and R for a locked skater", () => {
    const rom = open('NHL94.smc')
    expect(hex(rom.bytes, 0xfc336, 7)).toBe('a5a9890080d0e9')
    const on = applySnesHacks(rom, { lockedDefenceFix: true }).bytes
    expect(on[0xfc336]).toBe(0x22)
    expect(hex(on, 0xfc33a, 3)).toBe('ead0e9')
    // B or X: as before. L or R, not a goalie: jsl PadTakeLeftDefense / RightDefense (.11 / .12's jml), A = 0.
    expect(hex(on, far(on, 0xfc336), 44)).toBe('a5a98940c0d01f893000f01abd430ff015a5a9892000f006224dcd9f8004222fcd9fa900006ba5a98900806b')
    // PadTakeLeftDefense: ldy #0 / cpx #$000C
    expect(hex(on, 0xfcd4d, 6)).toBe('a00000e00c00')
    expect(detectSnesHacks(on).choices.lockedDefenceFix).toBe(true)
    expect(Buffer.compare(buildRom(applySnesHacks(openRom(buildRom({ ...rom, bytes: on })), { lockedDefenceFix: false })), buildRom(rom))).toBe(0)
  })

  names.forEach((name) => {
    it(`${name}: both go in and come out`, () => {
      const rom = open(name)
      const before = detectSnesHacks(rom.bytes)
      expect(before.unknown).not.toContain('lockedChangeFix')
      expect(before.unknown).not.toContain('lockedDefenceFix')
      const on = openRom(buildRom(applySnesHacks(rom, { lockedChangeFix: true, lockedDefenceFix: true })))
      const after = detectSnesHacks(on.bytes)
      expect(after.choices.lockedChangeFix).toBe(true)
      expect(after.choices.lockedDefenceFix).toBe(true)
      expect(Buffer.compare(buildRom(applySnesHacks(on, { lockedChangeFix: false, lockedDefenceFix: false })), buildRom(rom))).toBe(0)
    })
  })
})
