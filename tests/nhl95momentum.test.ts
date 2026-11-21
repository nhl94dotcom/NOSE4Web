import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyNhl95Hacks, detectNhl95Hacks, NHL95_HACK_SECTIONS, NHL95_HACK_TITLES, NO_NHL95_HACKS, Nhl95HackError } from '../src/core/nhl95hacks'
import { buildRom, openRom } from '../src/core/rom'
import { expectSameBytes } from './samebytes'

// Fight momentum in NHL '95: with Vancecookcobxin's fighting, the winner's team gets +2 Agility and +2 Speed for 90
// seconds of play. NHL '95 (USA) at ../NHL95/NHL_95.bin, and the NHL '95 league ROMs named in local.json's nhl95Roms.
const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { nhl95Roms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['NHL95/NHL_95.bin', ...(local.nhl95Roms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (rom: Uint8Array, at: number, length: number) => Buffer.from(rom.subarray(at, at + length)).toString('hex')
const target = (rom: Uint8Array, at: number) => Buffer.from(rom.buffer, rom.byteOffset).readUInt32BE(at + 2)

// The code, each branch's target worked out from its bytes (in the comments, from the code's start):
// +$08 beq.s +$20 -> +$2A, +$10 bne.s +$18 -> +$2A, +$16 beq.s +$12 -> +$2A (the "off" return, Z clear);
// +$38 bsr.w $FFC6 -> +0, +$3C bne.s +2 -> +$40 (the asr); +$4A bsr.w $FFB4 -> +0, +$4E bne.s +$C -> +$5C (the rts),
// +$56 ble.s +4 -> +$5C; +$62 beq.s +4 -> +$68 (the jmp on to updatePPTeamTime, $8ABB4).
const CODE =
  '48e710004a78f75267200838' + '0000bef066184a6b00346712162b006202030040b638f7504cdf00084e75' + '4cdf0008023c00fb4e75' +
  'd42b00686100ffc666025402e2424e75' +
  '4242142b00696100ffb4660c5402b43c001f6f04143c001f4e75' +
  '4a78f75267045378f7524ef90008abb4' +
  '4278c0204278c0284278f7504278f7524e75' +
  '11eb0062f75002380040f75031fc005af752377cffff00444e75'

describe("fight momentum in NHL '95", () => {
  it('is a fighting option, off in the original game', () => {
    expect(NO_NHL95_HACKS.fightMomentum).toBe(false)
    expect(NHL95_HACK_TITLES.fightMomentum).toBe('Fight momentum')
    expect(NHL95_HACK_SECTIONS.find((s) => s.id === 'fighting')!.hacks).toContain('fightMomentum')
    expect(CODE.length / 2).toBe(0x9a)
  })
})

describe.skipIf(names.length === 0)("fight momentum in each NHL '95 ROM", () => {
  it.each(names)('goes in with fighting and comes out of %s', (name) => {
    const rom = open(name)
    const base = detectNhl95Hacks(rom.bytes)
    expect(base.unknown).toEqual([])
    expect(base.choices.fightMomentum).toBe(false)
    // The places, as NHL '95 has them: add.b legstr(a3),d2 / asr.w #1,d2; clr.w d2 / move.b legspd(a3),d2; jsr
    // updatePPTeamTime; clr.w (gsp).w / clr.w (ChkCnt).w.
    expect(hex(rom.bytes, 0x8c0c2, 6)).toBe('d42b0068e242')
    expect(hex(rom.bytes, 0x8c120, 6)).toBe('4242142b0069')
    expect(hex(rom.bytes, 0x89578, 6)).toBe('4eb90008abb4')
    expect(hex(rom.bytes, 0x9ca8, 8)).toBe('4278c0204278c028')
    // Without fighting there are no fights to win.
    expect(() => applyNhl95Hacks(rom, { fightMomentum: true })).toThrow(Nhl95HackError)
    const fights = applyNhl95Hacks(rom, { fighting: true })
    // The knockout's move.w #$FFFF,$44(a3), the winner a3.
    expect(hex(fights.bytes, 0x1e0980, 6)).toBe('377cffff0044')
    const on = applyNhl95Hacks(rom, { fighting: true, fightMomentum: true })
    const code = target(on.bytes, 0x8c0c2) - 0x34
    expect(hex(on.bytes, code, 0x9a)).toBe(CODE)
    for (const [at, entry] of [[0x8c0c2, 0x34], [0x8c120, 0x44], [0x89578, 0x5e], [0x9ca8, 0x6e], [0x1e0980, 0x80]]) {
      expect(hex(on.bytes, at, 2)).toBe('4eb9')
      expect(target(on.bytes, at)).toBe(code + entry)
    }
    expect(hex(on.bytes, 0x9cae, 2)).toBe('4e71')
    expect(detectNhl95Hacks(on.bytes)).toEqual({ choices: { ...base.choices, fighting: true, fightMomentum: true }, unknown: [] })
    expect(detectNhl95Hacks(buildRom(on))).toEqual({ choices: { ...base.choices, fighting: true, fightMomentum: true }, unknown: [] })
    // Off again: the fighting ROM as it was; fighting out with it, the original game.
    expectSameBytes(applyNhl95Hacks(on, { fightMomentum: false }).bytes, fights.bytes)
    expectSameBytes(applyNhl95Hacks(on, { fighting: false, fightMomentum: false }).bytes, rom.bytes)
    expect(() => applyNhl95Hacks(on, { fighting: false })).toThrow(Nhl95HackError)
    // With the other fighting options, and with giveaways and blocked shots (StartGame's places next to it).
    const more = applyNhl95Hacks(on, { fightingOff: true, fightSeconds: 120, giveaways: true, bodyBlockFix: true, blockedShots: true, timeOnIce: true })
    const found = detectNhl95Hacks(more.bytes)
    expect(found.unknown).toEqual([])
    expect(found.choices).toMatchObject({ fighting: true, fightingOff: true, fightMomentum: true, fightSeconds: 120, giveaways: true, blockedShots: true, timeOnIce: true })
    expectSameBytes(applyNhl95Hacks(more, { fightMomentum: false, fightingOff: false, fightSeconds: 0, giveaways: false, bodyBlockFix: false, blockedShots: false, timeOnIce: false }).bytes, fights.bytes)
  })
})
