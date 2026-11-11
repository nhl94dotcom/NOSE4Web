import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readAscii, readU16, readU32 } from '../src/core/bytes'
import { expandTeamSpace } from '../src/core/expand'
import { NHL94_EVO } from '../src/core/games'
import { expandPictureSpace } from '../src/core/graphics'
import {
  applyHacks,
  baseWeightForYear,
  detectHacks,
  hackChanges,
  HackError,
  hackRom,
  hacksSupported,
  hackState,
  NO_HACKS,
  narrowRating,
  widenRating,
  withHacksOf,
  type Bonuses,
  type HackChoices,
} from '../src/core/hacks'
import { importTeam, ALL_PARTS } from '../src/core/importteam'
import { openProjectFile, saveProjectFile } from '../src/core/projectfile'
import { projectTeamRatings } from '../src/core/ppfix'
import { buildRom, openRom } from '../src/core/rom'
import { CSV_TABLES } from '../src/core/tables'
import { changesSince } from '../src/core/season'
import { claimSpace } from '../src/core/space'
import expected from './smozrom-hashes.json'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const hasRom = existsSync(path('nhl94.bin'))
const stock = () => new Uint8Array(readFileSync(path('nhl94.bin')))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { league30Rom?: string } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const hasLeague = !!local.league30Rom && existsSync(path(local.league30Rom))

const BONUSES: Bonuses[] = ['original', 'disabled', 'hidden', 'playersMatchLines', 'linesMatchPlayers']
// smozROM's usual set, with everything it offers switched on.
const FULL: HackChoices = {
  ...NO_HACKS,
  weightFix: 'on',
  bodychecks: 'on',
  secondAssist: true,
  plusMinus: true,
  wideRatings: true,
  bonuses: 'playersMatchLines',
  threeStars: 'linesOn',
  baseWeight: 144,
}

describe.skipIf(!hasRom)('hacks to how the game plays', () => {
  const at = (rom: Uint8Array, offset: number, length: number) => Buffer.from(rom.subarray(offset, offset + length)).toString('hex')

  it('writes what the forum posts give, and nothing else', () => {
    const rom = stock()
    const play: HackChoices = {
      ...NO_HACKS,
      checkFix: 'all120',
      aggressionFix: true,
      comebackFix: true,
      goalieHold: 300,
      goalieWidth: 40,
      goalieOut: 224,
      goalieLine: 144,
      stamina: true,
      energyDrain: 65,
      energyRecovery: 6,
      speedBurst: 24,
      turnRate: 300,
      realTime: true,
    }
    const hacked = hackRom(rom, play)
    const expected: [number, string][] = [
      [0x15d78, '6100000ae20b17430073'],
      [0x15b70, '6d000026'],
      [0x13d6c, '670000044e71'],
      [0x1530e, '012c'],
      [0xb632, '0028'],
      [0xb650, 'ffd8'],
      [0xb66a, '00e0'],
      [0xb674, 'ff20'],
      [0xd3ea, '0090'],
      [0xd3f2, 'ff70'],
      [0x15782, '6002'],
      [0x10d42, '0041'],
      [0x7a1a, '0006'],
      [0xbb88, '7018'],
      [0x10e24, '012c'],
      [0x10e32, '012c'],
      [0x10e48, '012c'],
      [0x10e56, '012c'],
      [0x15dec, '0444'],
      [0x128cc, '003c'],
      [0x15e32, '0444'],
    ]
    for (const [offset, bytes] of expected) expect(at(hacked, offset, bytes.length / 2), offset.toString(16)).toBe(bytes)
    // Those are the only bytes that differ, and the ROM is no larger.
    expect(hacked.length).toBe(rom.length)
    const changed = new Set<number>()
    hacked.forEach((byte, i) => byte !== rom[i] && changed.add(i))
    const allowed = new Set(expected.flatMap(([offset, bytes]) => Array.from({ length: bytes.length / 2 }, (_, i) => offset + i)))
    expect([...changed].filter((i) => !allowed.has(i))).toEqual([])
    expect(detectHacks(hacked)).toEqual({ choices: play, unknown: [] })
    expect(Buffer.compare(hackRom(hacked, NO_HACKS), rom)).toBe(0)
  })

  it('stops the goalie whistle by leaving its count alone, and refuses numbers the game cannot take', () => {
    const rom = stock()
    const never = hackRom(rom, { ...NO_HACKS, goalieHold: 0 })
    expect(at(never, 0xd4c6, 2)).toBe('6002')
    expect(at(never, 0x1530e, 2)).toBe('008c')
    expect(() => hackRom(rom, { ...NO_HACKS, speedBurst: 96 })).toThrow('Speed burst has to be a whole number from 0 to 95.')
    expect(() => hackRom(rom, { ...NO_HACKS, turnRate: 0 })).toThrow(HackError)
    expect(() => hackRom(rom, { ...NO_HACKS, goalieOut: 1.5 })).toThrow(HackError)
  })

  it('leaves alone what it does not recognise, and says what changed', () => {
    const rom = stock()
    // The two ends of the ice disagree, and the clocks are half changed.
    rom.set([0x00, 0x30], 0xb632)
    rom.set([0x04, 0x44], 0x15dec)
    const state = detectHacks(rom)
    expect(state.unknown).toEqual(['clock', 'goalieBox'])
    const hacked = hackRom(rom, { ...NO_HACKS, goalieWidth: 60, goalieOut: 200, realTime: true, turnRate: 200 })
    expect(at(hacked, 0xb632, 2)).toBe('0030')
    expect(at(hacked, 0xb66a, 2)).toBe('00e7')
    expect(at(hacked, 0x128cc, 2)).toBe('0018')
    expect(at(hacked, 0x10e24, 2)).toBe('00c8')
    expect(hackChanges(NO_HACKS, { ...NO_HACKS, goalieHold: 0, speedBurst: 16, realTime: true, goalieOut: 224 })).toEqual([
      'Goalie hold time: 2.33 seconds to no whistle.',
      'Goalie range up the ice: 231 to 224.',
      "Speed burst: the original game's to 16.",
      'Real-time clock: off to on.',
    ])
  })
})

describe('the weight smozROM suggests for a season', () => {
  it('follows its table, and uses the ends of it for years outside', () => {
    expect(baseWeightForYear(1994)).toBe(140)
    expect(baseWeightForYear(1950)).toBe(112)
    expect(baseWeightForYear(1932)).toBe(108)
    expect(baseWeightForYear(2010)).toBe(144)
    expect(baseWeightForYear(1900)).toBe(112)
    expect(baseWeightForYear(2050)).toBe(144)
  })
})

describe('ratings restated between the two scales', () => {
  it('keeps what a rating is worth on the ice, and comes back the same', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(widenRating)).toEqual([0, 3, 5, 8, 10, 13, 15])
    for (let value = 0; value <= 6; value++) expect(narrowRating(widenRating(value))).toBe(value)
    expect(Array.from({ length: 16 }, (_, value) => narrowRating(value))).toEqual([0, 0, 1, 1, 2, 2, 2, 3, 3, 4, 4, 4, 5, 5, 6, 6])
  })
})

describe('hacks and kinds of ROM', () => {
  it('are not offered for a ROM rebuilt as far as EVO is', () => {
    expect(hacksSupported(NHL94_EVO)).toBe(false)
  })

  it('puts code at an even address, after a gap, without moving the end mark', () => {
    const rom = new Uint8Array(0x1000).fill(0xff)
    rom.set([0x60, 0xfe], 0x100)
    expect(claimSpace(rom, 8, true)!.at).toBe(0x106)
    expect(claimSpace(rom, 8)!.at).toBe(0x100)
    rom[0x102] = 1 // something ending on an even address
    expect(claimSpace(rom, 8, true)!.at).toBe(0x108)
  })
})

