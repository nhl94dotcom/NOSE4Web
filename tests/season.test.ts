import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { convertWeight, WEIGHT_BASES, weightBase } from '../src/core/attributes'
import { writeAscii } from '../src/core/bytes'
import { applyBulk, previewBulk, type BulkChange } from '../src/core/bulk'
import { checkProject } from '../src/core/check'
import { formatCsv } from '../src/core/csv'
import { expandTeamSpace } from '../src/core/expand'
import { banner, expandPictureSpace, menuLogo, pictureToImage, withBanner } from '../src/core/graphics'
import { ALL_PARTS, importTeam } from '../src/core/importteam'
import { currentPicture, importPictureSet, pictureFileName, pictureSet } from '../src/core/pictureset'
import { openProjectFile, saveProjectFile } from '../src/core/projectfile'
import { reportText } from '../src/core/report'
import { buildRom, openRom, type RomProject } from '../src/core/rom'
import { changeCount, changesSince, nextSeasonName, startSeason } from '../src/core/season'
import { CSV_TABLES, CsvImportError, importCsvSet, importWorkbookSheets } from '../src/core/tables'
import { FREE_AGENTS, trade } from '../src/core/trade'

const romPath = fileURLToPath(new URL('../../nhl94.bin', import.meta.url))
const hasRom = existsSync(romPath)
const stock = () => new Uint8Array(readFileSync(romPath))
const setup = () => openRom(stock())

const BOSTON = 1
const BUFFALO = 2
const MONTREAL = 11
// The same ROM with two teams' places in the list changed over.
const swapped = (project: RomProject, a: number, b: number): RomProject => {
  const teams = project.teams.map((team, i) => (i === a ? project.teams[b] : i === b ? project.teams[a] : team))
  return openRom(buildRom({ ...project, teams }))
}

describe('season names', () => {
  it('count up from the number a name ends in', () => {
    expect(nextSeasonName('Season_12')).toBe('Season_13')
    expect(nextSeasonName('CDL_Season_9')).toBe('CDL_Season_10')
    expect(nextSeasonName('League_S09')).toBe('League_S10')
    expect(nextSeasonName('My League')).toBe('My League_2')
    expect(nextSeasonName('')).toBe('Season_2')
  })
})

describe('weights between eras', () => {
  it('keeps a player as near as can be to the pounds he weighed', () => {
    expect(WEIGHT_BASES[0]).toBe(102)
    expect(WEIGHT_BASES[WEIGHT_BASES.length - 1]).toBe(152)
    expect(weightBase('weight')).toBe(140)
    expect(weightBase('weight:144')).toBe(144)
    expect(weightBase('rating')).toBeNull()
    // Bases eight apart are exact: one step of weight.
    expect(convertWeight(5, 140, 148)).toBe(4)
    expect(convertWeight(5, 148, 140)).toBe(6)
    expect(convertWeight(5, 140, 140)).toBe(5)
    // Otherwise the nearest, and never off the ends of the scale.
    expect(Math.abs(140 + 5 * 8 - (144 + convertWeight(5, 140, 144) * 8))).toBeLessThanOrEqual(4)
    expect(convertWeight(0, 102, 152)).toBe(0)
    expect(convertWeight(15, 152, 102)).toBe(15)
  })

  it.skipIf(!hasRom)('converts a roster in bulk, for weights only', () => {
    const project = setup()
    const change: BulkChange = { group: 'skaters', team: BOSTON, attribute: 0, action: 'fromBase', amount: 148, overallAtLeast: null, overallAtMost: null }
    const effects = previewBulk(project, change)
    expect(effects.length).toBeGreaterThan(10)
    expect(effects.every((e) => e.team === BOSTON && e.to === Math.min(15, e.from + 1))).toBe(true)
    const applied = applyBulk(project, change)
    expect(applied.teams[MONTREAL]).toBe(project.teams[MONTREAL])
    // Not a weight, so there is nothing to convert.
    expect(previewBulk(project, { ...change, attribute: 2 })).toEqual([])
  })

  it.skipIf(!hasRom)('converts weights when a team comes in from a ROM of another era', () => {
    const modern = (() => {
      const rom = stock()
      writeAscii(rom, 0x18a, ' -0X') // set up for a base weight of 148
      return openRom(rom)
    })()
    const project = setup()
    const result = importTeam(project, modern, MONTREAL, BOSTON, ALL_PARTS)
    const [got, was] = [result.project.teams[BOSTON].players, modern.teams[MONTREAL].players]
    expect(got.map((p) => p.attributes[0])).toEqual(was.map((p) => Math.min(15, p.attributes[0] + 1)))
    expect(got.map((p) => p.attributes.slice(1))).toEqual(was.map((p) => p.attributes.slice(1)))
    expect(result.notes.join(' ')).toContain("The other ROM's weights start at 148 pounds and this one's at 140.")
    expect(result.notes.join(' ')).not.toContain('different scales')
    // Between ROMs of one era nothing is touched.
    expect(importTeam(project, setup(), MONTREAL, BOSTON, ALL_PARTS).notes.join(' ')).not.toContain('pounds')
  })
})

