import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ANNOUNCER_HEIGHT,
  ANNOUNCER_WIDTH,
  genesisAnnouncer,
  genesisAnnouncerFromImage,
  SNES_ANNOUNCER_VIEW,
  snesAnnouncer,
  snesAnnouncerFromImage,
  withGenesisAnnouncer,
  withOriginalGenesisAnnouncer,
  withOriginalSnesAnnouncer,
  withSnesAnnouncer,
} from '../src/core/announcer'
import { openProjectFile, saveProjectFile } from '../src/core/projectfile'
import { buildRom, openRom } from '../src/core/rom'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const GENESIS = path('nhl94.bin')
const fresh = () => openRom(new Uint8Array(readFileSync(GENESIS)))

// A test image: red on the left half, blue on the right.
function halves(width: number, height: number): Uint8Array {
  const rgba = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) rgba.set((i % width) < width / 2 ? [255, 0, 0, 255] : [0, 0, 255, 255], i * 4)
  return rgba
}

describe.skipIf(!existsSync(GENESIS))('the announcer picture, Genesis', () => {
  it("reads Ron Barr's picture, unpacking its tiles", () => {
    const shown = genesisAnnouncer(fresh())!
    expect(shown.original).toBe(true)
    expect(shown.tiles).toBe(61)
    expect(shown.picture.width * shown.picture.height).toBe(ANNOUNCER_WIDTH * ANNOUNCER_HEIGHT)
    // The frame: colour 6 down the left edge and across the top, 1 at the bottom right.
    const at = (x: number, y: number) => shown.picture.pixels[y * ANNOUNCER_WIDTH + x]
    expect([at(0, 0), at(0, 40), at(30, 0), at(63, 71)]).toEqual([6, 6, 6, 1])
    expect(new Set(shown.picture.pixels).size).toBe(15)
  })

  it('puts in a picture of its own inside the frame, and the original back', () => {
    const project = fresh()
    const before = genesisAnnouncer(project)!
    const made = genesisAnnouncerFromImage(halves(200, 200), 200, 200, before)
    const changed = openRom(buildRom(withGenesisAnnouncer(project, made)))
    const after = genesisAnnouncer({ ...changed, source: project.source })!
    expect(after.original).toBe(false)
    const at = (p: typeof after, x: number, y: number) => p.picture.pixels[y * ANNOUNCER_WIDTH + x]
    // The frame is as it was; inside, red then blue.
    for (const [x, y] of [[0, 0], [1, 30], [62, 10], [20, 71]]) expect(at(after, x, y)).toBe(at(before, x, y))
    const colour = (p: typeof after, x: number, y: number) => p.palette[at(p, x, y)]
    expect(colour(after, 10, 30)).toBe(0x00e)
    expect(colour(after, 50, 30)).toBe(0xe00)
    // Only row 3's own colours changed.
    expect(after.palette.filter((w, i) => w !== before.palette[i]).length).toBeLessThanOrEqual(8)
    for (const i of [1, 2, 3, 4, 5, 6, 7]) expect(after.palette[i]).toBe(before.palette[i])
    // Put back.
    const back = withOriginalGenesisAnnouncer({ ...changed, source: project.source })
    expect(genesisAnnouncer(back)!.original).toBe(true)
  })

  it('keeps a picture of its own in a project file, put into a fresh copy of the ROM', () => {
    const project = fresh()
    const made = genesisAnnouncerFromImage(halves(80, 120), 80, 120, genesisAnnouncer(project)!)
    const changed = withGenesisAnnouncer(project, made)
    const text = saveProjectFile(changed, fresh(), 'Work')
    expect(JSON.parse(text).screens.announcer.bytes).toBeTruthy()
    // Over another copy too, where the file's own patch cannot be used.
    const other = new Uint8Array(readFileSync(GENESIS))
    other[0x150] ^= 1
    const { project: opened } = openProjectFile(openRom(other), text)
    expect(Array.from(genesisAnnouncer(opened)!.picture.pixels)).toEqual(Array.from(genesisAnnouncer(changed)!.picture.pixels))
  })
})

