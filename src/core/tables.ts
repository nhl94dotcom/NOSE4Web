import { cssHex, keepIfSameColor, nearestColorWord } from './color'
import { parseCsv, type Cell } from './csv'
import { overallRating } from './rating'
import type { RomProject } from './rom'
import { MAX_ROSTER, MIN_ROSTER, withSkaterCounts } from './roster'
import { MAX_SECONDS, menuOptions } from './settings'
import { goalieCount, teamDisplayName, type Player, type Team } from './team'

// Each table is one CSV file: a view of part of the ROM that can be exported,
// edited in a spreadsheet and imported again. An import changes nothing unless
// every row is valid.

export interface ImportResult {
  project: RomProject
  summary: string
  warnings: string[]
}

export class CsvImportError extends Error {
  problems: string[]

  constructor(problems: string[]) {
    super(problems[0])
    this.problems = problems
  }
}

export interface CsvTable {
  id: string
  title: string
  description: string
  rows: (project: RomProject) => Cell[][]
  apply: (project: RomProject, sheet: Sheet) => ImportResult
}

const VALID_TEXT = /^[\x20-\x7d]*$/
const MAX_GOALIES = 4
const MAX_COUNT = 15
const LINE_SLOTS = 7
const LINES_WARNING = 'Check the lines.'

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

// The rows of an imported file, read by column heading. Problems are collected
// so the user sees all of them at once.
class Sheet {
  readonly rowCount: number
  private readonly columns = new Map<string, number>()
  private readonly data: string[][]
  private readonly problems: string[] = []

  constructor(rows: string[][]) {
    if (rows.length === 0) throw new CsvImportError(['The file is empty.'])
    rows[0].forEach((heading, i) => this.columns.set(heading.trim().toLowerCase(), i))
    this.data = rows.slice(1)
    this.rowCount = this.data.length
  }

  require(columns: string[]): void {
    const missing = columns.filter((column) => !this.has(column))
    if (missing.length > 0) throw new CsvImportError([`The file has no column named ${missing.join(', ')}.`])
  }

  has(column: string): boolean {
    return this.columns.has(column.toLowerCase())
  }

  text(row: number, column: string): string {
    const index = this.columns.get(column.toLowerCase())
    return index === undefined ? '' : (this.data[row][index] ?? '').trim()
  }

  // Row numbers match the spreadsheet, where the headings are row 1.
  problem(row: number, message: string): void {
    this.problems.push(`Row ${row + 2}: ${message}`)
  }

  note(message: string): void {
    this.problems.push(message)
  }

  int(row: number, column: string, min: number, max: number): number {
    const text = this.text(row, column)
    const value = Number(text)
    if (text === '' || !Number.isInteger(value) || value < min || value > max) {
      this.problem(row, `${column} must be a whole number from ${min} to ${max}, not "${text}".`)
      return min
    }
    return value
  }

  gameText(row: number, column: string, maxLength = Infinity): string {
    const text = this.text(row, column)
    if (!VALID_TEXT.test(text)) this.problem(row, `${column} "${text}" has characters the game cannot show.`)
    if (text.length > maxLength) this.problem(row, `${column} "${text}" is longer than ${maxLength} characters.`)
    return text
  }

  // Looks a cell up in a list of names, also accepting the name's number.
  choice(row: number, column: string, names: string[]): number {
    const text = this.text(row, column)
    let index = names.findIndex((name) => sameText(name, text))
    if (index < 0 && /^\d+$/.test(text)) index = Number(text) - 1
    if (index < 0 || index >= names.length) {
      this.problem(row, `${column} "${text}" is not one of the choices.`)
      return 0
    }
    return index
  }

  finish(): void {
    if (this.problems.length > 0) throw new CsvImportError(this.problems)
  }
}

export type { Sheet }

