import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyHacks, detectHacks, NO_HACKS } from '../src/core/hacks'
import { buildRom, openRom } from '../src/core/rom'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
const u16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1]

describe.skipIf(!existsSync(path('nhl94.bin')))('the injured sit out the shootout (Genesis)', () => {
  it("NextShooter's shooter load calls code that passes over the saved out-for-the-game", () => {
    const rom = open('nhl94.bin')
    // .1: move.w (homeshootnum).w,d0; add.w d0,d0; move.w 0(a0,d0.w),(BA_Skater_Offset).w.
    expect(hex(rom.bytes, 0xfc4fe, 12)).toBe('3038d586d04031f00000d40a')
    const on = applyHacks(rom, { ...NO_HACKS, seasonTies: 'shootout', shootoutInjuries: true })
    expect(u16(on.bytes, 0xfc504)).toBe(0x4eb9)
    const code = (u16(on.bytes, 0xfc506) << 16) | u16(on.bytes, 0xfc508)
    const body = hex(on.bytes, code, 100)
    // The mark and gsp 3; the saved structs' tmpdst, the visitors' +$364; $FFFC, or positive with $1000.
    expect(body.startsWith('4a38f08267')).toBe(true)
    expect(body).toContain('0c780003c466')
    expect(body).toContain('43f8f0eab1fcffffd588660443e90364')
    expect(body).toContain('0c41fffc670a4a416f160801000c6710')
    // The wrap: two more, back to 0 at 10.
    expect(body).toContain('54400c40000a6d027000')
    expect(detectHacks(on.bytes).choices).toEqual({ ...NO_HACKS, seasonTies: 'shootout', shootoutInjuries: true })
    expect(Buffer.compare(buildRom(applyHacks(on, NO_HACKS)), buildRom(rom))).toBe(0)
  })
})
