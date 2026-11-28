import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { openRom } from '../src/core/rom'
import { importScreenSet, screenImage, screenSet } from '../src/core/screenset'

// The whole screens in Picture files (screenset.ts): exported, put back unchanged, and one edited.

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))

for (const [name, files] of [
  ['nhl94.bin', ['screens/title_screen.png', 'screens/main_menu_background.png', 'screens/rink.png', 'screens/rink_reverse.png']],
  ['NHL95/NHL_95.bin', ['screens/title_screen.png', 'screens/rink.png', 'screens/rink_reverse.png']],
  ['NHL94.smc', ['screens/main_menu_background.png', 'screens/rink.png']],
] as const) {
  describe.skipIf(!existsSync(path(name)))(`the screens of ${name}`, () => {
    it('exports each screen the ROM has, skips them unchanged, and puts in one that changed', () => {
      const project = openRom(new Uint8Array(readFileSync(path(name))))
      const set = screenSet(project)
      expect(set.map((s) => s.name)).toEqual(files)
      const images = set.map((s) => ({ name: s.name, rgba: screenImage(s), width: s.picture.width, height: s.picture.height }))
      const same = importScreenSet(project, images)
      expect(same.problems).toEqual([])
      expect(same.replaced).toEqual([])
      expect(same.unchanged).toBe(files.length)
      expect(same.project).toBe(project)

      // The last screen with one square mirrored where it is: the first in its middle rows that is not the same both ways
      // round. Its tile serves, turned, so no rink needs a new square; only this screen is replaced.
      const last = images[images.length - 1]
      const rgba = Uint8ClampedArray.from(last.rgba)
      const px = (x: number, y: number) => last.rgba.slice((y * last.width + x) * 4, (y * last.width + x + 1) * 4)
      const sameBothWays = (cx: number, cy: number) => {
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (px(cx + x, cy + y).join() !== px(cx + 7 - x, cy + y).join()) return false
        return true
      }
      let cell = -1
      for (let c = 0; c < (last.width / 8) * 10 && cell < 0; c++) {
        const [cx, cy] = [(c % (last.width / 8)) * 8, 80 + Math.floor(c / (last.width / 8)) * 8]
        if (!sameBothWays(cx, cy)) cell = c
      }
      const [cx, cy] = [(cell % (last.width / 8)) * 8, 80 + Math.floor(cell / (last.width / 8)) * 8]
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) rgba.set(px(cx + 7 - x, cy + y), ((cy + y) * last.width + cx + x) * 4)
      const changed = importScreenSet(project, [...images.slice(0, -1), { ...last, rgba }])
      expect(changed.problems).toEqual([])
      expect(changed.replaced).toEqual([set[set.length - 1].title])
      expect(changed.unchanged).toBe(files.length - 1)
      expect(changed.project.bytes).not.toEqual(project.bytes)
    })
  })
}