describe.skipIf(!hasRom)('hacks from smozROM', () => {
  // smozROM itself was run on the original game for every combination of its
  // questions, and the start of each result's SHA-256 kept. The keys are its
  // answers: weight bug fix, season, rating scale, three stars, Edit Lines.
  it('makes the same ROM as smozROM, byte for byte, for every combination of its choices', () => {
    const opened = openRom(stock())
    const wrong: string[] = []
    for (const [answers, hash] of Object.entries(expected as Record<string, string>)) {
      const [fix, year, scale, stars, lines] = answers.split('_')
      const choices: HackChoices = {
        ...NO_HACKS,
        weightFix: fix === 'y' ? 'on' : 'off',
        bodychecks: fix === 'y' ? 'on' : 'off',
        secondAssist: true,
        plusMinus: true,
        wideRatings: scale === '15',
        bonuses: BONUSES[Number(lines) - 1],
        threeStars: stars === 'n' ? 'original' : stars === 'off' ? 'linesOff' : 'linesOn',
        baseWeight: baseWeightForYear(Number(year)),
      }
      const hacked = applyHacks(opened, choices).bytes
      if (createHash('sha256').update(hacked).digest('hex').slice(0, 16) !== hash) wrong.push(answers)
      // What was put in is what is found, and taking it all out gives the ROM back.
      const state = detectHacks(hacked)
      if (state.unknown.length > 0 || JSON.stringify(state.choices) !== JSON.stringify(choices)) wrong.push(`${answers} read back`)
      if (Buffer.compare(applyHacks({ ...opened, bytes: hacked }, NO_HACKS).bytes, opened.bytes) !== 0) wrong.push(`${answers} removed`)
    }
    expect(Object.keys(expected)).toHaveLength(180)
    expect(wrong).toEqual([])
  })

  it('finds no hacks in the original game', () => {
    expect(hackState(openRom(stock()))).toEqual({ choices: NO_HACKS, unknown: [] })
    // The ROM as it comes, before the editor has touched it, reads the same.
    expect(detectHacks(stock())).toEqual({ choices: NO_HACKS, unknown: [] })
  })

  it('makes each hack on its own, and the same ROM whatever was there before', () => {
    const opened = openRom(stock())
    const each: Partial<HackChoices>[] = [
      { weightFix: 'on' },
      { weightFix: 'simple' },
      { bodychecks: 'on' },
      { secondAssist: true },
      { oneTimerAssist: true },
      { oneTimerAssist: true, secondAssist: true },
      { regainAssist: true },
      { regainAssist: true, secondAssist: true },
      { regainAssist: true, oneTimerAssist: true },
      { regainAssist: true, oneTimerAssist: true, secondAssist: true },
      { plusMinus: true },
      { wideRatings: true },
      { bonuses: 'disabled' },
      { threeStars: 'linesOff' },
      { baseWeight: 102 },
      { baseWeight: 152 },
      { checkFix: 'all120' },
      { checkFix: 'all240' },
      { aggressionFix: true },
      { ppPkFix: true },
      { comebackFix: true },
      { passFix: true },
      { faceoffFix: true },
      { runawayFix: true },
      { penaltyShotTableFix: true },
      { penaltyShotFixes: true },
      { goaliePullFix: true },
      { blindRingFix: true },
      { snipingFix: true },
      { awarenessFix: true },
      { crowdFix: true },
      { stickShots: true },
      { openNetFix: true },
      { seasonTies: 'overtime' },
      { repeatCheckFix: true },
      { goalieHold: 0 },
      { goalieHold: 300 },
      { goalieWidth: 40, goalieOut: 224 },
      { goalieLine: 96 },
      { stamina: true },
      { energyDrain: 65, energyRecovery: 6 },
      { noSkatingDrain: true },
      { burstEnergy: 0 },
      { noSkatingDrain: true, burstEnergy: 0, hitEnergy: 1365, holdEnergy: 683 },
      { speedBurst: 24 },
      { turnRate: 300 },
      { realTime: true },
      { injuries: 'never' },
      { injuries: 'penaltyOnly' },
      { injuries: 'period' },
      { injuries: 'game' },
      { hotColdRange: 4 },
      { hotColdRange: 0 },
      { noIcing: true },
      { bCheckPenaltiesOff: 'asPenaltiesOn' },
      { bCheckPenaltiesOff: 'forum' },
      { goalieDelay: 12 },
      { introWait: 20 },
      { puckFriction: 8 },
      { puckColours: 'home' },
      { puckColours: 'away' },
      { netColours: 'crowd' },
      { netColours: 'home' },
      { greenFan: true },
      { goalieDelay: 128 },
      { fourthPeriodOvertime: 5940 },
      { anyPosition: true },
      { hitEnergy: 204 },
      { holdEnergy: 102 },
      { hitEnergy: 204, holdEnergy: 102 },
      { injuryBonus: 2 },
      { injuryBonus: 2, injuryCap: 12, hitEnergy: 204 },
    ]
    for (const change of each) {
      const wanted = { ...NO_HACKS, ...change }
      const direct = applyHacks(opened, wanted)
      expect(detectHacks(direct.bytes)).toEqual({ choices: wanted, unknown: [] })
      const viaFull = applyHacks(applyHacks(opened, FULL), wanted)
      expect(Buffer.compare(viaFull.bytes, direct.bytes)).toBe(0)
      expect(Buffer.compare(applyHacks(direct, wanted).bytes, direct.bytes)).toBe(0)
    }
  })

  it('writes the injury, hot and cold range and icing choices as the forum posts and Match Viewer have them', () => {
    const at = (rom: Uint8Array, offset: number, length: number) => Buffer.from(rom.subarray(offset, offset + length)).toString('hex')
    const opened = openRom(stock())
    const sites = (rom: Uint8Array) => [at(rom, 0x14440, 4), at(rom, 0x14508, 4), at(rom, 0x14520, 4)]
    expect(sites(opened.bytes)).toEqual(['66000052', '66000012', '67000018'])
    expect(sites(applyHacks(opened, { ...NO_HACKS, injuries: 'never' }).bytes)).toEqual(['60000052', '66000012', '67000018'])
    expect(sites(applyHacks(opened, { ...NO_HACKS, injuries: 'period' }).bytes)).toEqual(['66000052', '4e714e71', '67000018'])
    expect(sites(applyHacks(opened, { ...NO_HACKS, injuries: 'game' }).bytes)).toEqual(['66000052', '60000012', '60000018'])
    const penaltyOnly = applyHacks(opened, { ...NO_HACKS, injuries: 'penaltyOnly' }).bytes
    expect([at(penaltyOnly, 0x14450, 4), at(penaltyOnly, 0x1446a, 6)]).toEqual(['4e714e71', '4e714e714e71'])
    expect([at(opened.bytes, 0x14450, 4), at(opened.bytes, 0x1446a, 6)]).toEqual(['6100005a', '31fc0004c3ec'])
    expect(at(opened.bytes, 0xf70aa, 4)).toBe('303c0009')
    expect(at(applyHacks(opened, { ...NO_HACKS, hotColdRange: 4 }).bytes, 0xf70aa, 4)).toBe('303c0004')
    expect(at(opened.bytes, 0x1023e, 8)).toBe('08f80002bf804e75')
    expect(at(applyHacks(opened, { ...NO_HACKS, noIcing: true }).bytes, 0x1023e, 8)).toBe('60040002bf804e75')
    // Tied regular-season games: PeriodOver's move.w #4,(gsp).w becomes NOPs.
    expect(at(opened.bytes, 0x1725c, 6)).toBe('31fc0004c466')
    const ties = applyHacks(opened, { ...NO_HACKS, seasonTies: 'overtime' }).bytes
    expect(at(ties, 0x1725c, 6)).toBe('4e714e714e71')
    // And .eop's beq.s to .eog, which would mark the game over at the end of the first overtime.
    expect(at(opened.bytes, 0x7c4c, 2)).toBe('67c8')
    expect(at(ties, 0x7c4c, 2)).toBe('4e71')
    // A ROM with only the first change, as the editor first made it: read as overtime, and mended.
    const half = ties.slice()
    half.set([0x67, 0xc8], 0x7c4c)
    expect(detectHacks(half).choices.seasonTies).toBe('overtime')
    expect(at(applyHacks({ ...opened, bytes: half }, { ...NO_HACKS, seasonTies: 'overtime' }).bytes, 0x7c4c, 2)).toBe('4e71')
    expect(at(applyHacks({ ...opened, bytes: half }, NO_HACKS).bytes, 0x1725c, 6)).toBe('31fc0004c466')
    // Or a shootout: PeriodOver's move and NextShooter's jump to the title become calls, and .eop's branch goes.
    const shootout = applyHacks(opened, { ...NO_HACKS, seasonTies: 'shootout' })
    expect(detectHacks(shootout.bytes)).toEqual({ choices: { ...NO_HACKS, seasonTies: 'shootout' }, unknown: [] })
    expect(at(shootout.bytes, 0x1725c, 2)).toBe('4eb9')
    expect(at(shootout.bytes, 0xfc4ca, 2)).toBe('4eb9')
    expect(at(shootout.bytes, 0x7c4c, 2)).toBe('4e71')
    for (const other of ['tie', 'overtime'] as const) {
      const changed = applyHacks(shootout, { ...NO_HACKS, seasonTies: other })
      expect(detectHacks(changed.bytes).choices.seasonTies).toBe(other)
      expect(at(changed.bytes, 0xfc4ca, 6)).toBe('4ef9000172e4')
    }
    expect(Array.from(buildRom(applyHacks(shootout, NO_HACKS)))).toEqual(Array.from(buildRom(opened)))
    // The start code clears gmdir, so the shooters attack Shootout mode's ends (Match Viewer), and keeps the team structs.
    const startAt = (shootout.bytes[0x1725e] << 24) | (shootout.bytes[0x1725f] << 16) | (shootout.bytes[0x17260] << 8) | shootout.bytes[0x17261]
    expect(at(shootout.bytes, startAt + 54, 6)).toBe('08b80001c2ea')
    // Or straight after period 3: the tie test calls code that starts the shootout first; .eop and $1725C stay.
    const now = applyHacks(opened, { ...NO_HACKS, seasonTies: 'shootoutNow' })
    expect(detectHacks(now.bytes)).toEqual({ choices: { ...NO_HACKS, seasonTies: 'shootoutNow' }, unknown: [] })
    expect(at(now.bytes, 0x17262, 2)).toBe('4eb9')
    expect(at(now.bytes, 0x17268, 2)).toBe('4e71')
    expect(at(now.bytes, 0x1725c, 6)).toBe('31fc0004c466')
    expect(at(now.bytes, 0x7c4c, 2)).toBe('67c8')
    expect(at(now.bytes, 0xfc4ca, 2)).toBe('4eb9')
    for (const other of ['tie', 'overtime', 'shootout'] as const) {
      const changed = applyHacks(now, { ...NO_HACKS, seasonTies: other })
      expect(detectHacks(changed.bytes).choices.seasonTies).toBe(other)
      expect(at(changed.bytes, 0x17262, 8)).toBe('3038c6da9078ca3e')
    }
    expect(Array.from(buildRom(applyHacks(now, NO_HACKS)))).toEqual(Array.from(buildRom(opened)))
    // A one-timer at an open net aimed at the middle, as with the goalie pulled (8), not high in the middle (0).
    expect(at(opened.bytes, 0xc5fc, 6)).toBe('4240b87c002c')
    expect(at(applyHacks(opened, { ...NO_HACKS, openNetFix: true }).bytes, 0xc5fc, 6)).toBe('7008b87c002c')
    // Repeated checks: FallDown's pair test becomes a call, the rest NOPs, falling through to .cont.
    const repeat = applyHacks(opened, { ...NO_HACKS, repeatCheckFix: true }).bytes
    expect(at(opened.bytes, 0x140a8, 18)).toBe('b5f8dedc6600000cb7f8dee0660000044e75')
    expect(at(repeat, 0x140a8, 2)).toBe('4eb9')
    expect(at(repeat, 0x140ae, 12)).toBe('4e714e714e714e714e714e71')
    // The version with the bench falls is recognised, and taken out cleanly.
    const v1 = opened.bytes.slice()
    v1.set([0x4e, 0xb9, 0x00, 0x0f, 0xfa, 0xc6, 0x4e, 0x71, 0x4e, 0x71, 0x4e, 0x71, 0x4e, 0x71, 0x4e, 0x71, 0x4e, 0x71], 0x140a8)
    v1.set(Buffer.from('b5f8dedc661eb7f8dee066184a6a005e66100c6a193e005867080c6a1a0000586602588f4e75', 'hex'), 0xffac6)
    expect(detectHacks(v1)?.choices.repeatCheckFix).toBe(true)
    expect(at(applyHacks({ ...opened, bytes: v1 }, NO_HACKS).bytes, 0x140a8, 18)).toBe('b5f8dedc6600000cb7f8dee0660000044e75')
    expect(at(repeat, (repeat[0x140aa] << 24 | repeat[0x140ab] << 16 | repeat[0x140ac] << 8 | repeat[0x140ad]) >>> 0, 22)).toBe(
      'b5f8dedc660eb7f8dee066084a6a005e6702588f4e75',
    )
    // The forum's version, bra.s +2, is recognised and taken out.
    const forum = opened.bytes.slice()
    forum.set([0x60, 0x02], 0x1023e)
    expect(detectHacks(forum)).toEqual({ choices: { ...NO_HACKS, noIcing: true }, unknown: [] })
    expect(Buffer.compare(applyHacks({ ...opened, bytes: forum }, NO_HACKS).bytes, opened.bytes)).toBe(0)
    // Out of range.
    expect(() => applyHacks(opened, { ...NO_HACKS, hotColdRange: 10 })).toThrow('from 0 to 9')
  })

  it('writes the intro wait, puck friction, puck colours and the fan in green', () => {
    const at = (rom: Uint8Array, offset: number, length: number) => Buffer.from(rom.subarray(offset, offset + length)).toString('hex')
    const opened = openRom(stock())
    const short = applyHacks(opened, { ...NO_HACKS, introWait: 20 }).bytes
    expect([at(short, 0x17aaa, 4), at(short, 0xfee2a, 4)]).toEqual(['31fc0014', '31fc0014'])
    expect(at(applyHacks(opened, { ...NO_HACKS, puckFriction: 8 }).bytes, 0xac1c, 2)).toBe('7408')
    const puck = (rom: Uint8Array) => Array.from({ length: 10 }, (_, i) => at(rom, 0xa1670 + i * 8, 1)).join(' ')
    expect(puck(opened.bytes)).toBe('00 00 00 08 00 00 08 08 08 08')
    // AdamCatalyst's home team puck, byte for byte; the shadow at $A1668 is left alone.
    const home = applyHacks(opened, { ...NO_HACKS, puckColours: 'home' }).bytes
    expect(puck(home)).toBe('40 40 40 48 40 40 48 48 48 48')
    expect(at(home, 0xa1668, 1)).toBe(at(opened.bytes, 0xa1668, 1))
    expect(puck(applyHacks(opened, { ...NO_HACKS, puckColours: 'crowd' }).bytes)).toBe('20 20 20 28 20 20 28 28 28 28')
    // The nets' six pieces, the puck's left as they are.
    const nets = (rom: Uint8Array) => Array.from({ length: 6 }, (_, i) => at(rom, 0xa16c0 + i * 8, 1)).join(' ')
    expect(nets(opened.bytes)).toBe('00 08 00 08 00 08')
    const red = applyHacks(opened, { ...NO_HACKS, netColours: 'crowd' }).bytes
    expect(nets(red)).toBe('20 28 20 28 20 28')
    expect(puck(red)).toBe(puck(opened.bytes))
    expect(nets(applyHacks(opened, { ...NO_HACKS, netColours: 'away', puckColours: 'home' }).bytes)).toBe('60 68 60 68 60 68')
    expect(detectHacks(red).choices.netColours).toBe('crowd')
    const fan = applyHacks(opened, { ...NO_HACKS, greenFan: true }).bytes
    expect([at(fan, 0xbdeae, 2), at(fan, 0xbdeee, 2)]).toEqual(['206a', '2074'])
    expect(() => applyHacks(opened, { ...NO_HACKS, puckFriction: 0 })).toThrow('from 1 to 12')
  })

  it('takes energy from a skater knocked down, and from one caught by a hold, with line changes on', () => {
    const at = (rom: Uint8Array, offset: number, length: number) => Buffer.from(rom.subarray(offset, offset + length)).toString('hex')
    const opened = openRom(stock())
    expect(at(opened.bytes, 0x14116, 8)).toBe('4a6b003467000034')
    expect(at(opened.bytes, 0x13f5c, 8)).toBe('323c0cf46100c7d8')
    const hacked = applyHacks(opened, { ...NO_HACKS, hitEnergy: 204, holdEnergy: 102 }).bytes
    // FallDown's .cont2 and holdcheck's flail become jsr / nop.
    expect(at(hacked, 0x14116, 2) + at(hacked, 0x1411c, 2)).toBe('4eb94e71')
    expect(at(hacked, 0x13f5c, 2) + at(hacked, 0x13f62, 2)).toBe('4eb94e71')
    const hit = readU32(hacked, 0x14118)
    // The clock running (not after the whistle); line changes on and not Auto; a skater; a player hitter; getpde, take 204, setpde; then .cont2's test, .chkpos by the return address.
    expect(at(hacked, hit, 76)).toBe(
      '08380000c2ea6636' + '4a78d05866300838' + '0004c2fc66284a6a' + '003467220c6b000b' + '00526e1a48e7e0f0' + '264a4eb90001575a' + '044000cc4eb90001' + '577a4cdf0f074a6b' + '003466062ebc0001' + '41504e75',
    )
    const hold = readU32(hacked, 0x13f5e)
    expect(at(hacked, hold, 56)).toBe('08380000c2ea6626' + '4a78d05866200838' + '0004c2fc661848e7' + 'e0f04eb90001575a' + '044000664eb90001' + '577a4cdf0f07323c' + '0cf44ef90001073a')
    // The routines the code calls are where it says: getpde, setpde and SetSPA.
    expect(at(opened.bytes, 0x1575a, 4)).toBe('347cc6ce')
    expect(at(opened.bytes, 0x1577a, 4)).toBe('4a406a00')
    expect(detectHacks(hacked).choices).toMatchObject({ hitEnergy: 204, holdEnergy: 102 })
    expect(Buffer.compare(applyHacks(openRom(hacked), NO_HACKS).bytes, opened.bytes)).toBe(0)
    expect(() => applyHacks(opened, { ...NO_HACKS, hitEnergy: 4097 })).toThrow('from 0 to 4096')
    // The first version (3180527), which took energy after the whistle too, is still recognised, and put in again as this one.
    const first = hacked.slice()
    first.set(Buffer.from('4a78d058663008380004c2fc66284a6a003467220c6b000b00526e1a48e7e0f0264a4eb90001575a044000cc4eb90001577a4cdf0f074a6b003466062ebc000141504e75', 'hex'), hit)
    first.set(Buffer.from('4a78d058662008380004c2fc661848e7e0f04eb90001575a044000664eb90001577a4cdf0f07323c0cf44ef90001073a', 'hex'), hold)
    expect(detectHacks(first)).toEqual({ choices: { ...NO_HACKS, hitEnergy: 204, holdEnergy: 102 }, unknown: [] })
    const renewed = applyHacks(openRom(first), { ...NO_HACKS, hitEnergy: 204, holdEnergy: 102 }).bytes
    expect(at(renewed, readU32(renewed, 0x14118), 8)).toBe('08380000c2ea6636')
  })

  it('counts knockdowns, adds them to the injury roll, clears them each game and halves them each intermission', () => {
    const at = (rom: Uint8Array, offset: number, length: number) => Buffer.from(rom.subarray(offset, offset + length)).toString('hex')
    const opened = openRom(stock())
    expect(at(opened.bytes, 0x14428, 18)).toBe('203c000000a06100cc56b06a00326e00005c')
    expect(at(opened.bytes, 0x778c, 6)).toBe('4eb900017102')
    expect(at(opened.bytes, 0x17236, 10)).toBe('5278c46608780001c2ea')
    const hacked = applyHacks(opened, { ...NO_HACKS, injuryBonus: 2, injuryCap: 10 }).bytes
    // a0 = $FFF000 + 32 for the away team + roster number, used by the count and the roll.
    const countOfA2 = '7200122a0066082a000600626704064100204 1f8f000d0c1'.replace(' ', '')
    const hit = readU32(hacked, 0x14118)
    // Skater a2, player a3; count +1 to 255; no energy part; .cont2's test.
    expect(at(hacked, hit, 74)).toBe(`48e7e0f0` + '08380000c2ea662c' + `4a6a003467260c6b000b00526e1e${countOfA2}521064025310` + '4cdf0f074a6b003466062ebc000141504e75')
    // The roll: count x 2, at most 10, added to impact before the compare; .22 ($14494) for no injury.
    expect(at(hacked, 0x14432, 2) + at(hacked, 0x14438, 2)).toBe('4eb94e71')
    const roll = readU32(hacked, 0x14434)
    expect(at(hacked, roll, 68)).toBe(`48e76080${countOfA2}74001410c4fc00020c42000a6304343c000a` + 'd46a0032b0424cdf01066e024e752ebc000144944e75')
    // Each game: clear the 64 bytes, then clearTeamStats.
    expect(at(hacked, readU32(hacked, 0x778e), 26)).toBe('48e7808041f8f000703f421851c8fffc4cdf01014ef900017102')
    // Each intermission: halve every count, then PeriodOver's own two instructions.
    expect(at(hacked, 0x17236, 2) + at(hacked, 0x1723c, 4)).toBe('4eb94e714e71')
    expect(at(hacked, readU32(hacked, 0x17238), 36)).toBe('48e7c08041f8f000703f1210e20910c151c8fff84cdf01035278c46608780001c2ea4e75')
    expect(detectHacks(hacked)).toEqual({ choices: { ...NO_HACKS, injuryBonus: 2, injuryCap: 10 }, unknown: [] })
    // With the energy too, the knockdown code takes it after counting; and each comes out on its own.
    const both = applyHacks(openRom(hacked), { ...NO_HACKS, injuryBonus: 2, injuryCap: 10, hitEnergy: 204 })
    expect(detectHacks(both.bytes).choices).toMatchObject({ injuryBonus: 2, injuryCap: 10, hitEnergy: 204 })
    const energyOnly = applyHacks(both, { ...NO_HACKS, hitEnergy: 204 }).bytes
    // Taking the injury risk out leaves the energy code exactly as putting the energy in alone makes it.
    expect(Buffer.compare(energyOnly, applyHacks(opened, { ...NO_HACKS, hitEnergy: 204 }).bytes)).toBe(0)
    expect(Buffer.compare(applyHacks(both, NO_HACKS).bytes, opened.bytes)).toBe(0)
    // A count hook without the roll (or the other way round) is not a state the editor makes: unknown, left alone.
    const half = hacked.slice()
    half.set([0xb0, 0x6a, 0x00, 0x32, 0x6e, 0x00, 0x00, 0x5c], 0x14432)
    expect(detectHacks(half).unknown).toContain('injuryBonus')
    expect(() => applyHacks(opened, { ...NO_HACKS, injuryBonus: 11 })).toThrow('from 0 to 10')
  })

  it('can make skating and speed bursts cost no energy, and keeps the drain from climbing past full', () => {
    const at = (rom: Uint8Array, offset: number, length: number) => Buffer.from(rom.subarray(offset, offset + length)).toString('hex')
    const opened = openRom(stock())
    // .sube: tst.w OptLine / bne.w rtss2, then the drain of 33; burst: tst.w OptLine / bne.w, subi.w #$CC,d0.
    expect(at(opened.bytes, 0x10d26, 8)).toBe('4a78d05866004738')
    expect(at(opened.bytes, 0x10d40, 4)).toBe('04400021')
    expect(at(opened.bytes, 0xbb68, 12)).toBe('4a78d0586600001a044000cc')
    const hacked = applyHacks(opened, { ...NO_HACKS, noSkatingDrain: true, burstEnergy: 0 }).bytes
    expect(at(hacked, 0x10d2a, 4)).toBe('60004738')
    expect(at(hacked, 0xbb70, 4)).toBe('04400000')
    expect(detectHacks(hacked).choices).toMatchObject({ noSkatingDrain: true, burstEnergy: 0 })
    expect(Buffer.compare(applyHacks(openRom(hacked), NO_HACKS).bytes, opened.bytes)).toBe(0)
    // Below 16, a high-endurance player's give-back outweighs the drain (Match Viewer, in the game).
    expect(() => applyHacks(opened, { ...NO_HACKS, energyDrain: 15 })).toThrow('from 16 to 999')
    // A hit may now take up to all of a player's energy.
    expect(detectHacks(applyHacks(opened, { ...NO_HACKS, hitEnergy: 4096 }).bytes).choices.hitEnergy).toBe(4096)
  })

  it('lists every skater for every position in Edit Lines, and saves such lines a byte a slot', () => {
    const at = (rom: Uint8Array, offset: number, length: number) => Buffer.from(rom.subarray(offset, offset + length)).toString('hex')
    const opened = openRom(stock())
    expect(at(opened.bytes, 0x83a0, 10)).toBe('b47c00026e00000ad240')
    const hacked = applyHacks(opened, { ...NO_HACKS, anyPosition: true }).bytes
    // SelectLinePlayer: no branch on the slot, so every slot lists from the first skater.
    expect(at(hacked, 0x83a4, 6)).toBe('4e714e714e71')
    // EncodeTeamLines: the old block's nibbles where the player fits them (else 0), with WriteLineData, then a byte a slot,
    // counted from the first skater, to save RAM $1EC0.
    expect(at(hacked, 0x8928, 2) + at(hacked, 0x892e, 2)).toBe('4eb94e71')
    expect(at(hacked, readU32(hacked, 0x892a), 144)).toBe(
      '588f48e7fcf8302a00285240387cd07618c041f8f04010c0' + '43ea016a4eb900009f4032004eb900009f7e3a00267c0000898a42424244' +
        '141b6b32' + '163120005303960110c3024200070c420002' + '6e08' + '9605640a76006006' + 'b6056502' + '7600' +
        '08440000' + '6604' + '188360d0' + 'e903871c60ca' +
        '4eb9000fe696203c00001ec0722241f8f0404eb90001a1e44eb90001a2064cdf1f3f4e75',
    )
    // DecodeTeamLines: the new block if it is this team's, else the original code.
    expect(at(hacked, 0x88c8, 2) + at(hacked, 0x88ce, 2)).toBe('4eb94e71')
    expect(at(hacked, readU32(hacked, 0x88ca), 92)).toBe(
      '588f48e7f890203c00001ec0722241f8f0404eb90001a2441038f040b038d076670a' + '307cd0764ef9000088d0' +
        '41f8f0414eb900009f403200267c0000898a4242' + '14136b1270001018d0415240141b4eb90000889860ea' + '4cdf091f4e75',
    )
    // The routines it calls are where it says.
    expect([at(opened.bytes, 0x9f40, 2), at(opened.bytes, 0x8898, 2), at(opened.bytes, 0x1a1e4, 4), at(opened.bytes, 0x1a244, 4), at(opened.bytes, 0xfe696, 4)]).toEqual([
      at(opened.bytes, 0x9f40, 2), at(opened.bytes, 0x8898, 2), '48e7e0c0', '48e7e0c0', '48e7c080',
    ])
    // GetForwardCount: the high nibble of the scouting report's forwards byte.
    expect(at(opened.bytes, 0x9f7e, 28)).toBe('48e70080206a001ed0e8000810280003e8480240000f4cdf01004e75')
    expect(detectHacks(hacked)).toEqual({ choices: { ...NO_HACKS, anyPosition: true }, unknown: [] })
    expect(Buffer.compare(applyHacks(openRom(hacked), NO_HACKS).bytes, opened.bytes)).toBe(0)
    // The first version (b2606c6), which wrote only the team byte to the old block, is still recognised, and taken out whole.
    const first = hacked.slice()
    const encode = readU32(hacked, 0x892a)
    first.fill(0xff, encode, encode + 144)
    first.set(
      Buffer.from(
        '588f48e7f8f0307cd076302a0028524010804eb9000fe69641f8f04010c043ea016a4eb900009f403200267c0000898a4242141b6b0c163120005303960110c360f0203c00001ec0722241f8f0404eb90001a1e44eb90001a2064cdf0f1f4e75',
        'hex',
      ),
      encode,
    )
    expect(detectHacks(first)).toEqual({ choices: { ...NO_HACKS, anyPosition: true }, unknown: [] })
    expect(Buffer.compare(applyHacks(openRom(first), NO_HACKS).bytes, opened.bytes)).toBe(0)
  })

  it("offers the fourth period length with its own regular-season overtime, keeping the Clock's and the playoffs'", () => {
    const at = (rom: Uint8Array, offset: number, length: number) => Buffer.from(rom.subarray(offset, offset + length)).toString('hex')
    const opened = openRom(stock())
    // The menu's period line offers 3 choices, in both tables of choice counts.
    expect([at(opened.bytes, 0xf7926, 2), at(opened.bytes, 0xf7938, 2)]).toEqual(['0003', '0003'])
    const hacked = applyHacks(opened, { ...NO_HACKS, fourthPeriodOvertime: 5940 }).bytes
    expect([at(hacked, 0xf7926, 2), at(hacked, 0xf7938, 2)]).toEqual(['0004', '0004'])
    // tst.w OptPlayMode / bne.w become jsr / nop; the Clock's move.w #600,d0 after them is left.
    expect(at(hacked, 0x7822, 2) + at(hacked, 0x7828, 2)).toBe('4eb94e71')
    expect(at(hacked, 0x782a, 4)).toBe('303c0258')
    const target = readU32(hacked, 0x7824)
    expect(at(hacked, target, 24)).toBe('4a78d048660c0c780003d0506608303c17345c974e754e75')
    const again = openRom(hacked)
    expect(detectHacks(again.bytes).choices.fourthPeriodOvertime).toBe(5940)
    expect(again.settings.overtimeSeconds).toBe(600)
    // The Clock's overtime is still edited where it was, with the hack on.
    const clock = openRom(buildRom({ ...again, settings: { ...again.settings, overtimeSeconds: 300 } }))
    expect(clock.settings.overtimeSeconds).toBe(300)
    expect(detectHacks(clock.bytes).choices.fourthPeriodOvertime).toBe(5940)
    // Changed, then taken out: the original game again.
    expect(detectHacks(applyHacks(again, { ...NO_HACKS, fourthPeriodOvertime: 600 }).bytes).choices.fourthPeriodOvertime).toBe(600)
    expect(Buffer.compare(applyHacks(again, NO_HACKS).bytes, opened.bytes)).toBe(0)
    expect(() => applyHacks(opened, { ...NO_HACKS, fourthPeriodOvertime: 6000 })).toThrow('from 0 to 5999')
  })

  it('writes the B-check and goalie control delay choices, the delay in all eight places', () => {
    const at = (rom: Uint8Array, offset: number, length: number) => Buffer.from(rom.subarray(offset, offset + length)).toString('hex')
    const opened = openRom(stock())
    const bcheck = (rom: Uint8Array) => [at(rom, 0x13fdc, 4), at(rom, 0x13fe6, 4)]
    expect(bcheck(opened.bytes)).toEqual(['6600003a', '67000030'])
    expect(bcheck(applyHacks(opened, { ...NO_HACKS, bCheckPenaltiesOff: 'asPenaltiesOn' }).bytes)).toEqual(['6000003a', '67000030'])
    expect(bcheck(applyHacks(opened, { ...NO_HACKS, bCheckPenaltiesOff: 'forum' }).bytes)).toEqual(['6700003a', '66000030'])
    const delays = (rom: Uint8Array) => [at(rom, 0xad02, 6), at(rom, 0xad08, 6), ...[0xb12f, 0xb139, 0xb36d, 0xb377, 0xb39b, 0xb3c3].map((o) => at(rom, o - 3, 4))]
    expect(delays(opened.bytes)).toEqual(['31fc1111bf06', '31fc1111bf08', '11fc0011', '11fc0011', '11fc0011', '11fc0011', '11fc0011', '11fc0011'])
    expect(delays(applyHacks(opened, { ...NO_HACKS, goalieDelay: 12 }).bytes)).toEqual(['31fc0c0cbf06', '31fc0c0cbf08', '11fc000c', '11fc000c', '11fc000c', '11fc000c', '11fc000c', '11fc000c'])
    expect(() => applyHacks(opened, { ...NO_HACKS, goalieDelay: 0 })).toThrow('from 1 to 128')
    expect(() => applyHacks(opened, { ...NO_HACKS, goalieDelay: 129 })).toThrow('from 1 to 128')
  })

  it("puts Match Viewer's regained-puck fix at $10176, apart from the other assist fixes", () => {
    const at = (rom: Uint8Array, offset: number, length: number) => Buffer.from(rom.subarray(offset, offset + length)).toString('hex')
    const where = (rom: Uint8Array, offset: number) => (rom[offset] << 24) | (rom[offset + 1] << 16) | (rom[offset + 2] << 8) | rom[offset + 3]
    const opened = openRom(stock())
    expect(at(opened.bytes, 0x10176, 8)).toBe('b068001867000028')
    const fixed = applyHacks(opened, { ...NO_HACKS, regainAssist: true }).bytes
    expect(at(fixed, 0x10176, 2)).toBe('4eb9')
    expect(at(fixed, 0x1017c, 2)).toBe('4e71')
    // cmp.w $18(a0),d0; bne.s +12; bclr #3,$30(a0); move.l #$101A4,(sp); rts
    expect(at(fixed, where(fixed, 0x10178), 20)).toBe('b0680018660c08a8000300302ebc000101a44e75')
    // The rest of a2touchpuck is as it was, the second-assist fix's place included.
    expect(at(fixed, 0x1017e, 38)).toBe(at(opened.bytes, 0x1017e, 38))
    const all = applyHacks(opened, { ...NO_HACKS, regainAssist: true, oneTimerAssist: true, secondAssist: true }).bytes
    for (const off of ['regainAssist', 'oneTimerAssist', 'secondAssist'] as const) {
      const wanted = { ...NO_HACKS, regainAssist: true, oneTimerAssist: true, secondAssist: true, [off]: false }
      expect(Buffer.compare(applyHacks({ ...opened, bytes: all }, wanted).bytes, applyHacks(opened, wanted).bytes), off).toBe(0)
    }
    expect(Buffer.compare(applyHacks({ ...opened, bytes: all }, NO_HACKS).bytes, opened.bytes)).toBe(0)
  })

  it("puts the one-timer assist fix at $F6CE4, with the second-assist fix's check in it when that is on", () => {
    const at = (rom: Uint8Array, offset: number, length: number) => Buffer.from(rom.subarray(offset, offset + length)).toString('hex')
    const opened = openRom(stock())
    expect(at(opened.bytes, 0xf6ce4, 16)).toBe('3168001a001c31680018001a31400018')
    const alone = applyHacks(opened, { ...NO_HACKS, oneTimerAssist: true }).bytes
    expect(at(alone, 0xf6ce4, 6).slice(0, 4)).toBe('4eb9')
    expect(at(alone, 0xf6cea, 10)).toBe('4e714e714e714e714e71')
    const where = (rom: Uint8Array) => (rom[0xf6ce6] << 24) | (rom[0xf6ce7] << 16) | (rom[0xf6ce8] << 8) | rom[0xf6ce9]
    expect(at(alone, where(alone), 42)).toBe('b06800186722 08a800030030 660c 3168001a001c 31680018001a 31400018 b068001c 6604 50e8001c 4e75'.replace(/ /g, ''))
    // With the second-assist fix, its first place still calls that fix, and this code has the fix's check.
    const both = applyHacks(opened, { ...NO_HACKS, oneTimerAssist: true, secondAssist: true }).bytes
    expect(at(both, 0x10188, 2)).toBe('4eb9')
    expect(at(both, where(both), 48)).toBe('b06800186728 08a800030030 6612 b068001a 6706 3168001a001c 31680018001a 31400018 b068001c 6604 50e8001c 4e75'.replace(/ /g, ''))
    // Turning either off leaves the other as it would be on its own.
    const assistOnly = applyHacks(opened, { ...NO_HACKS, secondAssist: true }).bytes
    expect(Buffer.compare(applyHacks({ ...opened, bytes: both }, { ...NO_HACKS, secondAssist: true }).bytes, assistOnly)).toBe(0)
    expect(Buffer.compare(applyHacks({ ...opened, bytes: both }, { ...NO_HACKS, oneTimerAssist: true }).bytes, alone)).toBe(0)
    expect(Buffer.compare(applyHacks({ ...opened, bytes: both }, NO_HACKS).bytes, opened.bytes)).toBe(0)
  })

  it('makes every hack at once, reads them all back and takes them all out', () => {
    const opened = openRom(stock())
    const all: HackChoices = {
      ...FULL,
      oneTimerAssist: true,
      checkFix: 'all120',
      aggressionFix: true,
      ppPkFix: true,
      comebackFix: true,
      passFix: true,
      faceoffFix: true,
      runawayFix: true,
      penaltyShotTableFix: true,
      penaltyShotFixes: true,
      goaliePullFix: true,
      blindRingFix: true,
      snipingFix: true,
      awarenessFix: true,
      crowdFix: true,
      stickShots: true,
      goalieHold: 300,
      goalieWidth: 40,
      goalieOut: 224,
      goalieLine: 144,
      stamina: true,
      energyDrain: 65,
      energyRecovery: 6,
      speedBurst: 24,
      turnRate: 300,
      realTime: true,
    }
    const hacked = applyHacks(opened, all)
    expect(detectHacks(hacked.bytes)).toEqual({ choices: all, unknown: [] })
    expect(Buffer.compare(applyHacks(hacked, NO_HACKS).bytes, opened.bytes)).toBe(0)
  })

  it('calls the code it adds from the right places, at even addresses in unused room', () => {
    const opened = openRom(stock())
    const hacked = applyHacks(opened, FULL).bytes
    let end = opened.bytes.length - 1
    while (opened.bytes[end] === 0xff) end--
    for (const at of [0x13d72, 0x14130, 0x10188, 0xf6ce4, 0xf710a, 0x1494a]) {
      expect(readU16(hacked, at)).toBe(0x4eb9)
      const target = readU32(hacked, at + 2)
      expect(target % 2).toBe(0)
      expect(target).toBeGreaterThan(end + 4)
      expect(target).toBeLessThan(hacked.length)
    }
    expect(readU32(hacked, 0x10188 + 2)).toBe(readU32(hacked, 0xf6ce4 + 2)) // one fix, called twice
    expect(readU16(hacked, end - 1)).toBe(0x60fe) // the end mark has not moved
    expect(hacked.length).toBe(opened.bytes.length)
  })

  it('marks the product code, so the editor shows the new scale and weights', () => {
    const opened = openRom(stock())
    const hacked = applyHacks(opened, FULL)
    expect(readAscii(hacked.bytes, 0x180, 14)).toBe('GM T-50656-F0V')
    expect(hacked.game.title).toBe('NHL 94, 0–15 ratings, base weight 144')
    expect(hacked.game.playerAttributeKinds.slice(0, 2)).toEqual(['weight:144', 'value'])
    const plain = applyHacks(hacked, NO_HACKS)
    expect(plain.game).toBe(opened.game)
    const retro = applyHacks(opened, { ...NO_HACKS, baseWeight: 102 })
    expect(readAscii(retro.bytes, 0x180, 14)).toBe('GM T-50656 -0A')
    expect(() => applyHacks(opened, { ...NO_HACKS, baseWeight: 141 })).toThrow(HackError)
  })

  it('restates every rating and weight when the scale or the base changes, and puts them back', () => {
    const opened = { ...openRom(stock()), freeAgents: [{ player: openRom(stock()).teams[3].players[5], role: 'F' as const }] }
    const wide = applyHacks(opened, { ...NO_HACKS, wideRatings: true })
    const [was, now] = [opened.teams[3].players[5], wide.teams[3].players[5]]
    expect(now.name).toBe(was.name)
    opened.game.playerAttributeKinds.forEach((kind, i) => expect(now.attributes[i]).toBe(kind === 'rating' ? widenRating(was.attributes[i]) : was.attributes[i]))
    const goalie = wide.teams[3].players[0]
    opened.game.goalieAttributeKinds.forEach((kind, i) => expect(goalie.attributes[i]).toBe(kind === 'rating' ? widenRating(opened.teams[3].players[0].attributes[i]) : opened.teams[3].players[0].attributes[i]))
    expect(wide.freeAgents[0].player).toEqual(now)
    // Nothing but the players has changed, and going back loses nothing.
    expect(wide.teams.map((t) => t.lines)).toEqual(opened.teams.map((t) => t.lines))
    const back = applyHacks(wide, NO_HACKS)
    expect(back.teams).toEqual(opened.teams)
    expect(back.freeAgents).toEqual(opened.freeAgents)

    // A base weight four pounds on leaves every stored weight where it was; eight pounds on moves each down a step.
    expect(applyHacks(opened, { ...NO_HACKS, baseWeight: 144 }).teams).toEqual(opened.teams)
    const heavier = applyHacks(opened, { ...NO_HACKS, baseWeight: 148 })
    opened.teams[0].players.forEach((player, i) => expect(heavier.teams[0].players[i].attributes[0]).toBe(Math.max(0, player.attributes[0] - 1)))
    // Changing a hack that touches no ratings leaves the players alone.
    expect(applyHacks(opened, { ...NO_HACKS, secondAssist: true }).teams).toBe(opened.teams)
  })

  it('builds a ROM that opens again with its hacks and its teams', () => {
    const hacked = applyHacks(openRom(stock()), FULL)
    const renamed = { ...hacked, teams: hacked.teams.map((team, i) => (i === 0 ? { ...team, players: team.players.map((p, j) => (j === 3 ? { ...p, name: p.name.split('').reverse().join('') } : p)) } : team)) }
    const reopened = openRom(buildRom(renamed))
    expect(reopened.game).toBe(hacked.game)
    expect(hackState(reopened)).toEqual({ choices: FULL, unknown: [] })
    expect(reopened.teams.map((t) => t.players)).toEqual(renamed.teams.map((t) => t.players))
    expect(reopened.settings).toEqual(hacked.settings)
  })

  it('lives with roster and picture room made before or after', () => {
    const opened = openRom(stock())
    const orders = [
      (p: typeof opened) => applyHacks(expandPictureSpace(expandTeamSpace(expandTeamSpace(p))), FULL),
      (p: typeof opened) => expandPictureSpace(expandTeamSpace(expandTeamSpace(applyHacks(p, FULL)))),
      (p: typeof opened) => applyHacks(expandTeamSpace(applyHacks(expandTeamSpace(p), { ...FULL, bonuses: 'disabled' })), FULL),
    ]
    for (const order of orders) {
      const project = order(opened)
      expect(hackState(project)).toEqual({ choices: FULL, unknown: [] })
      const reopened = openRom(buildRom(project))
      expect(hackState(reopened)).toEqual({ choices: FULL, unknown: [] })
      expect(reopened.teams.map((t) => t.players)).toEqual(project.teams.map((t) => t.players))
      expect(reopened.settings).toEqual(opened.settings)
      // And the hacks come out again cleanly, leaving the room that was made.
      const plain = applyHacks(project, NO_HACKS)
      expect(hackState(plain)).toEqual({ choices: NO_HACKS, unknown: [] })
      expect(openRom(buildRom(plain)).settings).toEqual(opened.settings)
    }
  })

  it('leaves alone code it does not recognise, and changes the rest', () => {
    const opened = openRom(stock())
    const strange = opened.bytes.slice()
    strange.set([0x4e, 0x71, 0x4e, 0x71], 0x1867e + 40) // three stars
    strange.set([0x4e, 0xb9, 0x00, 0x0f, 0xff, 0x00], 0x1494a) // a call to somewhere else, where plus-minus hooks in
    const project = { ...opened, bytes: strange }
    expect(hackState(project)!.unknown).toEqual(['plusMinus', 'threeStars'])

    const hacked = applyHacks(project, FULL)
    expect(Array.from(hacked.bytes.slice(0x1867e, 0x1867e + 158))).toEqual(Array.from(strange.slice(0x1867e, 0x1867e + 158)))
    expect(Array.from(hacked.bytes.slice(0x1494a, 0x1494a + 6))).toEqual([0x4e, 0xb9, 0x00, 0x0f, 0xff, 0x00])
    expect(Array.from(hacked.bytes.slice(0x17132, 0x17132 + 38))).toEqual(Array.from(strange.slice(0x17132, 0x17132 + 38)))
    const state = hackState(hacked)!
    expect(state.unknown).toEqual(['plusMinus', 'threeStars'])
    expect(state.choices).toEqual({ ...FULL, plusMinus: false, threeStars: 'original' })
    expect(hacked.game.title).toBe('NHL 94, 0–15 ratings, base weight 144')

    // A ROM with no room left says so and is not changed.
    const full = opened.bytes.slice()
    full.fill(1, 0xff000)
    expect(hackRom(full, { ...NO_HACKS, secondAssist: true }).length).toBe(0x200000) // it grows, as rosters do
    const largest = new Uint8Array(0x300000).fill(1)
    largest.set(full)
    expect(() => hackRom(largest, { ...NO_HACKS, secondAssist: true })).toThrow('There is no room left in this ROM')
    expect(() => applyHacks(opened, { ...NO_HACKS, bodychecks: 'earlier' })).toThrow('does not have the earlier bodycheck statistics')
  })

  it('carries hacks in a project file, and puts them into the ROM it is opened over', () => {
    const opened = openRom(stock())
    const hacked = applyHacks(opened, FULL)
    const edited = { ...hacked, teams: hacked.teams.map((team, i) => (i === 2 ? { ...team, players: team.players.map((p, j) => (j === 6 ? { ...p, attributes: p.attributes.map((v, a) => (a === 2 ? 14 : v)) } : p)) } : team)) }
    const text = saveProjectFile(edited, withHacksOf(opened, edited), 'S')
    const result = openProjectFile(opened, text)
    expect(result.notes.join(' ')).toContain("The project's hacks were put into this ROM.")
    expect(hackState(result.project)).toEqual({ choices: FULL, unknown: [] })
    expect(result.project.game).toBe(hacked.game)
    expect(result.project.teams.map((t) => t.players)).toEqual(edited.teams.map((t) => t.players))
    expect(result.project.teams[2].players[6].attributes[2]).toBe(14)
    // Over a ROM that has them already, nothing is said or done about hacks.
    const again = openProjectFile(openRom(buildRom(hacked)), text)
    expect(again.notes.join(' ')).not.toContain('hacks')
    // A project from before hacks were kept opens as ever.
    const older = JSON.stringify({ ...JSON.parse(saveProjectFile(opened, opened, 'S')), hacks: undefined })
    expect(openProjectFile(opened, older).project.game).toBe(opened.game)
  })

  it('reports hacks as changes, and nothing else that hacking did', () => {
    const opened = openRom(stock())
    const hacked = applyHacks(opened, { ...NO_HACKS, wideRatings: true, secondAssist: true, baseWeight: 148 })
    // The ROM as opened is brought to the same scales before the two are compared.
    const original = withHacksOf(opened, hacked)
    expect(original.game).toBe(hacked.game)
    expect(original.teams).toEqual(hacked.teams)
    expect(withHacksOf(opened, opened)).toBe(opened)
    expect(changesSince(hacked, original).details).toEqual([
      { heading: 'Hacks', changes: ['Second-assist bug fix: off to on.', 'Rating scale: 0 to 6 to 0 to 15.', 'Base weight: 140 pounds to 148 pounds.'] },
    ])
    // An edit made afterwards is listed on the new scale, beside the hacks.
    const edited = { ...hacked, teams: hacked.teams.map((team, i) => (i === 0 ? { ...team, players: team.players.map((p, j) => (j === 4 ? { ...p, attributes: p.attributes.map((v, a) => (a === 1 ? 15 : v)) } : p)) } : team)) }
    const details = changesSince(edited, original).details
    expect(details).toHaveLength(2)
    expect(details[1].changes).toHaveLength(1)
    expect(details[1].changes[0]).toContain('to 15')
    // Comparing two different ROMs sets their own hacks side by side.
    const apart = changesSince(openRom(buildRom(hacked)), opened).details
    expect(apart[0]).toEqual({ heading: 'In general', changes: [expect.stringContaining('different games')] })
    expect(apart[1]).toEqual(changesSince(hacked, original).details[0])
  })

  it('restates ratings when a team comes in from a ROM on the other scale', () => {
    const narrow = openRom(stock())
    const wide = applyHacks(narrow, { ...NO_HACKS, wideRatings: true })
    const into = importTeam(wide, narrow, 5, 5, ALL_PARTS)
    expect(into.notes.join(' ')).toContain("Each rating was restated on this ROM's scale.")
    expect(into.project.teams[5].players).toEqual(wide.teams[5].players)
    const outOf = importTeam(narrow, wide, 5, 5, ALL_PARTS)
    expect(outOf.project.teams[5].players).toEqual(narrow.teams[5].players)
    expect(importTeam(narrow, narrow, 5, 6, ALL_PARTS).notes.join(' ')).not.toContain('restated')
  })
})

