import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SNES_HACK_GROUPS } from '../src/core/hackgroups'
import { buildRom, openRom } from '../src/core/rom'
import { findCodeAll, loRomAddress, snesCodeInPlace } from '../src/core/snes'
import { snesFightState } from '../src/core/snesfight'
import { applySnesHacks, detectSnesHacks, SNES_HACKS, withSnesHackChoice, type SnesHack, type SnesHackChoices } from '../src/core/sneshacks'
import { expectSameBytes } from './samebytes'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
const hasRetail = existsSync(path('NHL94.smc'))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
const far = (b: Uint8Array, at: number) => ((b[at + 3] & 0x7f) << 15) | ((b[at + 1] | (b[at + 2] << 8)) & 0x7fff)
const word = (n: number) => hex(Uint8Array.of(n & 0xff, n >> 8), 0, 2)
const offChoices = () => Object.fromEntries(SNES_HACKS.map((hack) => [hack, false])) as SnesHackChoices

// NHL94.smc's places (file offsets): playeracc's clc / adc legstr,x / sta d2 and jsl getpde / lda legspd,x,
// updatepentime's jsl updatePPTeamTime, StartGame_go's jsl InitScores.
const FACTOR = 0xf2751
const SPEED = 0xf27ed
const TICK = 0xf3f75
const CLEAR = 0xf8384
// The block for NHL94.smc with NOSE4Web's fights, its lift (a jsr) at `lift` (16-bit A and index, as at every place).
const code = (lift: number) =>
  [
    'b2dc9f c9b19e 33c89f 0313 4310', // getpde, updatePPTeamTime, InitScores, legspd, temp3
    // lift: pha / lda.l timer / beq n (+$1A) / lda gmclock / bne n (+$15) / lda position,x / beq n (+$10) / cpx #$0C /
    // lda #0 / rol / cmp.l team / bne n (+3) / pla / inc / rts / n: pla / rts
    '48 affafd7e f01a add615 d015 bd430f f010 e00c00 a90000 2a cff8fd7e d003 68 1a 60 68 60',
    // factor: sta d2 / lda legstr,x / jsr lift / pha / clc / adc d2 / sta d2 / pla / lsr / adc d2 / sta d2 / rtl
    `85ad bde312 20${word(lift)} 48 18 65ad 85ad 68 4a 65ad 85ad 6b`,
    // speed: jsl getpde / lda legspd,x / jsr lift / cmp #16 / bcc r (+3) / lda #15 / r: rtl
    `22b2dc9f bd0313 20${word(lift)} c91000 9003 a90f00 6b`,
    // tick: lda.l timer / beq g (+5) / dec / sta.l timer / g: jml updatePPTeamTime
    'affafd7e f005 3a 8ffafd7e 5cc9b19e',
    // clear: lda #0 / sta.l team / sta.l timer / jml InitScores
    'a90000 8ff8fd7e 8ffafd7e 5c33c89f',
    // fall (Y the winner): cpy #$0C / lda #0 / rol / sta.l team / lda #90 / sta.l timer / lda #$FFFF / sta temp3,y / rtl
    'c00c00 a90000 2a 8ff8fd7e a95a00 8ffafd7e a9ffff 994310 6b',
  ]
    .join('')
    .replace(/ /g, '')

