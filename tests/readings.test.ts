import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { detectHacks, hackRom, NO_HACKS } from '../src/core/hacks'
import { openRom } from '../src/core/rom'
import { applySnesHacks, detectSnesHacks } from '../src/core/sneshacks'

// The hacks made from the NHL94 Match Viewer project's readings of bugs 13, 20,
// 21 and 25, at the places it gives.
const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const hex = (rom: Uint8Array, at: number, length: number) => Buffer.from(rom.subarray(at, at + length)).toString('hex')

describe.skipIf(!existsSync(path('nhl94.bin')))('the Genesis hacks from bugs 13, 20 and 21', () => {
  const rom = () => new Uint8Array(readFileSync(path('nhl94.bin')))

  it('changes only the bytes given, and reads each back', () => {
    for (const [choice, changes] of [
      [{ snipingFix: true }, { 0xc422: '4e714e71' }],
      [{ awarenessFix: true }, { 0xd0e1: '6a', 0xd2d9: '6a' }],
      [{ crowdFix: true }, { 0xfef66: '4e714e71' }],
    ] as const) {
      const before = rom()
      const after = hackRom(before, { ...NO_HACKS, ...choice })
      const changed = [...after.keys()].filter((i) => after[i] !== before[i])
      const expected = Object.entries(changes).flatMap(([at, bytes]) => [...Array(bytes.length / 2).keys()].map((i) => Number(at) + i))
      expect(changed.filter((i) => after[i] !== before[i])).toEqual(expected.filter((i) => before[i] !== after[i]))
      for (const [at, bytes] of Object.entries(changes)) expect(hex(after, Number(at), bytes.length / 2)).toBe(bytes)
      expect(detectHacks(after)).toEqual({ choices: { ...NO_HACKS, ...choice }, unknown: [] })
    }
    // The original bytes, as Match Viewer gives them.
    const original = rom()
    expect(hex(original, 0xc422, 4)).toBe('6b000084')
    expect(hex(original, 0xd0de, 6)).toBe('176b006b0040')
    expect(hex(original, 0xd2d6, 6)).toBe('176b006b0040')
    expect(hex(original, 0xfef66, 4)).toBe('6000000c')
  })
})

describe.skipIf(!existsSync(path('nhl94.bin')))('counting stick deflections as shots', () => {
  it("calls Match Viewer's code, byte for byte, from the deflection", () => {
    const before = new Uint8Array(readFileSync(path('nhl94.bin')))
    expect(hex(before, 0x151d6, 8)).toBe('6100af6660000528')
    const after = hackRom(before, { ...NO_HACKS, stickShots: true })
    expect(hex(after, 0x151d6, 2)).toBe('4eb9')
    expect(hex(after, 0x151dc, 2)).toBe('4e71')
    const at = (after[0x151d8] << 24) | (after[0x151d9] << 16) | (after[0x151da] << 8) | after[0x151db]
    expect(hex(after, at, 62)).toBe(
      '4a6a0034662a08380000c2ea662208380004c2ea661a08b80004c2ee6712487a001048e7c0703038bed84ef900012fd04eb90001013e588f4ef900015704',
    )
    expect(detectHacks(after)).toEqual({ choices: { ...NO_HACKS, stickShots: true }, unknown: [] })
    expect(Buffer.compare(hackRom(after, NO_HACKS), before)).toBe(0)
  })
})

const snes: [string, number, number[]][] = [
  ['NHL94.smc', 0xfcffb, [0xf04a0, 0xf0ace]],
  ['nhl94_2026.sfc', 0xfd10b, [0xf04a0, 0xf0ace]],
  ['nhl94snes_2026.sfc', 0xfd039, [0xf04a0, 0xf0ace]],
]

