import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CROWD_OWN, crowdColoursFromBanners, crowdColoursSupported, readCrowdColours, withCrowdColours } from '../src/core/crowdcolours'
import { buildRom, openRom } from '../src/core/rom'

// Each home team's crowd in its colours (crowdcolours.ts): NHL '95 and the SNES.

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const hexOf = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
const readU32 = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0

for (const name of ['NHL95/NHL_95.bin', 'NHL94.smc', 'nhl94_2026.sfc', 'nhl94snes_SA1.sfc']) {
  describe.skipIf(!existsSync(path(name)))(`crowd colours on ${name}`, () => {
    it('hooks the palette, sets two colours a team (and their shades), and comes out byte for byte', () => {
      const project = openRom(new Uint8Array(readFileSync(path(name))))
      expect(crowdColoursSupported(project)).toBe(true)
      expect(readCrowdColours(project)).toBeNull()
      const snes = name.endsWith('.smc') || name.endsWith('.sfc')
      const [red, blue] = snes ? [0x001f, 0x7c00] : [0x000e, 0x0e00]
      const colours = project.teams.map((_, t): [number, number] => (t === 0 ? [red, blue] : t === 1 ? [CROWD_OWN, blue] : [CROWD_OWN, CROWD_OWN]))
      const on = withCrowdColours(project, colours)
      expect(readCrowdColours(on)).toEqual(colours)
      expect(readCrowdColours(openRom(buildRom(on)))).toEqual(colours)
      if (!snes) {
        // setupIceRinkPal ($7D6F0) jumps to the code: the routine as it was, then for each colour cmpi.w #$FFFF,k(a0,d0.w);
        // beq.s +6; move.w k(a0,d0.w),(palfadenew + 2 * (16 + slot)).w, 14 bytes each (the first build put them 12
        // apart, each overwriting the last's destination: Match Viewer found it hung the game), then rts.
        expect(hexOf(on.bytes, 0x7d6f0, 2)).toBe('4ef9')
        const code = readU32(on.bytes, 0x7d6f2)
        expect(hexOf(on.bytes, code + 20, 10)).toBe('3038bf54e74841fa003c')
        const slots = [14, 9, 8, 6]
        slots.forEach((slot, k) =>
          expect(hexOf(on.bytes, code + 30 + k * 14, 14)).toBe(`0c70ffff000${k * 2}670631f0000${k * 2}${(0xb942 + (16 + slot) * 2).toString(16)}`),
        )
        expect(hexOf(on.bytes, code + 86, 2)).toBe('4e75')
      }
      const off = withCrowdColours(on, null)
      expect(Buffer.compare(Buffer.from(off.bytes.subarray(0, project.bytes.length)), Buffer.from(project.bytes))).toBe(0)
      expect(readCrowdColours(withCrowdColours(project, colours.map(() => [CROWD_OWN, CROWD_OWN])))).toBeNull()
    })

    it("takes each team's two colours from its banner", () => {
      const project = openRom(new Uint8Array(readFileSync(path(name))))
      const colours = crowdColoursFromBanners(project)
      expect(colours).toHaveLength(project.teams.length)
      expect(colours.every(([a, b]) => a !== CROWD_OWN && b !== CROWD_OWN)).toBe(true)
      expect(readCrowdColours(withCrowdColours(project, colours))).toEqual(colours)
    })
  })
}

it.skipIf(!existsSync(path('nhl94.bin')))('is not offered on NHL 94 (it has rink colours by team instead)', () => {
  expect(crowdColoursSupported(openRom(new Uint8Array(readFileSync(path('nhl94.bin')))))).toBe(false)
})
