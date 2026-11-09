import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SNES_COLORS } from '../src/core/color'
import { pictureToImage } from '../src/core/graphics'
import { buildRom, openRom, type RomProject } from '../src/core/rom'
import { currentSnesPicture, identifySnesPictureFile, importSnesPictureSet, snesPictureKinds, snesPictureSet } from '../src/core/snespictureset'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))

// The set as image files, as an export and an image editor would give them back.
const asFiles = (project: RomProject) =>
  snesPictureSet(project).map((entry) => ({ name: entry.name, rgba: pictureToImage(entry.picture, entry.palette, SNES_COLORS), width: entry.picture.width, height: entry.picture.height }))
const look = (project: RomProject, team: number, kind: 'logo' | 'centreIce' | 'scoreLogo') => {
  const p = currentSnesPicture(project, team, kind)!
  return Array.from(pictureToImage(p.picture, p.palette, SNES_COLORS))
}

it('reads the picture file names', () => {
  expect(identifySnesPictureFile('02_Boston_Bruins_logo.png')).toEqual({ team: 1, name: 'Boston_Bruins', kind: 'logo' })
  expect(identifySnesPictureFile('x/02_Boston_Bruins_score_logo.png')).toEqual({ team: 1, name: 'Boston_Bruins', kind: 'scoreLogo' })
  expect(identifySnesPictureFile('12_Montreal_Canadiens_centre_ice.png')?.kind).toBe('centreIce')
  expect(identifySnesPictureFile('03_logo.png')).toEqual({ team: 2, name: '', kind: 'logo' })
  expect(identifySnesPictureFile('03_Buffalo_menu_banner.png')).toBe(null)
})

describe.skipIf(!existsSync(path('NHL94.smc')))('SNES picture files', () => {
  it('exports every team logo and centre ice logo, and an unchanged set changes nothing', () => {
    const project = open('NHL94.smc')
    expect(snesPictureKinds(project)).toEqual(['logo', 'centreIce'])
    const files = asFiles(project)
    expect(files.filter((f) => f.name.endsWith('_logo.png')).length).toBe(project.teams.length)
    expect(files.filter((f) => f.name.endsWith('_centre_ice.png')).length).toBeGreaterThan(0)
    const result = importSnesPictureSet(project, files)
    expect(result.problems).toEqual([])
    expect(result.replaced).toEqual([])
    expect(result.unchanged).toBe(files.length)
  })

  it("replaces only the pictures changed, by number or by team name, and they're in the ROM", () => {
    const project = open('NHL94.smc')
    const files = asFiles(project)
    const logo = files.find((f) => f.name.startsWith('02_') && f.name.endsWith('_logo.png'))!
    const ice = files.find((f) => f.name.startsWith('12_') && f.name.endsWith('_centre_ice.png'))!
    // Boston's logo and Montreal's centre ice logo, each with one pixel painted in another of its colours.
    const edit = (file: typeof logo) => {
      const rgba = new Uint8ClampedArray(file.rgba)
      const solid = [...Array(file.width * file.height).keys()].find((i) => rgba[i * 4 + 3] === 255)!
      const other = [...Array(file.width * file.height).keys()].find((i) => rgba[i * 4 + 3] === 255 && rgba.slice(i * 4, i * 4 + 3).some((v, k) => v !== rgba[solid * 4 + k]))!
      rgba.set(rgba.slice(other * 4, other * 4 + 4), solid * 4)
      return { ...file, rgba }
    }
    const changed = files.map((f) => (f === logo ? edit(f) : f === ice ? edit(f) : f))
    const result = importSnesPictureSet(project, changed)
    expect(result.problems).toEqual([])
    expect(result.replaced).toEqual([expect.stringMatching(/: Team logo$/), expect.stringMatching(/: Centre ice logo$/)])
    expect(result.unchanged).toBe(files.length - 2)
    const reopened = openRom(buildRom(result.project))
    expect(look(reopened, 1, 'logo')).toEqual(Array.from(changed.find((f) => f.name === logo.name)!.rgba))
    expect(look(reopened, 11, 'centreIce')).not.toEqual(look(project, 11, 'centreIce'))
    expect(look(reopened, 4, 'logo')).toEqual(look(project, 4, 'logo'))
    // By name: the same file, numbered for another team, still goes to Boston.
    const moved = { ...changed.find((f) => f.name === logo.name)!, name: logo.name.replace(/^02_/, '05_') }
    const byName = importSnesPictureSet(project, [moved], { byName: true })
    expect(byName.replaced).toEqual([expect.stringContaining('Team logo')])
    expect(look(byName.project, 1, 'logo')).toEqual(look(result.project, 1, 'logo'))
    expect(look(byName.project, 4, 'logo')).toEqual(look(project, 4, 'logo'))
  })
})

