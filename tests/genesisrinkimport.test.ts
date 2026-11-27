import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { drawGenesisRink, genesisRinkGuide, importGenesisRink, readGenesisRink, RinkImportError, type RinkView } from '../src/core/genesisrink'
import { pictureToImage } from '../src/core/graphics'
import { openRom } from '../src/core/rom'

// Putting an edited rink picture back into NHL 94's rink (genesisrink.ts), as Match Viewer read the game (2026-11-27).

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const open = () => openRom(new Uint8Array(readFileSync(path('nhl94.bin'))))
const drawn = (rom: Uint8Array, view: RinkView, teams: { home: number[]; away: number[] }) => drawGenesisRink(rom, teams.home, teams.away, view)!
// Pixels that differ, counted (toEqual on 350,000 of them is far too slow when they differ).
const differing = (a: Uint8Array, b: Uint8Array) => a.reduce((n, v, i) => n + (v !== b[i] ? 1 : 0), 0)
const rgbaOf = (rom: Uint8Array, view: RinkView, teams: { home: number[]; away: number[] }) => {
  const d = drawn(rom, view, teams)
  return { rgba: pictureToImage(d.picture, d.palette), width: d.picture.width, height: d.picture.height, palette: d.palette, picture: d.picture }
}

describe.skipIf(!existsSync(path('nhl94.bin')))('putting an edited rink into NHL 94', () => {
  // Opened by the first test that needs it: the file is collected even where the ROM is missing.
  let opened: ReturnType<typeof open> | null = null
  const rom = () => (opened ??= open())
  const project = { get bytes() { return rom().bytes } }
  const teams = { get home() { return rom().teams[0].palette.slice(0, 16) }, get away() { return rom().teams[1].palette.slice(16, 32) } }

  it('draws a guide of the rows in play: the boards bright, the centre ice block red', () => {
    const image = rgbaOf(project.bytes, 'play', teams)
    const guide = genesisRinkGuide(project.bytes, 'play', image.palette)!
    expect([guide.width, guide.height]).toEqual([384, 680])
    expect(guide.boards).toBeGreaterThan(400)
    expect(guide.boards).toBeLessThan(900)
    // The centre ice block (the last 24 tiles' cells) is tinted red: its pixels' red beats green.
    const rink = readGenesisRink(project.bytes, 'play')!
    const cell = rink.words.findIndex((w) => (w & 0x7ff) >= rink.tileCount - 24)
    const at = ((Math.floor(cell / 48) * 8 + 4) * 384 + (cell % 48) * 8 + 4) * 4
    expect(guide.rgba[at]).toBeGreaterThan(guide.rgba[at + 1])
  })

  it('finds the reverse angle replay’s rink, with its own map and two tiles fewer', () => {
    const reverse = readGenesisRink(project.bytes, 'reverse')!
    expect([reverse.at, reverse.tileCount, reverse.width, reverse.height]).toEqual([0xb5180, 452, 48, 113])
  })

  for (const view of ['play', 'reverse'] as const) {
    it(`gives the same rink back for its own picture (${view})`, () => {
      const image = rgbaOf(project.bytes, view, teams)
      const result = importGenesisRink(project.bytes, view, image, image.palette)
      expect(result.used).toBeLessThanOrEqual(result.room)
      expect(differing(drawn(result.rom, view, teams).picture.pixels, image.picture.pixels)).toBe(0)
      // The tile count and everything outside the rink's tiles and map stay as they were.
      const rink = readGenesisRink(project.bytes, view)!
      expect(readGenesisRink(result.rom, view)!.tileCount).toBe(rink.tileCount)
      for (let i = 0; i < project.bytes.length; i++) {
        if (i >= rink.tilesAt && i < rink.tilesAt + rink.tileCount * 32) continue
        if (i >= rink.mapAt + 4 && i < rink.mapAt + 4 + rink.width * rink.height * 2) continue
        if (result.rom[i] !== project.bytes[i]) throw new Error(`byte ${i.toString(16)} changed`)
      }
    })
  }

  it('puts an edit in, keeping the centre ice logo’s cells, the replay icon, the three stars box and each cell’s priority', () => {
    const image = rgbaOf(project.bytes, 'play', teams)
    const rgba = Uint8ClampedArray.from(image.rgba)
    // A dark block of 32 by 16 pixels on the ice of the top zone, and a stripe across the hidden rows' three stars box.
    for (let y = 200; y < 216; y++) for (let x = 120; x < 152; x++) rgba.set([0, 0, 0, 255], (y * 384 + x) * 4)
    for (let y = 91 * 8; y < 92 * 8; y++) for (let x = 13 * 8; x < 19 * 8; x++) rgba.set([255, 0, 0, 255], (y * 384 + x) * 4)
    const result = importGenesisRink(project.bytes, 'play', { rgba, width: 384, height: 904 }, image.palette)
    const after = drawn(result.rom, 'play', teams)
    const black = image.palette.slice(0, 16).findIndex((word) => word === 0)
    for (let y = 200; y < 216; y++) for (let x = 120; x < 152; x++) expect(after.picture.pixels[y * 384 + x]).toBe(black)
    const before = readGenesisRink(project.bytes)!
    const now = readGenesisRink(result.rom)!
    before.words.forEach((word, cell) => {
      const [col, row] = [cell % 48, Math.floor(cell / 48)]
      const keptArea = (col >= 13 && col <= 18 && row >= 91 && row <= 94) || (col >= 32 && col <= 39 && row >= 85 && row <= 88)
      if ((word & 0x7ff) >= before.tileCount - 24 || keptArea) expect(now.words[cell], `cell ${col},${row}`).toBe(word)
      // Palette line and priority as they were.
      expect(now.words[cell] & 0xe000).toBe(word & 0xe000)
    })
  })

  it('takes a picture of only the rows shown in play, keeping the hidden ones', () => {
    const image = rgbaOf(project.bytes, 'play', teams)
    const top = { rgba: image.rgba.slice(0, 384 * 680 * 4), width: 384, height: 680 }
    const result = importGenesisRink(project.bytes, 'play', top, image.palette)
    const before = readGenesisRink(project.bytes)!
    const now = readGenesisRink(result.rom)!
    expect(now.words.slice(85 * 48)).toEqual(before.words.slice(85 * 48))
  })

  it('refuses a picture of the wrong size, and one with more different squares than there is room for', () => {
    const image = rgbaOf(project.bytes, 'play', teams)
    expect(() => importGenesisRink(project.bytes, 'play', { rgba: image.rgba, width: 384, height: 900 }, image.palette)).toThrow(RinkImportError)
    // Noise: every square different.
    const noise = Uint8ClampedArray.from(image.rgba)
    let seed = 7
    for (let i = 0; i < noise.length; i += 4) {
      seed = (seed * 1103515245 + 12345) >>> 0
      noise[i] = seed & 255
      noise[i + 1] = (seed >> 8) & 255
      noise[i + 2] = (seed >> 16) & 255
    }
    expect(() => importGenesisRink(project.bytes, 'play', { rgba: noise, width: 384, height: 904 }, image.palette)).toThrow(/different squares/)
    // Noise in one block only (x 96 to 223, y 96 to 255: 16 by 20 squares, less those the import keeps): the message says how many the rink
    // already uses, how many the picture adds, and where.
    const block = Uint8ClampedArray.from(image.rgba)
    for (let y = 96; y < 256; y++) {
      for (let x = 96; x < 224; x++) {
        const i = (y * 384 + x) * 4
        seed = (seed * 1103515245 + 12345) >>> 0
        block.set([seed & 255, (seed >> 8) & 255, (seed >> 16) & 255, 255], i)
      }
    }
    let message = ''
    try {
      importGenesisRink(project.bytes, 'play', { rgba: block, width: 384, height: 904 }, image.palette)
    } catch (e) {
      message = (e as Error).message
    }
    // Make it fit: the same picture goes in, every place showing a tile there is, and a square swapped only for one
    // the rink has.
    const fitted = importGenesisRink(project.bytes, 'play', { rgba: block, width: 384, height: 904 }, image.palette, true)
    expect(fitted.used).toBe(fitted.room)
    expect(fitted.swapped).toBeGreaterThan(200)
    expect(fitted.places).toBeGreaterThanOrEqual(fitted.swapped)
    const after = readGenesisRink(fitted.rom, 'play')!
    expect(after.words.every((word) => (word & 0x7ff) < after.tileCount)).toBe(true)
    // Outside the block (the picture there is the rink as it was), every pixel that differs is one it counts: the
    // squares swapped may be anywhere, the cheapest first.
    const redrawn = drawn(fitted.rom, 'play', teams).picture.pixels
    let outside = 0
    for (let y = 0; y < 680; y++) for (let x = 0; x < 384; x++) if ((y < 96 || y >= 256 || x < 96 || x >= 224) && redrawn[y * 384 + x] !== image.picture.pixels[y * 384 + x]) outside++
    expect(outside).toBeLessThanOrEqual(fitted.pixels)
    expect(message).toMatch(/^This picture needs \d+ more different squares of 8 by 8 pixels than the rink has room for \(\d+ of 399\)\. The rink as it is uses 379, so a picture can add only 20 new squares, and this one adds (\d+), at x 96 to 223, y 96 to 255 \(\1 squares\)\./)
  })
})
