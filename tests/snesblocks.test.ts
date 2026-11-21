import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SNES_HACK_GROUPS } from '../src/core/hackgroups'
import { buildRom, openRom } from '../src/core/rom'
import { applySnesHacks, detectSnesHacks, SNES_HACKS, withSnesHackChoice, type SnesHackChoices } from '../src/core/sneshacks'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
const hasRetail = existsSync(path('NHL94.smc'))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
const far = (b: Uint8Array, at: number) => ((b[at + 3] & 0x7f) << 15) | ((b[at + 1] | (b[at + 2] << 8)) & 0x7fff)
const latin = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('latin1')
const offChoices = () => Object.fromEntries(SNES_HACKS.map((hack) => [hack, false])) as SnesHackChoices

// The original game's places (file offsets): puckbody's lda puckz / cmp #8, StartGame_go's second jsl LoadTeamLines.
const PUCKBODY = 0xf6f7f
const LOAD_LINES = 0xf83ab
// The counting code and the clear, as they go in NHL94.smc (16-bit A and index, as at puckbody and in StartGame_go):
const COUNT_CODE = [
  'adf90d c90800', // lda puckz / cmp #8
  '1007', // bpl hit (+7: past lda d0 / and #$F / bne)
  'a5a5 290f00', // lda d0 / and #$F
  'd078', // bne out (+$78)
  'add815 290010 f070', // hit: lda sflags / and #sf2shot / beq out
  'add415 291000 d068', // lda gmode / and #gmhl / bne out
  'ad811d 29ff00 d060', // lda shootoutmode / and #$FF / bne out
  'b9430f f05b', // lda position,y / beq out (a goalie)
  'da a20000 c00c00 9001 e8', // phx / ldx #0 / cpy #$0C / bcc h / inx (X 1: a visitor)
  'ad290d c91800 b048', // h: lda shotplayer / cmp #$18 / bcs x (no player)
  'c90c00 8a 690000 290100 f03c', // cmp #$0C / txa / adc #0 / and #1 / beq x (the same team)
  'b9a312 29ff00 c91a00 b031', // lda pnum,y / and #$FF / cmp #26 / bcs x
  'c00c00 9003 691900', // cpy #$0C / bcc v / adc #$19 (C set: +$1A)
  'aa bf40fe7e 29ff00 c9ff00 b01c', // v: tax / lda.l counts,x / and #$FF / cmp #$FF / bcs x
  '1a e220 9f40fe7e c220', // inc / sep #$20 / sta.l counts,x / rep #$20
  'a20000 c00c00 9002 e8e8', // ldx #0 / cpy #$0C / bcc t / inx x2
  'bf74fe7e 1a 9f74fe7e', // t: lda.l totals,x / inc / sta.l totals,x
  'fa', // x: plx
  'adf90d c90800 6b', // out: lda puckz / cmp #8 / rtl
].join('').replace(/ /g, '')
const CLEAR_CODE = [
  '48 ad811d 29ff00 d010', // pha / lda shootoutmode / and #$FF / bne go (+16)
  'da a90000 a23600 9f40fe7e caca 10f8 fa', // phx / lda #0 / ldx #$36 / loop: sta.l counts,x / dex x2 / bpl loop (-8) / plx
  '68 5c34939b', // go: pla / jml LoadTeamLines
].join('').replace(/ /g, '')