describe('the SNES comeback bonus fix and awareness option', () => {
  for (const [name, comeback, awareness] of snes) {
    it.skipIf(!existsSync(path(name)))(`are at the places Match Viewer gives, in ${name === 'NHL94.smc' ? 'the original' : 'a 2026'} ROM`, () => {
      const project = openRom(new Uint8Array(readFileSync(path(name))))
      expect(detectSnesHacks(project.bytes).choices).toMatchObject({ comebackFix: false, awarenessFix: false })
      const hacked = applySnesHacks(project, { comebackFix: true, awarenessFix: true }).bytes
      const changed = [...hacked.keys()].filter((i) => hacked[i] !== project.bytes[i])
      expect(changed).toEqual([...awareness, comeback].sort((a, b) => a - b))
      expect(hacked[comeback]).toBe(0x30)
      for (const at of awareness) expect(hacked[at]).toBe(0x23)
      expect(detectSnesHacks(hacked).choices).toMatchObject({ comebackFix: true, awarenessFix: true })
      const back = applySnesHacks({ ...project, bytes: hacked }, { comebackFix: false, awarenessFix: false })
      expect(Buffer.compare(back.bytes, project.bytes)).toBe(0)
    })
  }
})

// Match Viewer's places: the shift of the touches (a2touchpuck), puckstick's
// .t1x and its jump to .3, and ChkShotStat.
const snesStats: [string, number, number, number, number][] = [
  ['NHL94.smc', 0xf4549, 0xf7714, 0xf768b, 0xf213],
  ['nhl94_2026.sfc', 0xf45b1, 0xf7797, 0xf770e, 0xf296],
  ['nhl94snes_2026.sfc', 0xf4591, 0xf7766, 0xf76dd, 0xf265],
]

describe('the SNES second-assist fix and stick deflections option', () => {
  for (const [name, shift, t1x, dot3, chkShotStat] of snesStats) {
    it.skipIf(!existsSync(path(name)))(`are at the places Match Viewer gives, in ${name === 'NHL94.smc' ? 'the original' : 'a 2026'} ROM`, () => {
      const project = openRom(new Uint8Array(readFileSync(path(name))))
      const rom = project.bytes
      expect(detectSnesHacks(rom).choices).toMatchObject({ secondAssist: false, stickShots: false })
      const hacked = applySnesHacks(project, { secondAssist: true, stickShots: true }).bytes
      const call = (at: number) => 0xf0000 + hacked[at + 1] + (hacked[at + 2] << 8) - 0x8000
      const low = name === 'nhl94_2026.sfc' ? 0x77 : 0x17
      // The shift becomes a call to it with the test, and the rest of the 12 bytes do nothing.
      expect(hacked[shift]).toBe(0x20)
      expect([...hacked.slice(shift + 3, shift + 12)]).toEqual(Array(9).fill(0xea))
      const assist = call(shift)
      expect([...hacked.slice(assist, assist + 7)]).toEqual([0xa5, 0xa5, 0xd9, 0x9e, low, 0xf0, 0x06])
      expect([...hacked.slice(assist + 7, assist + 19)]).toEqual([...rom.slice(shift, shift + 12)])
      expect(hacked[assist + 19]).toBe(0x60)
      // .t1x's jump goes to code that counts a goalie's shot, then on to .3.
      const jump = t1x + 8
      expect(rom[jump]).toBe(0x4c)
      expect(call(jump)).not.toBe(dot3)
      const stick = call(jump)
      expect([...hacked.slice(stick, stick + 13)]).toEqual([
        0xb9, rom[t1x - 14], rom[t1x - 13], 0xd0, 0x04, 0x22, chkShotStat & 0xff, chkShotStat >> 8, 0x9e, 0x4c, rom[jump + 1], rom[jump + 2], hacked[stick + 12],
      ])
      expect(0xf0000 + rom[jump + 1] + (rom[jump + 2] << 8) - 0x8000).toBe(dot3)
      expect(detectSnesHacks(hacked).choices).toMatchObject({ secondAssist: true, stickShots: true })
      const back = applySnesHacks({ ...project, bytes: hacked }, { secondAssist: false, stickShots: false })
      expect(Buffer.compare(back.bytes, rom)).toBe(0)
    })
  }
})
