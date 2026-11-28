import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SNES_COLORS } from '../src/core/color'
import { pictureToImage } from '../src/core/graphics'
import { buildRom, openRom } from '../src/core/rom'
import {
  readSnesSetupPicture,
  SNES_SETUP_SQUARES,
  snesSetupPictureBytes,
  snesSetupPictureFromImage,
  withOriginalSnesSetupPicture,
  withSnesSetupPicture,
  withSnesSetupPictureBytes,
} from '../src/core/snessetuppicture'

// The SNES Game Setup screen's background picture (snessetuppicture.ts), on retail and the 32-team SA-1 builds.

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
// The cells the logo boxes and team name blocks always cover, which a new picture leaves to MenuBack.
const covered = (x: number, y: number) => {
  const [col, row] = [x >> 3, y >> 3]
  return (row >= 1 && row <= 7 && ((col >= 1 && col <= 7) || (col >= 24 && col <= 30))) || (row === 11 && ((col >= 1 && col <= 9) || (col >= 22 && col <= 30)))
}

for (const name of ['NHL94.smc', 'nhl94_2026.sfc', 'nhl94snes_SA1.sfc']) {
  describe.skipIf(!existsSync(path(name)))(`the Game Setup background on ${name}`, () => {
    it('reads the original, puts its own export back looking the same, and puts the original back', () => {
      const project = openRom(new Uint8Array(readFileSync(path(name))))
      const shown = readSnesSetupPicture(project)!
      expect(shown.original).toBe(true)
      expect(shown.tiles).toBe(196)
      const rgba = pictureToImage(shown.picture, shown.palette, SNES_COLORS)
      const made = snesSetupPictureFromImage(project, rgba, 256, 224)
      // Every square not MenuBack's is the picture's, in at most its 195 tiles again.
      expect(made.tiles.length - 1).toBeLessThanOrEqual(195)
      const on = withSnesSetupPicture(project, made)
      expect(readSnesSetupPicture(on)!.original).toBe(false)
      // As a built ROM opened again, the same picture.
      const again = readSnesSetupPicture(openRom(buildRom(on)))!
      const after = pictureToImage(again.picture, again.palette, SNES_COLORS)
      let differ = 0
      for (let y = 0; y < 224; y++) {
        for (let x = 0; x < 256; x++) {
          const i = (y * 256 + x) * 4
          if (!covered(x, y) && (after[i] !== rgba[i] || after[i + 1] !== rgba[i + 1] || after[i + 2] !== rgba[i + 2])) differ++
        }
      }
      expect(differ).toBe(0)
      // Its bytes for a project file, and the original back.
      const bytes = snesSetupPictureBytes(on)!
      expect(snesSetupPictureBytes(withSnesSetupPictureBytes(project, bytes))).toEqual(bytes)
      // Imported ten times more: each copy gives its room back, so free space holds (from the second on; the first
      // copy's pieces land a little differently).
      const second = withSnesSetupPicture(on, made)
      let repeated = second
      for (let i = 0; i < 10; i++) repeated = withSnesSetupPicture(repeated, made)
      expect(repeated.bytes.length).toBe(on.bytes.length)
      expect(repeated.bytes.filter((b) => b === 0xff).length).toBe(second.bytes.filter((b) => b === 0xff).length)
      const back = readSnesSetupPicture(withOriginalSnesSetupPicture(on))!
      expect(back.original).toBe(true)
      expect(Buffer.compare(Buffer.from(back.picture.pixels), Buffer.from(shown.picture.pixels))).toBe(0)
    })

    it('fits a busy picture of any size: its most alike squares merged to the room there is', () => {
      const project = openRom(new Uint8Array(readFileSync(path(name))))
      const [w, h] = [512, 448]
      const rgba = new Uint8ClampedArray(w * h * 4)
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rgba.set([(x * 255) / w, (y * 255) / h, (x * y) & 255, 255], (y * w + x) * 4)
      const made = snesSetupPictureFromImage(project, rgba, w, h)
      expect(made.distinct).toBeGreaterThan(SNES_SETUP_SQUARES)
      expect(made.tiles.length - 1).toBeLessThanOrEqual(SNES_SETUP_SQUARES)
      const on = withSnesSetupPicture(project, made)
      expect(readSnesSetupPicture(on)!.original).toBe(false)
      expect(readSnesSetupPicture(openRom(buildRom(on)))!.tiles).toBe(made.tiles.length)
    })
  })
}

it.skipIf(!existsSync(path('nhl94.bin')))('is not offered on the Genesis', () => {
  expect(readSnesSetupPicture(openRom(new Uint8Array(readFileSync(path('nhl94.bin')))))).toBeNull()
})
