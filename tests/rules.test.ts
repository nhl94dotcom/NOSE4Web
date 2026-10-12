import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkProject } from '../src/core/check'
import { formatCsv, parseCsv } from '../src/core/csv'
import { expandTeamSpace } from '../src/core/expand'
import { teamSummaries } from '../src/core/league'
import { checkLeagueRules, cleanLeagueRules, hasLeagueRules, NO_LEAGUE_RULES, type LeagueRules } from '../src/core/leaguerules'
import { openProjectFile, saveProjectFile } from '../src/core/projectfile'
import { buildRom, openRom, type RomProject } from '../src/core/rom'
import { CSV_TABLES, csvFileName, CsvImportError, importCsv, importCsvSet } from '../src/core/tables'
import { FREE_AGENTS, trade } from '../src/core/trade'

const romPath = fileURLToPath(new URL('../../nhl94.bin', import.meta.url))
const hasRom = existsSync(romPath)
const setup = () => openRom(new Uint8Array(readFileSync(romPath)))

const ANAHEIM = 0 // 18 players
const BOSTON = 1 // 25 players
const BUFFALO = 2
const FLORIDA = 8
const withRules = (project: RomProject, rules: Partial<LeagueRules>): RomProject => ({ ...project, leagueRules: { ...NO_LEAGUE_RULES, ...rules } })
const messages = (project: RomProject) => checkLeagueRules(project).map((f) => `${f.where}: ${f.message}`)

