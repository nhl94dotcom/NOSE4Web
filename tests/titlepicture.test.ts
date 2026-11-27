import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { pictureToImage } from '../src/core/graphics'
import { buildRom, openRom } from '../src/core/rom'
import { readTitlePicture, titlePictureBytes, titlePictureFromImage, titlePicturePalette, withOriginalTitlePicture, withTitlePicture, withTitlePictureBytes } from '../src/core/titlepicture'

// The Genesis title screen's picture (titlepicture.ts), NHL 94 and NHL '95.

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const readU32 = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0

for (const [name, pointers, original] of [
  ['nhl94.bin', [0xff10c, 0xff13e], 0x4e45c],
  ['NHL95/NHL_95.bin', [0xa1374, 0xa13a6], 0x18daa8],
] as const) {
  describe.skipIf(!existsSync(path(name)))(`the title screen picture on ${name}`, () => {
    it('reads the original, puts its own export back looking the same, and puts the original back byte for byte', () => {
      const project = openRom(new Uint8Array(readFileSync(path(name))))
      const title = readTitlePicture(project)!
      expect(title.original).toBe(true)
      expect([title.picture.width, title.picture.height]).toEqual([256, 224])
      const rgba = pictureToImage(title.picture, title.palette)
      const made = titlePictureFromImage(project, rgba, 256, 224, titlePicturePalette(project)!)
      expect(made.tiles.length).toBeLessThanOrEqual(896)
      const on = withTitlePicture(project, made)
      // Both pointers to the new picture, in free room.
      const at = readU32(on.bytes, pointers[0] + 2)
      expect(readU32(on.bytes, pointers[1] + 2)).toBe(at)
      expect(at).not.toBe(original)
      const again = readTitlePicture(openRom(buildRom(on)))!
      expect(again.original).toBe(false)
      // Every pixel the same colour as the original's.
      const after = pictureToImage(again.picture, again.palette)
      let differ = 0
      for (let i = 0; i < 256 * 224; i++) if (after[i * 4] !== rgba[i * 4] || after[i * 4 + 1] !== rgba[i * 4 + 1] || after[i * 4 + 2] !== rgba[i * 4 + 2]) differ++
      expect(differ).toBe(0)
      // Row 3 and row 1's fixed colours stay the ROM's.
      const fixed = titlePicturePalette(project)!
      expect(again.palette.slice(48, 64)).toEqual(fixed.slice(48, 64))
      expect(again.palette[17]).toBe(fixed[17])
      expect(again.palette[29]).toBe(fixed[29])
      // Its bytes for a project file go back in the same.
      const bytes = titlePictureBytes(on)!
      expect(titlePictureBytes(withTitlePictureBytes(project, bytes))).toEqual(bytes)
      const back = withOriginalTitlePicture(on)
      expect(Buffer.compare(Buffer.from(back.bytes.subarray(0, project.bytes.length)), Buffer.from(project.bytes))).toBe(0)
      expect(readTitlePicture(back)!.original).toBe(true)
    })

    it('fits a photo-like picture of any size, in at most 896 squares and the colours there are', () => {
      const project = openRom(new Uint8Array(readFileSync(path(name))))
      const [w, h] = [640, 360]
      const rgba = new Uint8ClampedArray(w * h * 4)
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rgba.set([(x * 255) / w, (y * 255) / h, ((x ^ y) & 255), 255], (y * w + x) * 4)
      const made = titlePictureFromImage(project, rgba, w, h, titlePicturePalette(project)!)
      expect(made.tiles.length).toBeLessThanOrEqual(896)
      expect(made.palette[0]).toBe(0)
      const title = readTitlePicture(withTitlePicture(project, made))!
      expect(title.original).toBe(false)
    })
  })
}

it.skipIf(!existsSync(path('NHL94.smc')))('is not offered on the SNES', () => {
  expect(readTitlePicture(openRom(new Uint8Array(readFileSync(path('NHL94.smc')))))).toBeNull()
})
