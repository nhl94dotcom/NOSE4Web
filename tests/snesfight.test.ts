import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildRom, openRom } from '../src/core/rom'
import { snesCodeInPlace } from '../src/core/snes'
import { snesFightState } from '../src/core/snesfight'
import { applySnesHacks, detectSnesHacks, SNES_HACKS } from '../src/core/sneshacks'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i])

describe.skipIf(!existsSync(path('NHL94.smc')))("McMarkis's SNES fighting", () => {
  it('goes into the original game in bank $A0, its bonus can change, and it comes out leaving the game as it was', () => {
    const project = open('NHL94.smc')
    expect(detectSnesHacks(project.bytes).choices.fighting).toBe(false)
    expect(detectSnesHacks(project.bytes).amounts?.fighting).toBe(-1)
    const on = applySnesHacks(project, { fighting: true })
    expect(on.bytes.length).toBe(0x200000)
    expect(on.bytes[0x7fd7]).toBe(0x0b)
    expect(snesFightState(on.bytes)).toEqual({ kind: 'in', bank: 0xa0, bonus: 2 })
    const again = openRom(buildRom(on))
    expect(detectSnesHacks(again.bytes).choices.fighting).toBe(true)
    expect(detectSnesHacks(again.bytes).amounts?.fighting).toBe(2)
    // The bonus: only its two words change.
    const fiercer = applySnesHacks(again, {}, false, { fighting: 6 })
    expect(snesFightState(fiercer.bytes)).toEqual({ kind: 'in', bank: 0xa0, bonus: 6 })
    expect([...fiercer.bytes].filter((b, i) => b !== again.bytes[i]).length).toBe(2)
    // A bonus of 0 is still in.
    expect(snesFightState(applySnesHacks(again, {}, false, { fighting: 0 }).bytes)).toEqual({ kind: 'in', bank: 0xa0, bonus: 0 })
    // Out: the original game, 1 MB.
    const out = applySnesHacks(fiercer, { fighting: false })
    expect(out.bytes.length).toBe(0x100000)
    expect(same(buildRom(out), buildRom(project))).toBe(true)
  })

  it('goes with every other SNES hack, theirs in bank $9B free space and its in the second megabyte', () => {
    const project = open('NHL94.smc')
    const all = Object.fromEntries(SNES_HACKS.filter((hack) => hack !== 'showMaxBoost').map((hack) => [hack, true]))
    const on = applySnesHacks(project, all)
    expect(detectSnesHacks(on.bytes).choices).toMatchObject(all)
    expect(detectSnesHacks(on.bytes).unknown).toEqual([])
    const off = applySnesHacks(on, Object.fromEntries(SNES_HACKS.map((hack) => [hack, false])))
    expect(same(buildRom(off), buildRom(project))).toBe(true)
  })

  it("shares FallDown's count with the injury risk: chained in either order, and either comes out leaving the other", () => {
    const project = open('NHL94.smc')
    // The shared place, $9E:9BD2: ldy a2 / lda #$78 in the original game.
    const SHARED = 0xf1bd2
    const injury = applySnesHacks(project, { injuryBonus: true })
    const both = applySnesHacks(injury, { fighting: true })
    const bothOther = applySnesHacks(applySnesHacks(project, { fighting: true }), { injuryBonus: true })
    for (const rom of [both, bothOther]) {
      const state = detectSnesHacks(rom.bytes)
      expect(state.choices).toMatchObject({ fighting: true, injuryBonus: true })
      expect(state.unknown).toEqual([])
      expect(state.amounts?.injuryBonus).toBe(6)
      // The fights' jml goes to the stub: ldy a2 / jsr the injury count / jml F_countcheck in bank $A0.
      expect(rom.bytes[SHARED]).toBe(0x5c)
      const stub = ((rom.bytes[SHARED + 3] & 0x7f) << 15) | ((rom.bytes[SHARED + 1] | (rom.bytes[SHARED + 2] << 8)) & 0x7fff)
      expect(rom.bytes[stub]).toBe(0xa4)
      expect(rom.bytes[stub + 2]).toBe(0x20)
      expect(rom.bytes[stub + 5]).toBe(0x5c)
      expect(rom.bytes[stub + 8]).toBe(0xa0)
    }
    // Each comes out, leaving the other as it is alone.
    const noFight = applySnesHacks(both, { fighting: false })
    expect(detectSnesHacks(noFight.bytes).choices).toMatchObject({ fighting: false, injuryBonus: true })
    expect(Buffer.compare(buildRom(noFight), buildRom(injury))).toBe(0)
    const noInjury = applySnesHacks(both, { injuryBonus: false })
    expect(detectSnesHacks(noInjury.bytes).choices).toMatchObject({ fighting: true, injuryBonus: false })
    expect(Buffer.compare(buildRom(noInjury), buildRom(applySnesHacks(project, { fighting: true })))).toBe(0)
    // Its bonus changed with both in.
    expect(detectSnesHacks(applySnesHacks(both, {}, false, { injuryBonus: 9 }).bytes).amounts?.injuryBonus).toBe(9)
    // And both out: the original game.
    expect(Buffer.compare(buildRom(applySnesHacks(both, { fighting: false, injuryBonus: false })), buildRom(project))).toBe(0)
  })

  const leagues = (local.snesRoms ?? []).filter((name) => existsSync(path(name)))
  leagues.forEach((name, n) => {
    it(`SNES ROM ${n + 1}: goes in where there is room, and comes out leaving it as it was, or says why not`, () => {
      const project = open(name)
      const state = detectSnesHacks(project.bytes)
      if (!snesCodeInPlace(project.bytes)) {
        expect(state.unknown).toContain('fighting')
        return
      }
      const on = applySnesHacks(project, { fighting: true })
      const fight = snesFightState(on.bytes)
      expect(fight?.kind).toBe('in')
      // What the ROM had past its first megabyte is still there.
      expect(same(on.bytes.subarray(0, project.bytes.length).filter((_, i) => i >= 0x100000 && project.bytes[i] !== 0xff), project.bytes.subarray(0x100000).filter((b) => b !== 0xff))).toBe(true)
      const out = applySnesHacks(openRom(buildRom(on)), { fighting: false })
      // As it was, but for the header's checksum, which NOSE4Web sets right where a league ROM has it stale.
      const header = (i: number) => i >= 0x7fdc && i < 0x7fe0
      expect(out.bytes.length).toBe(project.bytes.length)
      expect(out.bytes.every((b, i) => header(i) || b === project.bytes[i])).toBe(true)
    })
  })
})
