import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyHacks, detectHacks, hacksSupported, NO_HACKS, type ThreeOnThree } from '../src/core/hacks'
import { buildRom, openRom } from '../src/core/rom'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { league30Rom?: string; otherRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['nhl94.bin', ...(local.league30Rom ? [local.league30Rom] : []), ...(local.otherRoms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (bytes: Uint8Array, at: number, count: number) => Buffer.from(bytes.subarray(at, at + count)).toString('hex')
const u16 = (b: Uint8Array, at: number) => (b[at] << 8) | b[at + 1]
const s16 = (b: Uint8Array, at: number) => (u16(b, at) << 16) >> 16
const u32 = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0
// Where a jsr at a hook site calls.
const target = (b: Uint8Array, at: number) => {
  expect(hex(b, at, 2)).toBe('4eb9')
  return u32(b, at + 2)
}

describe.skipIf(!existsSync(path('nhl94.bin')))('3 on 3 overtime', () => {
  for (const choice of ['season', 'all'] as const) {
    it(`${choice}: every hook calls its code, and every branch in it lands where it should`, () => {
      const rom = open('nhl94.bin')
      const on = applyHacks(rom, { ...NO_HACKS, threeOnThree: choice }).bytes
      expect(detectHacks(on).choices.threeOnThree).toBe(choice)
      const season = choice === 'season'
      // The order: movea.l #priolist,a0 first, then the tests, then lea to the overtime order G, C, LW, RD, LD, RW, EA.
      // releasepl, getlinee and SetPlList.
      for (const at of [0x12a00, 0x12ec4, 0x1583c]) {
        const code = target(on, at)
        expect(hex(on, code, 6)).toBe('207c00019286')
        const lea = code + (season ? 28 : 22)
        expect(hex(on, lea, 2)).toBe('41fa')
        expect(hex(on, lea + 2 + s16(on, lea + 2), 8)).toBe('00040302010506ff')
        // The tests' branches go to the rts after the lea.
        expect(hex(on, lea + 4, 2)).toBe('4e75')
        for (const branch of season ? [12, 20, 26] : [12, 20]) expect(code + branch + 2 + (on[code + branch + 1] << 24 >> 24)).toBe(lea + 4)
        // The original's priolist is as it was.
        expect(hex(on, 0x19286, 8)).toBe('00010204030506ff')
      }
      // The recount: both bsr.w go to the count loop (moveq #0,d1 / moveq #0,d4 / moveq #$32,d0); outside overtime the original's
      // two calls of InProgress_ap ($123DE).
      const recount = target(on, 0x123a2)
      expect(hex(on, 0x123a2 + 6, 10)).toBe('4e714e714e714e714e71')
      const calls: number[] = []
      for (let o = recount; o < recount + 218; o += 2) if (u16(on, o) === 0x6100) calls.push(o + 2 + s16(on, o + 2))
      expect(calls).toHaveLength(2)
      for (const call of calls) expect(hex(on, call, 6)).toBe('720078007032')
      expect(Buffer.from(on.subarray(recount, recount + 230)).toString('hex')).toContain('4eb9000123de')
      // Each team's count capped at 6 less its boxed players, at least 3 (moveq #6 / sub.w d4 or d5 / cmpi #3 ...).
      const recountCode = Buffer.from(on.subarray(recount, recount + 230)).toString('hex')
      // Neither team more than two skaters ahead: each tmap at most the other's + 2.
      expect(recountCode).toContain('302a0024322afcc0' + '34015442b0426f04' + '3542002434005442b2426f04' + '3542fcc0')
      expect(recountCode).toContain('700690440c4000036c027003b4406f023400')
      expect(recountCode).toContain('700690450c4000036c027003b4406f023400')
      expect(hex(on, 0x123de, 4)).toBe('72067032')
      // StartPer: still sets the overtime mark first.
      const start = target(on, 0x7870)
      expect(hex(on, start, 6)).toBe('08f80001c2fc')
      // The faceoff row: in overtime d4 = 0, the full row; else the original's three instructions.
      const faceoff = target(on, 0xfa6e)
      expect(Buffer.from(on.subarray(faceoff, faceoff + 34)).toString('hex')).toContain('78004e7544445c44e7444e75')
      // The power-play clock's full-strength test: in overtime the box list (lea $9A(a3),a0), else cmpi.w #6,tmap(a3).
      const box = target(on, 0x12a50)
      const boxCode = Buffer.from(on.subarray(box, box + 56)).toString('hex')
      expect(boxCode).toContain('41eb009a4242')
      expect(boxCode).toContain('0c6b000600244e75')
      // Its loop's branches: bmi to clr.w d2 / rts (Z set: nobody in the box), bne back to move.b (a0)+,d2.
      const loop = box + (season ? 28 : 22)
      expect(hex(on, loop, 2)).toBe('1418')
      expect(hex(on, loop + 4 + on[loop + 3], 4)).toBe('42424e75')
      expect(loop + 12 + (on[loop + 11] << 24 >> 24)).toBe(loop)
      // setpersonel's free object: the hook and 10 nops in place of the 26-byte loop; in overtime it skips boxed
      // players' objects (tst.w $66(a2,d1.w) / bgt), else the original loop, copied whole, its branches relative.
      expect(hex(on, 0x15800 + 6, 20)).toBe('4e71'.repeat(10))
      const pers = target(on, 0x15800)
      const persCode = Buffer.from(on.subarray(pers, pers + 120)).toString('hex')
      expect(persCode).toContain('4a7210666e')
      expect(persCode).toContain('d6fc00804a2b00615bcbfff66a000004304b4a6b00345acbffe84e75')
      const dbf = persCode.indexOf('51c8') / 2
      expect(hex(on, pers + dbf + 2 + s16(on, pers + dbf + 2), 4)).toBe('d2fc0080')
    })
  }

  it('switches between the two and goes out again, leaving the original game', () => {
    const rom = open('nhl94.bin')
    const season = applyHacks(rom, { ...NO_HACKS, threeOnThree: 'season' })
    const all = applyHacks(season, { ...detectHacks(season.bytes).choices, threeOnThree: 'all' })
    expect(detectHacks(all.bytes).choices.threeOnThree).toBe('all')
    const off = applyHacks(all, { ...detectHacks(all.bytes).choices, threeOnThree: 'off' })
    expect(Buffer.compare(buildRom(off), buildRom(applyHacks(rom, NO_HACKS)))).toBe(0)
  })

  it('goes with the shootout for ties, overtime until a goal and fighting', () => {
    const rom = open('nhl94.bin')
    for (const seasonTies of ['shootout', 'overtime'] as const) {
      const wanted = { ...NO_HACKS, threeOnThree: 'all' as ThreeOnThree, seasonTies, fighting: 'on' as const }
      const on = openRom(buildRom(applyHacks(rom, wanted)))
      expect(detectHacks(on.bytes).choices).toMatchObject({ threeOnThree: 'all', seasonTies, fighting: 'on' })
    }
  })

  names.forEach((name) => {
    it(`${name}: goes in and comes out`, () => {
      const rom = open(name)
      if (!hacksSupported(rom.game)) return
      const state = detectHacks(rom.bytes)
      if (state.unknown.includes('threeOnThree')) return
      expect(state.choices.threeOnThree).toBe('off')
      for (const choice of ['season', 'all'] as const) {
        const on = openRom(buildRom(applyHacks(rom, { ...state.choices, threeOnThree: choice })))
        expect(detectHacks(on.bytes).choices).toEqual({ ...state.choices, threeOnThree: choice })
        const off = applyHacks(on, { ...detectHacks(on.bytes).choices, threeOnThree: 'off' })
        expect(Buffer.compare(buildRom(off), buildRom(applyHacks(rom, state.choices)))).toBe(0)
      }
    })
  })
})
