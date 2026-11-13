import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildRom, openRom } from '../src/core/rom'
import { applySnesHacks, detectSnesHacks } from '../src/core/sneshacks'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
const far = (b: Uint8Array, at: number) => ((b[at + 3] & 0x7f) << 15) | ((b[at + 1] | (b[at + 2] << 8)) & 0x7fff)

describe.skipIf(!existsSync(path('NHL94.smc')))('SNES: time on ice for each player', () => {
  it("updateplayers' tick adds a second to the player's word at $7E:E800, and each game's start clears them", () => {
    const rom = open('NHL94.smc')
    // updateplayers: jsl loadTeamStruct ($9F:C757) after asl.b d0; StartGame_scout: jsl ScoutingReport.
    expect(hex(rom.bytes, 0xf8723, 4)).toBe('2257c79f')
    expect(rom.bytes[0xf8338]).toBe(0x22)
    const scouting = hex(rom.bytes, 0xf8339, 3)
    const on = applySnesHacks(rom, { timeOnIce: true }).bytes
    // jsl loadTeamStruct / cpx #$18 / bcs r / phx / lda d0 / and #$FF / cpx #$0C / bcc home / clc / adc #$34 /
    // home: tax / lda ptoi,x / cmp #5999 / bcs top / inc / sta ptoi,x / top: plx / r: rtl
    expect(hex(on, far(on, 0xf8723), 41)).toBe('2257c79fe01800b01fdaa5a529ff00e00c00900418693400aabf00e87ec96f17b0051a9f00e87efa6b')
    // lda #0 / ldx #$66 / loop: sta ptoi,x / dex / dex / bpl loop / jml ScoutingReport
    expect(hex(on, far(on, 0xf8338), 18)).toBe('a90000a266009f00e87ecaca10f85c' + scouting)
    expect(far(on, 0xf8723)).not.toBe(far(on, 0xf8338))
    expect(detectSnesHacks(on).choices.timeOnIce).toBe(true)
    expect(Buffer.compare(buildRom(applySnesHacks(openRom(buildRom({ ...rom, bytes: on })), { timeOnIce: false })), buildRom(rom))).toBe(0)
  })

  names.forEach((name) => {
    it(`${name}: goes in and comes out, or is not offered where the build counts its own`, () => {
      const rom = open(name)
      const state = detectSnesHacks(rom.bytes)
      if (state.notOffered?.timeOnIce) {
        expect(state.notOffered.timeOnIce).toMatch(/time on ice itself/)
        expect(() => applySnesHacks(rom, { timeOnIce: true })).toThrow()
        return
      }
      expect(state.unknown).not.toContain('timeOnIce')
      const on = openRom(buildRom(applySnesHacks(rom, { timeOnIce: true })))
      expect(detectSnesHacks(on.bytes).choices.timeOnIce).toBe(true)
      expect(Buffer.compare(buildRom(applySnesHacks(on, { timeOnIce: false })), buildRom(rom))).toBe(0)
    })
  })
})
