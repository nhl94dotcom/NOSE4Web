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
// Where the code a site calls is: its jsr and nops to a stub in its own bank, jsl / rts to the code in the
// bank with room ($9B in the original game).
const called = (b: Uint8Array, site: number, length: number) => {
  expect(b[site]).toBe(0x20)
  expect(hex(b, site + 3, length - 3)).toBe('ea'.repeat(length - 3))
  const stub = off((site >> 15) | 0x80, b[site + 1] | (b[site + 2] << 8))
  expect(stub >> 15).toBe(site >> 15)
  expect(b[stub]).toBe(0x22)
  expect(b[stub + 4]).toBe(0x60)
  return off(b[stub + 3], b[stub + 1] | (b[stub + 2] << 8))
}
const rel16 = (b: Uint8Array, at: number) => at + 3 + (((b[at + 1] | (b[at + 2] << 8)) << 16) >> 16)

describe.skipIf(!existsSync(path('NHL94.smc')))('SNES 3 on 3 overtime', () => {
  // The original game's places: releasepl, SetPlList and getlinee's priolist loads, InProgress_coin's two
  // InProgress_ap calls, StartPer's stz reloadtime, puckfaceoff2's formation row and GetLowestPen's test.
  const PRIO = [0xf40bf, 0xfd57b, 0xfdf4c]
  const COIN = 0xf36d1
  const START = 0xf844b
  const FACEOFF = 0xfaa9b
  const CLOCK = 0xf3bd9

  for (const amount of [1, 2]) {
    it(`choice ${amount}: each place calls its code, and the jumps in it land where they should`, () => {
      const rom = open('NHL94.smc')
      expect(hex(rom.bytes, COIN, 15)).toBe('649122f7b69ea902008591' + '22f7b69e')
      expect(hex(rom.bytes, START, 3)).toBe('9cc70c')
      expect(hex(rom.bytes, FACEOFF, 15)).toBe('a5b549ffff1a186906000a0a0a85b5')
      expect(hex(rom.bytes, CLOCK, 6)).toBe('b9a617c90600')
      for (const at of PRIO) expect(hex(rom.bytes, at, 5)).toBe('a9b0d68589')
      const on = applySnesHacks(rom, {}, false, { threeOnThree: amount }).bytes
      expect(detectSnesHacks(on).amounts?.threeOnThree).toBe(amount)
      const season = amount === 1
      // The tests: gsp at least 3, no shootout, no penalty shot; and for the regular season OptPlayMode 0.
      const active = `ad3016c90300` + '90..' + 'ad811d' + 'd0..' + 'ad9b1e' + 'd0..' + (season ? 'afbc347ed0..' : '')
      const activeLength = season ? 24 : 18
      const matches = (code: number, pattern: string) => expect(hex(on, code, pattern.length / 2)).toMatch(new RegExp(`^${pattern}$`))
      for (const at of PRIO) {
        const code = called(on, at, 5)
        expect(hex(on, code, 5)).toBe('a9b0d68589')
        matches(code + 5, active)
        // phk / phk / pla / and #$FF / sta a0+2, then per to the overtime order, pla / sta a0, rts.
        const per = code + 5 + activeLength + 8
        expect(hex(on, per - 8, 8)).toBe('4b4b6829ff00858b')
        expect(on[per]).toBe(0x62)
        expect(hex(on, rel16(on, per), 8)).toBe('00040302010506ff')
        expect(hex(on, per + 3, 4)).toBe('688589' + '6b')
      }
      // The recount: the tests, brl to the count; their skip to the original's two calls.
      const coin = called(on, COIN, 15)
      matches(coin, active)
      const brl = coin + activeLength
      expect(on[brl]).toBe(0x82)
      expect(hex(on, brl + 3, 16)).toBe('649122f7b69ea902008591' + '22f7b69e' + '6b')
      expect(hex(on, rel16(on, brl), 1)).toBe('da')
      // Every skip lands on the original's calls.
      for (const at of [7, 12, 17, ...(season ? [23] : [])]) expect(coin + at + 1 + (on[coin + at] << 24 >> 24)).toBe(brl + 3)
      // The count stores both teams' tmap, at most 6 less the boxed, at least 3.
      const body = Buffer.from(on.subarray(rel16(on, brl), rel16(on, brl) + 240)).toString('hex')
      expect(body).toContain('8da817a90600' + '38e301c90300')
      expect(body).toContain('8da617a90600' + '38e5a9c90300')
      // Neither team more than two skaters ahead: home + 2 against the visitors, and the other way.
      expect(body).toContain('ada6171869020' + '0cda817b0038da817')
      expect(body).toContain('ada8171869020' + '0cda617b0038da617')
      // StartPer: stz reloadtime, and for a shootout both teams back to 6.
      const start = called(on, START, 3)
      expect(hex(on, start, 6)).toBe('9cc70cad811d')
      expect(hex(on, start + 8, 10)).toBe('a906008da6178da8176b')
      // The faceoff: in overtime stz d4 (row 0), else the original's.
      const faceoff = called(on, FACEOFF, 15)
      expect(hex(on, faceoff + activeLength, 3)).toBe('64b56b')
      expect(hex(on, faceoff + activeLength + 3, 16)).toBe('a5b549ffff1a186906000a0a0a85b5' + '6b')
      // The clock: outside overtime the original's lda tmap,y / cmp #6.
      const clock = called(on, CLOCK, 6)
      expect(Buffer.from(on.subarray(clock, clock + 120)).toString('hex')).toContain('b9a617c906006b')
      // Out again: the original game.
      expect(Buffer.compare(buildRom(applySnesHacks(openRom(buildRom({ ...rom, bytes: on })), {}, false, { threeOnThree: 0 })), buildRom(rom))).toBe(0)
    })
  }

  it('goes with every other SNES hack, in and out', () => {
    const rom = open('NHL94.smc')
    const state = detectSnesHacks(rom.bytes)
    for (const hack of SNES_HACKS) {
      if (hack === 'threeOnThree' || state.unknown.includes(hack)) continue
      let base
      try {
        base = applySnesHacks(rom, { [hack]: true })
      } catch {
        continue
      }
      const both = applySnesHacks(base, {}, false, { threeOnThree: 2 })
      const read = detectSnesHacks(both.bytes)
      expect(read.unknown, hack).toEqual(detectSnesHacks(base.bytes).unknown)
      expect(read.choices[hack], hack).toBe(true)
      expect(read.amounts?.threeOnThree, hack).toBe(2)
      expect(Buffer.compare(buildRom(applySnesHacks(both, {}, false, { threeOnThree: 0 })), buildRom(base)), hack).toBe(0)
    }
  })

  // McMarkis's SA-1 builds: the variables $6000 on in BW-RAM, OptPlayMode in bank $40.
  const sa1 = names.find((name) => /SA1/.test(name))
  it.skipIf(!sa1)('on the SA-1 build: the game\'s variables where that build has them', () => {
    const on = applySnesHacks(open(sa1!), {}, false, { threeOnThree: 1 }).bytes
    const all = Buffer.from(on).toString('hex')
    expect(all).toContain('ad3076c90300')
    expect(all).toContain('8da877a90600')
    expect(all).toMatch(/afbc3440d0/)
  })

  names.forEach((name) => {
    it(`${name}: both choices go in and come out`, () => {
      const rom = open(name)
      const state = detectSnesHacks(rom.bytes)
      expect(state.unknown).not.toContain('threeOnThree')
      for (const amount of [1, 2]) {
        const on = openRom(buildRom(applySnesHacks(rom, {}, false, { threeOnThree: amount })))
        expect(detectSnesHacks(on.bytes).amounts?.threeOnThree).toBe(amount)
        expect(Buffer.compare(buildRom(applySnesHacks(on, {}, false, { threeOnThree: 0 })), buildRom(rom))).toBe(0)
      }
    })
  })
})
