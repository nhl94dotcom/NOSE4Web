import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { menuLogo, menuLogoPalette, rinkLogo, type Picture } from '../src/core/graphics'
import { fillPoints, flipped, linePoints, mirrored, oneRowPerSquare, paint, rectanglePoints, samePicture, shifted } from '../src/core/paint'
import { ownColours, paintableColours, withPainted } from '../src/core/pictureset'
import { buildRom, openRom } from '../src/core/rom'
import { snesLogoTiles } from '../src/core/snespictures'

const blank = (width: number, height: number): Picture => ({ width, height, pixels: new Uint8Array(width * height) })
const rows = (picture: Picture) => Array.from({ length: picture.height }, (_, y) => Array.from(picture.pixels.subarray(y * picture.width, (y + 1) * picture.width)).join(''))

describe('drawing on a picture', () => {
  it('draws lines and rectangles, both ends and corners included', () => {
    expect(linePoints([0, 0], [3, 0])).toEqual([[0, 0], [1, 0], [2, 0], [3, 0]])
    expect(linePoints([0, 0], [2, 2])).toEqual([[0, 0], [1, 1], [2, 2]])
    expect(linePoints([3, 1], [3, 1])).toEqual([[3, 1]])
    expect(linePoints([4, 0], [0, 2])).toHaveLength(5)
    expect(rows(paint(blank(5, 4), rectanglePoints([3, 2], [1, 0], false), 7))).toEqual(['07770', '07070', '07770', '00000'])
    expect(rows(paint(blank(4, 3), rectanglePoints([0, 0], [2, 1], true), 1))).toEqual(['1110', '1110', '0000'])
  })

  it('fills the pixels joined to one, of its colour, side by side only', () => {
    const picture = paint(blank(5, 3), [[2, 0], [2, 1], [2, 2], [0, 0]], 1)
    expect(rows(paint(picture, fillPoints(picture, [4, 1]), 3))).toEqual(['10133', '00133', '00133'])
    expect(rows(paint(picture, fillPoints(picture, [0, 0]), 3))).toEqual(['30100', '00100', '00100'])
    expect(fillPoints(picture, [9, 9])).toEqual([])
  })

  it('mirrors, flips and moves, leaving the original alone', () => {
    const picture = paint(blank(4, 2), [[0, 0]], 5)
    expect(rows(paint(picture, mirrored(picture, [[1, 1]]), 2))).toEqual(['5000', '0220'])
    expect(rows(flipped(picture, true))).toEqual(['0005', '0000'])
    expect(rows(flipped(picture, false))).toEqual(['0000', '5000'])
    expect(rows(shifted(picture, 1, 1))).toEqual(['0000', '0500'])
    expect(rows(shifted(picture, -1, 0))).toEqual(['0000', '0000'])
    expect(rows(picture)).toEqual(['5000', '0000'])
    expect(samePicture(picture, paint(blank(4, 2), [[0, 0]], 5))).toBe(true)
    expect(samePicture(picture, blank(4, 2))).toBe(false)
  })

  it('keeps each 8 by 8 square of a centre ice logo in one row of colours', () => {
    let picture = paint(blank(16, 8), [[0, 0], [1, 0], [9, 0]], 0x53)
    picture = paint(picture, [[2, 2]], 0x64)
    picture = oneRowPerSquare(picture, [[2, 2]], 0x64)
    expect([picture.pixels[0], picture.pixels[1], picture.pixels[2 * 16 + 2], picture.pixels[9]]).toEqual([0x63, 0x63, 0x64, 0x53])
    expect(oneRowPerSquare(picture, [[0, 0]], 0)).toBe(picture)
  })

  it('counts the tiles an SNES logo takes, a repeated tile once', () => {
    expect(snesLogoTiles(blank(56, 56))).toBeNull()
    expect(snesLogoTiles(paint(blank(56, 56), rectanglePoints([0, 0], [55, 55], true), 1))?.tiles).toBeLessThanOrEqual(4)
    // Random pixels: no two squares alike, so a tile for every one of the 49.
    const busy = blank(56, 56)
    let seed = 7
    busy.pixels.forEach((_, i) => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      busy.pixels[i] = 1 + (seed % 15)
    })
    const used = snesLogoTiles(busy)!
    expect(used.tiles).toBeGreaterThan(used.most)
  })
})

const romPath = fileURLToPath(new URL('../../nhl94.bin', import.meta.url))

describe.skipIf(!existsSync(romPath))('drawn Genesis pictures in the ROM', () => {
  it('keeps a drawn menu logo and its new colours, and a drawn centre-ice logo', () => {
    const project = openRom(new Uint8Array(readFileSync(romPath)))
    expect(paintableColours('menuLogo')).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
    expect(ownColours('rinkLogo')).toEqual([])
    const logo = paint(menuLogo(project, 3), rectanglePoints([0, 0], [5, 5], true), 9)
    const palette = menuLogoPalette(project, 3).slice()
    palette[9] = 0x0e0e
    let graphics = withPainted(project, 3, 'menuLogo', logo, palette)
    const rink = paint(rinkLogo(project, 3), [[10, 10]], 4)
    graphics = withPainted({ ...project, graphics }, 3, 'rinkLogo', rink)
    const reopened = openRom(buildRom({ ...project, graphics }))
    expect(samePicture(menuLogo(reopened, 3), logo)).toBe(true)
    expect(menuLogoPalette(reopened, 3)[9]).toBe(0x0e0e)
    expect([5, 6].map((slot) => menuLogoPalette(reopened, 3)[slot])).toEqual([0x0eee, 0x0000])
    expect(samePicture(rinkLogo(reopened, 3), rink)).toBe(true)
    // Other teams are untouched.
    expect(samePicture(menuLogo(reopened, 4), menuLogo(project, 4))).toBe(true)
  })
})
