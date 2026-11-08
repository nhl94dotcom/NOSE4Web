import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { colorRgb, SNES_COLORS } from '../src/core/color'
import { pictureToImage } from '../src/core/graphics'
import { buildRom, openRom } from '../src/core/rom'
import { blankScoreLogo, scoreLogoFromImage, snesScoreLogo, snesScoreLogosSupported, withoutSnesScoreLogo, withSnesScoreLogo } from '../src/core/snesscorelogos'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
// How a logo looks: each pixel's colour, or -1 where see-through.
const look = (logo: { picture: { pixels: Uint8Array }; palette: number[] }) =>
  Array.from(logo.picture.pixels, (p) => (p ? colorRgb(logo.palette[p], SNES_COLORS).join() : '-'))

describe.skipIf(!existsSync(path('NHL94.smc')))('the original SNES game', () => {
  it('has no score logos', () => {
    expect(snesScoreLogosSupported(openRom(new Uint8Array(readFileSync(path('NHL94.smc')))))).toBe(false)
  })
})

for (const name of ['nhl94_2026.sfc', 'nhl94snes_2026.sfc']) {
  describe.skipIf(!existsSync(path(name)))(`score logos in ${name}`, () => {
    const open = () => openRom(new Uint8Array(readFileSync(path(name))))

    it("reads every team's, and an exported one imported again looks the same", () => {
      const project = open()
      expect(snesScoreLogosSupported(project)).toBe(true)
      const logos = project.teams.map((_, team) => snesScoreLogo(project, team)!)
      expect(logos.every((logo) => logo !== null && logo.picture.pixels.some((p) => p >= 6))).toBe(true)
      const boston = logos[1]
      const rgba = pictureToImage(boston.picture, boston.palette, SNES_COLORS)
      const made = scoreLogoFromImage(rgba, 24, 16, boston.palette)
      expect(look(made)).toEqual(look(boston))
      // Given to Buffalo, which then looks like Boston; Boston and the rest are untouched.
      const done = openRom(buildRom(withSnesScoreLogo(project, 2, made.picture, made.palette)))
      expect(done.bytes.length).toBe(project.bytes.length)
      expect(look(snesScoreLogo(done, 2)!)).toEqual(look(boston))
      for (const team of [0, 1, 3, 31]) expect(look(snesScoreLogo(done, team)!)).toEqual(look(logos[team]))
    })

    it('shows a team by its letters, and gives it a new score logo in free space', () => {
      const project = open()
      const letters = withoutSnesScoreLogo(project, 5)
      expect(snesScoreLogo(letters, 5)).toBeNull()
      const blank = blankScoreLogo()
      const given = withSnesScoreLogo(letters, 5, blank.picture, blank.palette)
      expect(look(snesScoreLogo(given, 5)!)).toEqual(look(blank))
      expect(look(snesScoreLogo(openRom(buildRom(given)), 4)!)).toEqual(look(snesScoreLogo(project, 4)!))
    })

    it('refuses an image of the wrong size, and takes one 13 high', () => {
      const palette = snesScoreLogo(open(), 0)!.palette
      expect(() => scoreLogoFromImage(new Uint8Array(56 * 56 * 4), 56, 56, palette)).toThrow('24 pixels wide and 16 high')
      const short = scoreLogoFromImage(new Uint8Array(24 * 13 * 4).fill(255), 24, 13, palette)
      expect(short.picture.pixels.slice(0, 24 * 13).every((p) => p !== 0)).toBe(true)
      expect(short.picture.pixels.slice(24 * 13).every((p) => p === 0)).toBe(true)
    })
  })
}
