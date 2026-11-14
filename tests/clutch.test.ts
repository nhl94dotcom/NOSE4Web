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

describe.skipIf(!existsSync(path('nhl94.bin')))('clutch time (Genesis)', () => {
  it("AttributeCalc's end and the clock's tick call the clutch code", () => {
    const rom = open('nhl94.bin')
    expect(hex(rom.bytes, 0xf713a, 10)).toBe('024300ff4cdf02074e75')
    expect(hex(rom.bytes, 0x15dfa, 10)).toBe('5378c4680c78003dc468')
    const on = applyHacks(rom, { ...NO_HACKS, clutchTime: true })
    // jmp to the code, then nops; the code ends with AttributeCalc's own movem / rts.
    expect(u16(on.bytes, 0xf713a)).toBe(0x4ef9)
    expect(hex(on.bytes, 0xf7140, 4)).toBe('4e714e71')
    const calc = (u16(on.bytes, 0xf713c) << 16) | u16(on.bytes, 0xf713e)
    // Aggression ($F in TempWord2, $BF14) left out; gsp 2, gameclock <= 120, within a goal; +3, capped at 30.
    expect(hex(on.bytes, calc, 12)).toBe('024300ff0c78000fbf14672c')
    expect(hex(on.bytes, calc + 46, 14)).toBe('56430c43001e6302761e4cdf0207')
    // The tick: jsr / nops, the code ending with the game's cmpi #61 for its bgt.
    expect(u16(on.bytes, 0x15dfa)).toBe(0x4eb9)
    const tick = (u16(on.bytes, 0x15dfc) << 16) | u16(on.bytes, 0x15dfe)
    expect(hex(on.bytes, tick, 10)).toBe('5378c4680c780078c468')
    // The 9 ratings the pass adds to (not aioff, aidef or aggress).
    expect(hex(on.bytes, tick + 98, 18)).toBe('00680069006c006d006e0070007100720075')
    expect(detectHacks(on.bytes).choices).toEqual({ ...NO_HACKS, clutchTime: true })
    expect(Buffer.compare(buildRom(applyHacks(on, NO_HACKS)), buildRom(rom))).toBe(0)
    // With the other rating hacks.
    const all = applyHacks(rom, { ...NO_HACKS, clutchTime: true, hotColdRange: 4, bonuses: 'disabled' })
    expect(detectHacks(all.bytes).choices).toEqual({ ...NO_HACKS, clutchTime: true, hotColdRange: 4, bonuses: 'disabled' })
  })

  it('recognises the first version (which read $D6CC) and replaces it', () => {
    const rom = open('nhl94.bin')
    const on = applyHacks(rom, { ...NO_HACKS, clutchTime: true })
    const calc = (u16(on.bytes, 0xf713c) << 16) | u16(on.bytes, 0xf713e)
    const old = on.bytes.slice()
    old.set([0xd6, 0xcc], calc + 8)
    expect(detectHacks(old).choices.clutchTime).toBe(true)
    const project = openRom(buildRom({ ...on, bytes: old }))
    expect(Buffer.compare(buildRom(applyHacks(project, NO_HACKS)), buildRom(rom))).toBe(0)
    const again = applyHacks(project, { ...NO_HACKS, clutchTime: true })
    const calc2 = (u16(again.bytes, 0xf713c) << 16) | u16(again.bytes, 0xf713e)
    expect(hex(again.bytes, calc2 + 8, 2)).toBe('bf14')
  })
})

describe.skipIf(!existsSync(path('NHL94.smc')))('clutch time (SNES)', () => {
  it("setplayer's .8 ends in a jml to the clutch code, and Gameloop's tick calls the pass", () => {
    const rom = open('NHL94.smc')
    expect(hex(rom.bytes, 0xfd24c, 6)).toBe('c22029ff006b')
    const on = applySnesHacks(rom, { clutchTime: true }).bytes
    expect(on[0xfd24c]).toBe(0x5c)
    expect(hex(on, 0xfd250, 2)).toBe('eaea')
    const calc = far(on, 0xfd24c)
    // rep / and #$FF / pha / tya / sec / sbc r3 / cmp #11 (aggression).
    expect(hex(on, calc, 12)).toBe('c22029ff00489838e514c90b')
    expect(on[0xf85bd]).toBe(0x22)
    const tick = far(on, 0xf85bd)
    // dec gameclock / lda gameclock / cmp #120; the first lda CwdExciteLvl at 47; legstr $12E3 first in the pass.
    expect(hex(on, tick, 9)).toBe('ce3216ad3216c97800')
    expect(hex(on, tick + 47, 3)).toBe('adbe19')
    // The pass keeps X (Gameloop's frame count): phx / ldx #$16 ... plx / lda CwdExciteLvl / rtl.
    expect(hex(on, tick + 51, 7)).toBe('daa21600bde312')
    expect(hex(on, tick + 51 + 4 + 9 * 12 + 4, 5)).toBe('faadbe196b')
    expect(detectSnesHacks(on).vaultVersions).not.toContain('clutchTime')
    const state = detectSnesHacks(on)
    expect(state.choices.clutchTime).toBe(true)
    expect(Buffer.compare(buildRom(applySnesHacks(openRom(buildRom({ ...rom, bytes: on })), { clutchTime: false })), buildRom(rom))).toBe(0)
    // NOSE4Web's first version, whose pass lost X: recognised, taken out, and replaced.
    const first = on.slice()
    const length = 64 + 9 * 12
    const firstTick = Buffer.concat([Buffer.from(on.subarray(tick, tick + 51)), Buffer.from(on.subarray(tick + 52, tick + length - 5)), Buffer.from(on.subarray(tick + length - 4, tick + length))])
    first.fill(0xff, tick, tick + length)
    first.set(firstTick, tick)
    expect(detectSnesHacks(first).choices.clutchTime).toBe(true)
    expect(detectSnesHacks(first).vaultVersions).toContain('clutchTime')
    const firstProject = openRom(buildRom({ ...rom, bytes: first }))
    expect(Buffer.compare(buildRom(applySnesHacks(firstProject, { clutchTime: false })), buildRom(rom))).toBe(0)
    const updated = applySnesHacks(firstProject, { clutchTime: true }, true).bytes
    expect(detectSnesHacks(updated).vaultVersions).not.toContain('clutchTime')
    expect(hex(updated, far(updated, 0xf85bd) + 51, 4)).toBe('daa21600')
    // With the hot and cold bug fix, which changes .8's middle.
    const both = applySnesHacks(rom, { clutchTime: true, hotColdFix: true })
    expect(detectSnesHacks(both.bytes).choices.hotColdFix).toBe(true)
    expect(detectSnesHacks(both.bytes).choices.clutchTime).toBe(true)
  })

  snesNames.forEach((name) => {
    it(`${name}: goes in and comes out`, () => {
      const rom = open(name)
      expect(detectSnesHacks(rom.bytes).unknown).not.toContain('clutchTime')
      const on = openRom(buildRom(applySnesHacks(rom, { clutchTime: true })))
      expect(detectSnesHacks(on.bytes).choices.clutchTime).toBe(true)
      expect(Buffer.compare(buildRom(applySnesHacks(on, { clutchTime: false })), buildRom(rom))).toBe(0)
    })
  })
})
