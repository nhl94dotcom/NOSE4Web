import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildRom, openRom } from '../src/core/rom'
import { applySnesHacks, detectSnesHacks, SNES_HACKS, type SnesHack } from '../src/core/sneshacks'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
const far = (b: Uint8Array, at: number) => ((b[at + 3] & 0x7f) << 15) | ((b[at + 1] | (b[at + 2] << 8)) & 0x7fff)
const latin = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('latin1')
// The places in the original game (file offsets): puckglue, puckstick, dopass, assdumpin, doshot, FallDown .25, StartGame_scout.
const SITES = { glue: 0xf1a61, steal: 0xf7680, pass: 0xf69d4, dump: 0xf6ecc, shot: 0xf62b3, fall: 0xf1e63, scout: 0xf8334 }

describe.skipIf(!existsSync(path('NHL94.smc')))('SNES: giveaways and takeaways', () => {
  it('hooks the places that set and free the carrier, and clears the counts at each game', () => {
    const rom = open('NHL94.smc')
    expect(hex(rom.bytes, SITES.glue, 5)).toBe('a4918cd90a')
    expect(hex(rom.bytes, SITES.steal, 5)).toBe('984a8df30c')
    for (const at of [SITES.pass, SITES.dump, SITES.shot]) expect(hex(rom.bytes, at, 5)).toBe('8a4a8df30c')
    expect(hex(rom.bytes, SITES.fall, 6)).toBe('a9ffff8dd90a')
    expect(rom.bytes[SITES.scout]).toBe(0x22)
    const on = applySnesHacks(rom, { giveaways: true }).bytes
    for (const at of Object.values(SITES)) expect(on[at]).toBe(0x22)
    // puckglue's call: its own two instructions first.
    expect(hex(on, far(on, SITES.glue), 5)).toBe('a4918cd90a')
    // The clear goes on to Create_HotCold_Table.
    const clear = far(on, SITES.scout)
    expect(hex(on, clear, 11)).toBe('a9ffff8f8ce67e8f8ee67e')
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

  names.forEach((name) => {
    it(`${name}: goes in and comes out, with every other hack it can take`, () => {
      const rom = open(name)
      const state = detectSnesHacks(rom.bytes)
      expect(state.unknown).not.toContain('giveaways')
      expect(state.unknown).not.toContain('giveawaysShown')
      const on = openRom(buildRom(applySnesHacks(rom, { giveaways: true, giveawaysShown: true })))
      expect(detectSnesHacks(on.bytes).choices).toMatchObject({ giveaways: true, giveawaysShown: true })
      expect(Buffer.compare(buildRom(applySnesHacks(on, { giveaways: false, giveawaysShown: false })), buildRom(rom))).toBe(0)
      // With all the others the ROM can take that go together.
      const others: Partial<Record<SnesHack, boolean>> = {}
      for (const hack of SNES_HACKS) {
        if (state.unknown.includes(hack) || state.notOffered?.[hack] || hack === 'fighting') continue
        if (['showMaxBoost', 'seasonOvertime'].includes(hack)) continue
        others[hack] = true
      }
      const all = applySnesHacks(rom, others)
      const both = applySnesHacks(openRom(buildRom(all)), { giveaways: true, giveawaysShown: true })
      const found = detectSnesHacks(both.bytes)
      expect(found.unknown).toEqual(detectSnesHacks(all.bytes).unknown)
      for (const hack of Object.keys(others) as SnesHack[]) expect(found.choices[hack]).toBe(true)
    })
  })
})
