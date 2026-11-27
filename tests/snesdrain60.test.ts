import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildRom, openRom } from '../src/core/rom'
import { applySnesHacks, detectSnesHacks, SNES_HITS_ONLY } from '../src/core/sneshacks'

// A later SA-1 Classic + 60 fps + Fighting build (a league member's, 2026-11-26) drains energy with lda frames / and #$7F /
// cmp dp / bcs, where the earlier builds have and #$3F / bne: the energy options read it as the drain they hook.

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const LATER = 'SA1_60fps_league.smc'
const EARLIER = 'nhl94snes_SA1.sfc'
const ENERGY = ['hitEnergy', 'holdEnergy', 'injuryBonus', 'noSkatingDrain'] as const

describe.skipIf(!existsSync(path(LATER)) || !existsSync(path(EARLIER)))('the energy options on a later 60 fps build', () => {
  it('reads its drain, puts Energy from hits only in and takes it out byte for byte, as on the earlier build', () => {
    for (const name of [LATER, EARLIER]) {
      const rom = openRom(new Uint8Array(readFileSync(path(name))))
      const state = detectSnesHacks(rom.bytes)
      for (const hack of ENERGY) expect(state.unknown, `${name} ${hack}`).not.toContain(hack)
      const wanted = { ...state.choices, hitEnergy: true, holdEnergy: true, noSkatingDrain: true, freeBurst: true, energySpeed: true }
      const on = applySnesHacks(rom, wanted, false, { ...state.amounts!, ...SNES_HITS_ONLY })
      const back = detectSnesHacks(openRom(buildRom(on)).bytes)
      expect(back.unknown, name).toEqual(state.unknown)
      for (const hack of ['hitEnergy', 'holdEnergy', 'noSkatingDrain', 'freeBurst', 'energySpeed'] as const) expect(back.choices[hack], `${name} ${hack}`).toBe(true)
      expect([back.amounts!.hitEnergy, back.amounts!.holdEnergy]).toEqual([SNES_HITS_ONLY.hitEnergy, SNES_HITS_ONLY.holdEnergy])
      // Off again: the ROM as it was.
      const off = applySnesHacks(on, state.choices, false, state.amounts!)
      expect(Buffer.compare(Buffer.from(off.bytes), Buffer.from(rom.bytes)), name).toBe(0)
    }
  })
})
