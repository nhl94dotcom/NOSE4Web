import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyHacks, detectHacks, hacksSupported, NO_HACKS, type HackChoices } from '../src/core/hacks'
import { buildRom, openRom } from '../src/core/rom'
import { expectSameBytes } from './samebytes'

// The Genesis league ROMs named in local.json that are on this computer.
const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { league30Rom?: string; otherRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
export const genesisLeagueNames = [local.league30Rom, ...(local.otherRoms ?? [])].filter((name): name is string => !!name && existsSync(path(name)))

// A Genesis hack going into each league ROM and out again, leaving the ROM as its own hacks put in afresh make it.
// Only the EVO builds, whose code is their own, take no hacks; any other ROM that does not fails.
export function goesInAndOutOfLeagueRoms(title: string, wanted: Partial<HackChoices>): void {
  const keys = Object.keys(wanted) as (keyof HackChoices)[]
  describe.skipIf(genesisLeagueNames.length === 0)(`${title} in the league ROMs`, () => {
    // Numbered, so that no ROM's name appears in the test results.
    it.each(genesisLeagueNames.map((name, n) => [n + 1, name] as const))('ROM %i: goes in and comes out, leaving the ROM as its own hacks make it', (_, name) => {
      const rom = openRom(new Uint8Array(readFileSync(path(name))))
      expect(hacksSupported(rom.game)).toBe(!name.includes('EVO'))
      if (name.includes('EVO')) return
      const state = detectHacks(rom.bytes)
      for (const key of keys) {
        expect(state.unknown).not.toContain(key)
        expect(state.choices[key], key).toBe(NO_HACKS[key])
      }
      const on = openRom(buildRom(applyHacks(rom, { ...state.choices, ...wanted })))
      expect(detectHacks(on.bytes)).toEqual({ choices: { ...state.choices, ...wanted }, unknown: state.unknown })
      const off = applyHacks(on, state.choices)
      expect(detectHacks(off.bytes)).toEqual(state)
      expectSameBytes(buildRom(off), buildRom(applyHacks(rom, state.choices)))
    }, 60000)
  })
}
