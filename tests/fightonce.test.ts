import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { GENESIS_HACK_GROUPS, SNES_HACK_GROUPS } from '../src/core/hackgroups'
import { detectHacks, hackRom, HACK_TITLES, NO_HACKS } from '../src/core/hacks'
import { applyNhl95Hacks, detectNhl95Hacks, NHL95_HACK_SECTIONS, NHL95_HACK_TITLES, NO_NHL95_HACKS, Nhl95HackError } from '../src/core/nhl95hacks'
import { buildRom, openRom } from '../src/core/rom'
import { findCodeAll, snesCodeInPlace } from '../src/core/snes'
import { snesFightState } from '../src/core/snesfight'
import { applySnesHacks, detectSnesHacks, SNES_HACK_TITLES, SNES_HACKS, withSnesHackChoice, type SnesHackChoices } from '../src/core/sneshacks'
import { expectSameBytes } from './samebytes'

// One fight a game: with fighting, a player who has fought cannot start another fight that game. NHL 94 Genesis
// (nhl94.bin, CDL_Season_12.bin), NHL '95 (NHL95/NHL_95.bin and local.json's nhl95Roms) and the SNES (NHL94.smc and
// local.json's snesRoms), one level above the repository.
const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { nhl95Roms?: string[]; snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const hex = (rom: Uint8Array, at: number, length: number) => Buffer.from(rom.subarray(at, at + length)).toString('hex')
const target = (rom: Uint8Array, at: number) => Buffer.from(rom.buffer, rom.byteOffset).readUInt32BE(at + 2)
const genesisRoms = ['nhl94.bin', 'CDL_Season_12.bin'].filter((name) => existsSync(path(name)))
const nhl95Roms = ['NHL95/NHL_95.bin', ...(local.nhl95Roms ?? [])].filter((name) => existsSync(path(name)))
const snesRoms = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))

// The part each code shares: a0 = the player, d0 = his bit (roster index $66, +32 with pflags $62 bit 6), a0 its byte
// from $FFF754; and the clear: both longs, then on to the jsr's own target.
const LOCATE = '7000102800660828000600626704064000203200e64941f8f754d0c14e75'
const CLEAR = '42b8f75442b8f7584ef9'
// NHL 94: +0 test (a3, a2; branches: bsr.s +$30 / +$28 to +$34, bne.s +$10 / +8 to +$18), +$18 out to .exit,
// +$20 mark (bsr.s +$10 / +$0A to +$34), +$34 locate, +$52 clear.
const CODE94 =
  '204b613001106610204a612801106608' + '207cffffb74a4e75' + '588f4ef9002003ba' + '204b611001d0204a610a01d0067803e8b89c4e75' + LOCATE + CLEAR + '000f6e8a'
// NHL '95: +0 test (a4, a5; bsr.s +$2C / +$24 to +$30, bne.s +$10 / +8 to +$18), the moveq and on to $1E04D2;
// +$18 out of the check; +$1C mark (bsr.s +$10 / +$0A to +$30); +$30 locate; +$4E clear.
const CODE95 =
  '204c612c01106610204d612401106608' + '70004ef9001e04d2' + '588f4e75' + '204c611001d0204d610a01d0067803e8b4b44e75' + LOCATE + CLEAR + '00067938'

describe('one fight a game', () => {
  it('is a fighting option in all three games, off in the original games, after fight momentum', () => {
    expect(NO_HACKS.fightOnce).toBe(false)
    expect(NO_NHL95_HACKS.fightOnce).toBe(false)
    for (const title of [HACK_TITLES.fightOnce, NHL95_HACK_TITLES.fightOnce, SNES_HACK_TITLES.fightOnce]) expect(title).toBe('One fight a game')
    for (const hacks of [
      GENESIS_HACK_GROUPS.find((g) => g.id === 'fighting')!.hacks as string[],
      SNES_HACK_GROUPS.find((g) => g.id === 'fighting')!.hacks as string[],
      NHL95_HACK_SECTIONS.find((s) => s.id === 'fighting')!.hacks as string[],
    ]) {
      expect(hacks.indexOf('fightOnce')).toBe(hacks.indexOf('fightMomentum') + 1)
    }
    expect(CODE94.length / 2).toBe(0x60)
    expect(CODE95.length / 2).toBe(0x5c)
    const on = { ...(Object.fromEntries(SNES_HACKS.map((hack) => [hack, false])) as SnesHackChoices), fighting: true, fightOnce: true }
    expect(withSnesHackChoice(on, 'fighting', false).fightOnce).toBe(false)
  })
})

