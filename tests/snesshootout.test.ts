import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildRom, openRom } from '../src/core/rom'
import { snesCodeInPlace } from '../src/core/snes'
import { applySnesHacks, detectSnesHacks } from '../src/core/sneshacks'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (bytes: Uint8Array, at: number, count: number) => Buffer.from(bytes.subarray(at, at + count)).toString('hex')
const offset = (bank: number, address: number) => ((bank & 0x7f) << 15) | (address & 0x7fff)

describe.skipIf(!existsSync(path('NHL94.smc')))('the SNES shootout for tied regular-season games', () => {
  // Opened when a test runs, so that the tests skip where the ROMs are not.
  let opened: ReturnType<typeof open> | undefined
  const retail = () => (opened ??= open('NHL94.smc'))
  // PeriodOver's lda #4 / sta gsp after overtime ($9F:8D6A), its tie test ($9F:8D70), clockcont_0's beq .7.
  const AFTER = 0xf8d51 + 25
  const TIE = 0xf8d51 + 31
  const CLOCK = 0xf8c96 + 12

  it('after one overtime: the hook, its code, every branch landing where it should, and out again', () => {
    expect(hex(retail().bytes, AFTER, 6)).toBe('a904008d3016')
    const on = applySnesHacks(retail(), {}, false, { seasonShootout: 1 })
    expect(detectSnesHacks(on.bytes).amounts?.seasonShootout).toBe(1)
    expect(on.bytes[AFTER]).toBe(0x22)
    expect(hex(on.bytes, AFTER + 4, 2)).toBe('eaea')
    expect(hex(on.bytes, CLOCK, 2)).toBe('eaea')
    expect(hex(on.bytes, TIE, 6)).toBe('ad8e17cd9017')
    const a = offset(on.bytes[AFTER + 3], on.bytes[AFTER + 1] | (on.bytes[AFTER + 2] << 8))
    // A: bne +$0E from 9 to the mark's clearing at 23; bne +$0D from 17 to lda #4 / sta gsp at 30; rtl at 36.
    expect(hex(on.bytes, a + 7, 2)).toBe('d00e')
    expect(hex(on.bytes, a + 23, 3)).toBe('a90000')
    expect(hex(on.bytes, a + 15, 2)).toBe('d00d')
    expect(hex(on.bytes, a + 30, 7)).toBe('a904008d30166b')
    // RUN, at 37: rep #$30; phb; phx; ... jsl PlayShootout ($80:C81C) ... jml PeriodOver ($9F:8CB1).
    const run = a + 37
    expect(hex(on.bytes, run, 4)).toBe('c2308bda')
    const code = hex(on.bytes, run, 160)
    expect(code).toContain('221cc880')
    expect(code).toContain('5cb18c9f')
    // The winner: bcs +3 over ldx #2.
    expect(code).toContain('b003a20200da')
    // Out: the original game.
    expect(Buffer.compare(buildRom(applySnesHacks(on, {}, false, { seasonShootout: 0 })), buildRom(retail()))).toBe(0)
  })

  it('after period 3: the tie test becomes the call, which does the test after, and the choices switch', () => {
    const on = applySnesHacks(retail(), {}, false, { seasonShootout: 2 })
    expect(detectSnesHacks(on.bytes).amounts?.seasonShootout).toBe(2)
    expect(hex(on.bytes, AFTER, 6)).toBe('a904008d3016')
    expect(hex(on.bytes, CLOCK, 2)).toBe('f09f')
    expect(on.bytes[TIE]).toBe(0x22)
    const b = offset(on.bytes[TIE + 3], on.bytes[TIE + 1] | (on.bytes[TIE + 2] << 8))
    // B: bne +$1C from 9 to the mark's clearing at 37; bne +$1D from 15, +$15 from 23, +$0D from 31 to the test at 44.
    expect(hex(on.bytes, b + 7, 2)).toBe('d01c')
    expect(hex(on.bytes, b + 37, 3)).toBe('a90000')
    expect(hex(on.bytes, b + 13, 2)).toBe('d01d')
    expect(hex(on.bytes, b + 21, 2)).toBe('d015')
    expect(hex(on.bytes, b + 29, 2)).toBe('d00d')
    expect(hex(on.bytes, b + 44, 7)).toBe('ad8e17cd90176b')
    // Switched to after one overtime, and back to none.
    const one = applySnesHacks(on, {}, false, { seasonShootout: 1 })
    expect(detectSnesHacks(one.bytes).amounts?.seasonShootout).toBe(1)
    expect(Buffer.compare(buildRom(applySnesHacks(one, {}, false, { seasonShootout: 0 })), buildRom(retail()))).toBe(0)
  })

  it('does not go with overtime until a goal', () => {
    expect(() => applySnesHacks(retail(), { seasonOvertime: true }, false, { seasonShootout: 1 })).toThrow(/cannot both be on/)
  })

  names.forEach((name, n) => {
    it(`SNES ROM ${n + 1}: both choices go in and out where the code is the original's, and it is not offered elsewhere`, () => {
      const rom = open(name)
      const state = detectSnesHacks(rom.bytes)
      if (!snesCodeInPlace(rom.bytes)) {
        expect(state.unknown).toContain('seasonShootout')
        return
      }
      expect(state.unknown).not.toContain('seasonShootout')
      for (const choice of [1, 2]) {
        const on = openRom(buildRom(applySnesHacks(rom, {}, false, { seasonShootout: choice })))
        expect(detectSnesHacks(on.bytes).amounts?.seasonShootout).toBe(choice)
        expect(Buffer.compare(buildRom(applySnesHacks(on, {}, false, { seasonShootout: 0 })), buildRom(rom))).toBe(0)
      }
    })
  })
})
