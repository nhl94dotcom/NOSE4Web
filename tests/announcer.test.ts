import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ANNOUNCER_HEIGHT, ANNOUNCER_WIDTH, genesisAnnouncer, genesisAnnouncerFromImage, withGenesisAnnouncer, withOriginalGenesisAnnouncer } from '../src/core/announcer'
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
