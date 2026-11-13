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

describe.skipIf(!existsSync(path('NHL94.smc')))('SNES: the one-timer that never fires', () => {
  it("asspassrec's .6 ($9E:E77E) calls code that ends a wind-up still waiting, then clears the receiver", () => {
    const rom = open('NHL94.smc')
    expect(hex(rom.bytes, 0xf677e, 6)).toBe('a9ffff8d070d')
    const on = applySnesHacks(rom, { oneTimerFix: true }).bytes
    expect(on[0xf677e]).toBe(0x22)
    expect(hex(on, 0xf6782, 2)).toBe('eaea')
    const code = ((on[0xf6781] & 0x7f) << 15) | ((on[0xf677f] | (on[0xf6780] << 8)) & 0x7fff)
    // SPA,x one of the two swings, SPAnum,x below $10: lda #SPAglide / jsl SetSPAFromA; then the original's.
    expect(hex(on, code, 35)).toBe('bda311c96eeff005c920f0d00fbdc311c91000b007a91aea22f1a39e' + 'a9ffff8d070d6b')
    expect(detectSnesHacks(on).choices.oneTimerFix).toBe(true)
    expect(Buffer.compare(buildRom(applySnesHacks(openRom(buildRom({ ...rom, bytes: on })), { oneTimerFix: false })), buildRom(rom))).toBe(0)
  })

  names.forEach((name) => {
    it(`${name}: goes in and comes out`, () => {
      const rom = open(name)
      expect(detectSnesHacks(rom.bytes).unknown).not.toContain('oneTimerFix')
      const on = openRom(buildRom(applySnesHacks(rom, { oneTimerFix: true })))
      expect(detectSnesHacks(on.bytes).choices.oneTimerFix).toBe(true)
      expect(Buffer.compare(buildRom(applySnesHacks(on, { oneTimerFix: false })), buildRom(rom))).toBe(0)
    })
  })
})