describe.skipIf(genesisRoms.length === 0)('one fight a game in NHL 94', () => {
  it.each(genesisRoms)('goes in with fighting, with or without momentum, and comes out of %s', (name) => {
    const before = new Uint8Array(readFileSync(path(name)))
    const choices = detectHacks(before).choices
    expect(choices.fightOnce).toBe(false)
    // checkfight's movea.l #puckx,a0 after its movem push, .cwd's addi.w #$3E8,(crowdlevel).w, StartGame's jsr $F6E8A.
    const fights = hackRom(before, { ...choices, fighting: 'on' })
    expect(hex(fights, 0x20025a, 10)).toBe('48e7f8f0207cffffb74a')
    expect(hex(fights, 0x20030c, 6)).toBe('067803e8b89c')
    expect(hex(fights, 0x77d8, 6)).toBe('4eb9000f6e8a')
    expect(detectHacks(fights).choices.fightOnce).toBe(false)
    const on = hackRom(before, { ...choices, fighting: 'on', fightOnce: true })
    const code = target(on, 0x77d8) - 0x52
    expect(hex(on, code, 0x60)).toBe(CODE94)
    expect([0x20025e, 0x20030c].map((at) => hex(on, at, 2))).toEqual(['4eb9', '4eb9'])
    expect([target(on, 0x20025e), target(on, 0x20030c)]).toEqual([code, code + 0x20])
    expect(detectHacks(on)).toEqual({ choices: { ...detectHacks(fights).choices, fightOnce: true }, unknown: [] })
    // With fight momentum (its own hooks), and the menu's choice changed: both recognised.
    const both = hackRom(on, { ...choices, fighting: 'arcade', fightOnce: true, fightMomentum: true })
    expect(detectHacks(both)).toEqual({ choices: { ...detectHacks(hackRom(before, { ...choices, fighting: 'arcade' })).choices, fightOnce: true, fightMomentum: true }, unknown: [] })
    // Off again: the fighting ROM as it was, with momentum or without.
    expect(Buffer.from(hackRom(on, { ...choices, fighting: 'on' })).equals(Buffer.from(fights))).toBe(true)
    expect(Buffer.from(hackRom(both, { ...choices, fighting: 'on' })).equals(Buffer.from(fights))).toBe(true)
    const momentum = hackRom(before, { ...choices, fighting: 'on', fightMomentum: true })
    expect(Buffer.from(hackRom(both, { ...choices, fighting: 'on', fightMomentum: true })).equals(Buffer.from(momentum))).toBe(true)
    // Fighting out takes it with it.
    const none = hackRom(both, { ...choices, fighting: 'none', fightOnce: true })
    expect(detectHacks(none).choices).toMatchObject({ fighting: 'none', fightOnce: false })
    expect(hex(none, 0x77d8, 6)).toBe('4eb9000f6e8a')
    expect(Buffer.from(none).equals(Buffer.from(hackRom(fights, choices)))).toBe(true)
  })

  it('needs fighting: without it nothing changes', () => {
    const before = new Uint8Array(readFileSync(path(genesisRoms[0])))
    const after = hackRom(before, { ...detectHacks(before).choices, fightOnce: true })
    expect(detectHacks(after).choices.fightOnce).toBe(false)
    expect(hex(after, 0x77d8, 6)).toBe('4eb9000f6e8a')
  })
})

