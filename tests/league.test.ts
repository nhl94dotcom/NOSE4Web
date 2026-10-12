import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkProject } from '../src/core/check'
import { compareProjects } from '../src/core/compare'
import { openRom, type RomProject } from '../src/core/rom'
import { addPlayer, transferPlayers } from '../src/core/roster'
import { CsvImportError, importWorkbookSheets, workbookSheets } from '../src/core/tables'
import { goalieCount } from '../src/core/team'
import { readWorkbook, writeWorkbook } from '../src/core/workbook'

const romPath = fileURLToPath(new URL('../../nhl94.bin', import.meta.url))
const hasRom = existsSync(romPath)
const original = hasRom ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()
const state = (p: RomProject) => ({ teams: p.teams, settings: p.settings, rinkPalette: p.rinkPalette })
const lineNames = (p: RomProject, team: number) =>
  p.teams[team].lines.map((line) => line.slice(0, 7).map((v) => p.teams[team].players[v - 1].name))

describe('Excel workbooks', () => {
  it('keeps text, numbers and awkward values through a real .xlsx file', async () => {
    const sheets = [
      { name: 'players', rows: [['Name', 'Jersey', 'Colour'], ['Myles O\'Connor', 5, '#00ff24'], ['# 19', 0, '']] },
      { name: 'Notes', rows: [['anything']] },
    ]
    const file = await writeWorkbook(sheets)
    expect(String.fromCharCode(file[0], file[1])).toBe('PK') // an .xlsx file is a zip archive
    expect(await readWorkbook(file)).toEqual([
      { name: 'players', rows: [['Name', 'Jersey', 'Colour'], ["Myles O'Connor", '5', '#00ff24'], ['# 19', '0', '']] },
      { name: 'Notes', rows: [['anything']] },
    ])
  })
})

