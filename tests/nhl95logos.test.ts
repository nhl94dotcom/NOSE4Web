import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { canAddGenesisScoreLogos } from '../src/core/genesisscorelogos'
import { expandPictureSpace, menuLogo, menuLogoPalette, pictureSpace, rinkLogosSupported, withMenuLogo, writeGraphics, type Picture } from '../src/core/graphics'
import { importTeam, ALL_PARTS } from '../src/core/importteam'
import { pictureKinds } from '../src/core/pictureset'
import { openProjectFile, saveProjectFile } from '../src/core/projectfile'
import { buildRom, openRom } from '../src/core/rom'

// NHL '95 (USA) at ../NHL95/NHL_95.bin, and any NHL '95 league ROMs named in local.json's nhl95Roms.
const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { nhl95Roms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const RETAIL = 'NHL95/NHL_95.bin'
const names = [RETAIL, ...(local.nhl95Roms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const BOSTON = 1

// A 48 x 48 logo in colours 7 to 15, with white and black, every tile different.
function pattern(): Picture {
  const pixels = new Uint8Array(48 * 48)
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) pixels[y * 48 + x] = [0, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15][(x * 7 + y * 3 + ((x * y) >> 4)) % 12]
  return { width: 48, height: 48, pixels }
}

describe.skipIf(names.length === 0)("NHL '95 menu logos", () => {
  it.each(names)('reads every team’s 6 x 6 logo and its colours in %s, and nothing NHL 94 keeps differently', (name) => {
    const project = open(name)
    expect(project.graphicsSupported).toBe(true)
    expect(pictureKinds(project)).toEqual(['menuLogo'])
    expect(rinkLogosSupported(project)).toBe(false)
    expect(canAddGenesisScoreLogos(project)).toBe(false)
    project.teams.forEach((_, team) => {
      const logo = menuLogo(project, team)
      expect([logo.width, logo.height]).toEqual([48, 48])
      // White and black at 5 and 6, as in NHL 94.
      expect(menuLogoPalette(project, team).slice(5, 7)).toEqual([0xeee, 0])
    })
    // Rebuilt unedited, the logos and their colours are as they were.
    const rebuilt = openRom(buildRom(project))
    project.teams.forEach((_, team) => expect(menuLogo(rebuilt, team)).toEqual(menuLogo(project, team)))
  })

  it.each(names)('replaces one team’s logo and colours in %s, the other teams’ left as they were', (name) => {
    const opened = open(name)
    // The original game packs its logos tight, as NHL 94 does: a detailed one needs them given room first.
    // The WN95HL's ROMs give every logo a tile for each place already.
    expect(pictureSpace(opened) === null).toBe(name !== RETAIL)
    const project = expandPictureSpace(opened)
    expect(pictureSpace(project)).toBeNull()
    opened.teams.forEach((_, team) => expect(menuLogo(project, team)).toEqual(menuLogo(opened, team)))
    const colours = menuLogoPalette(project, BOSTON).slice()
    for (let i = 7; i < 16; i++) colours[i] = 0x002 * (i - 6)
    const graphics = withMenuLogo(project, BOSTON, pattern(), colours)
    const edited = { ...project, graphics }
    writeGraphics(project.bytes.slice(), project.game, graphics)
    const reopened = openRom(buildRom(edited))
    expect(menuLogo(reopened, BOSTON)).toEqual(pattern())
    const palette = menuLogoPalette(reopened, BOSTON)
    expect(palette.slice(7)).toEqual(colours.slice(7))
    // The stripes (1, 2) and the shared colours stay the team's.
    expect(palette.slice(0, 7)).toEqual(menuLogoPalette(project, BOSTON).slice(0, 7))
    project.teams.forEach((_, team) => {
      if (team === BOSTON) return
      expect(menuLogo(reopened, team)).toEqual(menuLogo(project, team))
      expect(menuLogoPalette(reopened, team)).toEqual(menuLogoPalette(project, team))
    })
    // A project file brings it back over a fresh copy of the ROM, the copy's own patch left out.
    const text = JSON.stringify({ ...JSON.parse(saveProjectFile(edited, opened, 'P')), rom: undefined })
    const again = openProjectFile(opened, text).project
    expect(menuLogo(again, BOSTON)).toEqual(pattern())
    expect(menuLogoPalette(again, BOSTON)).toEqual(palette)
  })

  it('is left alone where the code that finds it is not the original game’s', () => {
    const project = open(RETAIL)
    const odd = project.bytes.slice()
    odd[0x7d3ec] = 0x4e // the movea.l of GetTeamLogo
    expect(openRom(odd).graphicsSupported).toBe(false)
  })

  it.skipIf(!existsSync(path('nhl94.bin')))('comes across from NHL 94 with a team, the centre-ice logo left out', () => {
    const nhl95 = expandPictureSpace(open(RETAIL))
    const nhl94 = open('nhl94.bin')
    const { project, notes } = importTeam(nhl95, nhl94, BOSTON, BOSTON, { ...ALL_PARTS, names: false, roster: false, photos: false })
    expect(menuLogo(project, BOSTON)).toEqual(menuLogo(nhl94, BOSTON))
    expect(menuLogoPalette(project, BOSTON).slice(7)).toEqual(menuLogoPalette(nhl94, BOSTON).slice(7))
    expect(notes).toContain("Centre-ice logo left alone: the editor does not read NHL '95's.")
    expect(notes).toContain('Menu logo brought in.')
    expect(menuLogo(openRom(buildRom(project)), BOSTON)).toEqual(menuLogo(nhl94, BOSTON))
  })
})
