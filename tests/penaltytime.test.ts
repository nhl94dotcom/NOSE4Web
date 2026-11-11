import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyHacks, detectHacks, NO_HACKS } from '../src/core/hacks'
import { penaltyLengths } from '../src/core/penaltytime'
import { buildRom, openRom } from '../src/core/rom'
import { applySnesHacks, detectSnesHacks } from '../src/core/sneshacks'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (bytes: Uint8Array, at: number, count: number) => Buffer.from(bytes.subarray(at, at + count)).toString('hex')

describe('penalty time', () => {
  it('says how long a minor and a major last', () => {
    expect(penaltyLengths(60)).toBe('a 2-minute minor lasts 2:00 and a 5-minute major 5:00')
    expect(penaltyLengths(45)).toBe('a 2-minute minor lasts 1:30 and a 5-minute major 3:45')
  })

  it.skipIf(!existsSync(path('nhl94.bin')))("Genesis: changes the 60 in .Sa's mulu.w #$3C,d2, and puts it back", () => {
    const project = open('nhl94.bin')
    expect(hex(project.bytes, 0x1230c, 10)).toBe('4882c4fc003c08c2000d')
    expect(detectHacks(project.bytes).choices.penaltySeconds).toBe(60)
    const half = applyHacks(project, { ...NO_HACKS, penaltySeconds: 30 })
    expect(hex(half.bytes, 0x12310, 2)).toBe('001e')
    expect(detectHacks(half.bytes)).toEqual({ choices: { ...NO_HACKS, penaltySeconds: 30 }, unknown: [] })
    expect(Buffer.compare(buildRom(applyHacks(half, NO_HACKS)), buildRom(project))).toBe(0)
  })

  const snes = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
  it.skipIf(snes.length === 0)('SNES: changes the 60 in InProgress\'s ldx #$003C, in every build, and puts it back', () => {
    for (const name of snes) {
      const project = open(name)
      const state = detectSnesHacks(project.bytes)
      expect(state.unknown, name).not.toContain('penaltyTime')
      expect(state.choices.penaltyTime, name).toBe(false)
      expect(state.amounts?.penaltyTime, name).toBe(60)
      const half = applySnesHacks(project, {}, false, { penaltyTime: 30 })
      const after = detectSnesHacks(half.bytes)
      expect(after.choices.penaltyTime, name).toBe(true)
      expect(after.amounts?.penaltyTime, name).toBe(30)
      // Only those two bytes change, besides the checksum.
      const differ = [...half.bytes].flatMap((b, i) => (b !== project.bytes[i] ? [i] : []))
      expect(differ.length, name).toBe(1)
      const back = applySnesHacks(openRom(buildRom(half)), {}, false, { penaltyTime: 60 })
      expect(Buffer.compare(buildRom(back), buildRom(project)), name).toBe(0)
    }
  })
})
