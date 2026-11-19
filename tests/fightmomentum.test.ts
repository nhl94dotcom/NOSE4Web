import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { detectHacks, hackRom, NO_HACKS } from '../src/core/hacks'

// Fight momentum: with chaos's fighting, the winner's team gets +2 Agility and +2 Speed for 90 seconds of play.
const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const hex = (rom: Uint8Array, at: number, length: number) => Buffer.from(rom.subarray(at, at + length)).toString('hex')
const roms = ['nhl94.bin', 'CDL_Season_12.bin'].filter((name) => existsSync(path(name)))

describe.skipIf(roms.length === 0)('fight momentum', () => {
  it.each(roms)('goes in with fighting and comes out of %s', (name) => {
    const before = new Uint8Array(readFileSync(path(name)))
    const choices = detectHacks(before).choices
    expect(choices.fightMomentum).toBe(false)
    const fights = hackRom(before, { ...choices, fighting: 'on' })
    expect(detectHacks(fights).choices.fightMomentum).toBe(false)
    const on = hackRom(before, { ...choices, fighting: 'on', fightMomentum: true })
    const target = (at: number) => Buffer.from(on).readUInt32BE(at + 2)
    // jsr at each place; a bra past the rest of each crowd-boost test
    expect(hex(on, 0x10c02, 2)).toBe('4eb9')
    expect(hex(on, 0x10c08, 4)).toBe('6000000e')
    expect(hex(on, 0x10c86, 2)).toBe('4eb9')
    expect(hex(on, 0x10c8c, 4)).toBe('6000001a')
    expect(hex(on, 0x128da, 2)).toBe('4eb9')
    expect(hex(on, 0x77c0, 2)).toBe('4eb9')
    expect(hex(on, 0x77c6, 2)).toBe('4e71')
    expect(hex(on, 0x2007e4, 2)).toBe('4eb9')
    const code = target(0x10c02) - 0x34
    expect([target(0x10c86), target(0x128da), target(0x77c0), target(0x2007e4)]).toEqual([code + 0x50, code + 0x76, code + 0x86, code + 0x98])
    // The tick goes on to updatePPTeamTime ($FE14C), the winner hook does the original move last.
    expect(hex(on, code + 0x80, 6)).toBe('4ef9000fe14c')
    expect(hex(on, code + 0xaa, 8)).toBe('317cffff00444e75')
    expect(detectHacks(on)).toEqual({ choices: { ...detectHacks(fights).choices, fightMomentum: true }, unknown: [] })
    // Off again: the fighting ROM as it was.
    expect(Buffer.from(hackRom(on, { ...choices, fighting: 'on', fightMomentum: false })).equals(Buffer.from(fights))).toBe(true)
    // Fighting out takes momentum with it.
    const none = hackRom(on, { ...choices, fighting: 'none', fightMomentum: true })
    expect(detectHacks(none).choices.fightMomentum).toBe(false)
    expect(detectHacks(none).choices.fighting).toBe('none')
    expect(hex(none, 0x10c02, 10)).toBe('08380001c2fe6600000c')
    expect(hex(none, 0x128da, 6)).toBe('4eb9000fe14c')
    expect(hex(none, 0x77c0, 8)).toBe('4278c4664278c46e')
  })

  it.each(roms)('goes with giveaways (both hook StartGame) in %s', (name) => {
    const before = new Uint8Array(readFileSync(path(name)))
    const choices = detectHacks(before).choices
    const on = hackRom(before, { ...choices, fighting: 'on', fightMomentum: true, giveaways: true, timeOnIce: true })
    const found = detectHacks(on)
    expect(found.unknown).toEqual([])
    expect(found.choices).toMatchObject({ fightMomentum: true, giveaways: true, timeOnIce: true, fighting: 'on' })
  })

  it('needs fighting: without it nothing changes', () => {
    if (!existsSync(path('nhl94.bin'))) return
    const before = new Uint8Array(readFileSync(path('nhl94.bin')))
    const after = hackRom(before, { ...NO_HACKS, fightMomentum: true })
    expect(detectHacks(after).choices.fightMomentum).toBe(false)
    expect(hex(after, 0x10c02, 10)).toBe('08380001c2fe6600000c')
  })
})