describe.skipIf(!hasRom)('matching teams by name', () => {
  const asFiles = (project: RomProject) =>
    pictureSet(project).map((entry) => ({ name: entry.name, rgba: pictureToImage(entry.picture, entry.palette), width: entry.picture.width, height: entry.picture.height }))

  it('puts pictures on the team named in each file, wherever it is in the list', () => {
    const source = expandPictureSpace(setup())
    const target = expandPictureSpace(swapped(setup(), BOSTON, MONTREAL))
    const files = asFiles(source).filter((f) => /^(02|12)_/.test(f.name))
    expect(files).toHaveLength(8)

    // By number, Boston's pictures land on the team now in Boston's place.
    const byNumber = importPictureSet(target, files)
    expect(byNumber.replaced.length).toBeGreaterThan(0)
    expect(menuLogo(byNumber.project, BOSTON)).toEqual(menuLogo(source, BOSTON))
    // By name, they follow Boston to where Boston now is. (Changing two
    // teams' places moves their rosters, not the pictures kept for each place.)
    const byName = importPictureSet(target, files, { byName: true })
    expect(byName.problems).toEqual([])
    expect(byName.replaced).toHaveLength(8)
    const look = (project: RomProject, team: number) => {
      const { picture, palette } = currentPicture(project, team, 'menuLogo')
      return pictureToImage(picture, palette)
    }
    expect(look(byName.project, MONTREAL)).toEqual(look(source, BOSTON))
    expect(look(byName.project, BOSTON)).toEqual(look(source, MONTREAL))
  })

  it('leaves out a picture whose team is not in the ROM', () => {
    const project = setup()
    const logo = menuLogo(project, BOSTON)
    const image = { rgba: pictureToImage(logo, new Array<number>(16).fill(0x0eee)), width: 48, height: 48 }
    const result = importPictureSet(project, [{ name: '02_Springfield_Atoms_menu_logo.png', ...image }, { name: '05_menu_logo.png', ...image }], { byName: true })
    expect(result.replaced).toEqual([])
    expect(result.problems).toEqual([
      '02_Springfield_Atoms_menu_logo.png: this ROM has no team called Springfield Atoms.',
      '05_menu_logo.png: this ROM has no team called (no name).',
    ])
    // The name written in a file is the team's name with anything but letters and digits as underscores.
    expect(pictureFileName(project, 20, 'menuLogo')).toBe('21_St_Louis_Blues_menu_logo.png')
    const blues = importPictureSet(project, [{ name: '03_St_Louis_Blues_menu_logo.png', ...image }], { byName: true })
    expect(blues.replaced).toEqual(['St. Louis Blues: Menu logo'])
  })

  it('opens a project over a ROM that lists the teams in another order', () => {
    let project = expandPictureSpace(expandTeamSpace(setup()))
    const flat = { width: 88, height: 16, pixels: new Uint8Array(88 * 16).fill(5) }
    project = { ...project, graphics: withBanner(project, 'game', BOSTON, flat) }
    project = {
      ...project,
      teams: project.teams.map((team, i) => (i === BOSTON ? { ...team, players: team.players.map((p, j) => (j === 3 ? { ...p, name: 'Edited Bruin' } : p)) } : team)),
      settings: { ...project.settings, playoffDraws: project.settings.playoffDraws.map((draw, d) => (d === 0 ? [BOSTON, ...draw.slice(1)] : draw)) },
      leagueRules: { ...project.leagueRules, maxPlayers: 24, exempt: [BOSTON] },
    }
    const text = saveProjectFile(project, setup(), 'x')
    const other = swapped(setup(), BOSTON, MONTREAL)

    // In order, Boston's roster lands on the team in Boston's old place, renaming it.
    const inOrder = openProjectFile(other, text).project
    expect(inOrder.teams[BOSTON].players[3].name).toBe('Edited Bruin')
    // By name, everything about Boston follows Boston.
    const byName = openProjectFile(other, text, { byName: true }).project
    expect(byName.teams[MONTREAL].names).toEqual(project.teams[BOSTON].names)
    expect(byName.teams[MONTREAL].players[3].name).toBe('Edited Bruin')
    expect(byName.teams[BOSTON].players).toEqual(project.teams[MONTREAL].players)
    expect(banner(byName, 'game', MONTREAL)).toEqual(flat)
    expect(byName.settings.playoffDraws[0][0]).toBe(MONTREAL)
    expect(byName.leagueRules.exempt).toEqual([MONTREAL])
    expect(() => buildRom(byName)).not.toThrow()
  })

  it('opens nothing by name if a team in the project has no team of its name in the ROM', () => {
    const project = setup()
    const renamed = { ...project, teams: project.teams.map((team, i) => (i === BUFFALO ? { ...team, names: ['Springfield', 'SPR', 'Atoms', 'The Dome'] } : team)) }
    const text = saveProjectFile(renamed, project, 'x')
    expect(() => openProjectFile(project, text, { byName: true })).toThrow('Matching by name, the ROM has no team of its own for: Springfield Atoms.')
    expect(openProjectFile(project, text).project.teams[BUFFALO].names[0]).toBe('Springfield')
  })
})

