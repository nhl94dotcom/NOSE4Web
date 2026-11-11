import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { withGenesisBloodAdded } from '../src/core/genesisblood'
import { genesisScoreLogo, withGenesisScoreLogo, withGenesisScoreLogosAdded } from '../src/core/genesisscorelogos'
import { rinkLogo, withRinkLogo } from '../src/core/graphics'
import { teamPhotos, withPhoto } from '../src/core/photos'
import { openProjectFile, saveProjectFile } from '../src/core/projectfile'
import { buildRom, openRom, type RomProject } from '../src/core/rom'
import { snesBlockColours, withSnesBlockColours } from '../src/core/snesblockcolours'
import { snesPhotoPalette, withSnesPhotoPalette } from '../src/core/snesphotos'
import { teamMovedTo, withTeamOrder } from '../src/core/teamorder'

// Project files keep what is kept only in the ROM itself (photos, score
// logos, head blood, the SNES banner and photo colours) as a patch of the
// finished ROM, put back when the project is opened over the same ROM.
const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const GENESIS = path('nhl94.bin')
const SNES = path('NHL94.smc')
const fresh = (file: string) => openRom(new Uint8Array(readFileSync(file)))
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((byte, i) => byte === b[i])

// Saved, and opened over a fresh copy of the same ROM: the same finished ROM.
function roundTrip(file: string, project: RomProject) {
  const text = saveProjectFile(project, fresh(file), 'Work')
  const { project: back, notes } = openProjectFile(fresh(file), text)
  return { text, back, notes, exact: same(buildRom(back), buildRom(project)) }
}

describe.skipIf(!existsSync(GENESIS))('project files with work kept only in the ROM, Genesis', () => {
  it('puts back a replaced player photo, score logos and head blood exactly', () => {
    let project = fresh(GENESIS)
    const photo = teamPhotos(project, 1)[0].picture
    project = withPhoto(project, 1, 0, { ...photo, pixels: photo.pixels.map((p, i) => (i < 200 ? 5 : p)) })
    project = withGenesisScoreLogosAdded(project)
    const logo = genesisScoreLogo(project, 2)!
    project = withGenesisScoreLogo(project, 2, { ...logo, home: { ...logo.home, pixels: logo.home.pixels.map(() => 3) } })
    project = withGenesisBloodAdded(project)
    const { text, back, notes, exact } = roundTrip(GENESIS, project)
    expect(JSON.parse(text).rom).toBeDefined()
    expect(notes).toEqual([])
    expect(exact).toBe(true)
    // Still the ROM as opened underneath, for Reset, patches and Changes.
    expect(same(back.source, fresh(GENESIS).source)).toBe(true)
  })

  it('keeps no patch where the rest of the file gives the ROM, as for names and pictures', () => {
    let project = fresh(GENESIS)
    project = { ...project, teams: project.teams.map((team, t) => (t === 0 ? { ...team, names: ['Anaheim', 'ANA', 'Ducks', 'Pond'] } : team)) }
    const logo = rinkLogo(project, 4)
    project = { ...project, graphics: withRinkLogo(project, 4, { ...logo, pixels: logo.pixels.map(() => 1) }) }
    project = withTeamOrder(project, teamMovedTo(28, 3, 12))
    const { text, exact } = roundTrip(GENESIS, project)
    expect(JSON.parse(text).rom).toBeUndefined()
    expect(exact).toBe(true)
  })

  it('says what was left out when opened over another copy of the ROM', () => {
    let project = fresh(GENESIS)
    const photo = teamPhotos(project, 1)[0].picture
    project = withPhoto(project, 1, 0, { ...photo, pixels: photo.pixels.map(() => 6) })
    project = { ...project, teams: project.teams.map((team, t) => (t === 0 ? { ...team, names: ['Anaheim', 'ANA', 'Ducks', 'Pond'] } : team)) }
    const text = saveProjectFile(project, fresh(GENESIS), 'Work')
    // Another copy: one byte of the header's overseas name changed.
    const other = new Uint8Array(readFileSync(GENESIS))
    other[0x150] ^= 0x01
    const { project: back, notes } = openProjectFile(openRom(other), text)
    expect(notes.join(' ')).toMatch(/not the copy of the ROM the project was made on.*player photos/)
    expect(back.teams[0].names[2]).toBe('Ducks')
  })
})

describe.skipIf(!existsSync(SNES))('project files with work kept only in the ROM, SNES', () => {
  it('puts back banner colours and photo colours exactly', () => {
    let project = fresh(SNES)
    project = withSnesBlockColours(project, 3, snesBlockColours(project, 3)!.map((word, i) => (i === 5 ? 0x7c00 : word)))
    project = withSnesPhotoPalette(project, 4, snesPhotoPalette(project, 4).map((word, i) => (i === 6 ? 0x001f : word)))
    const { text, notes, exact } = roundTrip(SNES, project)
    expect(JSON.parse(text).rom).toBeDefined()
    expect(notes).toEqual([])
    expect(exact).toBe(true)
  })
})
