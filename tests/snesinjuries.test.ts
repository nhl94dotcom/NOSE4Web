import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildRom, openRom } from '../src/core/rom'
import { applySnesHacks, detectSnesHacks } from '../src/core/sneshacks'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (bytes: Uint8Array, at: number, count: number) => Buffer.from(bytes.subarray(at, at + count)).toString('hex')

describe.skipIf(names.length === 0)('the SNES injuries choice', () => {
  it("changes Match Viewer's places in the original game, one choice at a time", () => {
    const project = open('NHL94.smc')
    // bne .23 after the roll's clock test ($9E:9DD6); setInjuryType's bne .rtl ($9E:C34D); jsl setInjuryType and sta InjCntDown ($9E:9E21, $9E:9E28).
    const sites = { never: 0xf1dd6, period: 0xf434d, call: 0xf1e21, count: 0xf1e28 }
    expect(hex(project.bytes, sites.never, 2)).toBe('d09e')
    expect(hex(project.bytes, sites.period, 2)).toBe('d00f')
    expect(hex(project.bytes, sites.call, 4)).toBe('22d0c29e')
    expect(hex(project.bytes, sites.count, 3)).toBe('8d2616')
    expect(detectSnesHacks(project.bytes).amounts?.injuries).toBe(0)
    const expected = [
      ['d09e', 'd00f', '22d0c29e', '8d2616'],
      ['809e', 'd00f', '22d0c29e', '8d2616'],
      ['d09e', 'd00f', 'eaeaeaea', 'eaeaea'],
      ['d09e', '800f', '22d0c29e', '8d2616'],
      ['d09e', 'eaea', '22d0c29e', '8d2616'],
      // The long fall: jmp .25 ($9E:9E59, the ordinary fall's crowd reaction) and a NOP.
      ['d09e', 'd00f', '4c599eea', '8d2616'],
    ]
    let rom = project
    // Each choice from the last, then back to the original game.
    for (const choice of [1, 2, 3, 4, 5, 2, 5, 0]) {
      rom = applySnesHacks(rom, {}, false, { injuries: choice })
      expect([hex(rom.bytes, sites.never, 2), hex(rom.bytes, sites.period, 2), hex(rom.bytes, sites.call, 4), hex(rom.bytes, sites.count, 3)], `choice ${choice}`).toEqual(expected[choice])
      expect(detectSnesHacks(rom.bytes).amounts?.injuries, `choice ${choice}`).toBe(choice)
      expect(detectSnesHacks(rom.bytes).choices.injuries).toBe(choice !== 0)
      // SPAinjury1's first list: falls, lies 300 ticks, gets up (frames 282-284, then 345), only with the long fall.
      expect(hex(rom.bytes, 0xef920, 16), `choice ${choice}`).toBe(choice === 5 ? '1a0106001b012c011c0108005901f8ff' : '190114001a0114001b01e8031b0118fc')
    }
    expect(Buffer.compare(buildRom(rom), buildRom(project))).toBe(0)
  })

  names.forEach((name, n) => {
    it(`SNES ROM ${n + 1}: found, and every choice goes in and comes out`, () => {
      const project = open(name)
      const state = detectSnesHacks(project.bytes)
      expect(state.unknown).not.toContain('injuries')
      for (const choice of [1, 2, 3, 4, 5]) {
        const on = applySnesHacks(project, {}, false, { injuries: choice })
        const again = openRom(buildRom(on))
        expect(detectSnesHacks(again.bytes).amounts?.injuries).toBe(choice)
        expect(Buffer.compare(buildRom(applySnesHacks({ ...again, source: project.source }, {}, false, { injuries: 0 })), buildRom(project))).toBe(0)
      }
    })
  })
})
