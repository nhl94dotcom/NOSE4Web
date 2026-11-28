import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SNES_COLORS } from '../src/core/color'
import { pictureToImage } from '../src/core/graphics'
import { buildRom, openRom } from '../src/core/rom'
import { drawSnesRink, importSnesRink, readSnesRinkPalette, SnesRinkImportError, snesRinkImportable } from '../src/core/snesrink'

// Putting an edited rink picture back into the SNES rink (snesrink.ts), on retail and the 32-team build.

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const differing = (a: Uint8Array, b: Uint8Array) => a.reduce((n, v, i) => n + (v !== b[i] ? 1 : 0), 0)

for (const name of ['NHL94.smc', 'nhl94_2026.sfc']) {
  describe.skipIf(!existsSync(path(name)))(`putting an edited rink into ${name}`, () => {
    it('gives the same rink back for its own picture, takes new squares into its room, and refuses too many', () => {
      const project = openRom(new Uint8Array(readFileSync(path(name))))
      const rom = project.bytes
      expect(snesRinkImportable(rom)).toBe(true)
      const palette = readSnesRinkPalette(rom)
      const rink = drawSnesRink(rom, null)!
      const shown = { width: 384, height: 680 }
      const rgba = pictureToImage({ ...rink, height: 680, pixels: rink.pixels.slice(0, 384 * 680) }, palette, SNES_COLORS)
      const same = importSnesRink(rom, { rgba, ...shown }, palette)
      expect(same.used).toBeLessThanOrEqual(same.room)
      expect(differing(drawSnesRink(same.rom, null)!.pixels, rink.pixels)).toBe(0)

      // A 32 x 16 checkerboard of two of the boards' colours on the ice: new squares, in the room there is.
      const edited = Uint8ClampedArray.from(rgba)
      const [a, b] = [rgba.slice(0, 4), Uint8ClampedArray.from([255, 255, 255, 255])]
      for (let y = 296; y < 312; y++) for (let x = 96; x < 128; x++) edited.set(((x >> 2) + (y >> 2)) % 2 ? a : b, (y * 384 + x) * 4)
      const changed = importSnesRink(rom, { rgba: edited, ...shown }, palette)
      expect(changed.used).toBeGreaterThan(0)
      expect(changed.used).toBeLessThanOrEqual(changed.room)
      const after = drawSnesRink(changed.rom, null)!
      expect(differing(after.pixels, rink.pixels)).toBeGreaterThan(100)
      // Only the block's cells changed.
      let outside = 0
      for (let y = 0; y < 904; y++) for (let x = 0; x < 384; x++) if ((y < 296 || y >= 312 || x < 96 || x >= 128) && after.pixels[y * 384 + x] !== rink.pixels[y * 384 + x]) outside++
      expect(outside).toBe(0)
      // A built ROM opened again draws the same.
      expect(differing(drawSnesRink(openRom(buildRom({ ...project, bytes: changed.rom })).bytes, null)!.pixels, after.pixels)).toBe(0)

      // All 904 rows: the pause scoreboard's rink (rows 85-112) may change too, the replay icon (rows 85-92, columns
      // 32-39) not.
      const whole = pictureToImage(rink, palette, SNES_COLORS)
      expect(differing(drawSnesRink(importSnesRink(rom, { rgba: whole, width: 384, height: 904 }, palette).rom, null)!.pixels, rink.pixels)).toBe(0)
      const board = Uint8ClampedArray.from(whole)
      for (let y = 704; y < 720; y++) for (let x = 40; x < 72; x++) board.set(((x >> 2) + (y >> 2)) % 2 ? a : b, (y * 384 + x) * 4)
      for (let y = 680; y < 744; y++) for (let x = 256; x < 320; x++) board.set(b, (y * 384 + x) * 4)
      const onBoard = drawSnesRink(importSnesRink(rom, { rgba: board, width: 384, height: 904 }, palette).rom, null)!
      let boardChanged = 0
      let iconChanged = 0
      for (let y = 680; y < 904; y++) {
        for (let x = 0; x < 384; x++) {
          if (onBoard.pixels[y * 384 + x] === rink.pixels[y * 384 + x]) continue
          if (y < 744 && x >= 256 && x < 320) iconChanged++
          else boardChanged++
        }
      }
      expect(boardChanged).toBeGreaterThan(100)
      expect(iconChanged).toBe(0)

      // Noise everywhere: far more squares than the room.
      const noise = Uint8ClampedArray.from(rgba).map((v, i) => (i % 4 === 3 ? 255 : (v * 7 + i * 13) & 255))
      expect(() => importSnesRink(rom, { rgba: noise, ...shown }, palette)).toThrow(SnesRinkImportError)
    })
  })
}
