// Views across every team at once: finding players, and how the teams compare.

import type { GameConfig } from './games'
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
  // The team as it plays with line changes: see LineupRatings.
  overall: number | null
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
// The lines a team plays at even strength with line changes on.
const EVEN_STRENGTH = ['Sc1', 'Sc2', 'Chk']

export interface LineupRatings {
  // For each line, as in TeamSummary.
  lines: LineRating[]
  // The goalie of the first line.
  goalie: number | null
  // The average overall of every skater on the even strength lines (Sc1,
  // Sc2 and Chk), each counted once however many of them he is on, and of
  // the first line's goalie, as one more. Where a ROM has no such lines, the
  // first line's skaters and its goalie.
  overall: number | null
}

// A team's line ratings and overall. `empty` is the positions on each line
// the ROM leaves empty on every team (see emptyLineSlots).
export function lineupRatings(team: Team, game: GameConfig, empty: boolean[][]): LineupRatings {
  const goalies = goalieCount(team)
  const overallAt = (position: number) => {
    const player = team.players[position - 1]
    return player ? overallRating(player.attributes, position <= goalies, game) : null
  }
  // A line slot holds a roster position from 1. A skater put in goal, or a
  // goalie skating, is rated as what the roster says they are. Slots a ROM
  // leaves empty are not counted; a line missing someone else has no rating.
  const filled = (l: number, slots: number[]) => slots.filter((slot) => !((team.lines[l] ?? [])[slot] === 0 && empty[l]?.[slot]))
  const rate = (l: number, slots: number[]) => {
    const wanted = filled(l, slots)
    const rated = wanted.map((slot) => overallAt((team.lines[l] ?? [])[slot])).filter((v): v is number => v !== null)
    return rated.length === wanted.length ? average(rated) : null
  }
  const lines = team.lines.map((_, l) => ({ skaters: rate(l, SKATER_SLOTS), forwards: rate(l, FORWARD_SLOTS), defence: rate(l, DEFENCE_SLOTS) }))
  const goalie = overallAt((team.lines[0] ?? [])[0])

  const even = EVEN_STRENGTH.map((label) => game.lineLabels.indexOf(label)).filter((l) => l >= 0 && l < team.lines.length)
  const playing = even.length > 0 ? even : [0]
  const positions = new Set(playing.flatMap((l) => filled(l, SKATER_SLOTS).map((slot) => team.lines[l][slot])))
  const skaters = [...positions].map(overallAt)
  const overall = goalie === null || skaters.some((v) => v === null) ? null : average([...(skaters as number[]), goalie])
  return { lines, goalie, overall }
}

export function teamSummaries(project: RomProject): TeamSummary[] {
  const everyone = leaguePlayers(project)
  const empty = emptyLineSlots(project.teams)
  return project.teams.map((team, t) => {
    const roster = everyone.filter((p) => p.team === t)
    const overalls = (role: Role) => roster.filter((p) => p.role === role).map((p) => p.overall)
    const { lines, goalie, overall } = lineupRatings(team, project.game, empty)
    return {
      team: t,
      overall,
      players: team.players.length,
      goalies: goalieCount(team),
      startingSkaters: lines[0]?.skaters ?? null,
      startingGoalie: goalie,
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
    overall: column('overall'),
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

export interface BalanceEntry {
  team: number
  value: number
  // How far from the league average, and in standard deviations.
  fromAverage: number
  deviations: number
}

export interface LeagueBalance {
  average: number
  // The population standard deviation of the teams' values.
  deviation: number
  // The highest value less the lowest.
  spread: number
  // Highest first; teams without a value are left out.
  ranked: BalanceEntry[]
}

// How evenly one rating is spread over the teams, or null where fewer than
// two teams have it.
export function leagueBalance(summaries: TeamSummary[], key: SummaryColumn): LeagueBalance | null {
  const rated = summaries.flatMap((s) => (s[key] === null ? [] : [{ team: s.team, value: s[key] as number }]))
  if (rated.length < 2) return null
  const mean = rated.reduce((sum, r) => sum + r.value, 0) / rated.length
  const deviation = Math.sqrt(rated.reduce((sum, r) => sum + (r.value - mean) ** 2, 0) / rated.length)
  const values = rated.map((r) => r.value)
  return {
    average: mean,
    deviation,
    spread: Math.max(...values) - Math.min(...values),
    ranked: rated
      .map((r) => ({ ...r, fromAverage: r.value - mean, deviations: deviation === 0 ? 0 : (r.value - mean) / deviation }))
      .sort((a, b) => b.value - a.value || a.team - b.team),
  }
}

// Whether a team is one of the game's All-Star teams, by its name.
export function isAllStarTeam(name: string): boolean {
  return /\ball[ -]?stars?\b/i.test(name)
}