describe.skipIf(!hasLeague)('hacks already in a league ROM', () => {
  const league = () => openRom(new Uint8Array(readFileSync(path(local.league30Rom!))))

  it('are all recognised, and survive a change to one of them', () => {
    const opened = league()
    const state = hackState(opened)!
    expect(state.unknown).toEqual([])
    expect(state.choices.secondAssist).toBe(true)
    expect(state.choices.plusMinus).toBe(true)

    // Applying what is there changes nothing that matters, and the ROM still opens the same.
    const same = applyHacks(opened, state.choices)
    expect(hackState(same)).toEqual(state)
    expect(same.game).toBe(opened.game)
    expect(same.teams).toBe(opened.teams)

    const changed = applyHacks(opened, { ...state.choices, threeStars: state.choices.threeStars === 'linesOn' ? 'linesOff' : 'linesOn' })
    expect(hackState(changed)!.choices).toEqual({ ...state.choices, threeStars: state.choices.threeStars === 'linesOn' ? 'linesOff' : 'linesOn' })
    const reopened = openRom(buildRom(changed))
    expect(reopened.teams.map((t) => t.players)).toEqual(opened.teams.map((t) => t.players))
    expect(reopened.settings).toEqual(opened.settings)
    expect(hackState(reopened)).toEqual(hackState(changed))
  })

  it('keeps an earlier version of the bodycheck statistics unless told to replace it', () => {
    const opened = league()
    const state = hackState(opened)!
    if (state.choices.bodychecks !== 'earlier') return
    const target = readU32(opened.bytes, 0x14130 + 2)
    const code = Array.from(opened.bytes.slice(target, target + 58))
    const kept = applyHacks(opened, { ...state.choices, weightFix: 'on' })
    expect(readU32(kept.bytes, 0x14130 + 2)).toBe(target)
    expect(Array.from(kept.bytes.slice(target, target + 58))).toEqual(code)
    expect(hackState(kept)!.choices.bodychecks).toBe('earlier')

    const replaced = applyHacks(opened, { ...state.choices, bodychecks: 'on' })
    expect(hackState(replaced)).toEqual({ choices: { ...state.choices, bodychecks: 'on' }, unknown: [] })
    expect(hackState(openRom(buildRom(replaced)))!.choices.bodychecks).toBe('on')
    const removed = applyHacks(opened, { ...state.choices, bodychecks: 'off' })
    expect(readAscii(removed.bytes, 0x993f, 3)).toBe('PIM')
    expect(hackState(removed)!.choices.bodychecks).toBe('off')
  })
})

