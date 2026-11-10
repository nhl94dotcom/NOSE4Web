import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { colorRgb } from '../src/core/color'
import { compareProjects } from '../src/core/compare'
import {
  MENU_PICTURE_COLOURS,
  MENU_PICTURE_HIDDEN_CELLS,
  MENU_PICTURE_TILES,
  menuPictureFromImage,
  menuPicturePalette,
  readMenuPicture,
  withMenuPicture,
  withOriginalMenuPicture,
} from '../src/core/menupicture'
import { openProjectFile, saveProjectFile } from '../src/core/projectfile'
import { buildRom, openRom } from '../src/core/rom'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const open = (name = 'nhl94.bin') => openRom(new Uint8Array(readFileSync(path(name))))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { drezzMenuRom?: string } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}

// A simple picture: a red field, a white square, a blue band.
function simple(width: number, height: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const square = x > width / 3 && x < (2 * width) / 3 && y > height / 3 && y < (2 * height) / 3
      const rgb = square ? [255, 255, 255] : y < height / 5 ? [0, 0, 255] : [192, 0, 0]
      rgba.set([...rgb, 255], (y * width + x) * 4)
    }
  }
  return rgba
}

// A busy one: smooth colour ramps with noise, so nearly every square is different.
function busy(width: number, height: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4)
  let seed = 7
  const random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      rgba.set([(x * 255) / width, (y * 255) / height, random() * 255, 255], (y * width + x) * 4)
    }
  }
  return rgba
}

describe.skipIf(!existsSync(path('nhl94.bin')))('the Game Setup background', () => {
  it("is the original's in retail, 240 tiles, drawn in row 0 with flips", () => {
    const rom = open().bytes
    // setoptions: movea.l #GameSetUpMap,a0.
    expect(Buffer.from(rom.subarray(0xf823a, 0xf8240)).toString('hex')).toBe('207c0004b7a0')
    const menu = readMenuPicture(rom)!
    expect(menu.original).toBe(true)
    expect(menu.tiles).toBe(240)
    expect(menu.picture.pixels.some((p) => p !== 0)).toBe(true)
  })

  it('takes a simple picture exactly, keeping the fonts colours, and puts the original back', () => {
    const project = open()
    const palette = menuPicturePalette(project.bytes)!
    const made = menuPictureFromImage(simple(640, 448), 640, 448, palette)
    expect(made.distinct).toBe(made.tiles.length)
    expect(made.tiles.length).toBeLessThanOrEqual(MENU_PICTURE_TILES)
    // Row 0's colours 1 and 3 to 7, which the menu's lettering and frames use, are the ROM's.
    for (const i of [1, 3, 4, 5, 6, 7]) expect(made.palette[i]).toBe(palette[i])
    // Rows 1 and 2 belong to other pictures on the screen and are kept; the map uses rows 0 and 3 only.
    expect(made.palette.slice(16, 48)).toEqual(palette.slice(16, 48))
    expect(made.map.every((entry) => [0, 3].includes((entry >> 13) & 3))).toBe(true)
    const hacked = openRom(buildRom(withMenuPicture(project, made)))
    const menu = readMenuPicture(hacked.bytes)!
    expect(menu.original).toBe(false)
    const at = (x: number, y: number) => colorRgb(menu.palette[menu.picture.pixels[y * 320 + x]])
    expect(at(160, 112)).toEqual([255, 255, 255])
    expect(at(10, 10)).toEqual([0, 0, 255])
    expect(at(10, 200)).toEqual([182, 0, 0])
    // Compare ROMs names it.
    expect(JSON.stringify(compareProjects(project, hacked))).toContain('Main menu background')
    // Only the pointer and the new data change; putting the original back leaves the pointer as it was.
    const back = withOriginalMenuPicture(hacked)
    expect(readMenuPicture(back.bytes)!.original).toBe(true)
    // A second picture goes where the first is, if it fits.
    const again = withMenuPicture(hacked, made)
    expect(again.bytes.length).toBe(hacked.bytes.length)
  })

  it('keeps the background in a project file, put into a fresh copy of the ROM', () => {
    const project = open()
    const edited = withMenuPicture(project, menuPictureFromImage(simple(320, 224), 320, 224, menuPicturePalette(project.bytes)!))
    const text = saveProjectFile(edited, project, 'test')
    const reopened = openProjectFile(open(), text).project
    expect(readMenuPicture(reopened.bytes)!.picture.pixels).toEqual(readMenuPicture(edited.bytes)!.picture.pixels)
    expect(readMenuPicture(reopened.bytes)!.original).toBe(false)
    // Over the ROM it came from, nothing is written twice.
    expect(Buffer.compare(openProjectFile(edited, text).project.bytes, edited.bytes)).toBe(0)
  })

  it('merges the most alike squares of a busy picture into the room there is, in at most 25 colours of its own', () => {
    const project = open()
    const made = menuPictureFromImage(busy(320, 224), 320, 224, menuPicturePalette(project.bytes)!)
    expect(made.distinct).toBeGreaterThan(MENU_PICTURE_TILES)
    expect(made.tiles.length).toBeLessThanOrEqual(MENU_PICTURE_TILES)
    expect(MENU_PICTURE_COLOURS).toBe(25)
    // The 114 cells the screen always covers are left blank (Match Viewer's grid): the top strip's top-left corner, say.
    expect(MENU_PICTURE_HIDDEN_CELLS).toBe(114)
    const blank = made.tiles.findIndex((tile) => tile.every((b) => b === 0))
    expect(made.map[6] & 0x7ff).toBe(blank)
    expect(made.map[2 * 40 + 7] & 0x7ff).toBe(blank)
    expect(made.map[4 * 40 + 6] & 0x7ff).not.toBe(blank)
    const own = new Set([0, 2, 8, 9, 10, 11, 12, 13, 14, 15, ...Array.from({ length: 15 }, (_, i) => 49 + i)].map((i) => made.palette[i]))
    expect(own.size).toBeLessThanOrEqual(25)
    const hacked = openRom(buildRom(withMenuPicture(project, made)))
    expect(readMenuPicture(hacked.bytes)!.tiles).toBe(made.tiles.length)
  })

  it.skipIf(!local.drezzMenuRom || !existsSync(path(local.drezzMenuRom)))("reads a picture made with Drezz's guide, and says it loads too many tiles", () => {
    const menu = readMenuPicture(open(local.drezzMenuRom).bytes)!
    expect(menu.original).toBe(false)
    expect(menu.tiles).toBe(0x480)
  })
})
