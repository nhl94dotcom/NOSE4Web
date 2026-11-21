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
// puckgoalie's .t2 jsl ChkShotStat, dopass_swing's .2 lda puckvx / sta d0, a2touchpuck's ldy a2 / cpy #$0018, pucknorm's
// jsl ChkOffsides and checkgoal's lda #$FFFF / sta collflag.
const SITES = { glue: 0xf1a61, steal: 0xf7680, pass: 0xf69d4, dump: 0xf6ecc, shot: 0xf62b3, fall: 0xf1e63, injury: 0xf1ddf, scout: 0xf8334, goalie: 0xf70ec, wide: 0xf6ae9, touch: 0xf44f3, frame: 0xf5d43, goal: 0xf10ff }
// The clear, the block's last part: lda #$FFFF / sta last carrier / sta cause / lda #0 / ldx #n / loop: sta counts,x /
// dex / dex / bpl loop / jml Create_HotCold_Table.
const CLEAR_LENGTH = 29
// The places found in the ROM as `on` has them hooked.
type Sites = { glue: number; goalie: number; wide: number; touch: number; frame: number; goal: number; scout: number }
// The stoppage's two parts, between the net's and the clear: the pickup's (lda gmode / and #$0004 / bne / jmp the count /
// ldy a2 / sty puckc / lda #$FFFF / sta carrier / sta cause / rtl) and the frame's (lda gmode / and #$0004 / beq / lda
// #$FFFF / sta carrier / sta cause / jmp the frame's part).
const STOP_LENGTH = 50
// A ROM with NOSE4Web's later version of 18 November 2026 (1d24880), from one with this version (`on`): without the
// stoppage's parts, puckglue's and pucknorm's calls to the parts they go on to, the clear moved down over them.
function versionNet(on: Uint8Array, sites: Sites): Uint8Array {
  const earlier = on.slice()
  const stop = far(on, sites.glue)
  const clear = far(on, sites.scout)
  expect(clear).toBe(stop + STOP_LENGTH)
  expect(hex(on, stop + 3, 6)).toBe('290400d0034c')
  expect(hex(on, stop + 28 + 3, 5)).toBe('290400f00b')
  expect(far(on, sites.frame)).toBe(stop + 28)
  earlier.set(on.subarray(stop + 9, stop + 11), sites.glue + 1)
  earlier.set(on.subarray(stop + 28 + 20, stop + 28 + 22), sites.frame + 1)
  earlier.fill(0xff, stop, clear + CLEAR_LENGTH)
  earlier.set(on.subarray(clear, clear + CLEAR_LENGTH), stop)
  earlier[sites.scout + 1] = (0x8000 | (stop & 0x7fff)) & 0xff
  earlier[sites.scout + 2] = (0x8000 | (stop & 0x7fff)) >> 8
  return earlier
}
// A ROM with NOSE4Web's version of 18 November 2026 (bfda480), from one with this version (`on`): its pickup took only
// $FFFE for a pass (cmp #$FFFE / beq pass / cmp #$8000 / bcs give, where this one has cmp #$FFFF / beq give / cmp
// #$8000 / bcs pass), the pass at the net forgot the carrier and the cause as it was released, and there was no goalie's
// touch at a2touchpuck, the frame nor the net (between the pass at the net and the clear), the game's own code at their
// places.
function version18(rom: Uint8Array, on: Uint8Array, sites: Sites): Uint8Array {
  const earlier = on.slice()
  // The pickup's test: the last cmp #$FFFF / beq before the goalie's touch (the steal, pass, shot and fall entries after
  // it have none).
  const block = far(on, sites.goalie) - 0x200
  const test = Buffer.from(on.subarray(block, far(on, sites.goalie))).lastIndexOf(Buffer.from('c9fffff0', 'hex')) + block
  expect(hex(on, test + 5, 4).slice(0, 6)).toBe('c90080')
  const [give, pass] = [on[test + 4], on[test + 9]]
  earlier.set([0xc9, 0xfe, 0xff, 0xf0, pass + 5, 0xc9, 0x00, 0x80, 0xb0, give - 5], test)
  const wideAt = far(on, sites.wide)
  const touchAt = far(on, sites.touch)
  const clear = far(on, sites.scout)
  // The mark (lda #$FFFD / ldy pucky / bpl / dec / sta cause): lda #$FFFF / sta carrier / sta cause, two bytes shorter;
  // the four branches over it and the brl at the end two nearer their outs.
  let shorter = hex(on, wideAt, touchAt - wideAt)
  for (const [from, to] of [['a303f039', 'a303f037'], ['e3033027', 'e3033025'], ['c3019020', 'c301901e'], ['f002b00d', 'f002b00b']]) {
    expect(shorter.split(from).length).toBe(2)
    shorter = shorter.replace(from, to)
  }
  const wide = Buffer.from(shorter, 'hex')
  const mark = wide.indexOf(Buffer.from('a9fdffac', 'hex'))
  expect(hex(wide, mark + 6, 4)).toBe('10013a8f')
  const cause = wide.subarray(mark + 10, mark + 13)
  const carrier = Buffer.from([cause[0] - 2, cause[1], cause[2]])
  const older = Buffer.concat([wide.subarray(0, mark), Buffer.from('a9ffff8f', 'hex'), carrier, Buffer.from('8f', 'hex'), cause, wide.subarray(mark + 13)])
  expect(older[older.length - 3]).toBe(0x82)
  const brl = older.readInt16LE(older.length - 2) + 2
  older.writeInt16LE(brl, older.length - 2)
  earlier.fill(0xff, wideAt, clear + CLEAR_LENGTH)
  earlier.set(older, wideAt)
  earlier.set(on.subarray(clear, clear + CLEAR_LENGTH), wideAt + older.length)
  const to = wideAt + older.length
  earlier[sites.scout + 1] = (0x8000 | (to & 0x7fff)) & 0xff
  earlier[sites.scout + 2] = (0x8000 | (to & 0x7fff)) >> 8
  earlier.set(rom.subarray(sites.touch, sites.touch + 5), sites.touch)
  earlier.set(rom.subarray(sites.frame, sites.frame + 4), sites.frame)
  earlier.set(rom.subarray(sites.goal, sites.goal + 6), sites.goal)
  return earlier
}
// A ROM with NOSE4Web's version of 15 November 2026 (7ad4a23), from one with the version of 18 November (`on`): its
// block without the goalie's touch, the multiply and the pass at the net (between the fall's entry and the clear), the
// game's own code at their two places.
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
// The five newer places in a ROM, found as the hack finds them, and the clear's.
function newSites(rom: Uint8Array): Sites {
  const find = (pattern: string) => {
    const found = findCodeAll(rom, pattern)
    expect(found.length).toBe(1)
    return found[0].at
  }
  return {
    glue: find('a4..cc....f0..a90300' + '22......22......9c....9c....' + '..........' + '84..64') + 24,
    goalie: find('22......22......a9060022......ad....c90030'),
    wide: find('bd....d0..bd....f0..ad....30..80..ad....30..49ffff1a8d....' + '..........' + 'ad....85..22') + 29,
    touch: find('..........90034c....b9....8f......b9....8f......984a8f'),
    frame: find('22......22......ad....d0..ad....10') + 4,
    goal: find('............ad....c90d0030..ad....8d....4c'),
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
    expect(hex(rom.bytes, SITES.touch, 5)).toBe('a491c01800')
    expect(rom.bytes[SITES.frame]).toBe(0x22)
    expect(hex(rom.bytes, SITES.goal, 4)).toBe('a9ffff8d')
    const now = applySnesHacks(rom, { giveaways: true }).bytes
    for (const at of Object.values(SITES)) expect(now[at]).toBe(0x22)
    // From the whistle to the end of the ref's sequence (gmode's gmpen, $0004): at the pickup, the carrier and the cause
    // forgotten, nothing counted; each frame, the same. Else on to the count and the frame's part, as they were.
    const stop = far(now, SITES.glue)
    const on = versionNet(now, { ...SITES, ...newSites(rom.bytes) })
    const count = far(on, SITES.glue)
    const frame = far(on, SITES.frame)
    const local = (at: number) => hex(Uint8Array.of((0x8000 | (at & 0x7fff)) & 0xff, (0x8000 | (at & 0x7fff)) >> 8), 0, 2)
    expect(hex(now, stop, STOP_LENGTH)).toBe(
      ('add415 290400 d003 4c' + local(count) + ' a491 8cd90a a9ffff 8f10fd7e 8f12fd7e 6b' + ' add415 290400 f00b a9ffff 8f10fd7e 8f12fd7e 4c' + local(frame)).replace(/ /g, ''),
    )
    expect(detectSnesHacks(now).choices.giveaways).toBe(true)
    expect(detectSnesHacks(now).vaultVersions ?? []).not.toContain('giveaways')
    expect(Buffer.compare(buildRom(applySnesHacks(openRom(buildRom({ ...rom, bytes: now })), { giveaways: false })), buildRom(rom))).toBe(0)
    // The rest as the later version of 18 November has it.
    expect(on[SITES.wide + 4]).toBe(0xea)
    expect(on[SITES.touch + 4]).toBe(0xea)
    expect(hex(on, SITES.goal + 4, 2)).toBe('eaea')
    // The pickup: lda cause / cmp #$FFFF (none) / beq give / cmp #$8000 (a pass from there, the pass at the net's two
    // marks too) / bcs pass, else the forcer's spot.
    expect(hex(on, far(on, SITES.glue), 0x60)).toContain('af12fd7ec9fffff0')
    // The goalie's touch: lda cause / cmp #$FFFE / bne / lda #$FFFF / sta last carrier, then jml ChkShotStat.
    expect(hex(on, far(on, SITES.goalie), 20)).toBe('af12fd7ec9feffd007a9ffff8f10fd7e5c13f29e')
    // Then the multiply (A = A * Y, with d0 and d1), and the pass at the net.
    const mul = far(on, SITES.goalie) + 20
    expect(hex(on, mul, 24)).toBe('85a564a99846a59007aa1865a985a98a0aa6a5d0f0a5a960')
    const address = 0x8000 | (mul & 0x7fff)
    const call = '20' + hex(Uint8Array.of(address & 0xff, address >> 8), 0, 2)
    expect(far(on, SITES.wide)).toBe(mul + 24)
    expect(hex(on, mul + 24, 0xaf)).toBe(
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
        'a303 f039 a305 ' + call + ' 48 a305 a8 a92800 38 e303 3027 ' + call + ' c301 9020 a9d8ff 38 e303 300b f009 ' + call + ' c301 f002 b00d',
        // at the net: the cause $FFFD at the top's net (pucky positive), $FFFC at the bottom's, the passer kept; then
        // the pulls and out
        'a9fdff acd30d 1001 3a 8f12fd7e 68 6868 8254ff',
      ]
        .join(' ')
        .replace(/ /g, ''),
    )
    // A goalie's touch at a2touchpuck (its own ldy a2 / cpy #$0018 last): position,y 0 and the cause $FFFC or $FFFD
    // (ora #1 / cmp #$FFFD), the carrier and the cause forgotten.
    const touch = mul + 24 + 0xaf
    expect(far(on, SITES.touch)).toBe(touch)
    expect(hex(on, touch, 41)).toBe('a491c01800 b01c b9430f d017 af12fd7e 090100 c9fdff d00b a9ffff 8f10fd7e 8f12fd7e a491c01800 6b'.replace(/ /g, ''))
    // Each frame of pucknorm, then jml ChkOffsides: the pass at the net at the top's goal line (pucky $108 or more) or the
    // bottom's (-$108 or less) forgotten.
    expect(far(on, SITES.frame)).toBe(touch + 41)
    expect(hex(on, touch + 41, 47)).toBe(
      ('af12fd7e c9fdff d00a add30d c90801 301a 800d c9fcff d013 add30d c9f9fe 100b a9ffff 8f10fd7e 8f12fd7e 5c' + hex(rom.bytes, SITES.frame + 1, 3)).replace(/ /g, ''),
    )
    // The puck in a net's box below its crossbar (checkgoal's own lda #$FFFF / sta collflag first): the cause $FFFC or
    // $FFFD, the carrier and the cause forgotten.
    const net = touch + 41 + 47
    expect(far(on, SITES.goal)).toBe(net)
    expect(hex(on, net, 30)).toBe(('a9ffff 8d' + hex(rom.bytes, SITES.goal + 4, 2) + ' af12fd7e 090100 c9fdff d00b a9ffff 8f10fd7e 8f12fd7e 6b').replace(/ /g, ''))
    expect(far(on, SITES.scout)).toBe(net + 30)
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

  it('knows the later version of 18 November, which counted a pickup after the whistle, and replaces it when asked', () => {
    const rom = open('NHL94.smc')
    const on = applySnesHacks(rom, { giveaways: true }).bytes
    const earlier = versionNet(on, { ...SITES, ...newSites(rom.bytes) })
    const state = detectSnesHacks(earlier)
    expect(state.choices.giveaways).toBe(true)
    expect(state.unknown).not.toContain('giveaways')
    expect(state.vaultVersions).toContain('giveaways')
    const project = openRom(buildRom({ ...rom, bytes: earlier }))
    expect(Buffer.compare(applySnesHacks(project, { giveaways: true }).bytes, project.bytes)).toBe(0)
    expect(Buffer.compare(buildRom(applySnesHacks(project, { giveaways: true }, true)), buildRom({ ...rom, bytes: on }))).toBe(0)
    expect(Buffer.compare(buildRom(applySnesHacks(project, { giveaways: false })), buildRom(rom))).toBe(0)
  })

  it('knows the version of 18 November, which forgot a pass at the net as it was released, and replaces it when asked', () => {
    const rom = open('NHL94.smc')
    const on = applySnesHacks(rom, { giveaways: true }).bytes
    const earlier = version18(rom.bytes, versionNet(on, { ...SITES, ...newSites(rom.bytes) }), SITES)
    expect(hex(earlier, SITES.touch, 5)).toBe('a491c01800')
    expect(earlier[SITES.wide]).toBe(0x22)
    const state = detectSnesHacks(earlier)
    expect(state.choices.giveaways).toBe(true)
    expect(state.unknown).not.toContain('giveaways')
    expect(state.vaultVersions).toContain('giveaways')
    const project = openRom(buildRom({ ...rom, bytes: earlier }))
    expect(Buffer.compare(applySnesHacks(project, { giveaways: true }).bytes, project.bytes)).toBe(0)
    expect(Buffer.compare(buildRom(applySnesHacks(project, { giveaways: true }, true)), buildRom({ ...rom, bytes: on }))).toBe(0)
    expect(Buffer.compare(buildRom(applySnesHacks(project, { giveaways: false })), buildRom(rom))).toBe(0)
  })

  it('knows the version of 15 November, without the pass at the net, and replaces it when asked', () => {
    const rom = open('NHL94.smc')
    const on = applySnesHacks(rom, { giveaways: true }).bytes
    const earlier = version15(rom.bytes, version18(rom.bytes, versionNet(on, { ...SITES, ...newSites(rom.bytes) }), SITES), SITES.goalie, SITES.wide, SITES.scout)
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
      // The stoppage's parts at puckglue's and pucknorm's calls; the rest as the later version of 18 November has it.
      expect(hex(on.bytes, far(on.bytes, sites.glue), 9)).toBe(sa1 ? 'add475290400d0034c' : 'add415290400d0034c')
      expect(far(on.bytes, sites.frame)).toBe(far(on.bytes, sites.glue) + 28)
      const net = versionNet(on.bytes, sites)
      const touch = far(on.bytes, sites.goalie)
      expect(hex(on.bytes, touch, 20)).toBe((sa1 ? 'af025540c9feffd007a9ffff8f005540' : 'af12fd7ec9feffd007a9ffff8f10fd7e') + '5c' + hex(rom.bytes, sites.goalie + 1, 3))
      expect(far(on.bytes, sites.wide)).toBe(touch + 44)
      expect(hex(on.bytes, touch + 44, 14)).toBe(sa1 ? 'da800868faaddf6e85a56bbdc374' : 'da800868faaddf0e85a56bbdc314')
      // A goalie's touch at a2touchpuck, the frame at pucknorm's jsl ChkOffsides and the net at checkgoal, after the pass at
      // the net.
      expect(hex(rom.bytes, sites.touch, 5)).toBe('a491c01800')
      expect(hex(on.bytes, sites.touch, 1) + hex(on.bytes, sites.touch + 4, 1)).toBe('22ea')
      const goalieTouch = far(on.bytes, sites.touch)
      expect(hex(on.bytes, goalieTouch, 16)).toBe(sa1 ? 'a491c01800b01cb9436fd017af025540' : 'a491c01800b01cb9430fd017af12fd7e')
      expect(far(net, sites.frame)).toBe(goalieTouch + 41)
      expect(hex(on.bytes, goalieTouch + 41 + 43, 4)).toBe('5c' + hex(rom.bytes, sites.frame + 1, 3))
      expect(hex(rom.bytes, sites.goal, 4)).toBe('a9ffff8d')
      expect(far(on.bytes, sites.goal)).toBe(goalieTouch + 41 + 47)
      expect(hex(on.bytes, goalieTouch + 41 + 47, 6)).toBe('a9ffff8d' + hex(rom.bytes, sites.goal + 4, 2))
      // The versions of 18 (both) and 15 November in this build: known, replaced when asked, and out again.
      const withNet = versionNet(applySnesHacks(rom, { giveaways: true }).bytes, sites)
      const with18 = version18(rom.bytes, withNet, sites)
      for (const bytes of [withNet, with18, version15(rom.bytes, with18, sites.goalie, sites.wide, sites.scout)]) {
        const earlier = openRom(buildRom({ ...rom, bytes }))
        expect(detectSnesHacks(earlier.bytes).vaultVersions).toContain('giveaways')
        expect(Buffer.compare(buildRom(applySnesHacks(earlier, { giveaways: true }, true)), buildRom(applySnesHacks(rom, { giveaways: true })))).toBe(0)
        expect(Buffer.compare(buildRom(applySnesHacks(earlier, { giveaways: false })), buildRom(rom))).toBe(0)
      }
      // With all the others the ROM can take that go together.
      const others: Partial<Record<SnesHack, boolean>> = {}
      for (const hack of SNES_HACKS) {
        if (state.unknown.includes(hack) || state.notOffered?.[hack] || hack === 'fighting') continue
        // Blocked shots' Game Stats row goes where giveaways' does; fight momentum needs the fights.
        if (['showMaxBoost', 'seasonOvertime', 'barrCoin', 'blockedShotsShown', 'fightMomentum'].includes(hack)) continue
        others[hack] = true
      }
      const all = applySnesHacks(rom, others)
      const both = applySnesHacks(openRom(buildRom(all)), { giveaways: true, giveawaysShown: true })
      const found = detectSnesHacks(both.bytes)
      expect(found.unknown).toEqual(detectSnesHacks(all.bytes).unknown)
      for (const hack of Object.keys(others) as SnesHack[]) expect(found.choices[hack]).toBe(true)
      // No other hack at the five newer places.
      const rest = applySnesHacks(rom, { ...others, giveaways: false, giveawaysShown: false, giveawayPages: false })
      expect(hex(rest.bytes, sites.glue, 5)).toBe(hex(rom.bytes, sites.glue, 5))
      expect(hex(rest.bytes, sites.goalie, 4)).toBe(hex(rom.bytes, sites.goalie, 4))
      expect(hex(rest.bytes, sites.wide, 5)).toBe(hex(rom.bytes, sites.wide, 5))
      expect(hex(rest.bytes, sites.touch, 5)).toBe(hex(rom.bytes, sites.touch, 5))
      expect(hex(rest.bytes, sites.frame, 4)).toBe(hex(rom.bytes, sites.frame, 4))
      expect(hex(rest.bytes, sites.goal, 6)).toBe(hex(rom.bytes, sites.goal, 6))
    })
  })
})