const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const snesRoms = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))

describe.skipIf(snesRoms.length === 0)('the announcer picture, SNES', () => {
  // Numbered, so that no ROM's name appears in the test results.
  snesRoms.forEach((name, n) => {
    it(`SNES ROM ${n + 1}: reads Ron Barr, puts in a picture of its own in the free corner, and the original back`, () => {
      const project = openRom(new Uint8Array(readFileSync(path(name))))
      const before = snesAnnouncer(project)!
      expect(before.original).toBe(true)
      expect(before.picture.pixels.some((c) => c !== 0)).toBe(true)
      const made = snesAnnouncerFromImage(halves(90, 160), 90, 160)
      expect(made.tiles.length).toBeLessThanOrEqual(152)
      const changed = withSnesAnnouncer(project, made)
      const reopened = openRom(buildRom(changed))
      const after = snesAnnouncer({ ...reopened, source: project.source })!
      expect(after.original).toBe(false)
      const { width, left } = SNES_ANNOUNCER_VIEW
      const at = (x: number, y: number) => after.picture.pixels[y * width + x]
      // Left of the corner, the frame; in it, red then blue.
      expect(at(left - 4, 60)).toBe(0)
      expect(after.palette[at(left + 10, 60)]).toBe(0x001f)
      expect(after.palette[at(left + 60, 60)]).toBe(0x7c00)
      // Colour 0, see-through, as it was.
      expect(after.palette[0]).toBe(before.palette[0])
      // Put back, and kept in a project file.
      expect(snesAnnouncer(withOriginalSnesAnnouncer(changed))!.original).toBe(true)
      const text = saveProjectFile(changed, openRom(new Uint8Array(readFileSync(path(name)))), 'Work')
      const other = new Uint8Array(readFileSync(path(name)))
      other[other.length - 1] ^= 1
      const { project: opened } = openProjectFile(openRom(other), text)
      expect(Array.from(snesAnnouncer(opened)!.picture.pixels)).toEqual(Array.from(snesAnnouncer(changed)!.picture.pixels))
    })
  })

  it("puts a cut-out in Ron Barr's whole place, behind the box too, and refuses a photo too detailed for it", () => {
    const project = openRom(new Uint8Array(readFileSync(path(snesRoms[0]))))
    // A 60 x 100 figure, red and blue halves, on a see-through background of 200 x 120.
    const [w, h] = [200, 120]
    const rgba = new Uint8Array(w * h * 4)
    for (let y = 10; y < 110; y++) for (let x = 120; x < 180; x++) rgba.set(x < 150 ? [255, 0, 0, 255] : [0, 0, 255, 255], (y * w + x) * 4)
    const made = snesAnnouncerFromImage(rgba, w, h, 'whole')
    expect(made.area).toBe('whole')
    expect(made.words).toHaveLength(26 * 16)
    // The see-through squares are left empty, and cost no tiles.
    expect(made.words.filter((word) => word === 0).length).toBeGreaterThan(200)
    expect(made.tiles.length).toBeLessThan(152)
    const after = snesAnnouncer({ ...openRom(buildRom(withSnesAnnouncer(project, made))), source: project.source })!
    const { width } = SNES_ANNOUNCER_VIEW
    const at = (x: number, y: number) => after.picture.pixels[y * width + x]
    // Fitted whole, 200 x 120 into 208 x 128 (x 1.04), set in the bottom right: the figure x 125-187, red to 156.
    expect(after.palette[at(140, 70)]).toBe(0x001f)
    expect(after.palette[at(172, 70)]).toBe(0x7c00)
    expect(at(195, 70)).toBe(0)
    // Left of the figure, inside the area: see-through, so the screen's frame shows.
    expect(at(40, 70)).toBe(0)
    // A photo that is all picture is too much for 152 squares there.
    const noisy = new Uint8Array(208 * 128 * 4).map((_, i) => (i % 4 === 3 ? 255 : (i * 7919) % 251))
    expect(() => withSnesAnnouncer(project, snesAnnouncerFromImage(noisy, 208, 128, 'whole'))).toThrow(/see-through background/)
  })
})