function replaceTeams(project: RomProject, changed: Map<number, Team>): RomProject {
  return { ...project, teams: project.teams.map((team, i) => changed.get(i) ?? team) }
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`

// How a choice is written in a file: by name, or by number when the name
// would not say which one is meant.
function choiceCell(names: string[], index: number): Cell {
  const name = names[index]
  return name !== undefined && names.filter((n) => sameText(n, name)).length === 1 ? name : index + 1
}

// ---------------------------------------------------------------- players

const jerseyToNumber = (jersey: number) => (jersey >> 4) * 10 + (jersey & 0x0f)
const numberToJersey = (number: number) => (Math.floor(number / 10) << 4) | number % 10

// Goalies reuse some attribute columns for other things, so those headings name both.
function attributeHeadings(project: RomProject): string[] {
  const { playerAttributeLabels, goalieAttributeLabels } = project.game
  return playerAttributeLabels.map((label, i) =>
    goalieAttributeLabels[i] === label ? label : `${label} (G: ${goalieAttributeLabels[i]})`,
  )
}

// Moves each line slot to wherever its player now sits on the roster.
function remapLines(old: Team, players: Player[]): { lines: number[][]; lost: number } {
  const used = new Set<number>()
  const find = (match: (candidate: Player) => boolean) => players.findIndex((p, i) => !used.has(i) && match(p))
  const moved = old.players.map((player) => {
    let index = find((p) => p.name === player.name && p.jersey === player.jersey)
    if (index < 0) index = find((p) => p.name === player.name)
    if (index >= 0) used.add(index)
    return index
  })

  let lost = 0
  const lines = old.lines.map((line) =>
    line.map((position, slot) => {
      if (slot >= LINE_SLOTS || position === 0 || position > old.players.length) return position
      if (moved[position - 1] >= 0) return moved[position - 1] + 1
      lost++
      return slot === 0 ? 1 : Math.min(position, players.length)
    }),
  )
  return { lines, lost }
}

const players: CsvTable = {
  id: 'players',
  title: 'Players',
  description:
    'Every player and goalie with jersey number and attributes. A team listed in the file has its whole roster replaced; teams left out are untouched.',

  rows(project) {
    const rows: Cell[][] = [
      ['Team', 'Team name', 'Order', 'Position', 'Name', 'Jersey', 'Overall', ...attributeHeadings(project)],
    ]
    project.teams.forEach((team, t) => {
      const goalies = goalieCount(team)
      team.players.forEach((player, i) => {
        const position = i < goalies ? 'G' : i - goalies < team.forwards ? 'F' : 'D'
        rows.push([
          t + 1,
          teamDisplayName(team),
          i + 1,
          position,
          player.name,
          jerseyToNumber(player.jersey),
          overallRating(player.attributes, i < goalies),
          ...player.attributes,
        ])
      })
    })
    return rows
  },

  apply(project, sheet) {
    const headings = attributeHeadings(project)
    sheet.require(['Team', 'Position', 'Name', 'Jersey', ...headings])

    interface Entry {
      group: number
      order: number
      player: Player
    }
    const byTeam = new Map<number, Entry[]>()
    for (let row = 0; row < sheet.rowCount; row++) {
      const team = sheet.int(row, 'Team', 1, project.teams.length) - 1
      const position = sheet.text(row, 'Position').toUpperCase()
      const group = position === '' ? -1 : 'GFD'.indexOf(position)
      if (group < 0) sheet.problem(row, `Position must be G, F or D, not "${position}".`)
      const order = Number(sheet.text(row, 'Order'))
      const player: Player = {
        name: sheet.gameText(row, 'Name'),
        jersey: numberToJersey(sheet.int(row, 'Jersey', 0, 99)),
        attributes: headings.map((heading) => sheet.int(row, heading, 0, 15)),
      }
      const entries = byTeam.get(team) ?? []
      // Rows with no usable Order keep the order they have in the file.
      entries.push({ group, order: sheet.text(row, 'Order') !== '' && Number.isFinite(order) ? order : Infinity, player })
      byTeam.set(team, entries)
    }

    const changed = new Map<number, Team>()
    const warnings: string[] = []
    let playerCount = 0
    for (const [index, entries] of byTeam) {
      const old = project.teams[index]
      const name = teamDisplayName(old)
      // The game needs goalies first, then forwards, then defence.
      const sorted = entries
        .map((entry, file) => ({ ...entry, file }))
        .sort((a, b) => a.group - b.group || a.order - b.order || a.file - b.file)
      const count = (group: number) => sorted.filter((entry) => entry.group === group).length
      const [goalies, forwards, defense] = [count(0), count(1), count(2)]

      if (goalies < 1 || goalies > MAX_GOALIES) sheet.note(`${name} needs 1 to ${MAX_GOALIES} goalies, not ${goalies}.`)
      if (forwards > MAX_COUNT) sheet.note(`${name} can have at most ${MAX_COUNT} forwards, not ${forwards}.`)
      if (defense > MAX_COUNT) sheet.note(`${name} can have at most ${MAX_COUNT} defence, not ${defense}.`)
      if (sorted.length < MIN_ROSTER || sorted.length > MAX_ROSTER) {
        sheet.note(`${name} needs ${MIN_ROSTER} to ${MAX_ROSTER} players, not ${sorted.length}.`)
      }

      const roster = sorted.map((entry) => entry.player)
      const { lines, lost } = remapLines(old, roster)
      if (lost > 0) warnings.push(`${name}: ${plural(lost, 'line slot')} used players who are gone. ${LINES_WARNING}`)
      // A goalie byte's meaning is not known beyond "not zero means a goalie".
      const goalieNibbles = old.goalieNibbles.map((value, i) => (i >= goalies ? 0 : value || 1))
      if (goalies > goalieCount(old)) warnings.push(`${name}: the goalie byte for each added goalie was set to 1.`)

      changed.set(index, { ...old, players: roster, lines, goalieNibbles, forwards, defense })
      playerCount += roster.length
    }
    sheet.finish()

    return {
      project: replaceTeams(project, changed),
      summary: `Replaced the rosters of ${plural(changed.size, 'team')} (${plural(playerCount, 'player')}).`,
      warnings,
    }
  },
}

// ------------------------------------------------------------------ teams

const NAME_COLUMNS = ['Location', 'Initials', 'Name', 'Stadium']
const GOALIE_BYTE_COLUMNS = [1, 2, 3, 4].map((n) => `Goalie byte ${n}`)
const TEAM_BYTE_COLUMNS = [1, 2, 3].map((n) => `Team byte ${n}`)
const COLOR_COLUMNS = ['Home', 'Away'].flatMap((strip) => Array.from({ length: 16 }, (_, i) => `${strip} ${i + 1}`))

const teams: CsvTable = {
  id: 'teams',
  title: 'Teams',
  description:
    'Team names and home and away colours. Only the columns present in the file are changed, and an empty cell keeps the current value.',

  rows(project) {
    const rows: Cell[][] = [['Team', ...NAME_COLUMNS, ...GOALIE_BYTE_COLUMNS, ...TEAM_BYTE_COLUMNS, ...COLOR_COLUMNS]]
    project.teams.forEach((team, t) => {
      rows.push([t + 1, ...team.names, ...team.goalieNibbles, ...team.teamBytes, ...team.palette.map(cssHex)])
    })
    return rows
  },

  apply(project, sheet) {
    sheet.require(['Team'])
    const changed = new Map<number, Team>()
    for (let row = 0; row < sheet.rowCount; row++) {
      const index = sheet.int(row, 'Team', 1, project.teams.length) - 1
      let team = changed.get(index) ?? project.teams[index]
      const given = (column: string) => sheet.has(column) && sheet.text(row, column) !== ''

      const names = team.names.map((name, i) => (given(NAME_COLUMNS[i]) ? sheet.gameText(row, NAME_COLUMNS[i]) : name))
      const teamBytes = team.teamBytes.map((value, i) =>
        given(TEAM_BYTE_COLUMNS[i]) ? sheet.int(row, TEAM_BYTE_COLUMNS[i], 0, 255) : value,
      )
      const palette = team.palette.map((word, i) => {
        if (!given(COLOR_COLUMNS[i])) return word
        const color = sheet.text(row, COLOR_COLUMNS[i])
        if (/^#[0-9a-f]{6}$/i.test(color)) return keepIfSameColor(word, nearestColorWord(color))
        sheet.problem(row, `${COLOR_COLUMNS[i]} must look like #1a2b3c, not "${color}".`)
        return word
      })
      team = { ...team, names, teamBytes, palette }

      const goalieNibbles = team.goalieNibbles.map((value, i) =>
        given(GOALIE_BYTE_COLUMNS[i]) ? sheet.int(row, GOALIE_BYTE_COLUMNS[i], 0, 15) : value,
      )
      if (goalieNibbles.every((value) => value === 0)) {
        sheet.problem(row, 'The goalie bytes cannot all be zero.')
      } else if (goalieNibbles.some((value, i) => value !== team.goalieNibbles[i])) {
        team = withSkaterCounts({ ...team, goalieNibbles }, team.forwards)
      }
      changed.set(index, team)
    }
    sheet.finish()
    return { project: replaceTeams(project, changed), summary: `Updated ${plural(changed.size, 'team')}.`, warnings: [] }
  },
}