describe.skipIf(!hasRom)('a season and its changes', () => {
  it('lists nothing until something is changed, then everything since the ROM was opened', () => {
    const opened = setup()
    expect(changeCount(changesSince(opened, opened))).toBe(0)
    const project = expandTeamSpace(opened)
    const traded = trade(project, { team: BOSTON, picks: [5] }, { team: MONTREAL, picks: [7] })
    const report = changesSince(traded, opened)
    expect(report.moves).toHaveLength(2)
    expect(changeCount(report)).toBeGreaterThan(2)
    // Undoing the change empties the list again: it is worked out from where things stand.
    expect(changeCount(changesSince(project, opened))).toBe(0)
  })

  it('says a released player is a free agent, and a signed one was', () => {
    const opened = expandTeamSpace(setup())
    const name = opened.teams[BOSTON].players[9].name
    const released = trade(opened, { team: BOSTON, picks: [9] }, { team: FREE_AGENTS, picks: [] })
    const out = changesSince(released, opened)
    expect(out.departures).toEqual([expect.objectContaining({ name, freeAgent: true })])
    expect(reportText(out, 'a', 'b')).toContain(`${name}: was with Boston Bruins`)
    expect(reportText(out, 'a', 'b')).toContain(', now a free agent')

    const signed = trade(released, { team: FREE_AGENTS, picks: [0] }, { team: MONTREAL, picks: [] })
    const back = changesSince(signed, released)
    expect(back.arrivals).toEqual([expect.objectContaining({ name, team: 'Montreal Canadiens', freeAgent: true })])
    expect(reportText(back, 'a', 'b')).toContain('signed from the free agents')
  })

  it('counts changes from the start of a season once one is started', () => {
    const opened = expandTeamSpace(setup())
    const edited = trade(opened, { team: BOSTON, picks: [5] }, { team: FREE_AGENTS, picks: [] })
    const season = startSeason(edited, 'Season_13', { clearFreeAgents: false }, new Date('2026-10-12T12:00:00Z'))
    expect(season.baseline).toMatchObject({ name: 'Season_13', startedAt: '2026-10-12T12:00:00.000Z' })
    expect(season.freeAgents).toHaveLength(1)
    expect(changeCount(changesSince(season, season.baseline!))).toBe(0)
    // What was done before the season began is still a change since the ROM was opened.
    expect(changeCount(changesSince(season, opened))).toBeGreaterThan(0)

    const later = trade(season, { team: MONTREAL, picks: [6] }, { team: BUFFALO, picks: [] })
    const report = changesSince(later, later.baseline!)
    expect(report.moves.map((m) => [m.from, m.to])).toEqual([['Montreal Canadiens', 'Buffalo Sabres']])
    // Letting the free agents go empties them at the start, so they are not a change afterwards.
    const cleared = startSeason(edited, 'Season_13', { clearFreeAgents: true })
    expect(cleared.freeAgents).toEqual([])
    expect(cleared.baseline!.freeAgents).toEqual([])
    // None of it is in the ROM.
    expect(buildRom(season)).toEqual(buildRom(edited))
  })

  it('carries the starting point in a project file', () => {
    const opened = setup()
    const season = startSeason(expandTeamSpace(opened), 'Season_13', { clearFreeAgents: false })
    const later = trade(season, { team: MONTREAL, picks: [6] }, { team: BUFFALO, picks: [] })
    const reopened = openProjectFile(setup(), saveProjectFile(later, opened, 'Season_13')).project
    expect(reopened.baseline?.name).toBe('Season_13')
    expect(reopened.baseline?.teams.map((t) => t.players)).toEqual(season.teams.map((t) => t.players))
    expect(changesSince(reopened, reopened.baseline!).moves).toHaveLength(1)
    // A file from before there were seasons opens with none.
    const file = JSON.parse(saveProjectFile(later, opened, 'x'))
    delete file.baseline
    expect(openProjectFile(setup(), JSON.stringify(file)).project.baseline).toBeNull()
  })
})

