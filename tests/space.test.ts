import { describe, expect, it } from 'vitest'
import { claimSpace, releaseSpace } from '../src/core/space'

// A small ROM: data, NOSE's end mark, then unused room.
function marked(): Uint8Array {
  const rom = new Uint8Array(0x80000).fill(0xff)
  rom.fill(0x11, 0, 0x1000)
  rom.set([0x60, 0xfe], 0x1000)
  return rom
}

function add(rom: Uint8Array, size: number, value: number) {
  const claimed = claimSpace(rom, size)!
  claimed.rom.fill(value, claimed.at, claimed.at + size)
  return { rom: claimed.rom, part: { start: claimed.at, end: claimed.at + size } }
}

describe('giving room back', () => {
  it('moves the end mark back when what is freed is last', () => {
    const before = marked()
    const a = add(before, 0x100, 0xaa)
    releaseSpace(a.rom, [a.part])
    expect(a.rom).toEqual(before)
  })

  it('marks room freed between two things, and takes it back with what follows', () => {
    const before = marked()
    const a = add(before, 0x100, 0xaa)
    const b = add(a.rom, 0x80, 0xbb)
    const rom = b.rom
    releaseSpace(rom, [a.part])
    // Still in use after it: b stays where it is, the end mark too.
    expect(rom.subarray(b.part.start, b.part.end).every((v) => v === 0xbb)).toBe(true)
    expect([rom[b.part.end], rom[b.part.end + 1]]).toEqual([0x60, 0xfe])
    expect(rom.subarray(a.part.start, a.part.end - 12).every((v) => v === 0xff)).toBe(true)
    // Then b out too: all of it is given back.
    releaseSpace(rom, [b.part])
    expect(rom).toEqual(before)
  })

  it('takes back several parts freed at once, whatever their order', () => {
    const before = marked()
    const a = add(before, 0x40, 0xaa)
    const b = add(a.rom, 0x40, 0xbb)
    const c = add(b.rom, 0x40, 0xcc)
    releaseSpace(c.rom, [c.part, a.part, b.part])
    expect(c.rom).toEqual(before)
  })

  it('leaves the end mark alone where something follows it, and room it did not give', () => {
    const before = marked()
    const a = add(before, 0x100, 0xaa)
    // Another tool's code after the mark.
    a.rom.fill(0xcd, a.part.end + 2, a.part.end + 0x20)
    const rom = a.rom.slice()
    releaseSpace(rom, [a.part])
    expect([rom[a.part.end], rom[a.part.end + 1]]).toEqual([0x60, 0xfe])
    expect(rom.subarray(a.part.end + 2, a.part.end + 0x20)).toEqual(a.rom.subarray(a.part.end + 2, a.part.end + 0x20))
    // Unused room that was there before, not given by claimSpace, is not taken: the mark never goes before where it was.
    const gap = marked()
    gap.fill(0xff, 0xf00, 0x1000)
    const g = add(gap, 0x100, 0xaa)
    releaseSpace(g.rom, [g.part])
    expect([g.rom[0x1000], g.rom[0x1001]]).toEqual([0x60, 0xfe])
  })

  it('in a ROM without the mark, takes back marked room too', () => {
    const before = marked()
    before[0x1000] = before[0x1001] = 0xff
    const a = add(before, 0x100, 0xaa)
    const b = add(a.rom, 0x80, 0xbb)
    releaseSpace(b.rom, [a.part])
    releaseSpace(b.rom, [b.part])
    expect(b.rom).toEqual(before)
  })
})