describe.skipIf(nhl95Roms.length === 0)("one fight a game in NHL '95", () => {
  it.each(nhl95Roms)('goes in with fighting and comes out of %s', (name) => {
    const rom = open(name)
    const base = detectNhl95Hacks(rom.bytes)
    expect(base.unknown).toEqual([])
    expect(base.choices.fightOnce).toBe(false)
    expect(hex(rom.bytes, 0x9cb6, 6)).toBe('4eb900067938')
    expect(() => applyNhl95Hacks(rom, { fightOnce: true })).toThrow(Nhl95HackError)
    const fights = applyNhl95Hacks(rom, { fighting: true })
    // moveq #0,d0 / bsr.w $1E04D2 after the puck-at-faceoff test; the fight's addi.w #$3E8,(crowdlevel).w.
    expect(hex(fights.bytes, 0x1e039a, 16)).toBe('0c30001b00386700011e70006100012a')
    expect(hex(fights.bytes, 0x1e03e8, 10)).toBe('4278c028067803e8b4b4')
    const on = applyNhl95Hacks(rom, { fighting: true, fightOnce: true })
    const code = target(on.bytes, 0x9cb6) - 0x4e
    expect(hex(on.bytes, code, 0x5c)).toBe(CODE95)
    for (const [at, entry] of [[0x1e03a4, 0], [0x1e03ec, 0x1c]]) {
      expect(hex(on.bytes, at, 2)).toBe('4eb9')
      expect(target(on.bytes, at)).toBe(code + entry)
    }
    expect(detectNhl95Hacks(on.bytes)).toEqual({ choices: { ...base.choices, fighting: true, fightOnce: true }, unknown: [] })
    expect(detectNhl95Hacks(buildRom(on))).toEqual({ choices: { ...base.choices, fighting: true, fightOnce: true }, unknown: [] })
    // With fight momentum and the other fighting options.
    const both = applyNhl95Hacks(on, { fightMomentum: true, fightingArcade: true, fightSeconds: 120 })
    expect(detectNhl95Hacks(both.bytes)).toEqual({ choices: { ...base.choices, fighting: true, fightOnce: true, fightMomentum: true, fightingArcade: true, fightSeconds: 120 }, unknown: [] })
    // Off again: the fighting ROM as it was; fighting out with it, the original game.
    expectSameBytes(applyNhl95Hacks(on, { fightOnce: false }).bytes, fights.bytes)
    expectSameBytes(applyNhl95Hacks(both, { fightOnce: false, fightMomentum: false, fightingArcade: false, fightSeconds: 0 }).bytes, fights.bytes)
    expectSameBytes(applyNhl95Hacks(both, { fighting: false, fightOnce: false, fightMomentum: false, fightingArcade: false, fightSeconds: 0 }).bytes, rom.bytes)
    expect(() => applyNhl95Hacks(on, { fighting: false })).toThrow(Nhl95HackError)
  })
})

