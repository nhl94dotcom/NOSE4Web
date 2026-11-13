import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyHacks, detectHacks, NO_HACKS } from '../src/core/hacks'
import { buildRom, openRom } from '../src/core/rom'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
const u16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1]
const target = (b: Uint8Array, at: number) => (u16(b, at + 2) << 16) | u16(b, at + 4)

describe.skipIf(!existsSync(path('nhl94.bin')))('time on ice in Player Stats (Genesis)', () => {
  it('hooks the column bounds, the title, the headers, GetStatColumn and the row number', () => {
    const rom = open('nhl94.bin')
    // The original code at each hook, and Penalty Minutes' sort title.
    expect(hex(rom.bytes, 0x9556, 12)).toBe('b07cffff6df0b07c00046eea')
    expect(hex(rom.bytes, 0x968a, 16)).toBe('43fa02b67001d078d5ac4eb900013508')
    expect(hex(rom.bytes, 0x9658, 6)).toBe('4eb900011a48')
    expect(hex(rom.bytes, 0x9878, 6)).toBe('3400301fb042')
    expect(hex(rom.bytes, 0x97ce, 8)).toBe('72044eb900011d3a')
    expect(Buffer.from(rom.bytes.subarray(0x99b2, 0x99c6)).toString('latin1')).toBe('[ Penalty Minutes   ')

    const on = applyHacks(rom, { ...NO_HACKS, timeOnIce: true })
    for (const at of [0x9556, 0x968a, 0x9658, 0x9878, 0x97ce]) expect(u16(on.bytes, at)).toBe(0x4eb9)
    expect(hex(on.bytes, 0x955c, 6)).toBe('4e714e714e71')
    expect(hex(on.bytes, 0x97d4, 2)).toBe('4e71')
    // Penalty Minutes' title text as it was: the title code adds the "]" in game stats only (d7 = 0).
    expect(Buffer.from(on.bytes.subarray(0x99b2, 0x99c6)).toString('latin1')).toBe('[ Penalty Minutes   ')
    expect(hex(on.bytes, 0x9690, 10)).toBe('4e714e714e714e714e71')
    // Column 5 in game stats only (tst.w d7), back to .scroll ($954C) past the bounds.
    expect(hex(on.bytes, target(on.bytes, 0x9556), 34)).toBe('0c40ffff6d144a4766080c4000056e0a4e750c4000046e024e75588f4ef90000954c')
    // GetStatColumn: column 5 is the word at $136 of the team struct, the player's.
    expect(hex(on.bytes, target(on.bytes, 0x9878), 38)).toBe('3400302f00042f570002548f0c41000566103400d442064201363432200058 8f4e75b0424e75'.replace(' ', ''))
    // The new title, 20 wide as the others.
    const title = target(on.bytes, 0x968a)
    expect(Buffer.from(on.bytes.subarray(title + 64, title + 84)).toString('latin1')).toBe('[    Time On Ice    ')
    // Column 4 and tst.w d7: printx back one, "]" printed.
    expect(hex(on.bytes, title + 32, 30)).toBe('0c780004d5ac66144a4766105378b02843fa002270004eb9000135084e75')
    // The row: from SOG on, the time (PushTime $11CA2), highlighted, then an empty string; else PushNumberWidth.
    const row = hex(on.bytes, target(on.bytes, 0x97ce), 68)
    expect(row).toContain('4eb900011ca2')
    expect(row).toContain('72044ef900011d3a')
    expect(detectHacks(on.bytes).choices).toEqual({ ...NO_HACKS, timeOnIce: true })
    expect(Buffer.compare(buildRom(applyHacks(on, NO_HACKS)), buildRom(rom))).toBe(0)
  })

  it('goes with the bodycheck counts, which keep their Chk column', () => {
    const rom = open('nhl94.bin')
    const both = applyHacks(rom, { ...NO_HACKS, bodychecks: 'on', timeOnIce: true })
    expect(detectHacks(both.bytes).choices).toEqual({ ...NO_HACKS, bodychecks: 'on', timeOnIce: true })
    expect(Buffer.from(both.bytes.subarray(0x993f, 0x9942)).toString('latin1')).toBe('Chk')
    expect(Buffer.compare(buildRom(applyHacks(both, NO_HACKS)), buildRom(rom))).toBe(0)
  })
})
