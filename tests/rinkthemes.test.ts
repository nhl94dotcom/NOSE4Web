import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { drawGenesisRink } from '../src/core/genesisrink'
import { openRom } from '../src/core/rom'
import { RINK_THEMES, rinkThemesSupported, withRinkTheme } from '../src/core/rinkthemes'

// Ready-made rink looks (rinkthemes.ts), NHL 94.

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))

for (const name of ['nhl94.bin']) {
  describe.skipIf(!existsSync(path(name)))(`rink themes on ${name}`, () => {
    for (const { theme } of RINK_THEMES) {
      it(`puts in ${theme}: the stands change, the ice in the middle does not, on both rinks`, () => {
        const project = openRom(new Uint8Array(readFileSync(path(name))))
        const [home, away] = [project.teams[0].palette.slice(0, 16), project.teams[1].palette.slice(16, 32)]
        const before = drawGenesisRink(project.bytes, home, away, 'play')!
        const palette = [...project.rinkPalette.slice(0, 32), ...before.palette.slice(32)]
        const after = withRinkTheme(project, theme, palette)
        for (const view of ['play', 'reverse'] as const) {
          const [was, now] = [drawGenesisRink(project.bytes, home, away, view)!.picture, drawGenesisRink(after.bytes, home, away, view)!.picture]
          let middle = 0
          let corner = 0
          for (let y = 0; y < 680; y++) {
            for (let x = 0; x < 384; x++) {
              const i = y * 384 + x
              if (was.pixels[i] === now.pixels[i]) continue
              if (x >= 96 && x < 288 && y >= 160 && y < 520) middle++
              if (x < 24 && y < 24) corner++
            }
          }
          expect(middle).toBe(0)
          expect(corner).toBeGreaterThan(100)
          // The ice before each net (rows 14 and 77, columns 23-24: plain ice, Match Viewer) is as it was.
          let nets = 0
          for (const row of [14, 77]) for (let y = row * 8; y < row * 8 + 8; y++) for (let x = 23 * 8; x < 25 * 8; x++) if (was.pixels[y * 384 + x] !== now.pixels[y * 384 + x]) nets++
          expect(nets).toBe(0)
        }
      })
    }
  })
}

it.skipIf(!existsSync(path('NHL95/NHL_95.bin')))("is not offered on NHL '95, whose stands are thin strips", () => {
  expect(rinkThemesSupported(openRom(new Uint8Array(readFileSync(path('NHL95/NHL_95.bin')))))).toBe(false)
  expect(rinkThemesSupported(openRom(new Uint8Array(readFileSync(path('nhl94.bin')))))).toBe(true)
})
