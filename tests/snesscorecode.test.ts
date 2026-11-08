import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildRom, openRom } from '../src/core/rom'
import { detectSnesHacks } from '../src/core/sneshacks'
import { canAddScoreLogos, hasAddedScoreLogos, withScoreLogosAdded, withScoreLogosTakenOut } from '../src/core/snesscorecode'
import { snesScoreLogo, snesScoreLogosSupported, withoutSnesScoreLogo } from '../src/core/snesscorelogos'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const callAt = (rom: Uint8Array, offset: number) => rom[offset + 1] | (rom[offset + 2] << 8) | (rom[offset + 3] << 16)

for (const name of ['NHL94.smc', 'SDL16.smc', 'NHL94_Classic.smc']) {
  describe.skipIf(!existsSync(path(name)))(`score logos added to ${name}`, () => {
    it('puts the code in, every team with a logo, and takes it all out again to the ROM as it was', () => {
      const project = open(name)
      expect(canAddScoreLogos(project)).toBe(true)
      expect(snesScoreLogosSupported(project)).toBe(false)
      const added = withScoreLogosAdded(project)
      expect(added.bytes.length).toBe(project.bytes.length)
      expect(snesScoreLogosSupported(added) && hasAddedScoreLogos(added) && !canAddScoreLogos(added)).toBe(true)
      for (let team = 0; team < added.teams.length; team++) {
        const logo = snesScoreLogo(added, team)!
        expect(logo.palette[4]).toBe(0) // the box's black: palette 4's colour 4 is the line change box's
        expect(logo.picture.pixels.some((p) => p >= 6)).toBe(true)
      }
      // The four places call the code: the rink's two at $9F:B8B0 / $9F:E9C1, the score box's at $9F:9C56 / $9F:9C7A.
      const rom = added.bytes
      const tiles = callAt(rom, 0xfb8b0)
      expect(callAt(rom, 0xfe9c1)).toBe(tiles)
      expect(callAt(rom, 0xf9c56)).toBe(callAt(rom, 0xf9c7a))
      expect(rom[0xf9c56]).toBe(0x22)
      // The hacks are found as before.
      expect(detectSnesHacks(rom).unknown).toEqual(detectSnesHacks(project.bytes).unknown)
      // Downloaded, opened again, and taken out: the original ROM.
      const reopened = openRom(buildRom(added))
      expect(hasAddedScoreLogos(reopened)).toBe(true)
      const out = withScoreLogosTakenOut(withoutSnesScoreLogo(added, 3))
      expect(Buffer.compare(out.bytes, project.bytes)).toBe(0)
    })
  })
}

describe.skipIf(!existsSync(path('nhl94_2026.sfc')))('a 32-team build', () => {
  it('has score logos of its own, so none are added and none can be taken out', () => {
    const project = open('nhl94_2026.sfc')
    expect(canAddScoreLogos(project)).toBe(false)
    expect(hasAddedScoreLogos(project)).toBe(false)
  })
})
