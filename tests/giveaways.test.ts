import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyHacks, detectHacks, NO_HACKS } from '../src/core/hacks'
import { buildRom, openRom } from '../src/core/rom'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { league30Rom?: string; otherRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['nhl94.bin', ...(local.league30Rom ? [local.league30Rom] : []), ...(local.otherRoms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
const u16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1]
const u32 = (b: Uint8Array, o: number) => ((u16(b, o) << 16) | u16(b, o + 2)) >>> 0

describe.skipIf(!existsSync(path('nhl94.bin')))('giveaways and takeaways (Genesis)', () => {
  it('counts at puckglue, learns why at the steals, FallDown and doshot, clears at StartGame, and adds the Game Stats row', () => {
    const rom = open('nhl94.bin')
    expect(detectHacks(rom.bytes).choices.giveaways).toBe(false)
    const on = applyHacks(rom, { ...NO_HACKS, giveaways: true }).bytes
    const base = u32(on, 0x15288 + 2)
    const entries: [number, number][] = [[0x15288, 0], [0x151bc, 4], [0x15548, 4], [0x143fa, 8], [0xc340, 0xc], [0x77b8, 0x10], [0xfde5e, 0x14], [0xfde6c, 0x18]]
    for (const [at, entry] of entries) {
      expect(u16(on, at)).toBe(0x4eb9)
      expect(u32(on, at + 2)).toBe(base + entry)
    }
    expect(u16(on, 0xfdcbc)).toBe(0x80)
    expect(u16(on, 0xfdcca)).toBe(0x40)
    // puckglue's own two instructions first.
    expect(hex(on, base + 0x1c, 8)).toBe('302a005231c0b7aa')
    // TBLA: moveq #$F,d6 / lea (pc) to the table after the code: Score first, Give/Takeaways last.
    expect(hex(on, base + 0x132, 2)).toBe('7c0f')
    const table = base + 0x136 + u16(on, base + 0x136)
    expect(table).toBe(base + 0x144)
    expect(hex(on, table, 7)).toBe('000853636f7265')
    const text = Buffer.from(on.subarray(base, base + 0x400)).toString('latin1')
    expect(text.split('Give/Takeaways').length).toBe(3)
    expect(hex(on, base + 0x13a, 4)).toBe('3c3c000b')
    expect(detectHacks(on).choices).toEqual({ ...NO_HACKS, giveaways: true })
    expect(Buffer.compare(buildRom(applyHacks(openRom(buildRom({ ...rom, bytes: on })), NO_HACKS)), buildRom(rom))).toBe(0)
  })

  it("goes with time on ice, the injury risk, hit energy and chaos's fighting patch", () => {
    const rom = open('nhl94.bin')
    const all = { ...NO_HACKS, giveaways: true, timeOnIce: true, injuryBonus: 2, injuryCap: 10, hitEnergy: 204, holdEnergy: 102, fighting: 'on' as const, bodychecks: 'on' as const }
    const on = applyHacks(rom, all)
    expect(detectHacks(on.bytes).choices).toMatchObject({ giveaways: true, timeOnIce: true, fighting: 'on', bodychecks: 'on' })
    const off = applyHacks(openRom(buildRom(on)), { ...all, giveaways: false })
    expect(detectHacks(off.bytes).choices.giveaways).toBe(false)
  })

  names.forEach((name) => {
    it(`${name}: goes in and comes out`, () => {
      const rom = open(name)
      const state = detectHacks(rom.bytes)
      // Not for the EVO builds, whose code is their own.
      if (name.includes('EVO')) {
        expect(state.unknown).toContain('giveaways')
        return
      }
      expect(state.unknown).not.toContain('giveaways')
      const on = openRom(buildRom(applyHacks(rom, { ...state.choices, giveaways: true })))
      expect(detectHacks(on.bytes).choices).toEqual({ ...state.choices, giveaways: true })
      expect(Buffer.compare(buildRom(applyHacks(on, state.choices)), buildRom(applyHacks(rom, state.choices)))).toBe(0)
    })
  })
})
