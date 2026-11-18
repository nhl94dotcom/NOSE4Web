import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildRom, openRom } from '../src/core/rom'
import { findCodeAll } from '../src/core/snes'
import { applySnesHacks, detectSnesHacks, SNES_HACKS, type SnesHack } from '../src/core/sneshacks'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
const far = (b: Uint8Array, at: number) => ((b[at + 3] & 0x7f) << 15) | ((b[at + 1] | (b[at + 2] << 8)) & 0x7fff)
const latin = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('latin1')
// The places in the original game (file offsets): puckglue, puckstick, dopass, assdumpin, doshot, FallDown .25, StartGame_scout,
// puckgoalie's .t2 jsl ChkShotStat and dopass_swing's .2 lda puckvx / sta d0.
const SITES = { glue: 0xf1a61, steal: 0xf7680, pass: 0xf69d4, dump: 0xf6ecc, shot: 0xf62b3, fall: 0xf1e63, injury: 0xf1ddf, scout: 0xf8334, goalie: 0xf70ec, wide: 0xf6ae9 }
// The clear, the block's last part: lda #$FFFF / sta last carrier / sta cause / lda #0 / ldx #n / loop: sta counts,x /
// dex / dex / bpl loop / jml Create_HotCold_Table.
const CLEAR_LENGTH = 29
// A ROM with NOSE4Web's version of 15 November 2026 (7ad4a23): this one's block without the goalie's touch, the
// multiply and the pass at the net (between the fall's entry and the clear), the game's own code at their two places.
// The places found in the ROM as `on` has them hooked.
function version15(rom: Uint8Array, on: Uint8Array, goalie: number, wide: number, scout: number): Uint8Array {
  const earlier = on.slice()
  const from = far(on, goalie)
  const clear = far(on, scout)
  expect(on[clear + CLEAR_LENGTH - 4]).toBe(0x5c)
  earlier.fill(0xff, from, clear + CLEAR_LENGTH)
  earlier.set(on.subarray(clear, clear + CLEAR_LENGTH), from)
  earlier[scout + 1] = (0x8000 | (from & 0x7fff)) & 0xff
  earlier[scout + 2] = (0x8000 | (from & 0x7fff)) >> 8
  earlier.set(rom.subarray(goalie, goalie + 4), goalie)
  earlier.set(rom.subarray(wide, wide + 5), wide)
  return earlier
}
// The two new places in a ROM, found as the hack finds them.
function newSites(rom: Uint8Array): { goalie: number; wide: number; scout: number } {
  const find = (pattern: string) => {
    const found = findCodeAll(rom, pattern)
    expect(found.length).toBe(1)
    return found[0].at
  }
  return {
    goalie: find('22......22......a9060022......ad....c90030'),
    wide: find('bd....d0..bd....f0..ad....30..80..ad....30..49ffff1a8d....' + '..........' + 'ad....85..22') + 29,
    scout: find('22......22......a9ffff8d....22'),
  }
}

