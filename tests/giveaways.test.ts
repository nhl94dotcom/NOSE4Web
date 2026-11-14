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
    const entries: [number, number][] = [[0x15288, 0], [0x151bc, 4], [0x15548, 4], [0x143fa, 8], [0xc340, 0xc], [0x77b8, 0x10], [0xfde5e, 0x14], [0xfde6c, 0x18], [0xbc6e, 0x1c]]
    for (const [at, entry] of entries) {
      expect(u16(on, at)).toBe(0x4eb9)
      expect(u32(on, at + 2)).toBe(base + entry)
    }
    expect(u16(on, 0xfdcbc)).toBe(0x80)
    expect(u16(on, 0xfdcca)).toBe(0x40)
    // puckglue's own two instructions first.
    expect(hex(on, base + 0x20, 8)).toBe('302a005231c0b7aa')
    // TBLA: moveq #$F,d6 / lea (pc) to the table after the code: Score first, Give/Takeaways last.
    expect(hex(on, base + 0x166, 2)).toBe('7c0f')
    const table = base + 0x16a + u16(on, base + 0x16a)
    expect(table).toBe(base + 0x178)
    expect(hex(on, table, 7)).toBe('000853636f7265')
    const text = Buffer.from(on.subarray(base, base + 0x400)).toString('latin1')
    expect(text.split('Give/Takeaways').length).toBe(3)
    expect(hex(on, base + 0x16e, 4)).toBe('3c3c000b')
    expect(detectHacks(on).choices).toEqual({ ...NO_HACKS, giveaways: true })
    expect(Buffer.compare(buildRom(applyHacks(openRom(buildRom({ ...rom, bytes: on })), NO_HACKS)), buildRom(rom))).toBe(0)
  })

  it('adds the Giveaways and Takeaways pages to Player Stats, with or without Time On Ice', () => {
    const rom = open('nhl94.bin')
    const sites = [0x9556, 0x968a, 0x9658, 0x9878, 0x97ce]
    const text = (b: Uint8Array, at: number) => Buffer.from(b.subarray(at, at + 0x240)).toString('latin1')
    for (const timeOnIce of [false, true]) {
      const on = applyHacks(rom, { ...NO_HACKS, giveaways: true, timeOnIce }).bytes
      const base = u32(on, sites[0] + 2)
      sites.forEach((at, i) => {
        expect(u16(on, at)).toBe(0x4eb9)
        expect(u32(on, at + 2)).toBe(base + 4 * i)
      })
      // The page bounds: up to 6, or 7 with the time on ice.
      expect(hex(on, base + 0x14 + 10, 4)).toBe(timeOnIce ? '0c400007' : '0c400006')
      const pages = text(on, base)
      expect(pages).toContain('[    Giveaways     ]')
      expect(pages).toContain(timeOnIce ? '[    Takeaways     ]' : '[    Takeaways      ')
      expect(pages.includes('Time On Ice')).toBe(timeOnIce)
      expect(detectHacks(on).choices).toEqual({ ...NO_HACKS, giveaways: true, timeOnIce })
      // Off again: the game's code, byte for byte, or the time on ice page's own (which detection checks byte for byte).
      const off = openRom(buildRom(applyHacks(openRom(buildRom({ ...rom, bytes: on })), { ...NO_HACKS, timeOnIce })))
      expect(detectHacks(off.bytes).choices).toEqual({ ...NO_HACKS, timeOnIce })
      if (!timeOnIce) expect(Buffer.compare(buildRom(off), buildRom(rom))).toBe(0)
    }
    // Giveaways on a ROM that has the time on ice page: the pages' code takes its places over.
    const toi = openRom(buildRom(applyHacks(rom, { ...NO_HACKS, timeOnIce: true })))
    const both = buildRom(applyHacks(toi, { ...NO_HACKS, timeOnIce: true, giveaways: true }))
    expect(detectHacks(openRom(both).bytes).choices).toEqual({ ...NO_HACKS, timeOnIce: true, giveaways: true })
    // And off again: the time on ice page alone, as the time on ice hack has it.
    expect(detectHacks(applyHacks(openRom(both), { ...NO_HACKS, timeOnIce: true }).bytes).choices).toEqual({ ...NO_HACKS, timeOnIce: true })
  })

  it('knows a ROM from the version without the pages, and adds them when applied again', () => {
    const rom = open('nhl94.bin')
    // The counts, and the game's own code at the five places.
    const counts = applyHacks(rom, { ...NO_HACKS, giveaways: true }).bytes.slice()
    for (const at of [0x9556, 0x968a, 0x9658, 0x9878, 0x97ce]) counts.set(rom.bytes.subarray(at, at + 16), at)
    expect(detectHacks(counts).choices).toEqual({ ...NO_HACKS, giveaways: true })
    const again = applyHacks(openRom(buildRom({ ...rom, bytes: counts })), { ...NO_HACKS, giveaways: true }).bytes
    expect(u16(again, 0x9556)).toBe(0x4eb9)
    expect(detectHacks(again).choices).toEqual({ ...NO_HACKS, giveaways: true })
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
