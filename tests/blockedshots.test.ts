import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyHacks, blockedShotsOutdated, detectHacks, NO_HACKS, playerStatsPageCodes, type HackChoices } from '../src/core/hacks'
import { buildRom, openRom } from '../src/core/rom'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { league30Rom?: string; otherRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['nhl94.bin', ...(local.league30Rom ? [local.league30Rom] : []), ...(local.otherRoms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
const u16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1]
const u32 = (b: Uint8Array, o: number) => ((u16(b, o) << 16) | u16(b, o + 2)) >>> 0
// A ROM grown for the code stays grown when it comes out: the ROM as it was, grown.
const grown = (rom: ReturnType<typeof open>, length: number) => {
  const bytes = new Uint8Array(Math.max(length, rom.bytes.length)).fill(0xff)
  bytes.set(rom.bytes)
  return { ...rom, bytes }
}
// The Game Stats row: its label's length word and label, then the totals' offset and none.
const ROW = String.fromCharCode(0, 0x10) + 'Blocked Shots "' + String.fromCharCode(0x36, 0xff, 0xff)
const PAGE_SITES = [0x9556, 0x968a, 0x9658, 0x9878, 0x97ce]
const pageText = (b: Uint8Array) => Buffer.from(b.subarray(u32(b, PAGE_SITES[0] + 2), u32(b, PAGE_SITES[0] + 2) + 0x300)).toString('latin1')

describe.skipIf(!existsSync(path('nhl94.bin')))('blocked shots (Genesis)', () => {
  it('counts at puckbody, clears at StartGame, and adds the Game Stats row and the Player Stats page', () => {
    const rom = open('nhl94.bin')
    expect(detectHacks(rom.bytes).choices.blockedShots).toBe(false)
    const on = applyHacks(rom, { ...NO_HACKS, blockedShots: true }).bytes
    const base = u32(on, 0x153ca + 2)
    for (const [at, entry] of [[0x153ca, 0], [0x77cc, 4], [0xfde5e, 8], [0xfde6c, 0xc]]) {
      expect(u16(on, at)).toBe(0x4eb9)
      expect(u32(on, at + 2)).toBe(base + entry)
    }
    expect(hex(on, 0x153ca + 6, 4)).toBe('66000092')
    expect(u16(on, 0xfdcbc)).toBe(0x80)
    expect(u16(on, 0xfdcca)).toBe(0x40)
    // puckbody's own btst, its flags returned; the clear ends with jmp InitScores.
    expect(hex(on, base + 0x10, 8)).toBe('082a000300646702')
    expect(hex(on, base + 0xc8, 6)).toBe('4ef9000131f4')
    // TBLA: moveq #$F,d6 / lea (pc) to the table: Score first, Blocked Shots last.
    const table = base + 0xd2 + u16(on, base + 0xd2)
    expect(hex(on, table, 7)).toBe('000853636f7265')
    const text = Buffer.from(on.subarray(base, base + 0x400)).toString('latin1')
    expect(text.split(ROW).length).toBe(3)
    // The page: bounds up to 5, its title and header.
    const pages = u32(on, PAGE_SITES[0] + 2)
    PAGE_SITES.forEach((at, i) => expect(u32(on, at + 2)).toBe(pages + 4 * i))
    expect(hex(on, pages + 0x14 + 10, 4)).toBe('0c400005')
    expect(pageText(on)).toContain('[  Blocked Shots    ')
    // BLK, then spaces over the next column's heading (the page before's TK, PIM or TOI), as Time On Ice's does.
    expect(pageText(on)).toContain('\x00\x0a BLK    ')
    expect(pageText(on)).not.toContain('Giveaways')
    expect(detectHacks(on)).toEqual({ choices: { ...NO_HACKS, blockedShots: true }, unknown: [] })
    // Off: the game, byte for byte.
    expect(Buffer.compare(buildRom(applyHacks(openRom(buildRom({ ...rom, bytes: on })), NO_HACKS)), buildRom(grown(rom, on.length)))).toBe(0)
  })

  it('goes with giveaways and time on ice, in any mix, and comes out of each', () => {
    const rom = open('nhl94.bin')
    for (const giveaways of [false, true]) {
      for (const timeOnIce of [false, true]) {
        const choices = { ...NO_HACKS, giveaways, timeOnIce }
        const on = applyHacks(openRom(buildRom(applyHacks(rom, choices))), { ...choices, blockedShots: true }).bytes
        expect(detectHacks(on)).toEqual({ choices: { ...choices, blockedShots: true }, unknown: [] })
        const base = u32(on, 0x153ca + 2)
        // Game Stats: the blocked shots row only with giveaways off (its row keeps the table's one free place).
        expect(u32(on, 0xfde5e + 2)).toBe(giveaways ? u32(on, 0x15288 + 2) + 0x14 : base + 8)
        const pages = pageText(on)
        expect(pages.includes('Giveaways')).toBe(giveaways)
        expect(pages.includes('Time On Ice')).toBe(timeOnIce)
        expect(pages).toContain(timeOnIce ? '[  Blocked Shots   ]' : '[  Blocked Shots    ')
        if (giveaways) expect(pages).toContain('[    Takeaways     ]')
        // The last page.
        const last = 5 + (giveaways ? 2 : 0) + (timeOnIce ? 1 : 0)
        expect(hex(on, u32(on, PAGE_SITES[0] + 2) + 0x14 + 10, 4)).toBe(`0c40000${last}`)
        // Off again: as the ROM had it without blocked shots.
        const off = applyHacks(openRom(buildRom({ ...rom, bytes: on })), choices)
        expect(detectHacks(off.bytes)).toEqual({ choices, unknown: [] })
        expect(Buffer.compare(buildRom(off), buildRom(grown(applyHacks(rom, choices), off.bytes.length)))).toBe(0)
        // Giveaways taken out with blocked shots kept: the blocked shots row goes in.
        if (giveaways) {
          const kept = applyHacks(openRom(buildRom({ ...rom, bytes: on })), { ...choices, giveaways: false, blockedShots: true }).bytes
          expect(detectHacks(kept)).toEqual({ choices: { ...choices, giveaways: false, blockedShots: true }, unknown: [] })
          expect(u32(kept, 0xfde5e + 2)).toBe(u32(kept, 0x153ca + 2) + 8)
        }
      }
    }
  })

  it('replaces the first version of its pages, whose heading left the next column’s, in any mix', () => {
    const rom = open('nhl94.bin')
    const codes = playerStatsPageCodes()
    for (const giveaways of [false, true]) {
      for (const timeOnIce of [false, true]) {
        const choices = { ...NO_HACKS, giveaways, timeOnIce, blockedShots: true }
        const on = applyHacks(rom, choices).bytes
        const [now, first] = codes.filter((c) => c.gv === giveaways && c.blk && c.toi === timeOnIce)
        expect(first.code.length).toBe(now.code.length - 4)
        const pages = u32(on, PAGE_SITES[0] + 2)
        expect(Buffer.compare(on.subarray(pages, pages + now.code.length), now.code)).toBe(0)
        // As 77b70a2 made it: the first version's code where the pages are, the room after it free.
        const earlier = on.slice()
        earlier.set(first.code, pages)
        earlier.fill(0xff, pages + first.code.length, pages + now.code.length)
        expect(detectHacks(earlier)).toEqual({ choices, unknown: [] })
        expect([blockedShotsOutdated(on), blockedShotsOutdated(earlier)]).toEqual([false, true])
        const again = applyHacks(openRom(buildRom({ ...rom, bytes: earlier })), choices)
        expect(pageText(again.bytes)).toContain('\x00\x0a BLK    ')
        expect(detectHacks(again.bytes)).toEqual({ choices, unknown: [] })
        const off = applyHacks(openRom(buildRom({ ...rom, bytes: earlier })), NO_HACKS)
        expect(Buffer.compare(buildRom(off), buildRom(grown(rom, off.bytes.length)))).toBe(0)
      }
    }
  })

  it('keeps the giveaway pages of ROMs made before it as they were', () => {
    const rom = open('nhl94.bin')
    for (const timeOnIce of [false, true]) {
      const gv = applyHacks(rom, { ...NO_HACKS, giveaways: true, timeOnIce })
      const again = applyHacks(openRom(buildRom(gv)), { ...NO_HACKS, giveaways: true, timeOnIce })
      expect(Buffer.compare(buildRom(again), buildRom(gv))).toBe(0)
    }
  })

  it('has its two places to itself, with every other hack on', () => {
    const rom = open('nhl94.bin')
    const all: HackChoices = {
      ...NO_HACKS,
      weightFix: 'on', bodychecks: 'on', secondAssist: true, oneTimerAssist: true, regainAssist: true, plusMinus: true, wideRatings: true, bonuses: 'disabled',
      threeStars: 'linesOn', baseWeight: 144, checkFix: 'all120', aggressionFix: true, ppPkFix: true, comebackFix: true,
      passFix: true, openNetFix: true, repeatCheckFix: true, fighting: 'arcade', faceoffFix: true, runawayFix: true, penaltyShotTableFix: true, penaltyShotFixes: true,
      goaliePullFix: true, blindRingFix: true, snipingFix: true, awarenessFix: true, crowdFix: true, stickShots: true,
      goalieHold: 0, goalieWidth: 40, goalieOut: 224, goalieLine: 144, stamina: true, energyDrain: 65,
      energyRecovery: 6, noSkatingDrain: true, burstEnergy: 0, speedBurst: 24, turnRate: 300, realTime: true, injuries: 'period', hotColdRange: 4, hybridIcing: true, delayedCalls: true, threeOnThree: 'season', bCheckPenaltiesOff: 'asPenaltiesOn', goalieDelay: 12, fewerSkaterLines: 32, introWait: 20, puckFriction: 8, puckColours: 'home', netColours: 'crowd', greenFan: true, barrPick: true, fourthPeriodOvertime: 5940, seasonTies: 'overtime', anyPosition: true, hitEnergy: 204, holdEnergy: 102, injuryBonus: 2, injuryCap: 12, headBleeding: true, penaltySeconds: 30, fightSeconds: 150, shootoutInjuries: true, nhlShootout: true, choppyIce: true, clutchTime: true, timeOnIce: true, organResume: true, giveaways: true,
    }
    const others = applyHacks(rom, all)
    for (const at of [0x153ca, 0x77cc]) expect(hex(others.bytes, at, 6)).toBe(hex(rom.bytes, at, 6))
    const on = applyHacks(openRom(buildRom(others)), { ...all, blockedShots: true })
    expect(detectHacks(on.bytes)).toEqual({ choices: { ...all, blockedShots: true }, unknown: [] })
    const off = applyHacks(openRom(buildRom(on)), all)
    expect(detectHacks(off.bytes)).toEqual({ choices: all, unknown: [] })
    for (const at of [0x153ca, 0x77cc]) expect(hex(off.bytes, at, 6)).toBe(hex(rom.bytes, at, 6))
  })

  names.forEach((name) => {
    it(`${name}: goes in and comes out`, () => {
      const rom = open(name)
      const state = detectHacks(rom.bytes)
      if (name.includes('EVO')) {
        expect(state.unknown).toContain('blockedShots')
        return
      }
      expect(state.unknown).not.toContain('blockedShots')
      const on = openRom(buildRom(applyHacks(rom, { ...state.choices, blockedShots: true })))
      expect(detectHacks(on.bytes).choices).toEqual({ ...state.choices, blockedShots: true })
      const off = applyHacks(on, state.choices)
      expect(Buffer.compare(buildRom(off), buildRom(grown(applyHacks(rom, state.choices), off.bytes.length)))).toBe(0)
      if (!state.unknown.includes('giveaways') && !state.unknown.includes('timeOnIce')) {
        const all = openRom(buildRom(applyHacks(rom, { ...state.choices, blockedShots: true, giveaways: true, timeOnIce: true })))
        expect(detectHacks(all.bytes).choices).toEqual({ ...state.choices, blockedShots: true, giveaways: true, timeOnIce: true })
      }
    })
  })
})