// ------------------------------------------------------------------ lines

const lines: CsvTable = {
  id: 'lines',
  title: 'Lines',
  description:
    'Who plays on each line, by player name. Import this after the players file. Use # and a roster position, such as #12, where two players on a team share a name.',

  rows(project) {
    const { lineLabels, linePositionLabels } = project.game
    const rows: Cell[][] = [['Team', 'Team name', 'Line', ...linePositionLabels]]
    project.teams.forEach((team, t) => {
      const names = team.players.map((player) => player.name)
      team.lines.forEach((line, l) => {
        const cells = line.slice(0, LINE_SLOTS).map((position) => {
          const name = names[position - 1]
          return name !== undefined && names.filter((n) => sameText(n, name)).length === 1 ? name : `#${position}`
        })
        rows.push([t + 1, teamDisplayName(team), lineLabels[l], ...cells])
      })
    })
    return rows
  },

  apply(project, sheet) {
    const { lineLabels, linePositionLabels } = project.game
    sheet.require(['Team', 'Line', ...linePositionLabels])
    const changed = new Map<number, Team>()
    let lineCount = 0
    for (let row = 0; row < sheet.rowCount; row++) {
      const index = sheet.int(row, 'Team', 1, project.teams.length) - 1
      const team = changed.get(index) ?? project.teams[index]
      const lineIndex = sheet.choice(row, 'Line', lineLabels)
      const line = team.lines[lineIndex].slice()

      linePositionLabels.forEach((column, slot) => {
        const text = sheet.text(row, column)
        if (text.startsWith('#')) {
          const position = Number(text.slice(1))
          if (Number.isInteger(position) && position >= 1 && position <= team.players.length) line[slot] = position
          else sheet.problem(row, `${column}: "${text}" is not a roster position from 1 to ${team.players.length}.`)
          return
        }
        const matches = team.players.flatMap((player, i) => (sameText(player.name, text) ? [i + 1] : []))
        if (matches.length === 1) line[slot] = matches[0]
        else if (matches.length === 0) sheet.problem(row, `${column}: no player named "${text}" on this team.`)
        else sheet.problem(row, `${column}: more than one player named "${text}". Use # and the roster position.`)
      })
      changed.set(index, { ...team, lines: team.lines.map((l, i) => (i === lineIndex ? line : l)) })
      lineCount++
    }
    sheet.finish()
    return { project: replaceTeams(project, changed), summary: `Updated ${plural(lineCount, 'line')}.`, warnings: [] }
  },
}