describe.skipIf(!existsSync(path('NHL94.smc')))('SNES: giveaways and takeaways', () => {
  it('hooks the places that set and free the carrier, and clears the counts at each game', () => {
    const rom = open('NHL94.smc')
    expect(hex(rom.bytes, SITES.glue, 5)).toBe('a4918cd90a')
    expect(hex(rom.bytes, SITES.steal, 5)).toBe('984a8df30c')
    for (const at of [SITES.pass, SITES.dump, SITES.shot]) expect(hex(rom.bytes, at, 5)).toBe('8a4a8df30c')
    expect(hex(rom.bytes, SITES.fall, 6)).toBe('a9ffff8dd90a')
    expect(hex(rom.bytes, SITES.injury, 6)).toBe('a9ffff8dd90a')
    expect(rom.bytes[SITES.scout]).toBe(0x22)
    expect(hex(rom.bytes, SITES.goalie, 4)).toBe('2213f29e')
    expect(hex(rom.bytes, SITES.wide, 5)).toBe('addf0e85a5')
    const on = applySnesHacks(rom, { giveaways: true }).bytes
    for (const at of Object.values(SITES)) expect(on[at]).toBe(0x22)
    expect(on[SITES.wide + 4]).toBe(0xea)
    // The goalie's touch: lda cause / cmp #$FFFE / bne / lda #$FFFF / sta last carrier, then jml ChkShotStat.
    expect(hex(on, far(on, SITES.goalie), 20)).toBe('af12fd7ec9feffd007a9ffff8f10fd7e5c13f29e')
    // Then the multiply (A = A * Y, with d0 and d1), and the pass at the net.
    const mul = far(on, SITES.goalie) + 20
    expect(hex(on, mul, 24)).toBe('85a564a99846a59007aa1865a985a98a0aa6a5d0f0a5a960')
    const address = 0x8000 | (mul & 0x7fff)
    const call = '20' + hex(Uint8Array.of(address & 0xff, address >> 8), 0, 2)
    expect(far(on, SITES.wide)).toBe(mul + 24)
    expect(hex(on, mul + 24, 0xad)).toBe(
      [
        // phx / bra start / out1: pla / out: plx / lda puckvx / sta d0 / rtl
        'da 8008 68 fa addf0e 85a5 6b',
        // start: y and vy toward the passer's net (pfgoal,x), the bottom's negated
        'bdc314 d011 a90000 38 edff0e a8 a90000 38 edd30d 8006 acff0e add30d',
        // past the blue line; dist = $108 - y, 20 or more; pushed; vy toward the net, pushed
        'c95800 30d8 38 e90801 49ffff 1a c91400 30cb 48 98 30c6 f0c4 48',
        // x and |vx|, mirrored so vx is not negative; x pushed
        'ad710d acdf0e 100e 49ffff 1a 48 a90000 38 eddf0e a8 68 48',
        // both halved to under 256
        'c00001 b007 a303 c90001 900a 984aa8 a3034a8303 80ea',
        // p = a * dist; past +40 if (40 - x) * vy < p, past -40 if (-40 - x) * vy > p
        'a303 f037 a305 ' + call + ' 48 a305 a8 a92800 38 e303 3025 ' + call + ' c301 901e a9d8ff 38 e303 300b f009 ' + call + ' c301 f002 b00b',
        // a shot: the carrier and the cause forgotten; then the pulls and out
        'a9ffff 8f10fd7e 8f12fd7e 68 6868 8256ff',
      ]
        .join(' ')
        .replace(/ /g, ''),
    )
    // puckglue's call: its own two instructions first.
    expect(hex(on, far(on, SITES.glue), 5)).toBe('a4918cd90a')
    // The clear goes on to Create_HotCold_Table.
    const clear = far(on, SITES.scout)
    expect(hex(on, clear, 11)).toBe('a9ffff8f10fd7e8f12fd7e')
    // The carrier's and the forcer's roster places (pnum, $12A3) kept at $7E:FDEC and $FDEE as they get or force the
    // puck, and those counted: lda pnum,x / sta $7EFDEC at the pickup, lda $7EFDEC / jsr give, lda $7EFDEE / jsr take.
    const block = hex(on, far(on, SITES.glue), 0x140)
    expect(block).toContain('bda3128fecfd7e')
    expect(block).toContain('bda3128feefd7e')
    expect(block).toContain('afecfd7e20')
    expect(block).toContain('afeefd7e20')
    expect(detectSnesHacks(on).choices.giveaways).toBe(true)
    expect(Buffer.compare(buildRom(applySnesHacks(openRom(buildRom({ ...rom, bytes: on })), { giveaways: false })), buildRom(rom))).toBe(0)
  })

  it('adds the Give/Take row to Game Stats, read from the counts', () => {
    const rom = open('NHL94.smc')
    const on = applySnesHacks(rom, { giveaways: true, giveawaysShown: true }).bytes
    const text = latin(on, 0, on.length)
    expect(text.split('  Give/Take  ').length).toBe(3)
    // The row counts one more, penalties on and off.
    expect(text.includes('\xa9\x11\x00\x8d\xa3\x1d\xa9\x10\x00\x8d\x15\x1e')).toBe(true)
    expect(detectSnesHacks(on).choices).toMatchObject({ giveaways: true, giveawaysShown: true })
    expect(() => applySnesHacks(rom, { giveawaysShown: true })).toThrow()
    const off = applySnesHacks(openRom(buildRom({ ...rom, bytes: on })), { giveaways: false, giveawaysShown: false })
    expect(Buffer.compare(buildRom(off), buildRom(rom))).toBe(0)
  })

  it("adds the Giveaways and Takeaways pages to Player Stats, with the time on ice page or without", () => {
    const rom = open("NHL94.smc")
    const choices = (b: Uint8Array) => detectSnesHacks(b).choices
    const pick = (b: Uint8Array) => { const c = choices(b); return [c.giveawayPages, c.timeOnIceShown] }
    const gt = { giveaways: true, giveawayPages: true }
    const toi = { timeOnIce: true, timeOnIceShown: true }
    const pages = applySnesHacks(rom, gt).bytes
    expect(pick(pages)).toEqual([true, false])
    const text = latin(pages, 0, pages.length)
    expect(text).toContain("[Giveaways ]")
    expect(text).toContain("[Takeaways  ")
    expect(text).toContain("  Player         G  A Pt GV TK")
    // The Goalies page with each goalie's giveaways.
    expect(text).toContain("  Goalie         GA Sh Ptg  GV")
    // Div16U, which the save percentage calls for a goalie with shots against, keeps X (the stats index GV reads).
    expect(Buffer.from(pages).includes(Buffer.from('c90000f00cda22', 'hex'))).toBe(true)
    // Both at once, and each way round.
    const both = applySnesHacks(rom, { ...gt, ...toi }).bytes
    expect(pick(both)).toEqual([true, true])
    expect(latin(both, 0, both.length)).toContain("[Takeaways ]")
    const toiFirst = applySnesHacks(openRom(buildRom(applySnesHacks(rom, toi))), gt).bytes
    expect(pick(toiFirst)).toEqual([true, true])
    const pagesFirst = applySnesHacks(openRom(buildRom({ ...rom, bytes: pages })), toi).bytes
    expect(pick(pagesFirst)).toEqual([true, true])
    // Out again: the time on ice page as its own hack has it (its code, which detection reads byte for byte), or the original game.
    const toiAgain = applySnesHacks(openRom(buildRom({ ...rom, bytes: both })), { giveaways: false, giveawayPages: false }).bytes
    expect(pick(toiAgain)).toEqual([false, true])
    expect(Buffer.compare(buildRom(applySnesHacks(openRom(buildRom({ ...rom, bytes: toiAgain })), { timeOnIce: false, timeOnIceShown: false })), buildRom(rom))).toBe(0)
    expect(Buffer.compare(buildRom(applySnesHacks(openRom(buildRom({ ...rom, bytes: both })), { giveaways: false, giveawayPages: false, timeOnIce: false, timeOnIceShown: false })), buildRom(rom))).toBe(0)
    const pagesOnly = buildRom(applySnesHacks(openRom(buildRom({ ...rom, bytes: both })), { timeOnIce: false, timeOnIceShown: false }))
    expect(pick(openRom(pagesOnly).bytes)).toEqual([true, false])
    expect(Buffer.compare(buildRom(applySnesHacks(openRom(pagesOnly), { giveaways: false, giveawayPages: false })), buildRom(rom))).toBe(0)
  })

  it('knows the version of 15 November, without the pass at the net, and replaces it when asked', () => {
    const rom = open('NHL94.smc')
    const on = applySnesHacks(rom, { giveaways: true }).bytes
    const earlier = version15(rom.bytes, on, SITES.goalie, SITES.wide, SITES.scout)
    const state = detectSnesHacks(earlier)
    expect(state.choices.giveaways).toBe(true)
    expect(state.unknown).not.toContain('giveaways')
    expect(state.vaultVersions).toContain('giveaways')
    expect(detectSnesHacks(on).vaultVersions ?? []).not.toContain('giveaways')
    const project = openRom(buildRom({ ...rom, bytes: earlier }))
    // Kept as it is unless asked; replaced by this one when asked.
    expect(Buffer.compare(applySnesHacks(project, { giveaways: true }).bytes, project.bytes)).toBe(0)
    expect(Buffer.compare(buildRom(applySnesHacks(project, { giveaways: true }, true)), buildRom({ ...rom, bytes: on }))).toBe(0)
    expect(Buffer.compare(buildRom(applySnesHacks(project, { giveaways: false })), buildRom(rom))).toBe(0)
  })

  it('goes with the fights and the season shootout, which also use FallDown and free RAM in bank $7E', () => {
    const rom = open('NHL94.smc')
    const gt = { giveaways: true, giveawaysShown: true, giveawayPages: true }
    const with_ = applySnesHacks(openRom(buildRom(applySnesHacks(rom, { fighting: true, seasonShootout: true }, false, { seasonShootout: 1 }))), gt)
    expect(detectSnesHacks(with_.bytes).choices).toMatchObject({ ...gt, fighting: true, seasonShootout: true })
    const off = applySnesHacks(openRom(buildRom(with_)), { giveaways: false, giveawaysShown: false, giveawayPages: false })
    expect(detectSnesHacks(off.bytes).choices).toMatchObject({ giveaways: false, fighting: true, seasonShootout: true })
  })

  names.forEach((name) => {
    it(`${name}: goes in and comes out, with every other hack it can take`, () => {
      const rom = open(name)
      const state = detectSnesHacks(rom.bytes)
      expect(state.unknown).not.toContain('giveaways')
      expect(state.unknown).not.toContain('giveawaysShown')
      expect(state.unknown).not.toContain('giveawayPages')
      // The pages, with NOSE4Web's time on ice page where it is offered (McMarkis's builds have their own pages, and the
      // two go after them).
      const toi = state.notOffered?.timeOnIceShown ? {} : { timeOnIce: true, timeOnIceShown: true }
      const p = openRom(buildRom(applySnesHacks(rom, { giveaways: true, giveawayPages: true, ...toi })))
      expect(detectSnesHacks(p.bytes).choices).toMatchObject({ giveawayPages: true, ...toi })
      const text = latin(p.bytes, 0, p.bytes.length)
      expect(text).toContain("[Giveaways ]")
      if (state.notOffered?.timeOnIceShown) {
        expect(text).toContain("[Takeaways  ")
        expect(text.includes("[Checks Agt]")).toBe(true)
      }
      const offs = Object.fromEntries(Object.keys({ giveaways: 1, giveawayPages: 1, ...toi }).map((k) => [k, false]))
      expect(Buffer.compare(buildRom(applySnesHacks(p, offs)), buildRom(rom))).toBe(0)
      const on = openRom(buildRom(applySnesHacks(rom, { giveaways: true, giveawaysShown: true })))
      expect(detectSnesHacks(on.bytes).choices).toMatchObject({ giveaways: true, giveawaysShown: true })
      expect(Buffer.compare(buildRom(applySnesHacks(on, { giveaways: false, giveawaysShown: false })), buildRom(rom))).toBe(0)
      // The goalie's touch and the pass at the net: hooked to the block's two entries, each build's own addresses
      // (moved by $6000 in the SA-1 builds, the counts in BW-RAM there).
      const sites = newSites(rom.bytes)
      const sa1 = hex(rom.bytes, sites.wide, 5) === 'addf6e85a5'
      expect(hex(rom.bytes, sites.wide, 5)).toBe(sa1 ? 'addf6e85a5' : 'addf0e85a5')
      expect(on.bytes[sites.goalie]).toBe(0x22)
      expect(hex(on.bytes, sites.wide, 5).slice(0, 2) + hex(on.bytes, sites.wide + 4, 1)).toBe('22ea')
      const touch = far(on.bytes, sites.goalie)
      expect(hex(on.bytes, touch, 20)).toBe((sa1 ? 'af025540c9feffd007a9ffff8f005540' : 'af12fd7ec9feffd007a9ffff8f10fd7e') + '5c' + hex(rom.bytes, sites.goalie + 1, 3))
      expect(far(on.bytes, sites.wide)).toBe(touch + 44)
      expect(hex(on.bytes, touch + 44, 14)).toBe(sa1 ? 'da800868faaddf6e85a56bbdc374' : 'da800868faaddf0e85a56bbdc314')
      // The version of 15 November in this build: known, replaced when asked, and out again.
      const earlier = openRom(buildRom({ ...rom, bytes: version15(rom.bytes, applySnesHacks(rom, { giveaways: true }).bytes, sites.goalie, sites.wide, sites.scout) }))
      expect(detectSnesHacks(earlier.bytes).vaultVersions).toContain('giveaways')
      expect(Buffer.compare(buildRom(applySnesHacks(earlier, { giveaways: true }, true)), buildRom(applySnesHacks(rom, { giveaways: true })))).toBe(0)
      expect(Buffer.compare(buildRom(applySnesHacks(earlier, { giveaways: false })), buildRom(rom))).toBe(0)
      // With all the others the ROM can take that go together.
      const others: Partial<Record<SnesHack, boolean>> = {}
      for (const hack of SNES_HACKS) {
        if (state.unknown.includes(hack) || state.notOffered?.[hack] || hack === 'fighting') continue
        if (['showMaxBoost', 'seasonOvertime', 'barrCoin'].includes(hack)) continue
        others[hack] = true
      }
      const all = applySnesHacks(rom, others)
      const both = applySnesHacks(openRom(buildRom(all)), { giveaways: true, giveawaysShown: true })
      const found = detectSnesHacks(both.bytes)
      expect(found.unknown).toEqual(detectSnesHacks(all.bytes).unknown)
      for (const hack of Object.keys(others) as SnesHack[]) expect(found.choices[hack]).toBe(true)
      // No other hack at the two new places.
      const rest = applySnesHacks(rom, { ...others, giveaways: false, giveawaysShown: false, giveawayPages: false })
      expect(hex(rest.bytes, sites.goalie, 4)).toBe(hex(rom.bytes, sites.goalie, 4))
      expect(hex(rest.bytes, sites.wide, 5)).toBe(hex(rom.bytes, sites.wide, 5))
    })
  })
})
