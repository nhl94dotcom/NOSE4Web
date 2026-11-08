import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkProject } from '../src/core/check'
import {
  FEWEST_PHOTOS,
  photoFromImage,
  photoLayout,
  photoPalette,
  teamPhotos,
  withPhoto,
  withPhotoAdded,
  withPhotoMoved,
  withPhotoRemoved,
  withPhotoSlot,
} from '../src/core/photos'
import { buildRom, openRom } from '../src/core/rom'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { league30Rom?: string } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}

// A 48 by 48 picture in the eight shades, from a rule.
const drawn = (shade: (x: number, y: number) => number) => {
  const pixels = new Uint8Array(48 * 48)
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) pixels[y * 48 + x] = 5 + shade(x, y)
  return { width: 48, height: 48, pixels }
}
const same = (a: { pixels: Uint8Array }, b: { pixels: Uint8Array }) => Buffer.compare(Buffer.from(a.pixels), Buffer.from(b.pixels)) === 0
const changedBytes = (a: Uint8Array, b: Uint8Array) => [...b.keys()].filter((i) => a[i] !== b[i])

describe.skipIf(!existsSync(path('nhl94.bin')))('Genesis player photos', () => {
  const stock = () => openRom(new Uint8Array(readFileSync(path('nhl94.bin'))))

  it("finds every team's featured players, and the eight greys", () => {
    const project = stock()
    const layout = photoLayout(project.bytes, project.teams.length)!
    expect(layout.lists.map((list) => list.entries.length)).toEqual([6, 7, 6, 6, 6, 6, 6, 6, 6, 6, 7, 6, 6, 6, 6, 6, 6, 8, 6, 6, 6, 6, 6, 6, 7, 6, 25, 25])
    expect(photoPalette(project).slice(5, 13)).toEqual([0xeee, 0, 0xccc, 0xaaa, 0x888, 0x666, 0x444, 0x222])
    // Boston's first is Card001, for its first goalie; Anaheim has only generic pictures.
    expect(teamPhotos(project, 1)[0]).toMatchObject({ slot: 0, generic: false })
    expect(teamPhotos(project, 0).every((photo) => photo.generic)).toBe(true)
  })

  it("rewrites a player's own photo where it is, and gives one with a generic picture his own", () => {
    const project = stock()
    const picture = drawn((x, y) => (x + y) % 8)
    // Boston's goalie has a picture of his own, laid out by the shared map.
    const own = withPhoto(project, 1, 0, picture)
    expect(own.bytes.length).toBe(project.bytes.length)
    expect(changedBytes(project.bytes, own.bytes).length).toBeLessThanOrEqual(36 * 24)
    expect(same(teamPhotos(own, 1)[0].picture, picture)).toBe(true)
    // Anaheim's second shares the generic skater: it gets a new one, and the rest keep theirs.
    const before = teamPhotos(project, 0)
    const given = withPhoto(project, 0, 1, picture)
    const after = teamPhotos(given, 0)
    expect(same(after[1].picture, picture)).toBe(true)
    expect(after[1].generic).toBe(false)
    expect(same(after[2].picture, before[2].picture)).toBe(true)
    expect(same(teamPhotos(given, 13)[1].picture, teamPhotos(project, 13)[1].picture)).toBe(true)
  })

  it('grows the original 1 MB ROM to 2 MB once its unused end is full, losing nothing', () => {
    let project = stock()
    const picture = drawn((x) => x % 8)
    project = withPhoto(project, 0, 1, picture)
    expect(project.bytes.length).toBe(0x100000)
    project = withPhoto(project, 0, 2, picture)
    expect(project.bytes.length).toBe(0x200000)
    const reopened = openRom(buildRom(project))
    expect([1, 2].every((i) => same(teamPhotos(reopened, 0)[i].picture, picture))).toBe(true)
  })

  it('rewrites a photo with a map of its own, storing each different tile once', () => {
    const project = stock()
    const layout = photoLayout(project.bytes, project.teams.length)!
    const team = layout.lists.findIndex((list) => list.entries.some((entry) => project.bytes[entry.at + 7] !== 0))
    const index = layout.lists[team].entries.findIndex((entry) => project.bytes[entry.at + 7] !== 0)
    // Plain rows repeat, so the photo takes fewer tiles than the 36 it shows.
    const picture = drawn((x, y) => (y < 24 ? 0 : x % 8))
    const done = withPhoto(project, team, index, picture)
    expect(done.bytes.length).toBe(project.bytes.length)
    expect(photoLayout(done.bytes, done.teams.length)!.lists[team].entries[index].at).toBe(layout.lists[team].entries[index].at)
    expect(same(teamPhotos(done, team)[index].picture, picture)).toBe(true)
  })

  it('changes who a photo is for, its order, and adds and removes players, keeping six', () => {
    let project = stock()
    project = withPhotoSlot(project, 1, 1, 9)
    expect(teamPhotos(project, 1)[1].slot).toBe(9)
    project = withPhotoMoved(project, 1, 1, 0)
    expect(teamPhotos(project, 1).map((photo) => photo.slot).slice(0, 2)).toEqual([9, 0])
    // Anaheim's list is packed against Boston's, so a seventh moves it to the end of the ROM.
    const grown = withPhotoAdded(project, 0, 15, false)
    expect(teamPhotos(grown, 0)).toHaveLength(7)
    expect(teamPhotos(grown, 0)[6]).toMatchObject({ slot: 15, generic: true })
    expect(teamPhotos(grown, 1).map((photo) => photo.slot)).toEqual(teamPhotos(project, 1).map((photo) => photo.slot))
    expect(teamPhotos(withPhotoRemoved(grown, 0, 6), 0)).toHaveLength(6)
    expect(() => withPhotoRemoved(project, 0, 0)).toThrow(`at least ${FEWEST_PHOTOS}`)
    // Downloaded and opened again, all of it is there.
    const reopened = openRom(buildRom(grown))
    expect(teamPhotos(reopened, 0).map((photo) => photo.slot)).toEqual(teamPhotos(grown, 0).map((photo) => photo.slot))
    expect(teamPhotos(reopened, 1)[0].slot).toBe(9)
  })

  it('makes a photo from an image of any size, in greys, shading by spreading the difference', () => {
    const palette = photoPalette(stock())
    // A grey halfway between two shades, 96 by 60: the middle 60 by 60 is used.
    const rgba = new Uint8ClampedArray(96 * 60 * 4)
    for (let i = 0; i < 96 * 60; i++) rgba.set(i % 96 < 18 || i % 96 >= 78 ? [0, 0, 0, 255] : [0x99, 0x99, 0x99, 255], i * 4)
    const picture = photoFromImage(rgba, 96, 60, palette)
    expect([picture.width, picture.height]).toEqual([48, 48])
    const shades = new Set(picture.pixels)
    expect([...shades].sort()).toEqual([8, 9]) // aaa and 888, mixed
    // See-through counts as white.
    expect(new Set(photoFromImage(new Uint8ClampedArray(48 * 48 * 4), 48, 48, palette).pixels)).toEqual(new Set([5]))
  })

  it.skipIf(!local.league30Rom || !existsSync(path(local.league30Rom)))("reads a league ROM's own photos, and Check ROM finds a setup card past a roster", () => {
    const league = openRom(new Uint8Array(readFileSync(path(local.league30Rom!))))
    const layout = photoLayout(league.bytes, league.teams.length)!
    expect(layout.lists.every((list) => list.entries.length === 26)).toBe(true)
    expect(teamPhotos(league, 0).some((photo) => !photo.generic)).toBe(true)
    // Room for 26 in each list where it is: a 27th moves it.
    const picture = drawn(() => 3)
    const replaced = withPhoto(league, 0, 0, picture)
    expect(same(teamPhotos(replaced, 0)[0].picture, picture)).toBe(true)
    const past = withPhotoSlot(league, 2, 0, 40)
    expect(checkProject(past).some((finding) => finding.team === 2 && finding.level === 'note' && /Player photo 1, shown on the team setup screen/.test(finding.message))).toBe(true)
  })
})