describe.skipIf(!hasRom)("a league's own rules", () => {
  it('has nothing to say until a rule is set', () => {
    const project = setup()
    expect(hasLeagueRules(project.leagueRules)).toBe(false)
    expect(checkLeagueRules(project)).toEqual([])
    expect(checkProject(project).filter((f) => f.level === 'rule')).toEqual([])
  })

  it('holds every team to limits on its size and make-up', () => {
    const project = withRules(setup(), { minPlayers: 20, maxPlayers: 24, maxGoalies: 2, minDefence: 8 })
    const found = messages(project)
    expect(found).toContain("Anaheim Mighty Ducks: Has 18 players; the league's rules ask for at least 20.")
    expect(found).toContain("Boston Bruins: Has 25 players; the league's rules allow at most 24.")
    expect(found.filter((m) => m.includes('goalies; the league'))).not.toHaveLength(0)
    expect(found).toContain("Anaheim Mighty Ducks: Has 7 defencemen; the league's rules ask for at least 8.")
    // They are their own kind of finding, counted with the problems but not called one.
    const all = checkProject(project)
    expect(all.filter((f) => f.level === 'rule')).toHaveLength(found.length)
    expect(all.filter((f) => f.level === 'problem')).toEqual([])
    expect(all.find((f) => f.level === 'rule')).toMatchObject({ team: expect.any(Number) })
  })

  it('caps ratings: one player, the first line, the skaters, and the lot added up', () => {
    const project = setup()
    const summary = teamSummaries(project)[BOSTON]
    const capped = withRules(project, { maxPlayerOverall: 92, maxFirstLine: 80, maxSkaterAverage: 60, maxTotalOverall: 1500 })
    const boston = messages(capped).filter((m) => m.startsWith('Boston Bruins:'))
    expect(boston).toContain("Boston Bruins: Adam Oates is rated 93 overall; the league's rules allow at most 92.")
    expect(boston).toContain(`Boston Bruins: The first line averages ${summary.startingSkaters!.toFixed(1)} overall; the league's rules allow at most 80.`)
    expect(boston).toContain(`Boston Bruins: The skaters average ${summary.skaters!.toFixed(1)} overall; the league's rules allow at most 60.`)
    expect(boston.some((m) => /The overall ratings add up to \d+; the league's rules allow at most 1500\./.test(m))).toBe(true)
    // A limit exactly met is kept.
    expect(messages(withRules(project, { maxPlayerOverall: 100 }))).toEqual([])
    expect(messages(withRules(project, { maxPlayerOverall: 99 })).every((m) => m.includes('Mario Lemieux is rated 100'))).toBe(true)
  })

  it('finds a player on two teams, and two players in one number', () => {
    let project = expandTeamSpace(setup())
    // The original game has its stars on the All Stars teams as well, and the
    // players its two new teams drafted still on the teams they came from.
    expect(messages(withRules(project, { uniquePlayers: true })).length).toBeGreaterThan(20)
    const allStars = [ANAHEIM, FLORIDA, 26, 27]
    expect(messages(withRules(project, { uniquePlayers: true, exempt: allStars }))).toEqual([])

    // A Boston player turns up on Buffalo too, typed a little differently.
    const copy = project.teams[BOSTON].players[5]
    const teams = project.teams.map((team, i) =>
      i === BUFFALO ? { ...team, players: team.players.map((p, j) => (j === 6 ? { ...copy, name: ` ${copy.name.toUpperCase()}` } : j === 7 ? { ...p, jersey: team.players[8].jersey } : p)) } : team,
    )
    project = { ...project, teams }
    const twice = messages(withRules(project, { uniquePlayers: true, exempt: allStars }))
    expect(twice).toHaveLength(1)
    expect(twice[0]).toMatch(/is on 2 teams: Boston Bruins, Buffalo Sabres\.$/)

    const numbers = messages(withRules(project, { uniqueJerseys: true, exempt: allStars })).filter((m) => m.startsWith('Buffalo'))
    expect(numbers).toHaveLength(1)
    expect(numbers[0]).toMatch(/ and .* both wear number \d\d\.$/)

    // A free agent who is also on a team is caught too.
    const released = trade(project, { team: BOSTON, picks: [9] }, { team: FREE_AGENTS, picks: [] })
    const back = { ...released, teams: project.teams }
    expect(messages(withRules(back, { uniquePlayers: true, exempt: allStars })).some((m) => m.startsWith('Free agents:') && m.includes('is a free agent and also on Boston Bruins'))).toBe(true)
  })

  it('leaves the teams it is told to leave out', () => {
    const project = withRules(setup(), { minPlayers: 20 })
    expect(messages(project).some((m) => m.startsWith('Anaheim'))).toBe(true)
    expect(messages(withRules(project, { minPlayers: 20, exempt: [ANAHEIM] })).some((m) => m.startsWith('Anaheim'))).toBe(false)
  })

  it('travels in a project file, and is not in the ROM', () => {
    const project = withRules(setup(), { maxPlayers: 24, uniqueJerseys: true, exempt: [26, 27] })
    expect(buildRom(project)).toEqual(buildRom(setup()))
    const opened = openProjectFile(setup(), saveProjectFile(project, setup(), 'x'))
    expect(opened.project.leagueRules).toEqual(project.leagueRules)
    // A file from before there were rules, or with nonsense in them, opens with none or with what is usable.
    const file = JSON.parse(saveProjectFile(project, setup(), 'x'))
    delete file.leagueRules
    expect(openProjectFile(setup(), JSON.stringify(file)).project.leagueRules).toEqual(NO_LEAGUE_RULES)
    expect(cleanLeagueRules({ maxPlayers: 'lots', minGoalies: -1, maxGoalies: 3, uniquePlayers: 'yes', exempt: [2, 2, 99, 'x'] }, 28)).toEqual({
      ...NO_LEAGUE_RULES,
      maxGoalies: 3,
      exempt: [2],
    })
  })
})

describe.skipIf(!hasRom)('free agents in the spreadsheet files', () => {
  const table = CSV_TABLES.find((t) => t.id === 'freeagents')!
  const pooled = () => {
    let project = expandTeamSpace(setup())
    project = trade(project, { team: BOSTON, picks: [4, 20] }, { team: FREE_AGENTS, picks: [] })
    return { ...project, freeAgents: [...project.freeAgents, { player: { name: 'Spare Goalie', jersey: 0x31, attributes: new Array<number>(14).fill(2) }, role: 'G' as const }] }
  }

  it('lists them with the players file\'s columns, and reads them back the same', () => {
    const project = pooled()
    const rows = table.rows(project)
    expect(rows[0].slice(0, 4)).toEqual(['Position', 'Name', 'Jersey', 'Overall'])
    expect(rows[0]).toHaveLength(4 + 14)
    expect(rows).toHaveLength(1 + 3)
    expect(rows.slice(1).map((row) => row[0])).toEqual(['F', 'D', 'G'])
    expect(rows[3].slice(1, 3)).toEqual(['Spare Goalie', 31])

    const empty = { ...project, freeAgents: [] }
    const result = importCsv(table, empty, formatCsv(rows))
    expect(result.project.freeAgents).toEqual(project.freeAgents)
    expect(result.summary).toBe('Set 3 free agents.')
    expect(result.project.teams).toBe(empty.teams)
  })

  it('is the whole list: a file replaces the free agents there were', () => {
    const project = pooled()
    const rows = table.rows(project).map((row) => row.map(String))
    const fewer = [rows[0], rows[3], ['d', 'New Prospect', '5', '', ...new Array<string>(14).fill('4')]]
    const result = importCsv(table, project, formatCsv(fewer))
    expect(result.project.freeAgents.map((a) => [a.role, a.player.name, a.player.jersey])).toEqual([
      ['G', 'Spare Goalie', 0x31],
      ['D', 'New Prospect', 0x05],
    ])
    // Headings alone empty the list.
    expect(importCsv(table, project, formatCsv([rows[0]])).project.freeAgents).toEqual([])
    expect(parseCsv(formatCsv([rows[0]]))).toHaveLength(1)
  })

  it('refuses rows it cannot use, saying which', () => {
    const project = pooled()
    const rows = table.rows(project).map((row) => row.map(String))
    const bad = [rows[0], ['X', 'Somebody', '12', '', ...new Array<string>(14).fill('4')], ['F', '', '100', '', ...new Array<string>(14).fill('16')]]
    let problems: string[] = []
    try {
      importCsv(table, project, formatCsv(bad))
    } catch (e) {
      problems = (e as CsvImportError).problems
    }
    expect(problems).toContain('Row 2: Position must be G, F or D, not "X".')
    expect(problems).toContain('Row 3: Name is empty.')
    expect(problems.some((p) => p.startsWith('Row 3: Jersey must be a whole number from 0 to 99'))).toBe(true)
    expect(problems.filter((p) => p.includes('must be a whole number from 0 to 15'))).toHaveLength(14)
  })

  it('goes out and comes back with the rest of a set', () => {
    const project = pooled()
    const files = CSV_TABLES.map((t) => ({ name: csvFileName('Season_10', t), text: formatCsv(t.rows(project)) }))
    expect(files.map((f) => f.name)).toContain('Season_10_freeagents.csv')
    const result = importCsvSet({ ...project, freeAgents: [] }, files)
    expect(result.project.freeAgents).toEqual(project.freeAgents)
    expect(result.project.teams.map((t) => t.players)).toEqual(project.teams.map((t) => t.players))
  })
})
