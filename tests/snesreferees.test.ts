import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildRom, openRom } from '../src/core/rom'
import { findCodeAll } from '../src/core/snes'
import { applySnesHacks, detectSnesHacks, SNES_AMOUNT_OFF } from '../src/core/sneshacks'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
const far = (b: Uint8Array, at: number) => ((b[at + 3] & 0x7f) << 15) | ((b[at + 1] | (b[at + 2] << 8)) & 0x7fff)
// checkagr's lda.w #$0014 / sec / sbc.w aggress,x / asl x4 / sta.b d0 and checkint .ci's lda.w #$0014 / sec / sbc.w
// aggress,x / jsl randoma8 / cmp.w #$0002 / bcs, by the code itself.
const find = (b: Uint8Array, pattern: string) => findCodeAll(b, pattern).map((match) => match.at)
const AGR = 'a9140038fd....0a0a0a0a85a5'
const INT = 'a9140038fd....22......c90200b0'

describe('SNES referee strictness', () => {
  it('is off at the original game', () => {
    expect(SNES_AMOUNT_OFF.referees).toBe(2)
  })
})

describe.skipIf(!existsSync(path('NHL94.smc')))('SNES referee strictness in the original game', () => {
  it("checkagr's x16 becomes a jsl to x32, x21, x11 or x7, and interference's 2 becomes 1, 2, 3 or 4", () => {
    const rom = open('NHL94.smc')
    expect(hex(rom.bytes, 0xf4124, 13)).toBe('a9140038fd43140a0a0a0a85a5')
    expect(hex(rom.bytes, 0xf3ab2, 15)).toBe('a9140038fd43142285b39bc90200b0')
    const codes = [
      '0a0a0a0a0a6beaeaeaeaeaeaea',
      '85a50a0a1865a50a0a1865a56b',
      '',
      '85a50a0a1865a50a1865a56bea',
      '85a50a0a0a38e5a56beaeaeaea',
    ]
    for (const level of [0, 1, 3, 4]) {
      const on = applySnesHacks(rom, {}, false, { referees: level }).bytes
      expect(on[0xf412b]).toBe(0x22)
      expect(hex(on, far(on, 0xf412b), 13)).toBe(codes[level])
      expect(hex(on, 0xf3abe, 2)).toBe(`0${[1, 2, 2, 3, 4][level]}00`)
    }
  })
})

describe.skipIf(names.length === 0)('SNES referee strictness in every ROM', () => {
  it.each(names)('%s: each level changes only its places, reads back and comes out', (name) => {
    const rom = open(name)
    const [agr] = find(rom.bytes, AGR)
    const [int] = find(rom.bytes, INT)
    expect(find(rom.bytes, AGR)).toHaveLength(1)
    expect(find(rom.bytes, INT)).toHaveLength(1)
    const before = detectSnesHacks(rom.bytes)
    expect(before.unknown).not.toContain('referees')
    expect(before.amounts?.referees).toBe(2)
    for (const level of [0, 1, 3, 4]) {
      const on = applySnesHacks(rom, {}, false, { referees: level })
      const site = agr + 7
      const code = far(on.bytes, site)
      const changed = on.bytes.reduce((list, b, i) => (b !== rom.bytes[i] ? [...list, i] : list), [] as number[])
      const allowed = (i: number) => (i >= site && i < site + 4) || (i >= code && i < code + 13) || i === int + 12
      expect(changed.filter((i) => !allowed(i))).toEqual([])
      expect(on.bytes[int + 12]).toBe([1, 2, 2, 3, 4][level])
      const read = detectSnesHacks(openRom(buildRom(on)).bytes)
      expect(read.choices.referees).toBe(true)
      expect(read.amounts?.referees).toBe(level)
      expect(read.unknown).toEqual(before.unknown)
      // Another level over it, then the original game again.
      const other = applySnesHacks(on, {}, false, { referees: level === 4 ? 0 : 4 })
      expect(detectSnesHacks(other.bytes).amounts?.referees).toBe(level === 4 ? 0 : 4)
      expect(Buffer.compare(buildRom(applySnesHacks(other, {}, false, { referees: 2 })), buildRom(rom))).toBe(0)
      expect(Buffer.compare(buildRom(applySnesHacks(openRom(buildRom(on)), { referees: false })), buildRom(rom))).toBe(0)
    }
  })
})