// --------------------------------------------------------------- settings

const playoffs: CsvTable = {
  id: 'playoffs',
  title: 'Playoff draws',
  description: 'The seeded teams in each playoff draw, by team name or team number.',

  rows(project) {
    const names = project.teams.map(teamDisplayName)
    const rows: Cell[][] = [['Draw', ...project.game.playoffSlotLabels]]
    project.settings.playoffDraws.forEach((draw, d) => {
      rows.push([d + 1, ...draw.map((team) => choiceCell(names, team))])
    })
    return rows
  },

  apply(project, sheet) {
    const { playoffSlotLabels } = project.game
    sheet.require(['Draw', ...playoffSlotLabels])
    const names = project.teams.map(teamDisplayName)
    const playoffDraws = project.settings.playoffDraws.slice()
    for (let row = 0; row < sheet.rowCount; row++) {
      const draw = sheet.int(row, 'Draw', 1, playoffDraws.length) - 1
      playoffDraws[draw] = playoffSlotLabels.map((column) => sheet.choice(row, column, names))
    }
    sheet.finish()
    return {
      project: { ...project, settings: { ...project.settings, playoffDraws } },
      summary: `Updated ${plural(sheet.rowCount, 'playoff draw')}.`,
      warnings: [],
    }
  },
}

const rules: CsvTable = {
  id: 'rules',
  title: 'Rule messages',
  description: 'The on-screen rule messages with their fade-out delay and penalty minutes.',

  rows(project) {
    const rows: Cell[][] = [['Rule', 'Message', 'Max length', 'Fade-out delay', 'Penalty minutes']]
    project.settings.rules.forEach((rule, i) => {
      rows.push([i + 1, rule.text, rule.maxLength, rule.delay, rule.penaltyMinutes])
    })
    return rows
  },

  apply(project, sheet) {
    sheet.require(['Rule', 'Message', 'Fade-out delay', 'Penalty minutes'])
    const list = project.settings.rules.slice()
    for (let row = 0; row < sheet.rowCount; row++) {
      const index = sheet.int(row, 'Rule', 1, list.length) - 1
      list[index] = {
        ...list[index],
        text: sheet.gameText(row, 'Message', list[index].maxLength),
        delay: sheet.int(row, 'Fade-out delay', 0, 255),
        penaltyMinutes: sheet.int(row, 'Penalty minutes', 0, 255),
      }
    }
    sheet.finish()
    return {
      project: { ...project, settings: { ...project.settings, rules: list } },
      summary: `Updated ${plural(sheet.rowCount, 'rule message')}.`,
      warnings: [],
    }
  },
}

