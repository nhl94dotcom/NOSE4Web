import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkProject } from '../src/core/check'
import { compareProjects } from '../src/core/compare'
import { banner, menuLogo, menuLogoPalette, menuPalette, rinkLogo, withRinkLogo } from '../src/core/graphics'
import { genesisScoreLogo, hasGenesisScoreLogos, withGenesisScoreLogosAdded } from '../src/core/genesisscorelogos'
import { teamPhotos } from '../src/core/photos'
import { openProjectFile, saveProjectFile } from '../src/core/projectfile'
import { buildRom, openRom, type RomProject } from '../src/core/rom'
import { tableRows, tablesFor } from '../src/core/tables'
import { teamDisplayName } from '../src/core/team'
import { snesBlockColours } from '../src/core/snesblockcolours'
import { snesPhotoPalette, snesTeamPhotos } from '../src/core/snesphotos'
import { snesCentreIce, snesLogo } from '../src/core/snespictures'
import { snesScoreLogo, snesScoreLogosSupported } from '../src/core/snesscorelogos'
import { alphabeticalOrder, shownTeamRatings, teamMovedTo, teamMoveRange, withTeamOrder } from '../src/core/teamorder'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { league30Rom?: string; otherRoms?: string[]; snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const GENESIS = path('nhl94.bin')
const open = (file: string) => openRom(new Uint8Array(readFileSync(file)))
const reopen = (project: RomProject) => openRom(buildRom(project))

// Everything the game keeps for one team, as the editor reads it.
function looks(project: RomProject, team: number) {
  const t = project.teams[team]
  return {
    name: teamDisplayName(t),
    players: t.players.map((player) => player.name).join(','),
    lines: t.lines.join('|'),
    palette: t.palette.join(),
    songs: t.songs?.join(),
    rinkLogo: Array.from(rinkLogo(project, team).pixels).join(''),
    menuLogo: Array.from(menuLogo(project, team).pixels).join(''),
    menuLogoColours: menuLogoPalette(project, team).join(),
    menuColours: menuPalette(project, team).join(),
    banners: (['menu', 'visitor', 'game'] as const).map((kind) => Array.from(banner(project, kind, team).pixels).join('')).join('/'),
    photos: teamPhotos(project, team).map((photo) => `${photo.slot}:${Array.from(photo.picture.pixels).join('')}`).join(','),
    rating: shownTeamRatings(project.bytes, project.teams.length)?.[team],
    scoreLogo: hasGenesisScoreLogos(project) ? JSON.stringify(genesisScoreLogo(project, team), (_, v) => (v instanceof Uint8Array ? Array.from(v).join('') : v)) : null,
  }
}

const pixels = (value: unknown) => JSON.stringify(value, (_, v) => (v instanceof Uint8Array ? Array.from(v).join('') : v))

// The same on the SNES.
function snesLooks(project: RomProject, team: number) {
  const t = project.teams[team]
  const count = project.teams.length
  const edits = project.snesPictures!
  return {
    name: teamDisplayName(t),
    players: t.players.map((player) => player.name).join(','),
    lines: t.lines.join('|'),
    palette: t.palette.join(),
    overall: t.shownOverall,
    placeName: t.placeName,
    songs: t.snesSongs?.join(),
    logo: pixels(snesLogo(project.bytes, count, edits, team)),
    centreIce: pixels(snesCentreIce(project.bytes, count, edits, team)),
    blockColours: snesBlockColours(project, team)?.join(),
    photos: pixels(snesTeamPhotos(project, team).map((photo) => photo.picture)),
    photoColours: snesPhotoPalette(project, team).join(),
    scoreLogo: snesScoreLogosSupported(project) ? pixels(snesScoreLogo(project, team)) : null,
  }
}

function expectMoved(before: RomProject, after: RomProject, order: number[]) {
  const of = before.game.platform === 'snes' ? snesLooks : looks
  order.forEach((was, n) => expect(of(after, n), `team ${n + 1}`).toEqual(of(before, was)))
  // The draws and the menu's teams name the same teams as before.
  const named = (project: RomProject) => project.settings.playoffDraws.map((draw) => draw.map((team) => teamDisplayName(project.teams[team])))
  expect(named(after)).toEqual(named(before))
  for (const item of before.game.menuTeamItems) {
    expect(teamDisplayName(after.teams[after.settings.menu[item].value])).toBe(teamDisplayName(before.teams[before.settings.menu[item].value]))
  }
}

describe.skipIf(!existsSync(GENESIS))('moving teams, Genesis', () => {
  it('moves every table the game keeps by team, and the ROM reopens so', () => {
    const project = open(GENESIS)
    const range = teamMoveRange(project)
    expect(range).toEqual({ league: 26 })
    const order = alphabeticalOrder(project, 26)
    expect(order.slice(26)).toEqual([26, 27])
    const moved = withTeamOrder(project, order)
    expect(moved.teams.slice(0, 26).map(teamDisplayName)).toEqual(project.teams.slice(0, 26).map(teamDisplayName).sort((a, b) => a.localeCompare(b)))
    expectMoved(project, moved, order)
    const again = reopen(moved)
    expectMoved(project, again, order)
    expect(checkProject(again).filter((f) => f.level === 'problem')).toEqual([])
    // Moved back, the ROM is as it was.
    const back = withTeamOrder(again, order.map((_, n) => order.indexOf(n)))
    expect(Array.from(buildRom(back)).join() === Array.from(buildRom(project)).join()).toBe(true)
  })

  it('takes replaced pictures, score logos and the season with their teams', () => {
    let project = open(GENESIS)
    project = withGenesisScoreLogosAdded(project)
    const picture = rinkLogo(project, 3)
    picture.pixels.fill(2)
    project = { ...project, graphics: withRinkLogo(project, 3, picture), leagueRules: { ...project.leagueRules, exempt: [3] } }
    project = { ...project, baseline: { name: 'S1', startedAt: '', teams: project.teams, settings: project.settings, rinkPalette: project.rinkPalette, freeAgents: [] } }
    const order = teamMovedTo(28, 3, 10)
    const moved = withTeamOrder(project, order)
    expect(order[10]).toBe(3)
    expect(moved.graphics.rinkLogos[10]).toBe(picture)
    expect(moved.leagueRules.exempt).toEqual([10])
    expect(moved.baseline!.teams[10]).toBe(project.teams[3])
    expect(moved.teamOrder).toEqual(order)
    expectMoved(project, reopen(moved), order)
    // Two moves add up.
    const twice = withTeamOrder(moved, teamMovedTo(28, 0, 25))
    expect(twice.teamOrder!.map((was) => teamDisplayName(project.teams[was]))).toEqual(twice.teams.map(teamDisplayName))
    // Compare pairs each team with itself, and says the teams moved.
    const differences = compareProjects(project, moved)
    expect(differences.find((d) => d.heading === 'In general')?.changes.join(' ')).toMatch(/moved/)
    expect(differences.filter((d) => d.heading !== 'In general' && d.heading !== 'Team order')).toEqual([])
  })

  it('moves any team, and refuses an order that is not one', () => {
    const project = open(GENESIS)
    const order = teamMovedTo(28, 27, 0)
    expectMoved(project, reopen(withTeamOrder(project, order)), order)
    expect(() => withTeamOrder(project, [0, 0, ...Array.from({ length: 26 }, (_, n) => n + 2)])).toThrow(/every team once/)
  })

  it('is kept in a project file, and opened over the ROM as it was', () => {
    const project = open(GENESIS)
    const order = alphabeticalOrder(project, 26)
    const moved = withTeamOrder(project, order)
    const text = saveProjectFile(moved, project, 'Moved')
    const { project: restored, notes } = openProjectFile(open(GENESIS), text)
    expect(notes).toEqual([])
    expectMoved(project, restored, order)
    expectMoved(project, reopen(restored), order)
  })

  it('lists teams by name in the spreadsheet files when asked, numbers kept', () => {
    const project = open(GENESIS)
    const players = tablesFor(project.game).find((table) => table.id === 'players')!
    const rows = tableRows(project, players, 'name')
    const names = rows.slice(1).map((row) => String(row[1]))
    expect(names).toEqual(names.slice().sort((a, b) => a.localeCompare(b)))
    expect(rows.length).toBe(players.rows(project).length)
    expect(rows[1][0]).toBe(1 + project.teams.findIndex((team) => teamDisplayName(team) === names[0]))
  })
})

const others = [local.league30Rom, ...(local.otherRoms ?? [])].filter((name): name is string => !!name && existsSync(path(name)))
describe.skipIf(others.length === 0)('moving teams in the ROMs on this computer', () => {
  // Numbered, so that no ROM's name appears in the test results.
  others.forEach((name, i) => {
    it(`ROM ${i + 1}: moves every team's tables, or says why not`, () => {
      const project = open(path(name))
      const range = teamMoveRange(project)
      if ('reason' in range) {
        expect(range.reason).toMatch(/\./)
        return
      }
      // The league's teams by name, and the last team moved to the front.
      const order = alphabeticalOrder(project, range.league)
      expectMoved(project, reopen(withTeamOrder(project, order)), order)
      const last = teamMovedTo(project.teams.length, project.teams.length - 1, 0)
      expectMoved(project, reopen(withTeamOrder(project, last)), last)
    })
  })
})

const snes = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
describe.skipIf(snes.length === 0)('moving teams, SNES', () => {
  // Numbered, so that no ROM's name appears in the test results.
  snes.forEach((name, i) => {
    it(`SNES ROM ${i + 1}: moves every team's tables, or says why not`, () => {
      const project = open(path(name))
      const range = teamMoveRange(project)
      if ('reason' in range) throw new Error(range.reason)
      const order = alphabeticalOrder(project, range.league)
      const moved = withTeamOrder(project, order)
      expectMoved(project, moved, order)
      const again = reopen(moved)
      expectMoved(project, again, order)
      const last = teamMovedTo(project.teams.length, project.teams.length - 1, 0)
      expectMoved(project, reopen(withTeamOrder(project, last)), last)
      // Moved back, the ROM is as it was.
      const back = withTeamOrder(again, order.map((_, n) => order.indexOf(n)))
      expect(Array.from(buildRom(back)).join() === Array.from(buildRom(project)).join()).toBe(true)
    })
  })
})
