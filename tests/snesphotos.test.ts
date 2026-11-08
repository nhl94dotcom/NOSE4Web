import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { colourPhotoFromImage } from '../src/core/photos'
import { buildRom, openRom } from '../src/core/rom'
import { snesPhotoRgbs, snesPhotosSupported, snesTeamPhotos, withSnesPhoto, withSnesPhotosSwapped } from '../src/core/snesphotos'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const same = (a: { pixels: Uint8Array }, b: { pixels: Uint8Array }) => Buffer.compare(Buffer.from(a.pixels), Buffer.from(b.pixels)) === 0

// The original game (Huffman) and the 2026 builds (LZ).
for (const name of ['NHL94.smc', 'nhl94_2026.sfc', 'nhl94snes_2026.sfc']) {
  describe.skipIf(!existsSync(path(name)))(`SNES player photos in ${name}`, () => {
    const open = () => openRom(new Uint8Array(readFileSync(path(name))))

    it("replaces a player's own photo and a generic one, leaving the others as they were", () => {
      const project = open()
      expect(snesPhotosSupported(project)).toBe(true)
      const before = snesTeamPhotos(project, 0)
      // A gradient with a see-through corner, 64 by 64.
      const rgba = new Uint8ClampedArray(64 * 64 * 4)
      for (let i = 0; i < 64 * 64; i++) rgba.set([(i % 64) * 4, 128, 255 - (i % 64) * 4, i % 64 < 20 && i < 64 * 20 ? 0 : 255], i * 4)
      const picture = colourPhotoFromImage(rgba, 64, 64, snesPhotoRgbs(project, 0))
      expect(picture.pixels[0]).toBe(0)
      expect(picture.pixels[47 * 48 + 47]).not.toBe(0)
      for (const slot of [0, before.findIndex((photo) => photo.shared > 0)].filter((slot) => slot >= 0)) {
        const done = withSnesPhoto(project, 0, slot, picture)
        expect(done.bytes.length).toBe(project.bytes.length)
        const reopened = snesTeamPhotos(openRom(buildRom(done)), 0)
        expect(same(reopened[slot].picture, picture)).toBe(true)
        expect(reopened[slot].shared).toBe(0)
        reopened.forEach((photo, i) => {
          if (i !== slot) expect(same(photo.picture, before[i].picture)).toBe(true)
        })
        expect(same(snesTeamPhotos(done, 1)[1].picture, snesTeamPhotos(project, 1)[1].picture)).toBe(true)
      }
    })

    it('swaps two places’ photos', () => {
      const project = open()
      const before = snesTeamPhotos(project, 2)
      const after = snesTeamPhotos(withSnesPhotosSwapped(project, 2, 0, 4), 2)
      expect(same(after[0].picture, before[4].picture) && same(after[4].picture, before[0].picture)).toBe(true)
    })
  })
}