describe('SNES blocked shots', () => {
  it('needs its counts, and its Game Stats row is not with the giveaways row', () => {
    const page = withSnesHackChoice(offChoices(), 'blockedShotPages', true)
    expect(page.blockedShots).toBe(true)
    const shown = withSnesHackChoice({ ...offChoices(), giveaways: true, giveawaysShown: true }, 'blockedShotsShown', true)
    expect(shown.blockedShots).toBe(true)
    expect(shown.giveawaysShown).toBe(false)
    expect(withSnesHackChoice(page, 'blockedShots', false).blockedShotPages).toBe(false)
    const stats = SNES_HACK_GROUPS.find((group) => group.id === 'statistics')!.hacks
    expect(stats.slice(stats.indexOf('giveawayPages'), stats.indexOf('giveawayPages') + 4)).toEqual(['giveawayPages', 'blockedShots', 'blockedShotsShown', 'blockedShotPages'])
    expect(COUNT_CODE.length / 2).toBe(0x8e)
  })

  it.skipIf(!hasRetail)('counts at puckbody in NHL94.smc, the code byte for byte', () => {
    const rom = open('NHL94.smc')
    expect(hex(rom.bytes, PUCKBODY, 6)).toBe('adf90dc90800')
    expect(hex(rom.bytes, LOAD_LINES, 4)).toBe('2234939b')
    const on = applySnesHacks(rom, { blockedShots: true })
    expect(on.bytes[PUCKBODY]).toBe(0x22)
    expect(hex(on.bytes, PUCKBODY + 4, 2)).toBe('eaea')
    const code = far(on.bytes, PUCKBODY)
    expect(hex(on.bytes, code, COUNT_CODE.length / 2)).toBe(COUNT_CODE)
    expect(far(on.bytes, LOAD_LINES)).toBe(code + COUNT_CODE.length / 2)
    expect(hex(on.bytes, code + COUNT_CODE.length / 2, CLEAR_CODE.length / 2)).toBe(CLEAR_CODE)
    const state = detectSnesHacks(openRom(buildRom(on)).bytes)
    expect(state.choices.blockedShots).toBe(true)
    expect(state.unknown).toEqual(detectSnesHacks(rom.bytes).unknown)
  })

  it.skipIf(names.length === 0).each(names)('%s: the counts, Game Stats row and Player Stats page go in and come out', (name) => {
    const rom = open(name)
    const before = detectSnesHacks(rom.bytes)
    for (const hack of ['blockedShots', 'blockedShotsShown', 'blockedShotPages'] as const) {
      expect(before.unknown).not.toContain(hack)
      expect(before.choices[hack]).toBe(false)
    }
    const on = applySnesHacks(rom, { blockedShots: true, blockedShotsShown: true, blockedShotPages: true })
    const reopened = openRom(buildRom(on))
    const state = detectSnesHacks(reopened.bytes)
    expect(state.choices.blockedShots && state.choices.blockedShotsShown && state.choices.blockedShotPages).toBe(true)
    expect(state.unknown).toEqual(before.unknown)
    // The row, as the game's single-number rows: kind $10, the totals, no second number.
    expect(latin(reopened.bytes, 0, reopened.bytes.length)).toContain('\x0f\x00Blocked Shots')
    expect(latin(reopened.bytes, 0, reopened.bytes.length)).toContain('  Player         G  A Pt   BLK')
    // With giveaways' row asked for too: one or the other.
    expect(() => applySnesHacks(reopened, { giveaways: true, giveawaysShown: true })).toThrow(/cannot both be on/)
    const swapped = applySnesHacks(reopened, { giveaways: true, giveawaysShown: true, blockedShotsShown: false })
    expect(detectSnesHacks(swapped.bytes).choices.giveawaysShown).toBe(true)
    expect(detectSnesHacks(swapped.bytes).choices.blockedShotsShown).toBe(false)
    expect(detectSnesHacks(swapped.bytes).unknown).toEqual(before.unknown)
    const off = applySnesHacks(reopened, { blockedShots: false, blockedShotsShown: false, blockedShotPages: false })
    expect(Buffer.compare(buildRom(off), buildRom(rom))).toBe(0)
  })

  it.skipIf(names.length === 0).each(names)('%s: the page with the giveaway and time on ice pages, either order', (name) => {
    const rom = open(name)
    const before = detectSnesHacks(rom.bytes)
    const toi = !before.notOffered?.timeOnIceShown
    const others = { giveaways: true, giveawayPages: true, ...(toi ? { timeOnIce: true, timeOnIceShown: true } : {}) }
    const pages = applySnesHacks(applySnesHacks(rom, { blockedShots: true, blockedShotPages: true }), others)
    const together = applySnesHacks(rom, { blockedShots: true, blockedShotPages: true, ...others })
    for (const p of [pages, together]) {
      const state = detectSnesHacks(openRom(buildRom(p)).bytes)
      expect(state.choices.blockedShotPages && state.choices.giveawayPages).toBe(true)
      if (toi) expect(state.choices.timeOnIceShown).toBe(true)
      expect(state.unknown).toEqual(before.unknown)
    }
    // The other pages out again with the blocked shots page staying, then that out: the ROM as it was.
    const less = applySnesHacks(pages, { giveaways: false, giveawayPages: false, ...(toi ? { timeOnIce: false, timeOnIceShown: false } : {}) })
    expect(detectSnesHacks(less.bytes).choices.blockedShotPages).toBe(true)
    const off = applySnesHacks(less, { blockedShots: false, blockedShotPages: false })
    expect(Buffer.compare(buildRom(off), buildRom(rom))).toBe(0)
  })

  it.skipIf(!hasRetail)('NHL94.smc: the page goes before the time on ice page, which the right press reaches one later', () => {
    const rom = open('NHL94.smc')
    // PlayerStatsScreen_right's lda statcolumn / cmp #5.
    const right = Buffer.from(rom.bytes).indexOf(Buffer.from('adf91dc9050030034c', 'hex')) + 4
    expect(rom.bytes[right]).toBe(5)
    const alone = applySnesHacks(rom, { blockedShots: true, blockedShotPages: true })
    expect(alone.bytes[right]).toBe(6)
    // Penalties' title gets its "]".
    expect(latin(alone.bytes, 0, alone.bytes.length)).toContain('[ Penalties]')
    const all = applySnesHacks(alone, { giveaways: true, giveawayPages: true, timeOnIce: true, timeOnIceShown: true })
    expect(all.bytes[right]).toBe(9)
    // Its row code: lda statcolumn / cmp #8 / bcc (on to the giveaway pages) / beq (its own) / dec statcolumn / jsl
    // (the time on ice page, as column 8) / inc statcolumn / rtl / jml.
    const row = far(all.bytes, 0xe096d)
    expect(hex(all.bytes, row, 9)).toBe('adf91dc90800900df0')
    expect(hex(all.bytes, row + 10, 3)).toBe('cef91d')
    expect(all.bytes[row + 13]).toBe(0x22)
    expect(hex(all.bytes, row + 17, 5)).toBe('eef91d6b5c')
    expect(hex(all.bytes, row + 13, 4).slice(2)).toBe(hex(all.bytes, row + 22, 3))
    // Its title with an arrow, the time on ice page last.
    expect(latin(all.bytes, 0, all.bytes.length)).toContain('[  Blocks  ]')
    expect(latin(all.bytes, 0, all.bytes.length)).toContain('[Takeaways ]')
  })
})