describe.skipIf(!existsSync(path('nhl94_2026.sfc')))('SNES picture files with score logos', () => {
  it('holds the score logos too, and brings a changed one back', () => {
    const project = open('nhl94_2026.sfc')
    expect(snesPictureKinds(project)).toEqual(['logo', 'centreIce', 'scoreLogo'])
    const files = asFiles(project)
    const unchanged = importSnesPictureSet(project, files)
    expect(unchanged.problems).toEqual([])
    expect(unchanged.replaced).toEqual([])
    // Boston's score logo given Chicago's.
    const theirs = files.find((f) => f.name.startsWith('05_') && f.name.endsWith('_score_logo.png'))!
    const mine = files.find((f) => f.name.startsWith('02_') && f.name.endsWith('_score_logo.png'))!
    const result = importSnesPictureSet(project, [{ ...theirs, name: mine.name }])
    expect(result.problems).toEqual([])
    expect(result.replaced).toEqual([expect.stringContaining('Score logo')])
    const reopened = openRom(buildRom(result.project))
    expect(look(reopened, 4, 'scoreLogo')).toEqual(look(project, 4, 'scoreLogo'))
    expect(look(reopened, 1, 'scoreLogo')).not.toEqual(look(project, 1, 'scoreLogo'))
  })
})

describe.skipIf(!existsSync(path('NHL94.smc')))("copying an SNES team's colours and logos", () => {
  it('gives another team its logos and colours, and leaves the rest alone', async () => {
    const { importTeam } = await import('../src/core/importteam')
    const { snesBlockColours } = await import('../src/core/snesblockcolours')
    const project = open('NHL94.smc')
    const result = importTeam(project, project, 1, 4, { names: false, roster: false, colours: true, pictures: true })
    expect(result.notes).toEqual(['Home and away colours brought in.', 'Its name banner colours brought in.', 'Team logo brought in.', expect.stringMatching(/^Centre ice logo.* brought in\.$/)])
    const reopened = openRom(buildRom(result.project))
    expect(look(reopened, 4, 'logo')).toEqual(look(project, 1, 'logo'))
    expect(look(reopened, 4, 'centreIce')).toEqual(look(project, 1, 'centreIce'))
    expect(reopened.teams[4].palette).toEqual(project.teams[1].palette)
    expect(snesBlockColours(reopened, 4)).toEqual(snesBlockColours(project, 1))
    for (const t of [0, 1, 2, 11]) {
      expect(look(reopened, t, 'logo'), `team ${t}`).toEqual(look(project, t, 'logo'))
      expect(look(reopened, t, 'centreIce'), `team ${t}`).toEqual(look(project, t, 'centreIce'))
    }
  })
})

describe.skipIf(!existsSync(path('NHL94_Classic.smc')) || !existsSync(path('nhl94_2026.sfc')))('an SNES team imported with its logos', () => {
  it('brings a Classic team logo and centre ice logo into the 32-team build looking as they did, and keeps its score logo', async () => {
    const { importTeam } = await import('../src/core/importteam')
    const classic = open('NHL94_Classic.smc')
    const build = open('nhl94_2026.sfc')
    const result = importTeam(build, classic, 4, 1, { names: false, roster: false, colours: false, pictures: true })
    expect(result.notes).toContain('Team logo brought in.')
    expect(result.notes).toContain('Score logo left alone: the other ROM has no score logos.')
    const reopened = openRom(buildRom(result.project))
    expect(look(reopened, 1, 'logo')).toEqual(look(classic, 4, 'logo'))
    expect(look(reopened, 1, 'centreIce')).toEqual(look(classic, 4, 'centreIce'))
    expect(look(reopened, 1, 'scoreLogo')).toEqual(look(build, 1, 'scoreLogo'))
    // And within the build, a score logo copied.
    const copied = importTeam(build, build, 4, 1, { names: false, roster: false, colours: false, pictures: true })
    expect(copied.notes).toContain('Score logo brought in.')
    const again = openRom(buildRom(copied.project))
    expect(look(again, 1, 'scoreLogo')).toEqual(look(build, 4, 'scoreLogo'))
    expect(look(again, 1, 'centreIce')).toEqual(look(build, 4, 'centreIce'))
    expect(look(again, 5, 'scoreLogo')).toEqual(look(build, 5, 'scoreLogo'))
  })
})