const OVERTIME = 'Overtime'
const SHOOTOUT = 'Shootout'

const clock: CsvTable = {
  id: 'clock',
  title: 'Clock',
  description: 'Period, overtime and shootout lengths in seconds, with the menu text for each period length.',

  rows(project) {
    const { settings } = project
    const rows: Cell[][] = [['Item', 'Seconds', 'Menu text', 'Max length']]
    settings.periodLengths.forEach((period, i) => {
      rows.push([`Period length ${i + 1}`, period.seconds, period.text, period.maxLength])
    })
    rows.push([OVERTIME, settings.overtimeSeconds, '', ''], [SHOOTOUT, settings.shootoutSeconds, '', ''])
    return rows
  },

  apply(project, sheet) {
    sheet.require(['Item', 'Seconds'])
    const settings = { ...project.settings, periodLengths: project.settings.periodLengths.slice() }
    const items = [...settings.periodLengths.map((_, i) => `Period length ${i + 1}`), OVERTIME, SHOOTOUT]
    for (let row = 0; row < sheet.rowCount; row++) {
      const item = sheet.choice(row, 'Item', items)
      const seconds = sheet.int(row, 'Seconds', 0, MAX_SECONDS)
      if (items[item] === OVERTIME) settings.overtimeSeconds = seconds
      else if (items[item] === SHOOTOUT) settings.shootoutSeconds = seconds
      else {
        const period = settings.periodLengths[item]
        const text = sheet.has('Menu text') ? sheet.gameText(row, 'Menu text', period.maxLength) : period.text
        settings.periodLengths[item] = { ...period, seconds, text }
      }
    }
    sheet.finish()
    return { project: { ...project, settings }, summary: `Updated ${plural(sheet.rowCount, 'clock setting')}.`, warnings: [] }
  },
}

const menu: CsvTable = {
  id: 'menu',
  title: 'Main menu',
  description: "The choices the main menu starts on, by the choice's text or its number.",

  rows(project) {
    const { settings, game } = project
    const names = project.teams.map(teamDisplayName)
    const rows: Cell[][] = [['Item', 'Choice']]
    settings.menu.forEach((item, i) => {
      rows.push([item.caption, choiceCell(menuOptions(settings, game, i, names), item.value)])
    })
    return rows
  },

  apply(project, sheet) {
    sheet.require(['Item', 'Choice'])
    const { settings, game } = project
    const names = project.teams.map(teamDisplayName)
    const items = settings.menu.slice()
    for (let row = 0; row < sheet.rowCount; row++) {
      const index = sheet.choice(row, 'Item', items.map((item) => item.caption))
      items[index] = { ...items[index], value: sheet.choice(row, 'Choice', menuOptions(settings, game, index, names)) }
    }
    sheet.finish()
    return {
      project: { ...project, settings: { ...settings, menu: items } },
      summary: `Updated ${plural(sheet.rowCount, 'menu item')}.`,
      warnings: [],
    }
  },
}

