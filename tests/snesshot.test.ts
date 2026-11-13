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

describe.skipIf(!existsSync(path('NHL94.smc')))('SNES: the shot that never fires', () => {
  it("puckglue's .4 calls code that clears the flags, then sets shot mode again for a shooter still winding up", () => {
    const rom = open('NHL94.smc')
    expect(hex(rom.bytes, 0xf1ac6, 6)).toBe('a90c001cd815')
    const on = applySnesHacks(rom, { shotFix: true }).bytes
    expect(on[0xf1ac6]).toBe(0x22)
    expect(hex(on, 0xf1aca, 2)).toBe('eaea')
    const code = ((on[0xf1ac9] & 0x7f) << 15) | ((on[0xf1ac7] | (on[0xf1ac8] << 8)) & 0x7fff)
    // trb the flags; ldy a2; SPA,y from SPAshotf up to ShotMode's bound; SPAnum,y below $18: tsb sfssdir.
    expect(hex(on, code, 30)).toBe('a90c001cd815a491b9a311c94aed9013c921f0b00eb9c311c91800b006a9')
    expect(hex(on, code + 30, 6)).toBe('08000cd8156b')
    expect(detectSnesHacks(on).choices.shotFix).toBe(true)
    expect(Buffer.compare(buildRom(applySnesHacks(openRom(buildRom({ ...rom, bytes: on })), { shotFix: false })), buildRom(rom))).toBe(0)
  })

  names.forEach((name) => {
    it(`${name}: goes in and comes out`, () => {
      const rom = open(name)
      expect(detectSnesHacks(rom.bytes).unknown).not.toContain('shotFix')
      const on = openRom(buildRom(applySnesHacks(rom, { shotFix: true })))
      expect(detectSnesHacks(on.bytes).choices.shotFix).toBe(true)
      expect(Buffer.compare(buildRom(applySnesHacks(on, { shotFix: false })), buildRom(rom))).toBe(0)
    })
  })
})