describe.skipIf(!hasRom)('the checking fix', () => {
  it('judges every check from 120, and reads project files that kept it as on or off', () => {
    const opened = openRom(stock())
    const choices = detectHacks(opened.bytes).choices
    expect(choices.checkFix).toBe('off')
    const fixed = applyHacks(opened, { ...choices, checkFix: 'all120' })
    // Only the doubling to 240 goes: asl.w #1,d0 becomes a NOP.
    expect(Buffer.from(fixed.bytes.subarray(0x13d6c, 0x13d72)).toString('hex')).toBe('670000044e71')
    expect(detectHacks(fixed.bytes).choices.checkFix).toBe('all120')
    expect(hackChanges(choices, detectHacks(fixed.bytes).choices)).toEqual(['Weight bug and C-then-B fix: off to everyone checks as the computer.'])

    // The earlier fix, every check from 240, is still recognised.
    const earlier = applyHacks(opened, { ...choices, checkFix: 'all240' })
    expect(detectHacks(earlier.bytes).choices.checkFix).toBe('all240')

    // A project file from before kept the earlier fix as true.
    const file = JSON.parse(saveProjectFile(opened, opened, 'S'))
    file.hacks = { ...file.hacks, checkFix: true }
    expect(detectHacks(openProjectFile(openRom(stock()), JSON.stringify(file)).project.bytes).choices.checkFix).toBe('all240')
  })
})