const rink: CsvTable = {
  id: 'rink',
  title: 'Rink colours',
  description: 'The 16 ice colours and 16 arena colours shared by every rink.',

  rows(project) {
    const rows: Cell[][] = [['Colour', 'Used for', 'Value']]
    project.rinkPalette.forEach((word, i) => rows.push([i + 1, i < 16 ? 'Ice' : 'Arena', cssHex(word)]))
    return rows
  },

  apply(project, sheet) {
    sheet.require(['Colour', 'Value'])
    const rinkPalette = project.rinkPalette.slice()
    for (let row = 0; row < sheet.rowCount; row++) {
      const index = sheet.int(row, 'Colour', 1, rinkPalette.length) - 1
      const color = sheet.text(row, 'Value')
      if (/^#[0-9a-f]{6}$/i.test(color)) rinkPalette[index] = keepIfSameColor(rinkPalette[index], nearestColorWord(color))
      else sheet.problem(row, `Value must look like #1a2b3c, not "${color}".`)
    }
    sheet.finish()
    return { project: { ...project, rinkPalette }, summary: `Updated ${plural(sheet.rowCount, 'rink colour')}.`, warnings: [] }
  },
}

// In the order a set of files has to be imported: lines are matched against
// the roster, and playoff draws and menu choices against the team names.
export const CSV_TABLES: CsvTable[] = [teams, players, lines, playoffs, rules, clock, menu, rink]

export function importCsv(table: CsvTable, project: RomProject, text: string): ImportResult {
  return table.apply(project, new Sheet(parseCsv(text)))
}

// ------------------------------------------------------------------- sets
// A set is one file per table, sharing a name: "League_S10_players.csv",
// "League_S10_teams.csv" and so on.

export function csvFileName(setName: string, table: CsvTable): string {
  return `${setName}_${table.id}.csv`
}

// Works out which table a file belongs to, and the set name in front of it.
export function identifyCsvFile(fileName: string): { table: CsvTable; setName: string } | null {
  const base = fileName.replace(/\.csv$/i, '')
  for (const table of CSV_TABLES) {
    const match = new RegExp(`^(?:(.*)[_ -])?${table.id}(?: \\(\\d+\\))?$`, 'i').exec(base)
    if (match) return { table, setName: match[1] ?? '' }
  }
  return null
}

export interface SetImportResult {
  project: RomProject
  // The name the files share, or '' if they do not all share one.
  setName: string
  files: { fileName: string; table: CsvTable; summary: string; warnings: string[] }[]
}

// Imports several files as one step: either all of them apply or none do.
export function importCsvSet(project: RomProject, files: { name: string; text: string }[]): SetImportResult {
  const identified = files.map((file) => ({ file, match: identifyCsvFile(file.name) }))
  const problems = identified
    .filter((entry) => !entry.match)
    .map((entry) => `${entry.file.name}: the file name must end in one of ${CSV_TABLES.map((t) => `_${t.id}.csv`).join(', ')}.`)
  for (const table of CSV_TABLES) {
    const same = identified.filter((entry) => entry.match?.table === table)
    if (same.length > 1) problems.push(`More than one ${table.title} file was chosen: ${same.map((e) => e.file.name).join(', ')}.`)
  }
  if (problems.length > 0) throw new CsvImportError(problems)

  const result: SetImportResult = { project, setName: '', files: [] }
  for (const table of CSV_TABLES) {
    const entry = identified.find((candidate) => candidate.match?.table === table)
    if (!entry) continue
    try {
      const applied = importCsv(table, result.project, entry.file.text)
      result.project = applied.project
      result.files.push({ fileName: entry.file.name, table, summary: applied.summary, warnings: applied.warnings })
    } catch (e) {
      if (!(e instanceof CsvImportError)) throw e
      throw new CsvImportError(e.problems.map((problem) => `${entry.file.name}: ${problem}`))
    }
  }
  // A lines file imported alongside the players settles any lines the new rosters disturbed.
  if (result.files.some((file) => file.table === lines)) {
    for (const file of result.files) file.warnings = file.warnings.filter((warning) => !warning.endsWith(LINES_WARNING))
  }
  const names = new Set(identified.map((entry) => entry.match!.setName))
  result.setName = names.size === 1 ? [...names][0] : ''
  return result
}
