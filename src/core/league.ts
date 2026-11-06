// Views across every team at once: finding players, and how the teams compare.

import { emptyLineSlots } from './lines'
import { overallRating } from './rating'
import type { RomProject } from './rom'
import { goalieCount, teamContentSize, type Player, type Team } from './team'

export type Role = 'G' | 'F' | 'D'
export const ROLE_NAMES: Record<Role, string> = { G: 'goalie', F: 'forward', D: 'defenceman' }

export function playerRole(team: Team, index: number): Role {
  const goalies = goalieCount(team)
  return index < goalies ? 'G' : index - goalies < team.forwards ? 'F' : 'D'
}

export interface LeaguePlayer {
  team: number
  // Place on the team's roster, from 0.
  index: number
  player: Player
  role: Role
  overall: number
}

export function leaguePlayers(project: RomProject): LeaguePlayer[] {
  return project.teams.flatMap((team, t) =>
    team.players.map((player, index) => {
      const role = playerRole(team, index)
      return { team: t, index, player, role, overall: overallRating(player.attributes, role === 'G', project.game) }
    }),
  )
}

// Players whose name contains every word typed, in any order and any case.
export function findPlayers(project: RomProject, text: string): LeaguePlayer[] {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  return leaguePlayers(project).filter(({ player }) => {
    const name = player.name.toLowerCase()
    return words.every((word) => name.includes(word))
  })
}

export interface TeamSummary {
  team: number
  players: number
  goalies: number
  // Average overall of the skaters on the first line, which is the whole
  // team when a league plays without line changes, and its goalie. Positions
  // a ROM leaves empty, as hacks with fewer skaters do, are not counted.
  startingSkaters: number | null
  startingGoalie: number | null
  forwards: number | null
  defence: number | null
  skaters: number | null
  bestGoalie: number | null
  // Bytes the team takes in the ROM.
  size: number
  // For each of the team's lines, in the ROM's order (the first is the
  // first line above): the average overall of its skaters, of its forwards
  // and of its defencemen, as for the first line.
  lines: LineRating[]
}

export interface LineRating {
  skaters: number | null
  forwards: number | null
  defence: number | null
}

// Slots of a line: goalie, two defencemen, three forwards, extra attacker.
const DEFENCE_SLOTS = [1, 2]
const FORWARD_SLOTS = [3, 4, 5]

const average = (values: number[]) => (values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length)
const SKATER_SLOTS = [1, 2, 3, 4, 5]

export function teamSummaries(project: RomProject): TeamSummary[] {
  const everyone = leaguePlayers(project)
  const empty = emptyLineSlots(project.teams)
  return project.teams.map((team, t) => {
    const roster = everyone.filter((p) => p.team === t)
    const overalls = (role: Role) => roster.filter((p) => p.role === role).map((p) => p.overall)
    // A line slot holds a roster position from 1. A skater put in goal, or a
    // goalie skating, is rated as what the roster says they are. Slots a ROM
    // leaves empty are not counted; a line missing someone else has no rating.
    const rate = (l: number, slots: number[]) => {
      const line = team.lines[l] ?? []
      const filled = slots.filter((slot) => !(line[slot] === 0 && empty[l]?.[slot]))
      const rated = filled.map((slot) => roster[line[slot] - 1]?.overall ?? null).filter((v): v is number => v !== null)
      return rated.length === filled.length ? average(rated) : null
    }
    const lines = team.lines.map((_, l) => ({ skaters: rate(l, SKATER_SLOTS), forwards: rate(l, FORWARD_SLOTS), defence: rate(l, DEFENCE_SLOTS) }))
    return {
      team: t,
      players: team.players.length,
      goalies: goalieCount(team),
      startingSkaters: lines[0]?.skaters ?? null,
      startingGoalie: roster[(team.lines[0] ?? [])[0] - 1]?.overall ?? null,
      forwards: average(overalls('F')),
      defence: average(overalls('D')),
      skaters: average([...overalls('F'), ...overalls('D')]),
      bestGoalie: overalls('G').length > 0 ? Math.max(...overalls('G')) : null,
      size: teamContentSize(team, project.layout),
      lines,
    }
  })
}

export type SummaryColumn = Exclude<keyof TeamSummary, 'team' | 'lines'>

// The average of each line's skater rating over all teams that have one.
export function lineAverages(summaries: TeamSummary[]): (number | null)[] {
  const count = Math.max(0, ...summaries.map((s) => s.lines.length))
  return Array.from({ length: count }, (_, l) => average(summaries.map((s) => s.lines[l]?.skaters ?? null).filter((v): v is number => v !== null)))
}

// The average of each column over all teams that have a value for it.
export function leagueAverages(summaries: TeamSummary[]): Record<SummaryColumn, number | null> {
  const column = (key: SummaryColumn) => average(summaries.map((s) => s[key]).filter((v): v is number => v !== null))
  return {
    players: column('players'),
    goalies: column('goalies'),
    startingSkaters: column('startingSkaters'),
    startingGoalie: column('startingGoalie'),
    forwards: column('forwards'),
    defence: column('defence'),
    skaters: column('skaters'),
    bestGoalie: column('bestGoalie'),
    size: column('size'),
  }
}