describe.skipIf(!hasRom)('the power play and penalty kill fix', () => {
  it('reads the two halves the other way round, in the same room, and the editor names them to match', () => {
    const opened = openRom(stock())
    const choices = detectHacks(opened.bytes).choices
    expect(choices.ppPkFix).toBe(false)
    const fixed = applyHacks(opened, { ...choices, ppPkFix: true })
    const at = (rom: Uint8Array) => Buffer.from(rom.subarray(0x15b1e, 0x15b3a)).toString('hex')
    // Power play: move.b 1(a0),d0 / lsr.b #4,d0 / move.b d0,PPBonus / nop; penalty kill: moveq #$F,d0 / and.b 1(a0),d0 / neg.b d0 / move.b d0,PKBonus.
    expect(at(fixed.bytes)).toBe('10280001e80811c0cf2e4e716000000e700fc02800014400' + '11c0cf2f')
    const differing = fixed.bytes.reduce((count, byte, i) => count + (byte !== opened.bytes[i] ? 1 : 0), 0)
    expect(differing).toBeLessThanOrEqual(28)
    expect(detectHacks(fixed.bytes).choices.ppPkFix).toBe(true)
    expect(applyHacks(fixed, { ...choices, ppPkFix: false }).bytes).toEqual(opened.bytes)

    // The team page, spreadsheets and comparisons follow the ROM.
    expect(projectTeamRatings(opened).map((rating) => rating.label).slice(2, 4)).toEqual(['Penalty kill', 'Power play'])
    expect(projectTeamRatings(fixed).map((rating) => rating.label).slice(2, 4)).toEqual(['Power play', 'Penalty kill'])
    const teams = CSV_TABLES.find((table) => table.id === 'teams')!
    // Anaheim's byte is 02: as intended, power play 0 and penalty kill 2.
    const rows = teams.rows(fixed)
    expect(rows[1][rows[0].indexOf('Power play bonus')]).toBe(0)
    expect(rows[1][rows[0].indexOf('Penalty kill cost')]).toBe(2)
  })
})
