import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { menuLogo, menuLogoPalette, rinkLogo, type Picture } from '../src/core/graphics'
import { fillPoints, flipped, linePoints, mirrored, paint, rectanglePoints, samePicture, shifted, squaresInBestRow } from '../src/core/paint'
import { colorRgb, SNES_COLORS } from '../src/core/color'
import { NO_SNES_PICTURE_EDITS, snesCentreIce, snesCentreIceMostSquares, snesCentreIceSquares } from '../src/core/snespictures'
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

  it('puts each 8 by 8 square of a centre ice logo in the row of colours that shows it best', () => {
    // Two rows of greys, the second in the opposite order and each 8 lighter, so neither row has the other's.
    const rgb: number[][] = Array.from({ length: 128 }, () => [0, 0, 0])
    for (let c = 1; c < 16; c++) {
      rgb[0x50 + c] = [c * 16, c * 16, c * 16]
      rgb[0x60 + c] = Array(3).fill((16 - c) * 16 + 8)
    }
    // A square drawn in row 6, with one dot of row 5 painted in: it stays in row 6, the rest untouched,
    // and the dot takes row 6's colour that looks the same (row 5 colour 3 is row 6 colour 13).
    const square = paint(blank(8, 8), rectanglePoints([0, 0], [7, 7], true), 0x62)
    const dotted = squaresInBestRow(paint(square, [[3, 3]], 0x53), rgb, [5, 6], [[3, 3]], 5)
    expect(dotted.pixels[3 * 8 + 3]).toBe(0x6d)
    expect(Array.from(dotted.pixels).filter((v) => v === 0x62)).toHaveLength(63)
    // Painted all over in row 5, it goes to row 5, exactly.
    const covered = squaresInBestRow(paint(square, rectanglePoints([0, 0], [7, 6], true), 0x54), rgb, [5, 6], [[0, 0]], 5)
    expect(covered.pixels[0]).toBe(0x54)
    expect(covered.pixels[7 * 8]).toBe(0x5e) // the last row's colour 2 of row 6 as row 5 shows it
    // Squares not touched, and squares in one row, are left alone; so is an empty picture.
    const two = paint(paint(blank(16, 8), [[0, 0]], 0x51), [[1, 0], [9, 0]], 0x62)
    const tidied = squaresInBestRow(two, rgb, [5, 6], [[9, 0]], 6)
    expect(tidied.pixels[9]).toBe(0x62)
    expect([tidied.pixels[0], tidied.pixels[1]]).toEqual([0x51, 0x62])
    expect(new Set(squaresInBestRow(two, rgb, [5, 6]).pixels.subarray(0, 2)).size).toBe(2)
    expect(squaresInBestRow(blank(8, 8), rgb, [5, 6]).pixels.every((p) => p === 0)).toBe(true)
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

const snesPath = fileURLToPath(new URL('../../NHL94.smc', import.meta.url))

describe.skipIf(!existsSync(snesPath))('drawing on an SNES centre ice logo', () => {
  it("leaves the rest of Boston's logo as it was when a dot is painted in the other row's colours", () => {
    const project = openRom(new Uint8Array(readFileSync(snesPath)))
    const ice = snesCentreIce(project.bytes, project.teams.length, NO_SNES_PICTURE_EDITS, 1, project.rinkPalette)
    const rgb = ice.palette.map((word) => colorRgb(word, SNES_COLORS))
    const middle: [number, number] = [32, 16]
    const before = ice.picture
    expect(before.pixels[middle[1] * before.width + middle[0]] >> 4).toBe(6)
    // Row 5 colour 5, a brick red, where row 6 colour 5 is gold.
    const after = squaresInBestRow(paint(before, [middle], 0x55), rgb, ice.rows, [middle], 5)
    const changed = Array.from(after.pixels).flatMap((v, i) => (v !== before.pixels[i] ? [i] : []))
    expect(changed).toEqual([middle[1] * before.width + middle[0]])
    expect(after.pixels[changed[0]] >> 4).toBe(6)
  })

  it('counts the squares of every original centre ice logo within the room the game has', () => {
    const project = openRom(new Uint8Array(readFileSync(snesPath)))
    const most = snesCentreIceMostSquares(project.bytes, project.teams.length)
    const counts = project.teams.map(
      (_, t) => snesCentreIceSquares(snesCentreIce(project.bytes, project.teams.length, NO_SNES_PICTURE_EDITS, t).picture, most).squares,
    )
    expect(Math.max(...counts)).toBe(most)
    // Empty squares are not counted, and a square that repeats is counted once.
    const plain = paint(blank(64, 32), rectanglePoints([0, 0], [63, 15], true), 0x51)
    expect(snesCentreIceSquares(plain, most).squares).toBe(1)
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
