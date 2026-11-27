import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { drawGenesisRink, importGenesisRink, readGenesisRink, type RinkView } from '../src/core/genesisrink'
import { pictureToImage } from '../src/core/graphics'
import { openRom } from '../src/core/rom'

// Putting an edited rink picture back into NHL '95's rink, whose reverse angle replay map shares its tiles
// (Match Viewer, 2026-11-27).

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const differing = (a: Uint8Array, b: Uint8Array) => a.reduce((n, v, i) => n + (v !== b[i] ? 1 : 0), 0)

describe.skipIf(!existsSync(path('NHL95/NHL_95.bin')))("putting an edited rink into NHL '95", () => {
  let opened: ReturnType<typeof openRom> | null = null
  const project = () => (opened ??= openRom(new Uint8Array(readFileSync(path('NHL95/NHL_95.bin')))))
  const teams = () => ({ home: project().teams[0].palette.slice(0, 16), away: project().teams[1].palette.slice(16, 32) })
  const drawn = (rom: Uint8Array, view: RinkView) => drawGenesisRink(rom, teams().home, teams().away, view)!

  it('finds the reverse angle replay map over the same tiles', () => {
    const [play, reverse] = [readGenesisRink(project().bytes, 'play')!, readGenesisRink(project().bytes, 'reverse')!]
    expect([play.width, play.height, play.tileCount]).toEqual([48, 85, 468])
    expect(reverse.mapAt).toBe(0x16060e)
    expect(reverse.tilesAt).toBe(play.tilesAt)
    expect(reverse.words.filter((w, i) => w !== play.words[i]).length).toBeGreaterThan(2000)
  })

  for (const view of ['play', 'reverse'] as const) {
    it(`gives both rinks back as they were for its own picture (${view}), and keeps the other's when one changes`, () => {
      const rom = project().bytes
      const d = drawn(rom, view)
      const image = { rgba: pictureToImage(d.picture, d.palette), width: d.picture.width, height: d.picture.height }
      const result = importGenesisRink(rom, view, image, d.palette)
      expect(result.used).toBeLessThanOrEqual(result.room)
      for (const v of ['play', 'reverse'] as const) expect(differing(drawn(result.rom, v).picture.pixels, drawn(rom, v).picture.pixels)).toBe(0)
      expect(readGenesisRink(result.rom, view)!.tileCount).toBe(468)

      // The rink has no room for new squares (all 444 in use), so an edit reuses its own: a piece of crowd copied, on
      // the grid, over the ice. It shows there, and the other rink is as it was.
      const edited = Uint8ClampedArray.from(image.rgba)
      for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) edited.set(image.rgba.subarray(((8 + y) * 384 + 8 + x) * 4, ((8 + y) * 384 + 9 + x) * 4), ((296 + y) * 384 + 96 + x) * 4)
      const changed = importGenesisRink(rom, view, { ...image, rgba: edited }, d.palette)
      expect(() => importGenesisRink(rom, view, { ...image, rgba: edited.map((v, i) => (i % 4 === 3 ? v : (v + i) & 255)) }, d.palette)).toThrow(/more different squares/)
      const otherView = view === 'play' ? 'reverse' : 'play'
      expect(differing(drawn(changed.rom, otherView).picture.pixels, drawn(rom, otherView).picture.pixels)).toBe(0)
      expect(differing(drawn(changed.rom, view).picture.pixels, drawn(rom, view).picture.pixels)).toBeGreaterThan(100)
    })
  }
})