describe.skipIf(!hasRom)('league tools on the NHL 94 ROM', () => {
  it('round-trips everything through an Excel workbook', async () => {
    const project = openRom(original)
    const sheets = workbookSheets(project)
    expect(sheets.map((s) => s.name)).toEqual(['teams', 'players', 'lines', 'playoffs', 'rules', 'clock', 'menu', 'rink'])
    const result = importWorkbookSheets(project, await readWorkbook(await writeWorkbook(sheets)))
    expect(state(result.project)).toEqual(state(project))
    expect(result.files).toHaveLength(8)
  })

  it('applies workbook edits in dependency order and ignores other sheets', async () => {
    const project = openRom(original)
    const edited = structuredClone(project)
    edited.teams[1].names[2] = 'Bears'
    edited.teams[1].players[5].name = 'New Guy'
    edited.settings.menu[2].value = 1
    const sheets = [...workbookSheets(edited).reverse(), { name: 'My notes', rows: [['x']] }]
    const result = importWorkbookSheets(project, await readWorkbook(await writeWorkbook(sheets)))
    expect(state(result.project)).toEqual(state(edited))
    expect(result.files.flatMap((f) => f.warnings)).toEqual([])
  })

  it('reports workbook problems by sheet and row, and changes nothing', async () => {
    const project = openRom(original)
    const sheets = workbookSheets(project)
    sheets[1].rows[3][sheets[1].rows[0].indexOf('Agl')] = 99
    const read = await readWorkbook(await writeWorkbook(sheets))
    expect(() => importWorkbookSheets(project, read)).toThrow('Sheet "players": Row 4: Agl must be a whole number from 0 to 15')
    expect(() => importWorkbookSheets(project, [{ name: 'Sheet1', rows: [['a']] }])).toThrow(CsvImportError)
  })

  it('finds nothing wrong with the original game', () => {
    const findings = checkProject(openRom(original))
    expect(findings.filter((f) => f.level === 'problem')).toEqual([])
    // The notes it does raise are about real quirks of the stock rosters.
    for (const finding of findings) expect(finding.message).toMatch(/share jersey number|no space in the name/)
  })

  it('finds the mistakes that break games', () => {
    const project = openRom(original)
    const boston = project.teams[1]
    const goalies = goalieCount(boston)
    boston.lines[2][3] = 1 // a goalie at left wing
    boston.lines[3][4] = 99 // nobody at centre
    boston.lines[4][5] = boston.lines[4][4] // the same player twice
    boston.lines[5][0] = 2 // the backup in goal
    boston.players[goalies].name = ''
    boston.players[goalies + 1].jersey = 0xa5
    boston.players[goalies + 2].attributes[3] = 12
    project.settings.playoffDraws[4][0] = 200
    project.settings.playoffDraws[6][1] = project.settings.playoffDraws[6][0]
    project.settings.menu[0].value = 40

    const messages = checkProject(project).map((f) => `${f.level} | ${f.where} | ${f.message}`)
    expect(messages).toEqual(
      expect.arrayContaining([
        'problem | Boston Bruins | Line Sc2 has a goalie in a skater\'s position.',
        'problem | Boston Bruins | Line Chk has a position with no valid player.',
        'note | Boston Bruins | Line PP1 uses the same player twice.',
        'note | Boston Bruins | Line PP2 does not have the first goalie in goal.',
        `problem | Boston Bruins | Player ${goalies + 1} has no name.`,
        `problem | Boston Bruins | ${boston.players[goalies + 1].name} has a jersey number that is not 00 to 99.`,
        `note | Boston Bruins | ${boston.players[goalies + 2].name} has OfA set to a value the game does not normally use.`,
        'problem | Playoff draw 5 | It names a team the ROM does not have.',
        'note | Playoff draw 7 | A team appears in it more than once.',
        'problem | Main menu | "Play Mode" starts on a choice that does not exist.',
      ]),
    )
    expect(checkProject(project).find((f) => f.where === 'Boston Bruins')?.team).toBe(1)

    boston.players[goalies + 3].name = 'x'.repeat(60)
    expect(checkProject(project)[0]).toMatchObject({ level: 'problem', where: 'Space' })
  })

  it('moves skaters between teams, keeping roles and lines', () => {
    const project = openRom(original)
    const [anaheim, boston] = project.teams
    const goalies = goalieCount(boston)
    const forward = goalies // Boston's first forward
    const defender = boston.players.length - 1
    const names = [boston.players[forward].name, boston.players[defender].name]

    const teams = transferPlayers(project.teams, 1, [defender, forward], 0)
    const [after, source] = teams
    expect(source.players).toHaveLength(boston.players.length - 2)
    expect(after.players).toHaveLength(anaheim.players.length + 2)
    expect(source.forwards).toBe(boston.forwards - 1)
    expect(source.defense).toBe(boston.defense - 1)
    expect(after.forwards).toBe(anaheim.forwards + 1)
    expect(after.defense).toBe(anaheim.defense + 1)
    // The forward joins the end of the forwards; the defenceman goes last.
    expect(after.players[goalieCount(after) + after.forwards - 1].name).toBe(names[0])
    expect(after.players.at(-1)!.name).toBe(names[1])
    // Anaheim's lines still name the same people.
    expect(lineNames({ ...project, teams }, 0)).toEqual(lineNames(project, 0))
    expect(teams[2]).toBe(project.teams[2])
    expect(checkProject({ ...project, teams }).filter((f) => f.level === 'problem')).toEqual([])

    expect(() => transferPlayers(project.teams, 1, [0], 0)).toThrow(/Goalies cannot be moved/)
    expect(() => transferPlayers(project.teams, 1, [forward], 1)).toThrow(/different team/)
    const full = project.teams.map((team, i) => (i === 1 ? addPlayer(team) : team)) // Boston at the limit
    expect(() => transferPlayers(full, 0, [5], 1)).toThrow(/more than 26 players/)
    const most = anaheim.players.map((_, i) => i).slice(goalieCount(anaheim), 16)
    expect(() => transferPlayers(project.teams, 0, most, 8)).toThrow(/at least 5 players/)
  })

  it('describes the differences between two ROMs', () => {
    const before = openRom(original)
    expect(compareProjects(before, openRom(original))).toEqual([])

    const after = structuredClone(before)
    const boston = after.teams[1]
    const goalies = goalieCount(boston)
    boston.names[3] = 'TD Garden'
    const renamed = boston.players[goalies].name
    boston.players[goalies].name = 'Renamed Guy'
    const tuned = boston.players[goalies + 1]
    tuned.jersey = 0x99
    tuned.attributes[2] += 1
    const removed = boston.players.pop()!
    boston.defense -= 1
    boston.lines = boston.lines.map((line) => line.map((v) => (v > boston.players.length ? boston.players.length : v)))
    boston.palette[3] = 0x0e0e
    after.settings.overtimeSeconds = 300
    after.settings.menu[2].value = 1
    after.settings.playoffDraws[2][0] = 0
    after.rinkPalette[0] = 0

    const differences = compareProjects(before, after)
    const section = (heading: string) => differences.find((d) => d.heading === heading)?.changes ?? []
    expect(differences.map((d) => d.heading)).toEqual(['Boston Bruins', 'Rink colours', 'Clock', 'Main menu', 'Playoff draws'])
    expect(section('Boston Bruins')).toEqual(
      expect.arrayContaining([
        `Stadium: "${before.teams[1].names[3]}" to "TD Garden".`,
        `${renamed} was renamed Renamed Guy.`,
        `${removed.name} was removed.`,
        '1 home colour changed.',
      ]),
    )
    expect(section('Boston Bruins').find((c) => c.startsWith(tuned.name))).toMatch(/number \d\d to 99; Spd .* to .*\.$/)
    expect(section('Clock')).toEqual(['Overtime: 600 to 300 seconds.'])
    expect(section('Main menu')).toEqual(['Team 1: Montreal Canadiens to Boston Bruins.'])
    expect(section('Playoff draws')).toEqual(['1 draw changed: 3.'])
  })
})
