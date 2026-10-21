import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { formatCsv, parseCsv, type Cell } from '../src/core/csv'
import { expandTeamSpace } from '../src/core/expand'
import { buildRom, openRom, type RomProject } from '../src/core/rom'
import { CSV_TABLES, csvFileName, CsvImportError, identifyCsvFile, importCsv, importCsvSet } from '../src/core/tables'
import { compareProjects } from '../src/core/compare'
import { resetTeamPart, teamPartChanged } from '../src/core/reset'
import { goalieCount } from '../src/core/team'
import { setTeamRating, teamRatingChoices, TEAM_RATINGS, teamRatings } from '../src/core/teamratings'

const romPath = fileURLToPath(new URL('../../nhl94.bin', import.meta.url))
const hasRom = existsSync(romPath)

describe('CSV text', () => {
  it('round-trips awkward cells', () => {
    const rows = [['Name', 'Note'], ["Myles O'Connor", 'said "hi", left'], [' padded ', 'two\nlines'], ['7', '']]
    expect(parseCsv(formatCsv(rows))).toEqual(rows)
  })

  it('reads semicolon-separated files and skips blank rows', () => {
    expect(parseCsv('Team;Name\r\n1;Boston\r\n;\r\n\r\n2;Buffalo')).toEqual([
      ['Team', 'Name'],
      ['1', 'Boston'],
      ['2', 'Buffalo'],
    ])
  })
})

