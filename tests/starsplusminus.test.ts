import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readU16, readU32 } from '../src/core/bytes'
import { applyHacks, hackState, NO_HACKS, plusMinusOutdated, threeStarsOutdated } from '../src/core/hacks'
import { openRom } from '../src/core/rom'

// NOSE4Web's versions of smozROM's plus-minus and three stars (Match Viewer, 2026-11-25): a highlight leaves the
// plus-minus log alone, and a shot faced weighs as on the SNES, with checks only where +$102 holds them.

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const hasRom = existsSync(path('nhl94.bin'))
const opened = () => openRom(new Uint8Array(readFileSync(path('nhl94.bin'))))
const hex = (rom: Uint8Array, at: number, length: number) => Buffer.from(rom.subarray(at, at + length)).toString('hex')
// The weight a three-stars instruction mulu.w #w / muls.w #w multiplies by, by where it is in the code.
const STARS_AT = 0x1867e
const weights = (rom: Uint8Array) => {
  const found: number[] = []
  for (let at = STARS_AT; at < STARS_AT + 160; at += 2) if ([0xc2fc, 0xc4fc, 0xc3fc].includes(readU16(rom, at))) found.push(readU16(rom, at + 2))
  return found
}

describe.skipIf(!hasRom)("NOSE4Web's plus-minus and three stars", () => {
  it('logs no goal in a highlight, and leaves the log alone when a highlight clears the team stats', () => {
    const rom = applyHacks(opened(), { ...NO_HACKS, plusMinus: true }).bytes
    const code = readU32(rom, 0x1494a + 2)
    // addi.w #$1E,$B8A2, then btst #gmhl,(gmode).w / bne.w to the rts.
    expect(hex(rom, code, 16)).toBe('0678001eb8a20838' + '0004c2ea6600' + hex(rom, code + 14, 2))
    expect(readU16(rom, code + 14 + readU16(rom, code + 14))).toBe(0x4e75)
    // clearTeamStats: movem.l (sp)+,a1-a3, then a call, nops, and its own movem.l a1-a3,-(sp).
    expect(hex(rom, 0x17132, 6)).toBe('4cdf0e004eb9')
    expect(hex(rom, 0x1713c, 28)).toBe('4e71'.repeat(12) + '48e70070')
    const clear = readU32(rom, 0x17138)
    // The structs, then the log unless StartHL2 (whose jsr clearTeamStats at $135D2 returns to $135D8) called.
    expect(hex(rom, 0x135d2, 6)).toBe('4eb900017102')
    expect(hex(rom, clear, 40)).toBe('303c06c7307cc6ce421851c8fffc0caf000135d80008670e307cdef4301054404218' + '51c8fffc4e75')
    expect(plusMinusOutdated(rom)).toBe(false)
    expect(hackState({ ...opened(), bytes: rom })!.choices.plusMinus).toBe(true)
  })

  it('weighs a shot faced as on the SNES, and counts checks only with bodycheck counts on', () => {
    const off = applyHacks(opened(), { ...NO_HACKS, threeStars: 'linesOff' }).bytes
    const on = applyHacks(opened(), { ...NO_HACKS, threeStars: 'linesOn', bodychecks: 'on' }).bytes
    // assist, shot, goal, check, goals against, shot faced.
    expect(weights(off)).toEqual([7000, 500, 11000, 0, -11000 & 0xffff, 900])
    expect(weights(on)).toEqual([9100, 650, 14300, 650, -11000 & 0xffff, 1170])
    for (const rom of [off, on]) expect(threeStarsOutdated(rom)).toBe(false)
    expect(hackState({ ...opened(), bytes: off })!.choices.threeStars).toBe('linesOff')
    // Bodycheck counts turned on later bring the checks in.
    const later = applyHacks({ ...opened(), bytes: off }, { ...NO_HACKS, threeStars: 'linesOff', bodychecks: 'on' }).bytes
    expect(weights(later)[3]).toBe(500)
  })

  it("recognises smozROM's versions, and puts in NOSE4Web's when the hacks are applied", () => {
    const wanted = { ...NO_HACKS, plusMinus: true, threeStars: 'linesOn' as const }
    const smoz = applyHacks(opened(), wanted, true)
    expect(weights(smoz.bytes)).toEqual([9100, 650, 14300, 650, -11000 & 0xffff, 4500])
    expect(hex(smoz.bytes, 0x17132, 38)).toBe('4cdf0e00203c000006c7307cc6ce421851c8fffc307cdef4301054404218' + '51c8fffc48e70070')
    expect(plusMinusOutdated(smoz.bytes)).toBe(true)
    expect(threeStarsOutdated(smoz.bytes)).toBe(true)
    const state = hackState(smoz)!
    expect(state.unknown).toEqual([])
    expect(state.choices).toEqual(wanted)
    // Put in the current version: the same choices applied again.
    const now = applyHacks(smoz, state.choices)
    expect(plusMinusOutdated(now.bytes)).toBe(false)
    expect(threeStarsOutdated(now.bytes)).toBe(false)
    expect(hackState(now)!.choices).toEqual(wanted)
    expect(weights(now.bytes)[5]).toBe(1170)
    // And all of it comes out again.
    expect(Buffer.compare(applyHacks(now, NO_HACKS).bytes, opened().bytes)).toBe(0)
    expect(Buffer.compare(applyHacks(smoz, NO_HACKS).bytes, opened().bytes)).toBe(0)
  })
})
