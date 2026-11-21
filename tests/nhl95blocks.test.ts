import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyNhl95Hacks, detectNhl95Hacks, NHL95_HACK_SECTIONS, NHL95_HACK_TITLES, nhl95HackSheet, NO_NHL95_HACKS, Nhl95HackError } from '../src/core/nhl95hacks'
import { buildRom, openRom } from '../src/core/rom'
import { expectSameBytes } from './samebytes'

// Blocked shots in NHL '95: NHL 94's counts with NHL '95's addresses, with Skaters block the puck on (without it pucks
// pass through skaters). NHL '95 (USA) at ../NHL95/NHL_95.bin, and the league ROMs named in local.json's nhl95Roms.
const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { nhl95Roms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['NHL95/NHL_95.bin', ...(local.nhl95Roms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (rom: Uint8Array, at: number, length: number) => Buffer.from(rom.subarray(at, at + length)).toString('hex')
const target = (rom: Uint8Array, at: number) => Buffer.from(rom.buffer, rom.byteOffset).readUInt32BE(at + 2)
const BODY = { bodyBlockFix: true }

// The code, each branch's target worked out from its bytes (from the code's start): +0 bra.w $E -> +$10 (the count),
// +4 bra.w $A6 -> +$AC (the clear), +8 bra.w $C4 -> +$CE and +$C bra.w $C8 -> +$D6 (the two Game Stats tables);
// +$16 beq.s 2 -> +$1A; +$24 bgt.s 8 -> +$2E (.hit); +$2C bne.s $72, +$34 beq.s $6A, +$3C bne.s $62, +$44 bne.s $5A,
// +$4A beq.s $54, +$54 bhi.s $4A, +$6C beq.s $32, +$78 bcc.s $26, +$9A beq.s 4 -> +$A0 (the return, puckbody's btst
// again); +$84 beq.s 8 -> +$8E (home); +$B8 dbra $FFFC -> +$B6. Then jmp restoreteams ($83D3E); the tables' lea (pc)s.
const CODE =
  '6000000e600000a6600000c4600000c8' +
  '082a0003006467024e75' +
  '48e760800c6b000800186e0832000241000f6672' +
  '08380004bef4676a08380004bef0666208380000bf00665a4a6a003467543238bad60c41000b624a' +
  'ef4941f8ac62d0c114280062122a0062b3020802000667324241122a00660c410020642641f8eb04082a0006' +
  '006267080641002041f8ee6a525041f8ea900c3000ff10006704523010004cdf0106082a000300644e75' +
  '48e7808041f8ea90700f429851c8fffc4278eb044278ee6a4cdf01014ef900083d3e'

describe("blocked shots in NHL '95", () => {
  it('is a statistics option, off in the original game', () => {
    expect(NO_NHL95_HACKS.blockedShots).toBe(false)
    expect(NHL95_HACK_TITLES.blockedShots).toBe('Blocked shots')
    const stats = NHL95_HACK_SECTIONS.find((s) => s.id === 'statistics')!.hacks
    expect(stats.indexOf('blockedShots')).toBe(stats.indexOf('giveaways') + 1)
    expect(CODE.length / 2).toBe(0xce)
  })
})

describe.skipIf(names.length === 0)("blocked shots in each NHL '95 ROM", () => {
  it.each(names)('%s: counts at puckbody, with a Game Stats row without giveaways, and comes out', (name) => {
    const rom = open(name)
    const base = detectNhl95Hacks(rom.bytes)
    expect(base.unknown).toEqual([])
    expect(base.choices.blockedShots).toBe(false)
    // puckbody's btst #pf3onetimer,pflags3(a2); StartGame's jsr restoreteams; DisplayStats' two tables; the scroll limits.
    expect(hex(rom.bytes, 0x7bca8, 6)).toBe('082a00030064')
    expect(hex(rom.bytes, 0x9cb0, 6)).toBe('4eb900083d3e')
    expect(hex(rom.bytes, 0x922c2, 6)).toBe('7c0e43fa0148')
    expect(hex(rom.bytes, 0x922d0, 8)).toBe('3c3c000a43fa0226')
    // Without the body fix, no puck reaches puckbody.
    expect(() => applyNhl95Hacks(rom, { blockedShots: true })).toThrow(Nhl95HackError)
    const body = applyNhl95Hacks(rom, BODY)
    const on = applyNhl95Hacks(rom, { ...BODY, blockedShots: true })
    const code = target(on.bytes, 0x7bca8)
    expect(hex(on.bytes, code, 0xce)).toBe(CODE)
    for (const [at, entry] of [[0x7bca8, 0], [0x9cb0, 4], [0x922c2, 8], [0x922d0, 0xc]]) {
      expect(hex(on.bytes, at, 2)).toBe('4eb9')
      expect(target(on.bytes, at)).toBe(code + entry)
    }
    expect(hex(on.bytes, 0x922d6, 2)).toBe('4e71')
    expect([hex(on.bytes, 0x92120, 2), hex(on.bytes, 0x9212e, 2)]).toEqual(['0080', '0040'])
    // moveq #15,d6 / lea table(pc),a1 and the same for the table without penalties, each table the ROM's with the row.
    const row = '0010' + Buffer.from('Blocked Shots ').toString('hex') + '287cffff'
    const tableA = code + 0xd2 + ((on.bytes[code + 0xd2] << 8) | on.bytes[code + 0xd3])
    expect(hex(on.bytes, tableA, 12)).toBe(hex(rom.bytes, 0x9240e, 12))
    expect(Buffer.from(on.bytes.subarray(code, code + 0x400)).toString('hex').split(row).length - 1).toBe(2)
    // Player Stats: the pages' code at the time on ice's places.
    expect(hex(on.bytes, 0x926f2, 2)).toBe('4eb9')
    expect(detectNhl95Hacks(on.bytes)).toEqual({ choices: { ...base.choices, ...BODY, blockedShots: true }, unknown: [] })
    expect(detectNhl95Hacks(buildRom(on))).toEqual({ choices: { ...base.choices, ...BODY, blockedShots: true }, unknown: [] })
    expect(nhl95HackSheet(on.bytes, name).sections.find((s) => s.heading === 'Statistics')!.items.map((i) => i.title)).toContain('Blocked shots')
    expectSameBytes(applyNhl95Hacks(on, { blockedShots: false }).bytes, body.bytes)
    expectSameBytes(applyNhl95Hacks(on, { bodyBlockFix: false, blockedShots: false }).bytes, rom.bytes)
  })

  it.each(names)('%s: with giveaways (no row) and time on ice, every mix of pages, either way round', (name) => {
    const rom = open(name)
    const base = detectNhl95Hacks(rom.bytes).choices
    for (const giveaways of [false, true]) {
      for (const timeOnIce of [false, true]) {
        const without = applyNhl95Hacks(rom, { ...BODY, giveaways, timeOnIce })
        const together = applyNhl95Hacks(rom, { ...BODY, giveaways, timeOnIce, blockedShots: true })
        const later = applyNhl95Hacks(without, { blockedShots: true })
        expectSameBytes(later.bytes, together.bytes, `giveaways ${giveaways}, time on ice ${timeOnIce}`)
        expect(detectNhl95Hacks(together.bytes)).toEqual({ choices: { ...base, ...BODY, giveaways, timeOnIce, blockedShots: true }, unknown: [] })
        // With giveaways the Game Stats places are theirs.
        const code = target(together.bytes, 0x7bca8)
        expect(target(together.bytes, 0x922c2) === code + 8).toBe(!giveaways)
        expectSameBytes(applyNhl95Hacks(together, { blockedShots: false }).bytes, without.bytes)
      }
    }
    // Giveaways out with blocked shots kept: the row is put in for blocked shots.
    const all = applyNhl95Hacks(rom, { ...BODY, giveaways: true, timeOnIce: true, blockedShots: true })
    expectSameBytes(applyNhl95Hacks(all, { giveaways: false }).bytes, applyNhl95Hacks(rom, { ...BODY, timeOnIce: true, blockedShots: true }).bytes)
    // The body fix out takes blocked shots with it only when asked: on its own it is refused.
    expect(() => applyNhl95Hacks(all, { bodyBlockFix: false })).toThrow(Nhl95HackError)
  })
})
