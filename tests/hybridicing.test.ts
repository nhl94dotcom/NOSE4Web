import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyHacks, detectHacks, hacksSupported } from '../src/core/hacks'
import { buildRom, openRom } from '../src/core/rom'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { league30Rom?: string; otherRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['nhl94.bin', ...(local.league30Rom ? [local.league30Rom] : []), ...(local.otherRoms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const at = (bytes: Uint8Array, offset: number, count: number) => Buffer.from(bytes.subarray(offset, offset + count)).toString('hex')
const u16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1]
const u32 = (b: Uint8Array, o: number) => u16(b, o) * 0x10000 + u16(b, o + 2)

describe.skipIf(!existsSync(path('nhl94.bin')))('hybrid icing', () => {
  it("PuckIChk's goal-line mark calls the decision, and the rts after it stays", () => {
    const rom = open('nhl94.bin')
    // .chkx: the crease-width tests, bclr #ifok; rts; .set: bset #ifcgl,(iflags).w; rts.
    expect(at(rom.bytes, 0x10284, 36)).toBe('0c78002cb74a6e000014' + '0c78ffd4b74a6d00000a' + '08b80002bf804e75' + '08f80000bf804e75')
    // a2touchpuck's .icing: AddPenalty is the bsr's target.
    expect(at(rom.bytes, 0x101f2, 2)).toBe('6100')
    expect(0x101f4 + u16(rom.bytes, 0x101f4)).toBe(0x11f2c)
    const on = applyHacks(rom, { ...detectHacks(rom.bytes).choices, hybridIcing: true }).bytes
    expect(u16(on, 0x102a0)).toBe(0x4eb9)
    expect(at(on, 0x102a6, 2)).toBe('4e75')
    const code = u32(on, 0x102a2)
    // It keeps the original's bset, then calls AddPenalty with PenIcing ($C) or clears ifok.
    expect(at(on, code + 4, 6)).toBe('08f80000bf80')
    const body = at(on, code, 166)
    expect(body).toContain('303c000c4eb900011f2c')
    expect(body).toContain('08b80002bf80')
    // The dbf in the nearest-skater loop goes back to the loop's first test.
    const dbf = code + body.indexOf('51cc') / 2
    expect(at(on, dbf + 2 + ((u16(on, dbf + 2) << 16) >> 16), 4)).toBe('4a680034')
    expect(detectHacks(on).choices.hybridIcing).toBe(true)
  })

  names.forEach((name) => {
    it(`${name}: goes in and comes out, leaving the ROM as its own hacks make it`, () => {
      const rom = open(name)
      if (!hacksSupported(rom.game)) return
      const state = detectHacks(rom.bytes)
      expect(state.unknown).not.toContain('hybridIcing')
      expect(state.choices.hybridIcing).toBe(false)
      const on = openRom(buildRom(applyHacks(rom, { ...state.choices, hybridIcing: true })))
      expect(detectHacks(on.bytes).choices).toEqual({ ...state.choices, hybridIcing: true })
      const off = applyHacks(on, { ...detectHacks(on.bytes).choices, hybridIcing: false })
      expect(Buffer.compare(buildRom(off), buildRom(applyHacks(rom, state.choices)))).toBe(0)
    })
  })
})