describe.skipIf(snesRoms.length === 0)("one fight a game on the SNES", () => {
  it.each(snesRoms)('%s: goes in with the fights, with or without momentum, and comes out', (name) => {
    const rom = open(name)
    const before = detectSnesHacks(rom.bytes)
    expect(before.unknown).not.toContain('fightOnce')
    expect(before.choices.fightOnce).toBe(false)
    const inPlace = snesCodeInPlace(rom.bytes)
    // NOSE4Web's fights on a ROM with the original game's code; McMarkis's builds have their own.
    if (inPlace) expect(() => applySnesHacks(rom, { fightOnce: true })).toThrow(/needs fighting on/)
    const fights = inPlace ? applySnesHacks(rom, { fighting: true }) : rom
    const on = applySnesHacks(fights, { fightOnce: true })
    // The puck-at-faceoff test: jsl / nops, then NOSE4Web's bne / rtl or McMarkis's bcs.
    const [test] = findCodeAll(on.bytes, inPlace ? '22......eaead0016b' : '22......eaeab0..af......f0..c90200')
    expect(test).toBeDefined()
    // Where the fight is on: jsl / nops after bit #pffight / bne / jmp.
    const fight = findCodeAll(on.bytes, 'bd....890004d0034c....22').filter(({ at }) => at > test.at && at - test.at < 0x180)
    expect(fight.length).toBe(1)
    expect(hex(on.bytes, fight[0].at + 15, inPlace ? 2 : 3)).toBe(inPlace ? 'eaea' : 'eaeaea')
    const state = detectSnesHacks(openRom(buildRom(on)).bytes)
    expect(state.choices.fightOnce).toBe(true)
    expect(state.unknown).toEqual(detectSnesHacks(fights.bytes).unknown)
    if (inPlace) expect(snesFightState(on.bytes)).toEqual(snesFightState(fights.bytes))
    // With fight momentum.
    const both = applySnesHacks(on, { fightMomentum: true })
    expect(detectSnesHacks(both.bytes).choices).toMatchObject({ fightOnce: true, fightMomentum: true })
    const momentum = detectSnesHacks(applySnesHacks(both, { fightOnce: false }).bytes)
    expect(momentum.choices).toMatchObject({ fightOnce: false, fightMomentum: true })
    expect(momentum.unknown).toEqual(state.unknown)
    expect(Buffer.compare(buildRom(applySnesHacks(both, { fightOnce: false, fightMomentum: false })), buildRom(fights))).toBe(0)
    if (inPlace) {
      // The fights' bonus changed: both come out and go back in with them.
      const bonus = applySnesHacks(both, { fighting: true }, false, { fighting: 4 })
      expect(detectSnesHacks(bonus.bytes).choices).toMatchObject({ fighting: true, fightOnce: true, fightMomentum: true })
      expect(detectSnesHacks(bonus.bytes).amounts?.fighting).toBe(4)
      expect(() => applySnesHacks(both, { fighting: false })).toThrow(/needs fighting on/)
      expect(Buffer.compare(buildRom(applySnesHacks(both, { fighting: false, fightOnce: false, fightMomentum: false })), buildRom(rom))).toBe(0)
    }
  })

  it.skipIf(!snesRoms.includes('NHL94.smc'))('NHL94.smc: the code byte for byte', () => {
    const on = applySnesHacks(open('NHL94.smc'), { fighting: true, fightOnce: true })
    // FightGameStart's sta.l fightinjany ($7E:FEB4, A = 0) becomes jsl to the code's start.
    const [clear] = findCodeAll(on.bytes, '9f80fe7ecaca10f822......af7a347e6b')
    const base = ((on.bytes[clear.at + 11] & 0x7f) << 15) | ((on.bytes[clear.at + 9] | (on.bytes[clear.at + 10] << 8)) & 0x7fff)
    const word = (n: number) => hex(Uint8Array.of(n & 0xff, n >> 8), 0, 2)
    const locate = word(0x8000 | ((base + 0x62) & 0x7fff))
    const code = [
      // clear: sta.l fightinjany, the four words of marks ($7E:FEC0), rtl
      '8fb4fe7e 8fc0fe7e 8fc2fe7e 8fc4fe7e 8fc6fe7e 6b',
      // +$15 test: phx / jsr locate / and.l marks,x / bne f (+$12) / tyx / jsr locate / and.l marks,x / bne f (+8) /
      // plx / lda $0B99 / cmp #$1B / rtl / f: plx / lda #$1B / cmp #$1B / rtl
      `da 20${locate} 3fc0fe7e d012 bb 20${locate} 3fc0fe7e d008 fa ad990b c91b00 6b fa a91b00 c91b00 6b`,
      // +$39 mark: X, then the direct page's a2 ($91), each: jsr locate / sep #$20 / ora.l / sta.l / rep #$20; plx;
      // then stz ChkCnt / ldy #$16 / rtl
      `da 20${locate} e220 1fc0fe7e 9fc0fe7e c220 a691 20${locate} e220 1fc0fe7e 9fc0fe7e c220 fa 9c7f14 a01600 6b`,
      // +$62 locate: lda pnum,x / and #$1F / cpx #$0C / bcc +3 / ora #$20 / pha / lsr x3 / tax / pla / and #7 / phy / tay /
      // lda #1 / l: dey / bmi +3 / asl / bra l / ply / rts
      'bda312 291f00 e00c00 9003 092000 48 4a4a4a aa 68 290700 5a a8 a90100 88 3003 0a 80fa 7a 60',
    ]
      .join('')
      .replace(/ /g, '')
    expect(hex(on.bytes, base, code.length / 2)).toBe(code)
  })
})
