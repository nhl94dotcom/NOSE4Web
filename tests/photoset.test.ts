import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { pictureToImage } from '../src/core/graphics'
import { importPhotoSet, photoSet } from '../src/core/photoset'
import { teamPhotos } from '../src/core/photos'
import { openRom, type RomProject } from '../src/core/rom'
import { snesTeamPhotos } from '../src/core/snesphotos'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
// The set as image files, as a zip of PNGs would bring them back.
const files = (project: RomProject) =>
  photoSet(project).map((entry) => ({ name: entry.name, rgba: pictureToImage(entry.picture, entry.palette, entry.format), width: 48, height: 48 }))

describe.skipIf(!existsSync(path('nhl94.bin')))('Genesis photos in a picture set', () => {
  it('names a file for each player with a photo of his own, and brings an exported set back unchanged', () => {
    const project = open('nhl94.bin')
    const set = photoSet(project)
    expect(set.length).toBeGreaterThan(100)
    expect(set[0].name).toMatch(/^photos\/02_Boston_Bruins\/[A-Za-z_]+\.png$/)
    const back = importPhotoSet(project, files(project))
    expect(back).toMatchObject({ replaced: [], problems: [], unchanged: set.length })
  })

  it("finds each photo's player by name, and adds a player with none to the featured players", () => {
    const project = open('nhl94.bin')
    const boston = files(project).filter((file) => file.name.startsWith('photos/02_'))
    // Boston's photos filed under Anaheim find no Anaheim players of those names.
    const renamed = boston.map((file) => ({ ...file, name: file.name.replace('photos/02_Boston_Bruins', 'photos/01_Mighty_Ducks') }))
    const result = importPhotoSet(project, renamed)
    expect(result.replaced).toEqual([])
    expect(result.problems[0]).toMatch(/has no player called/)
    // A Boston photo given to an Anaheim player of the same name.
    const listed = teamPhotos(project, 0).map((photo) => photo.slot)
    const slot = project.teams[0].players.findIndex((_, s) => !listed.includes(s))
    const anaheim = project.teams[0].players[slot].name
    const one = [{ ...boston[0], name: `photos/01_Anaheim/${anaheim.replace(/[^A-Za-z0-9]+/g, '_')}.png` }]
    const given = importPhotoSet(project, one)
    expect(given.replaced).toEqual([`Anaheim Mighty Ducks: ${anaheim}`])
    const photos = teamPhotos(given.project, 0)
    expect(photos).toHaveLength(7)
    expect(photos[6]).toMatchObject({ slot, generic: false })
  })
})

describe.skipIf(!existsSync(path('NHL94.smc')))('SNES photos in a picture set', () => {
  it('brings an exported set back unchanged, and a changed photo to its player', () => {
    const project = open('NHL94.smc')
    const set = files(project)
    expect(importPhotoSet(project, set)).toMatchObject({ replaced: [], problems: [], unchanged: set.length })
    const first = set[0]
    const rgba = first.rgba.slice()
    for (let i = 0; i < 48 * 4 * 10; i += 4) rgba.set([255, 0, 0, 255], i)
    const result = importPhotoSet(project, [{ ...first, rgba }])
    expect(result.replaced).toHaveLength(1)
    const team = Number(/photos\/(\d+)_/.exec(first.name)![1]) - 1
    const slot = project.teams[team].players.findIndex((p) => first.name.endsWith(`/${p.name.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}.png`))
    expect(snesTeamPhotos(result.project, team)[slot].picture.pixels.slice(0, 48)).not.toEqual(snesTeamPhotos(project, team)[slot].picture.pixels.slice(0, 48))
  })
})
