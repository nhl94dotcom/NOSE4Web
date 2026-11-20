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

describe.skipIf(!existsSync(path('NHL94.smc')))('SNES: open net shot fix', () => {
  it("shotdiradj's ldx a3 / stz d0 ($9E:E094) becomes a jsl to code that sets d0 to 8", () => {
    const rom = open('NHL94.smc')
    expect(hex(rom.bytes, 0xf6094, 6)).toBe('a69564a5a5b5')
    expect(detectSnesHacks(rom.bytes).choices.openNetFix).toBe(false)
    const on = applySnesHacks(rom, { openNetFix: true }).bytes
    expect(on[0xf6094]).toBe(0x22)
    expect(hex(on, 0xf6098, 2)).toBe('a5b5')
    // ldx a3 / lda #8 / sta d0 / rtl
    expect(hex(on, far(on, 0xf6094), 8)).toBe('a695a9080085a56b')
    expect([...on.keys()].filter((i) => on[i] !== rom.bytes[i] && (i < 0xf6094 || i > 0xf6097)).every((i) => i >= far(on, 0xf6094) && i < far(on, 0xf6094) + 8)).toBe(true)
  })

  it.each(names)('goes in, is recognised and comes out in %s', (name) => {
    const rom = open(name)
    const before = detectSnesHacks(rom.bytes)
    expect(before.choices.openNetFix).toBe(false)
    expect(before.unknown).not.toContain('openNetFix')
    const on = openRom(buildRom(applySnesHacks(rom, { openNetFix: true })))
    const after = detectSnesHacks(on.bytes)
    expect(after.choices).toEqual({ ...before.choices, openNetFix: true })
    expect(Buffer.compare(buildRom(applySnesHacks(on, { openNetFix: false })), buildRom(rom))).toBe(0)
  })
})
