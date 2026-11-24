import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { colourPhotoFromImage } from '../src/core/photos'
import { buildRom, openRom } from '../src/core/rom'
import { snesPhotoRgbs, snesPhotosSupported, snesTeamPhotos, withSnesPhoto, withSnesPhotosSwapped } from '../src/core/snesphotos'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const same = (a: { pixels: Uint8Array }, b: { pixels: Uint8Array }) => Buffer.compare(Buffer.from(a.pixels), Buffer.from(b.pixels)) === 0
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}

// Every SNES ROM on this computer: the original game and the 1 MB builds (Huffman), the 2 MB builds, LoROM and
// SA-1 (LZ).
for (const name of ['NHL94.smc', ...(local.snesRoms ?? [])]) {
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
      const own = before.findIndex((photo) => !photo.generic)
      const generic = before.findIndex((photo) => photo.generic)
      expect([own, generic].every((slot) => slot >= 0)).toBe(true)
      for (const slot of [own, generic]) {
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

    it('tells the stand-in pictures, which many places share', () => {
      const project = open()
      const generic = snesTeamPhotos(project, 1).filter((photo) => photo.generic)
      expect(generic.length).toBeGreaterThan(0)
      expect(generic.every((photo) => photo.shared >= 8)).toBe(true)
    })

    it("names the other places that show a player's own photo too", ({ skip }) => {
      const project = open()
      // A team with an own photo another place shows too (an All Stars team's). The original game has them; a build
      // without the All Stars teams may have none.
      const team = project.teams.findIndex((_, t) => snesTeamPhotos(project, t).some((photo) => !photo.generic && photo.shared > 0))
      if (name === 'NHL94.smc') expect(team).toBe(1)
      if (team < 0) return skip()
      const photos = snesTeamPhotos(project, team)
      const shared = photos.filter((photo) => !photo.generic && photo.shared > 0)
      expect(shared.length).toBeGreaterThan(0)
      for (const photo of shared) {
        expect(photo.sharedWith.length).toBe(photo.shared)
        expect(photo.sharedWith.every((other) => other.team !== team || other.slot !== photos.indexOf(photo))).toBe(true)
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