describe.skipIf(!hasRom)('strips that are hard to tell apart', () => {
  const strips = (project: RomProject) => checkProject(project).filter((f) => f.message.includes('strip'))
  const dressed = (project: RomProject, team: number, change: (palette: number[]) => number[]): RomProject => ({
    ...project,
    teams: project.teams.map((t, i) => (i === team ? { ...t, palette: change(t.palette) } : t)),
  })

  it('finds none in the original game', () => {
    expect(strips(setup())).toEqual([])
  })

  it('notes a home strip that looks like a visitor\'s away strip', () => {
    const project = setup()
    // Buffalo's away strip is dressed as Boston's home strip.
    const home = project.teams[BOSTON].palette.slice(0, 16)
    const clash = dressed(project, BUFFALO, (palette) => [...palette.slice(0, 16), ...home])
    const found = strips(clash)
    const boston = found.filter((f) => f.team === BOSTON)
    expect(boston).toHaveLength(1)
    expect(boston[0]).toMatchObject({ level: 'note' })
    expect(boston[0].message).toBe('The home strip looks much like the away strip of Buffalo Sabres. When they visit, the two teams will be hard to tell apart.')
    // Any other team it finds is one whose home strip is like Boston's.
    expect(found.every((f) => f.message.includes('Buffalo Sabres'))).toBe(true)
    // The same jersey with different pants is told apart.
    const pants = dressed(clash, BUFFALO, (palette) => palette.map((word, i) => ([16 + 3, 16 + 4, 16 + 5].includes(i) ? 0x00e0 : word)))
    expect(strips(pants)).toEqual([])
  })

  it('notes a strip that vanishes against the ice', () => {
    const project = setup()
    const ice = project.teams[BOSTON].palette[0]
    const ghost = dressed(project, BOSTON, (palette) => palette.map((word, i) => (i > 0 && i < 16 ? ice : word)))
    const found = strips(ghost).filter((f) => f.message.includes('ice'))
    expect(found).toHaveLength(1)
    expect(found[0].message).toBe('The home strip is close to the colour of the ice all over, so the players will be hard to see.')
    // White jerseys with dark pants, as most away strips are, show up fine.
    const white = dressed(project, BOSTON, (palette) => palette.map((word, i) => ([11, 12, 13].includes(i) ? 0x0eee : [3, 4, 5].includes(i) ? 0x0000 : word)))
    expect(strips(white).filter((f) => f.message.includes('ice'))).toEqual([])
  })
})

