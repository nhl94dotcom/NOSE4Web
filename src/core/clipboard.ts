import { goalieCount, type Player, type Team } from './team'

// Copying players as text lets them travel through the system clipboard, so
// they can be pasted into another team or into another ROM open in a second tab.

const MARKER = 'nose-web players'

interface CopiedPlayer extends Player {
  goalie: boolean
}

export function copyPlayers(team: Team, indexes: number[]): string {
  const goalies = goalieCount(team)
  const players: CopiedPlayer[] = indexes.map((i) => ({ ...team.players[i], goalie: i < goalies }))
  return JSON.stringify({ format: MARKER, players })
}

function readCopied(text: string): CopiedPlayer[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    data = null
  }
  const players = (data as { format?: string; players?: CopiedPlayer[] } | null)?.players
  const valid =
    (data as { format?: string } | null)?.format === MARKER &&
    Array.isArray(players) &&
    players.length > 0 &&
    players.every(
      (p) =>
        typeof p.name === 'string' &&
        /^[\x20-\x7d]*$/.test(p.name) &&
        Number.isInteger(p.jersey) &&
        Array.isArray(p.attributes) &&
        p.attributes.length === 14 &&
        p.attributes.every((v) => Number.isInteger(v) && v >= 0 && v <= 15),
    )
  if (!valid) throw new Error('The clipboard does not hold copied players.')
  return players
}

// Pastes over the players at `indexes`, in order. As in NOSE, copied players
// repeat if more rows are selected than were copied, and "attributes only"
// leaves each row's name and jersey number alone.
export function pastePlayers(team: Team, indexes: number[], text: string, attributesOnly: boolean): Team {
  const copied = readCopied(text)
  if (indexes.length === 0) throw new Error('Select the players to paste over first.')
  const goalies = goalieCount(team)
  const players = team.players.slice()
  indexes.forEach((index, n) => {
    const source = copied[n % copied.length]
    if (source.goalie !== index < goalies) {
      // Goalies and skaters use the attribute slots for different things.
      throw new Error('Goalies can only be pasted over goalies, and skaters over skaters.')
    }
    const { name, jersey, attributes } = source
    players[index] = attributesOnly ? { ...players[index], attributes } : { name, jersey, attributes }
  })
  return { ...team, players }
}

export function copiedPlayerCount(text: string): number {
  return readCopied(text).length
}

// Lines and playoff draws are copied as rows of numbers: roster positions for
// a line, team numbers for a draw.

const ROW_KINDS = {
  lines: { marker: 'nose-web lines', name: 'lines', width: 7 },
  draws: { marker: 'nose-web draws', name: 'playoff draws', width: 16 },
}
type RowKind = keyof typeof ROW_KINDS

function copyRows(kind: RowKind, rows: number[][]): string {
  return JSON.stringify({ format: ROW_KINDS[kind].marker, rows: rows.map((row) => row.slice(0, ROW_KINDS[kind].width)) })
}

function readRows(kind: RowKind, text: string): number[][] {
  const { marker, name, width } = ROW_KINDS[kind]
  let data: { format?: string; rows?: number[][] } | null
  try {
    data = JSON.parse(text)
  } catch {
    data = null
  }
  const rows = data?.rows
  const valid =
    data?.format === marker &&
    Array.isArray(rows) &&
    rows.length > 0 &&
    rows.every((row) => Array.isArray(row) && row.length === width && row.every((v) => Number.isInteger(v) && v >= 0 && v <= 255))
  if (!valid) throw new Error(`The clipboard does not hold copied ${name}.`)
  return rows!
}

export function copyLines(team: Team, indexes: number[]): string {
  return copyRows('lines', indexes.map((i) => team.lines[i]))
}

// A line is copied as roster positions, so it suits a team whose roster is in
// the same order. Positions the target team does not have are refused.
export function pasteLines(team: Team, indexes: number[], text: string): Team {
  const copied = readRows('lines', text)
  if (indexes.length === 0) throw new Error('Tick the lines to paste over first.')
  const highest = Math.max(...copied.flat())
  if (highest > team.players.length) {
    throw new Error(`A copied line uses roster position ${highest}, but this team has ${team.players.length} players.`)
  }
  const lines = team.lines.slice()
  indexes.forEach((index, n) => {
    // Only the seven positions are replaced; the line's unused last byte stays.
    lines[index] = [...copied[n % copied.length], ...lines[index].slice(ROW_KINDS.lines.width)]
  })
  return { ...team, lines }
}

export function copyDraws(draws: number[][], indexes: number[]): string {
  return copyRows('draws', indexes.map((i) => draws[i]))
}

export function pasteDraws(draws: number[][], indexes: number[], text: string, teamCount: number): number[][] {
  const copied = readRows('draws', text)
  if (indexes.length === 0) throw new Error('Tick the draws to paste over first.')
  const highest = Math.max(...copied.flat())
  if (highest >= teamCount) {
    throw new Error(`A copied draw uses team ${highest + 1}, but this ROM has ${teamCount} teams.`)
  }
  const next = draws.slice()
  indexes.forEach((index, n) => (next[index] = copied[n % copied.length].slice()))
  return next
}
