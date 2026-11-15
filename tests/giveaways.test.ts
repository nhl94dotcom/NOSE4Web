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
// NOSE4Web's giveaways code of 14 November 2026 (dbc898a), before the tables.
const EARLIER_GT =
  '6000001e600000f4600000fe6000011e6000012e6000015060000154600000fc302a005231c0b7aa48e7e0c008380004c2ea667808380000c2fa666408380004c2f0665c3238e8006b56ef4941f8b04ad0c114280062122a0062b30208020006673e3238e8020c41fffe67284a416b2aef4943f8b04ad2c14a690034671c14290062102a0062b10208020006660c74026120600c4a6a0034670622487400611231ea0052e80031fcffffe8024cdf03074e757000102900666b3e0c000020643808290006006267040640002041f8e8104a42670441f8e8500c3000ff000067045230000041f8e900082900060062670441f8ec64527020004e7531e80052beda31ea0052e8024e7550f8b7aa31eb0052e80208380004c2ea4e7550f8b7aa177c0010005e31fcfffee8024e7508f80004c2ee31fcffffe80031fcffffe8024e754278c4724278c5dc21fcffffffffe80041f8e810701f429851c8fffc42b8e90042b8ec644e757c0f43fafffc4e753c3c000b43fafffa4e75'

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
    expect(hex(on, base + 0x17e, 2)).toBe('7c0f')
    const table = base + 0x182 + u16(on, base + 0x182)
    expect(table).toBe(base + 0x190)
    expect(hex(on, table, 7)).toBe('000853636f7265')
    const text = Buffer.from(on.subarray(base, base + 0x400)).toString('latin1')
    expect(text.split('Give/Takeaways').length).toBe(3)
    expect(hex(on, base + 0x186, 4)).toBe('3c3c000b')
    // The carrier's and the forcer's roster places kept as they get or force the puck: move.b pnum(a2),(LASTP).w at
    // the pickup, pnum(a2) / pnum(a3) to CAUSEP at the steal and FallDown.
    const code = hex(on, base, 0x190)
    expect(code).toContain('11ea0066e804')
    expect(code).toContain('11ea0066e805')
    expect(code).toContain('11eb0066e805')
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

  it('knows the version of 14 November, which counted whoever held the spot, and replaces it when applied again', () => {
    const rom = open('nhl94.bin')
    const on = applyHacks(rom, { ...NO_HACKS, giveaways: true }).bytes
    const base = u32(on, 0x15288 + 2)
    // That version: its 376 bytes of code, then the same tables (lea (pc) extension words at $16A and $174).
    const body = Buffer.from(EARLIER_GT, 'hex')
    const tableB = 0x18c + u16(on, base + 0x18c)
    // The end: past the second Give/Takeaways row (its label, then two offsets).
    const end = Buffer.from(on).indexOf('Give/Takeaways', base + tableB, 'latin1') + 14 + 4
    const tables = on.slice(base + 0x190, end)
    const earlier = on.slice()
    earlier.fill(0xff, base, end)
    earlier.set(body, base)
    earlier.set(tables, base + body.length)
    earlier[base + 0x16a] = (body.length - 0x16a) >> 8
    earlier[base + 0x16b] = (body.length - 0x16a) & 0xff
    const b = tableB - 0x190 + body.length - 0x174
    earlier[base + 0x174] = b >> 8
    earlier[base + 0x175] = b & 0xff
    expect(detectHacks(earlier).choices).toEqual({ ...NO_HACKS, giveaways: true })
    expect(detectHacks(earlier).unknown).toEqual([])
    const again = applyHacks(openRom(buildRom({ ...rom, bytes: earlier })), { ...NO_HACKS, giveaways: true }).bytes
    expect(hex(again, u32(again, 0x15288 + 2), 0x190)).toContain('11ea0066e804')
    expect(Buffer.compare(buildRom(applyHacks(openRom(buildRom({ ...rom, bytes: earlier })), NO_HACKS)), buildRom(rom))).toBe(0)
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