describe.skipIf(!hasRom)('CSV tables', () => {
  const original = hasRom ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()
  const table = (id: string) => CSV_TABLES.find((t) => t.id === id)!
  const state = (p: RomProject) => ({ teams: p.teams, settings: p.settings, rinkPalette: p.rinkPalette })

  // Exports a table, lets the test edit the rows, and imports the result.
  function roundTrip(project: RomProject, id: string, edit: (rows: Cell[][]) => Cell[][] = (rows) => rows) {
    return importCsv(table(id), project, formatCsv(edit(table(id).rows(project))))
  }
  const column = (rows: Cell[][], heading: string) => rows[0].indexOf(heading)

  it.each(CSV_TABLES.map((t) => t.id))('%s: importing an unedited export changes nothing', (id) => {
    const project = openRom(original)
    const result = roundTrip(project, id)
    expect(state(result.project)).toEqual(state(project))
    expect(result.warnings).toEqual([])
  })

  it('exports one row per player', () => {
    const project = openRom(original)
    const rows = table('players').rows(project)
    expect(rows).toHaveLength(1 + project.teams.reduce((sum, team) => sum + team.players.length, 0))
    expect(rows[0].slice(0, 8)).toEqual(['Team', 'Team name', 'Order', 'Position', 'Name', 'Jersey', 'Overall', 'Wgt'])
    expect(rows[0]).toContain('ShP (G: PkC)')
    expect(rows[1].slice(0, 7)).toEqual([1, 'Anaheim Mighty Ducks', 1, 'G', 'Guy Hebert', 29, 44])
  })

  it('puts players in roster order however the file is sorted', () => {
    const project = openRom(original)
    const result = roundTrip(project, 'players', (rows) => [rows[0], ...rows.slice(1).reverse()])
    expect(result.project.teams).toEqual(project.teams)
  })

  it('applies player edits and keeps lines on the same people', () => {
    const project = openRom(original)
    const boston = project.teams[1]
    const goalies = goalieCount(boston)
    const lastForward = boston.players[goalies + boston.forwards - 1]
    const lineNames = (p: RomProject) =>
      p.teams[1].lines.map((line) => line.slice(0, 7).map((v) => p.teams[1].players[v - 1].name))

    const result = roundTrip(project, 'players', (rows) => {
      const row = rows.find((r) => r[column(rows, 'Team')] === 2 && r[column(rows, 'Name')] === lastForward.name)!
      row[column(rows, 'Position')] = 'd'
      row[column(rows, 'Jersey')] = 98
      row[column(rows, 'Wgt')] = 15
      return rows
    })
    const team = result.project.teams[1]
    expect(team.forwards).toBe(boston.forwards - 1)
    expect(team.defense).toBe(boston.defense + 1)
    const moved = team.players.find((p) => p.name === lastForward.name)!
    expect(moved).toMatchObject({ jersey: 0x98, attributes: [15, ...lastForward.attributes.slice(1)] })
    expect(lineNames(result.project)).toEqual(lineNames(project))
    expect(result.project.teams[2]).toEqual(project.teams[2]) // other teams come through unchanged
  })

  it('replaces only the teams in the file and warns about broken lines', () => {
    const project = openRom(original)
    const result = roundTrip(project, 'players', (rows) =>
      rows.filter((r, i) => i === 0 || (r[0] === 2 && r[column(rows, 'Order')] !== 3)),
    )
    expect(result.project.teams[1].players).toHaveLength(project.teams[1].players.length - 1)
    expect(result.project.teams[0]).toBe(project.teams[0])
    expect(result.summary).toBe('Replaced the rosters of 1 team (24 players).')
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatch(/^Boston Bruins: \d+ line slots? used players who are gone/)
  })

  it('rejects a file with bad rows and says which', () => {
    const project = openRom(original)
    let error: unknown
    try {
      roundTrip(project, 'players', (rows) => {
        rows[1][column(rows, 'Agl')] = 16
        rows[2][column(rows, 'Position')] = 'X'
        rows[3][column(rows, 'Name')] = 'Günther'
        return rows.filter((r, i) => i === 0 || r[0] !== 3 || r[column(rows, 'Position')] !== 'G')
      })
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(CsvImportError)
    expect((error as CsvImportError).problems).toEqual([
      'Row 2: Agl must be a whole number from 0 to 15, not "16".',
      'Row 3: Position must be G, F or D, not "X".',
      'Row 4: Name "Günther" has characters the game cannot show.',
      'Buffalo Sabres needs 1 to 4 goalies, not 0.',
    ])
    expect(() => importCsv(table('players'), project, 'Team,Name\r\n1,Bob')).toThrow(/no column named Position, Jersey/)
  })

  it('updates only the team columns that are present', () => {
    const project = openRom(original)
    const result = importCsv(table('teams'), project, 'Team,Name,Home 3,Stadium\r\n5,Blackhawks,#ff0000,\r\n')
    const team = result.project.teams[4]
    expect(team.names).toEqual(['Chicago', 'CHI', 'Blackhawks', project.teams[4].names[3]])
    expect(team.palette[2]).toBe(0x000e)
    expect(team.palette[3]).toBe(project.teams[4].palette[3])
    expect(() => importCsv(table('teams'), project, 'Team,Home 1\r\n5,red')).toThrow(/Home 1 must look like #1a2b3c/)
  })

  it('gives the six team ratings by name, and still takes the bytes that hold them', () => {
    const project = openRom(original)
    const rows = table('teams').rows(project)
    const ratings = ['Offence rating', 'Defence rating', 'Penalty kill cost', 'Power play bonus', 'Home rating', 'Away rating'].map((name) => column(rows, name))
    // Anaheim, the weakest; Detroit; and the All Stars, as the original game has them.
    expect(ratings.map((c) => rows[1][c])).toEqual([0, 7, 0, 2, 1, 3])
    expect(ratings.map((c) => rows[7][c])).toEqual([7, 3, 2, 1, 0, 0])
    expect(ratings.map((c) => rows[27][c])).toEqual([7, 7, 2, 0, 0, 0])
    expect(teamRatings(project.teams[0])).toEqual([0, 7, 0, 2, 1, 3])

    const named = importCsv(table('teams'), project, 'Team,Offence rating,Away rating\r\n1,5,\r\n2,,0\r\n')
    expect(named.project.teams[0].teamBytes).toEqual([0x57, 0x02, 0x13])
    expect(named.project.teams[1].teamBytes).toEqual([0x41, 0x21, 0x20])
    expect(compareProjects(project, named.project).flatMap((difference) => difference.changes).join(' ')).toContain('Offence rating: 0 to 5.')
    const bytes = importCsv(table('teams'), project, 'Team,Team byte 1,Penalty kill rating\r\n1,52,0\r\n')
    expect(bytes.project.teams[0].teamBytes).toEqual([0x34, 0x00, 0x13])
    // Files from before the power play and penalty kill were named as the game reads them still go to the same halves.
    const old = importCsv(table('teams'), project, 'Team,Power play rating,Penalty kill rating\r\n1,1,0\r\n')
    expect(old.project.teams[0].teamBytes[1]).toBe(0x10)
    const renamed = importCsv(table('teams'), project, 'Team,Penalty kill cost,Power play bonus\r\n1,1,0\r\n')
    expect(renamed.project.teams[0].teamBytes[1]).toBe(0x10)
    // Anaheim, meant to be weakest at both, plays with the best of both: Penalty kill 0 and Power play 2.
    expect(TEAM_RATINGS.map((rating) => rating.label).slice(2, 4)).toEqual(['Penalty kill', 'Power play'])
    expect(teamRatings(project.teams[0]).slice(2, 4)).toEqual([0, 2])
    expect(() => importCsv(table('teams'), project, 'Team,Home rating\r\n1,16')).toThrow(/Home rating/)

    const set = setTeamRating(project.teams[0], 3, 1)
    expect(set.teamBytes).toEqual([0x07, 0x01, 0x13])
    expect(teamRatingChoices(5, 3)).toEqual([0, 1, 2, 3])
    expect(teamRatingChoices(4, 3)).toEqual([0, 1, 2, 3])
    expect(teamRatingChoices(2, 1)).toEqual([0, 1, 2])
    expect(teamPartChanged(set, project.teams[0], 'ratings')).toBe(true)
    expect(resetTeamPart(set, project.teams[0], 'ratings')).toEqual(project.teams[0])
  })

  it('reads lines by player name or roster position', () => {
    const project = openRom(original)
    const anaheim = project.teams[0]
    const result = roundTrip(project, 'lines', (rows) => {
      const row = rows.find((r) => r[0] === 1 && r[2] === 'Sc1')!
      row[column(rows, 'C')] = anaheim.players[5].name.toUpperCase()
      row[column(rows, 'LW')] = '#7'
      return rows
    })
    expect(result.project.teams[0].lines[1][4]).toBe(6)
    expect(result.project.teams[0].lines[1][3]).toBe(7)
    expect(() => roundTrip(project, 'lines', (rows) => (rows[1][3] = 'Nobody', rows))).toThrow(/no player named "Nobody"/)
  })

  it('reads settings by name or number', () => {
    const project = openRom(original)
    let next = roundTrip(project, 'playoffs', (rows) => ((rows[1][1] = 'new york rangers'), (rows[1][2] = 1), rows)).project
    expect(next.settings.playoffDraws[0].slice(0, 2)).toEqual([14, 0])
    next = importCsv(table('menu'), next, 'Item,Choice\r\nTeam 1,Boston Bruins\r\nPer. Length,3\r\n').project
    expect(next.settings.menu[2].value).toBe(1)
    expect(next.settings.menu[4].value).toBe(2)
    next = importCsv(table('clock'), next, 'Item,Seconds,Menu text\r\nPeriod length 1,180,3 Minutes\r\nOvertime,300,\r\n').project
    expect(next.settings.periodLengths[0]).toMatchObject({ seconds: 180, text: '3 Minutes' })
    expect(next.settings.overtimeSeconds).toBe(300)
    expect(() => importCsv(table('rules'), next, 'Rule,Message,Fade-out delay,Penalty minutes\r\n3,Icing called!,1,0')).toThrow(
      /longer than 6 characters/,
    )
  })

  it('covers every team in every per-team file', () => {
    const project = openRom(original)
    for (const id of ['teams', 'players', 'lines']) {
      const teamNumbers = new Set(table(id).rows(project).slice(1).map((row) => row[0]))
      expect(teamNumbers.size).toBe(28)
    }
    expect(table('rink').rows(project)).toHaveLength(33)
  })

  it('recognises the files of a set by name', () => {
    const players = table('players')
    expect(csvFileName('My_League_Season_10', players)).toBe('My_League_Season_10_players.csv')
    expect(identifyCsvFile('My_League_Season_10_players.csv')).toEqual({ table: players, setName: 'My_League_Season_10' })
    expect(identifyCsvFile('My_League_Season_10_PLAYERS (2).CSV')?.setName).toBe('My_League_Season_10')
    expect(identifyCsvFile('players.csv')).toEqual({ table: players, setName: '' })
    expect(identifyCsvFile('My_League_roster.csv')).toBeNull()
  })

  it('imports a whole set in one step, in the right order', () => {
    const season9 = openRom(original)
    // Season 10: a team is renamed, a player is added, and a line and a draw use the new names.
    const edited = structuredClone(season9)
    edited.teams[1].names[2] = 'Bears'
    edited.teams[1].players[5].name = 'New Guy'
    edited.settings.menu[2].value = 1
    edited.rinkPalette[3] = 0x0e00
    const files = CSV_TABLES.map((t) => ({ name: csvFileName('League_S10', t), text: formatCsv(t.rows(edited)) }))

    const result = importCsvSet(season9, files.slice().reverse())
    expect(result.setName).toBe('League_S10')
    expect(result.files.map((f) => f.table.id)).toEqual(CSV_TABLES.map((t) => t.id))
    expect(state(result.project)).toEqual(state(edited))
    expect(result.files.flatMap((f) => f.warnings)).toEqual([])
    // Without the lines file, the renamed player's line slots are flagged.
    const withoutLines = importCsvSet(season9, files.filter((f) => !f.name.endsWith('_lines.csv')))
    expect(withoutLines.files.flatMap((f) => f.warnings)).toHaveLength(1)
  })

  it('imports nothing from a set if one file is wrong', () => {
    const project = openRom(original)
    const good = { name: 'S10_teams.csv', text: 'Team,Name\r\n2,Bears\r\n' }
    const bad = { name: 'S10_rink.csv', text: 'Colour,Value\r\n40,#000000\r\n' }
    expect(() => importCsvSet(project, [good, bad])).toThrow('S10_rink.csv: Row 2: Colour must be a whole number from 1 to 32')
    expect(() => importCsvSet(project, [good, { name: 'notes.csv', text: 'a,b' }])).toThrow(/notes.csv: the file name must end in/)
    expect(() => importCsvSet(project, [good, { ...good, name: 'S9_teams.csv' }])).toThrow(/More than one Teams file/)
    expect(importCsvSet(project, [good, { name: 'S9_rink.csv', text: 'Colour,Value\r\n1,#000000\r\n' }]).setName).toBe('')
  })

  it('produces a ROM that keeps a full set of imports', () => {
    let project = expandTeamSpace(openRom(original))
    project = roundTrip(project, 'players', (rows) => {
      for (const row of rows.slice(1, 40)) row[column(rows, 'Name')] = `${row[column(rows, 'Name')]} II`
      return rows
    }).project
    for (const id of ['teams', 'lines', 'playoffs', 'rules', 'clock', 'menu']) project = roundTrip(project, id).project
    const reopened = openRom(buildRom(project))
    expect(reopened.teams.map((t) => t.players)).toEqual(project.teams.map((t) => t.players))
    expect(reopened.teams.map((t) => t.lines)).toEqual(project.teams.map((t) => t.lines))
    expect(reopened.settings).toEqual(project.settings)
  })
})