describe.skipIf(!hasRom)('matching spreadsheet rows to teams by name', () => {
  const table = (id: string) => CSV_TABLES.find((t) => t.id === id)!
  const file = (id: string, project: RomProject, edit: (rows: string[][]) => string[][] = (rows) => rows) => ({
    name: `S_${id}.csv`,
    text: formatCsv(edit(table(id).rows(project).map((row) => row.map(String)))),
  })
  const players = (project: RomProject, team: number) => project.teams[team].players.map((p) => p.name)

  it('puts each team\'s rows on the team of that name, wherever it is in the list', () => {
    const source = setup()
    const target = swapped(setup(), BOSTON, MONTREAL) // Boston is now twelfth and Montreal second
    const edited = { ...source, teams: source.teams.map((team, i) => (i === BOSTON ? { ...team, players: team.players.map((p, j) => (j === 4 ? { ...p, name: 'Edited Bruin' } : p)) } : team)) }
    const files = [file('players', edited), file('lines', edited)]

    // By number, Boston's rows land on the team in Boston's old place, which is Montreal.
    const byNumber = importCsvSet(target, files).project
    expect(players(byNumber, BOSTON)).toContain('Edited Bruin')
    expect(byNumber.teams[BOSTON].names[0]).toBe('Montreal')
    // By name they follow Boston, and everyone else is as they were.
    const byName = importCsvSet(target, files, { byName: true }).project
    expect(byName.teams[MONTREAL].names[0]).toBe('Boston')
    expect(players(byName, MONTREAL)).toEqual(players(edited, BOSTON))
    expect(players(byName, BOSTON)).toEqual(players(source, MONTREAL))
    expect(byName.teams[MONTREAL].lines.map((l) => l.slice(0, 7))).toEqual(edited.teams[BOSTON].lines.map((l) => l.slice(0, 7)))
    expect(openRom(buildRom(byName)).teams.map((t) => t.players)).toEqual(byName.teams.map((t) => t.players))
  })

  it('matches the teams table by location and name, and a workbook the same way', () => {
    const source = setup()
    const target = swapped(setup(), BOSTON, MONTREAL)
    const recoloured = { ...source, teams: source.teams.map((team, i) => (i === BOSTON ? { ...team, palette: team.palette.map((w, c) => (c === 2 ? 0x0e00 : w)) } : team)) }
    const byName = importCsvSet(target, [file('teams', recoloured)], { byName: true }).project
    expect(byName.teams[MONTREAL].palette[2]).toBe(0x0e00)
    expect(byName.teams[BOSTON].palette).toEqual(source.teams[MONTREAL].palette)

    const sheets = [{ name: 'teams', rows: table('teams').rows(recoloured).map((row) => row.map(String)) }]
    expect(importWorkbookSheets(target, sheets, { byName: true }).project.teams[MONTREAL].palette[2]).toBe(0x0e00)
    expect(importWorkbookSheets(target, sheets).project.teams[BOSTON].palette[2]).toBe(0x0e00)
  })

  it('needs no team numbers at all, and takes names however they are capitalised', () => {
    const source = setup()
    const target = swapped(setup(), BOSTON, MONTREAL)
    const noNumbers = file('lines', source, (rows) => rows.map((row, r) => row.slice(1).map((cell, c) => (r > 0 && c === 0 ? cell.toUpperCase() : cell))))
    expect(noNumbers.text.split('\n')[0]).not.toContain('Team,')
    const byName = importCsvSet(target, [noNumbers], { byName: true }).project
    // Every team's lines as they were for that team, so nothing changes.
    expect(byName.teams.map((t) => t.lines)).toEqual(target.teams.map((t) => t.lines))
    // Without matching by name, a file with no team numbers cannot be used.
    expect(() => importCsvSet(target, [noNumbers])).toThrow(/no column named Team/)
  })

  it('imports nothing if a row names a team the ROM does not have, and says which rows', () => {
    const project = setup()
    const bad = file('players', project, (rows) => rows.map((row, r) => (r === 3 || r === 40 ? row.map((cell, c) => (c === 1 ? 'Springfield Atoms' : cell)) : row)))
    let problems: string[] = []
    try {
      importCsvSet(project, [file('teams', project), bad], { byName: true })
    } catch (e) {
      problems = (e as CsvImportError).problems
    }
    expect(problems).toEqual([
      'S_players.csv: Row 4: this ROM has no team called "Springfield Atoms".',
      'S_players.csv: Row 41: this ROM has no team called "Springfield Atoms".',
    ])
    // A table with no team name in it says what it needs.
    const noNames = file('lines', project, (rows) => rows.map((row) => [row[0], ...row.slice(2)]))
    expect(() => importCsvSet(project, [noNames], { byName: true })).toThrow('S_lines.csv: to match teams by name the file needs the column Team name.')
    // Tables that are not about one team each come in as ever.
    expect(importCsvSet(project, [file('rink', project), file('playoffs', project)], { byName: true }).files).toHaveLength(2)
  })
})