describe('SNES fight momentum', () => {
  it('goes with fighting, after it on the page', () => {
    const on = { ...offChoices(), fighting: true, fightMomentum: true }
    expect(withSnesHackChoice(on, 'fighting', false).fightMomentum).toBe(false)
    expect(withSnesHackChoice(on, 'fighting', true).fightMomentum).toBe(true)
    const fighting = SNES_HACK_GROUPS.find((group) => group.id === 'fighting')!.hacks
    expect(fighting.indexOf('fightMomentum')).toBe(fighting.indexOf('fightTime') + 1)
    expect(code(0x8000).length / 2).toBe(13 + 35 + 21 + 19 + 15 + 15 + 25)
  })

  it.skipIf(!hasRetail)('NHL94.smc: only with the fights, the code byte for byte, and the fights still recognised', () => {
    const rom = open('NHL94.smc')
    expect(detectSnesHacks(rom.bytes).unknown).not.toContain('fightMomentum')
    expect(() => applySnesHacks(rom, { fightMomentum: true })).toThrow(/needs fighting on/)
    // The injury risk's hook at the fights' shared place: still no fights, so off rather than other code.
    expect(detectSnesHacks(applySnesHacks(rom, {}, false, { injuryBonus: 6 }).bytes).unknown).toEqual([])
    expect(hex(rom.bytes, FACTOR, 6)).toBe('187de31285ad')
    expect(hex(rom.bytes, SPEED, 7)).toBe('22b2dc9fbd0313')
    expect(hex(rom.bytes, TICK, 4)).toBe('22c9b19e')
    expect(hex(rom.bytes, CLEAR, 4)).toBe('2233c89f')
    const on = applySnesHacks(rom, { fighting: true, fightMomentum: true })
    const fights = applySnesHacks(rom, { fighting: true })
    // F_fightfall's lda #$FFFF / sta temp3,y in the fights' block.
    const [fall] = findCodeAll(fights.bytes, 'a93c008d....a9ffff99....af')
    const site = fall.at + 6
    expect(on.bytes[site]).toBe(0x22)
    expect(hex(on.bytes, site + 4, 2)).toBe('eaea')
    const base = far(on.bytes, site) - (13 + 35 + 21 + 19 + 15 + 15)
    const lift = loRomAddress(base + 13)
    expect(hex(on.bytes, base, code(lift).length / 2)).toBe(code(lift))
    expect(hex(on.bytes, FACTOR, 6)).toBe(`22${hex(on.bytes, FACTOR + 1, 3)}8008`)
    expect(far(on.bytes, FACTOR)).toBe(base + 13 + 35)
    expect(far(on.bytes, SPEED)).toBe(base + 13 + 35 + 21)
    expect(hex(on.bytes, SPEED + 4, 3)).toBe('eaeaea')
    expect(far(on.bytes, TICK)).toBe(base + 13 + 35 + 21 + 19)
    expect(far(on.bytes, CLEAR)).toBe(base + 13 + 35 + 21 + 19 + 15)
    // The rest of the fights' block is theirs: still recognised, with their bonus.
    expect(snesFightState(on.bytes)).toEqual(snesFightState(fights.bytes))
    const state = detectSnesHacks(openRom(buildRom(on)).bytes)
    expect(state.choices.fighting && state.choices.fightMomentum).toBe(true)
    expect(state.unknown).toEqual([])
    // The fights' bonus changed, or the fights out: momentum comes out with them, the ROM as before.
    const bonus = applySnesHacks(on, { fighting: true }, false, { fighting: 4 })
    expect(detectSnesHacks(bonus.bytes).choices.fightMomentum).toBe(true)
    expect(detectSnesHacks(bonus.bytes).amounts?.fighting).toBe(4)
    expect(() => applySnesHacks(on, { fighting: false })).toThrow(/needs fighting on/)
    const off = applySnesHacks(on, { fighting: false, fightMomentum: false })
    expect(Buffer.compare(buildRom(off), buildRom(rom))).toBe(0)
    expect(Buffer.compare(buildRom(applySnesHacks(on, { fightMomentum: false })), buildRom(fights))).toBe(0)
  })

  it.skipIf(names.length === 0).each(names)('%s: goes in with every other hack it can take, and comes out', (name) => {
    const rom = open(name)
    const before = detectSnesHacks(rom.bytes)
    expect(before.unknown).not.toContain('fightMomentum')
    const inPlace = snesCodeInPlace(rom.bytes)
    if (!inPlace) {
      // McMarkis's builds' own fights: the winner in the direct page ($89), ldx $89 / lda #$FFFF before sta temp3,x.
      const [fall] = findCodeAll(rom.bytes, 'c8c8c0400090..a689a9ffff9d....bd')
      const on = applySnesHacks(rom, { fightMomentum: true })
      expect(hex(on.bytes, fall.at + 7 + 4, 1)).toBe('ea')
      const block = far(on.bytes, fall.at + 7)
      expect(hex(on.bytes, block, 3)).toBe('a689e0')
      expect(hex(on.bytes, block + 3, 2)).toBe('0c00')
      expect(hex(on.bytes, block + 20, 4)).toBe('a9ffff6b')
    }
    const all: Partial<Record<SnesHack, boolean>> = {}
    for (const hack of SNES_HACKS) {
      if (before.unknown.includes(hack) || before.notOffered?.[hack]) continue
      if (['showMaxBoost', 'seasonOvertime', 'barrCoin', 'giveawaysShown'].includes(hack)) continue
      all[hack] = true
    }
    const on = applySnesHacks(rom, all)
    const reopened = openRom(buildRom(on))
    const state = detectSnesHacks(reopened.bytes)
    for (const hack of Object.keys(all) as SnesHack[]) expect(state.choices[hack]).toBe(true)
    expect(state.unknown).toEqual(before.unknown)
    // Taken out of the downloaded ROM: the ROM as it was, byte for byte. (Its source is the ROM as first opened,
    // where the moved builds' intro skips find the calls they took out.)
    const off = applySnesHacks({ ...reopened, source: rom.source }, before.choices)
    expect(detectSnesHacks(off.bytes).choices).toEqual(before.choices)
    // All but the checksum ($7FDC-$7FDF): the downloaded file has the one buildRom worked out, and SDL16's own is
    // not that one.
    const noSum = (b: Uint8Array) => b.slice().fill(0, 0x7fdc, 0x7fe0)
    expectSameBytes(noSum(off.bytes), noSum(rom.bytes))
  })
})
