import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { colorLevels, colorWord, cssHex, nearestColorWord } from '../src/core/color'
import { buildRom, openRom } from '../src/core/rom'

const romPath = fileURLToPath(new URL('../../nhl94.bin', import.meta.url))
const hasRom = existsSync(romPath)

describe('Genesis colours', () => {
  it('converts between colour words and levels', () => {
    expect(colorLevels(0x0ee8)).toEqual([4, 7, 7])
    expect(colorWord([4, 7, 7])).toBe(0x0ee8)
    expect(cssHex(0x0000)).toBe('#000000')
    expect(cssHex(0x0eee)).toBe('#ffffff')
    for (let word = 0; word <= 0x0eee; word += 0x222) expect(nearestColorWord(cssHex(word))).toBe(word)
    expect(nearestColorWord('#ff0000')).toBe(0x000e)
  })
})

describe.skipIf(!hasRom)('palettes in the ROM', () => {
  const original = hasRom ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()
  const isColor = (word: number) => (word & 0xf111) === 0

  it('reads only valid colours', () => {
    const project = openRom(original)
    expect(project.rinkPalette).toHaveLength(32)
    expect(project.rinkPalette.every(isColor)).toBe(true)
    expect(project.teams.every((team) => team.palette.every(isColor))).toBe(true)
  })

  it('saves colour changes', () => {
    const project = openRom(original)
    project.rinkPalette[0] = 0x0e00
    project.teams[3].palette[20] = 0x000e
    const reopened = openRom(buildRom(project))
    expect(reopened.rinkPalette).toEqual(project.rinkPalette)
    expect(reopened.teams).toEqual(project.teams)
  })
})
