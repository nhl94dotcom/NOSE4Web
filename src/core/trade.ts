// Exchanging players between two teams, or between a team and the free
// agents: players the user is holding who are on no team.

import { emptyLineSlots, LINE_SLOTS } from './lines'
import type { RomProject } from './rom'
import { deletePlayer, insertSkater, MAX_ROSTER, MIN_ROSTER } from './roster'
import { goalieCount, teamDisplayName, type Player, type Team } from './team'

export type Role = 'G' | 'F' | 'D'

// A player on no team. Free agents are part of the user's work, kept with it
// in the browser and in project files, but they are not in the ROM.
export interface FreeAgent {
  player: Player
  role: Role
}

// Stands for the free agents where a team's number is expected.
export const FREE_AGENTS = -1

export interface TradeSide {
  // A team's number, or FREE_AGENTS.
  team: number
  // Who leaves this side: places on the team's roster, or among the free agents.
  picks: number[]
}

function role(team: Team, index: number): Role {
  const goalies = goalieCount(team)
  return index < goalies ? 'G' : index - goalies < team.forwards ? 'F' : 'D'
}

const sideName = (project: RomProject, side: TradeSide) =>
  side.team === FREE_AGENTS ? 'The free agents' : teamDisplayName(project.teams[side.team])

function leaving(project: RomProject, side: TradeSide): FreeAgent[] {
  if (side.team === FREE_AGENTS) return side.picks.map((i) => project.freeAgents[i])
  const team = project.teams[side.team]
  return side.picks.map((i) => ({ player: team.players[i], role: role(team, i) }))
}

// A team after its picked players leave and others arrive. Skaters come and
// go; a goalie can only take the place of one who leaves, since the game
// needs a team's goalies to stay where they are on the roster.
function exchange(team: Team, out: FreeAgent[], incoming: FreeAgent[]): Team {
  const name = teamDisplayName(team)
  const goaliesOut = out.filter((p) => p.role === 'G')
  const goaliesIn = incoming.filter((p) => p.role === 'G')
  if (goaliesOut.length !== goaliesIn.length) {
    throw new Error(`Goalies change places one for one. ${name} would give ${goaliesOut.length} and get ${goaliesIn.length}.`)
  }
  const skatersOut = out.filter((p) => p.role !== 'G')
  const skatersIn = incoming.filter((p) => p.role !== 'G')
  const size = team.players.length - skatersOut.length + skatersIn.length
  if (size < MIN_ROSTER) throw new Error(`${name} would have ${size} players, and a team needs at least ${MIN_ROSTER}.`)
  if (size > MAX_ROSTER) throw new Error(`${name} would have ${size} players, and a team can hold ${MAX_ROSTER}.`)

  let next: Team = {
    ...team,
    players: team.players.map((player) => {
      const at = goaliesOut.findIndex((g) => g.player === player)
      return at < 0 ? player : goaliesIn[at].player
    }),
  }
  // One leaves or one arrives at a time, keeping the roster within its
  // limits throughout, so that a full roster can still trade one for one.
  const toLeave = skatersOut.map((p) => p.player)
  const toArrive = skatersIn.slice()
  while (toLeave.length > 0 || toArrive.length > 0) {
    const canLeave = toLeave.length > 0 && next.players.length > MIN_ROSTER
    if (canLeave && (toArrive.length === 0 || next.players.length >= MAX_ROSTER || toLeave.length >= toArrive.length)) {
      next = deletePlayer(next, next.players.indexOf(toLeave.shift()!))
    } else {
      const arriving = toArrive.shift()!
      next = insertSkater(next, arriving.player, arriving.role === 'F')
    }
  }
  return next
}

// The project after the two sides exchange the players picked on each.
// Either side may give nothing. Says why not, if it cannot be done.
export function trade(project: RomProject, a: TradeSide, b: TradeSide): RomProject {
  if (a.team === b.team) throw new Error('Choose two different sides to trade between.')
  if (a.picks.length + b.picks.length === 0) throw new Error('Tick the players to trade first.')
  const [fromA, fromB] = [leaving(project, a), leaving(project, b)]

  const teams = project.teams.slice()
  let freeAgents = project.freeAgents
  const apply = (side: TradeSide, out: FreeAgent[], incoming: FreeAgent[]) => {
    if (side.team === FREE_AGENTS) freeAgents = [...freeAgents.filter((agent) => !out.includes(agent)), ...incoming]
    else teams[side.team] = exchange(teams[side.team], out, incoming)
  }
  apply(a, fromA, fromB)
  apply(b, fromB, fromA)
  return { ...project, teams, freeAgents }
}

// How many positions on a team's lines are held by players who would leave.
// Those positions fall to another player, and the lines want a look after.
export function linePositionsLost(project: RomProject, side: TradeSide): number {
  if (side.team === FREE_AGENTS) return 0
  const team = project.teams[side.team]
  const goalies = goalieCount(team)
  // A goalie's place is taken by the goalie who arrives, so only skaters count.
  const gone = new Set(side.picks.filter((i) => i >= goalies).map((i) => i + 1))
  const empty = emptyLineSlots(project.teams)
  return team.lines.reduce(
    (sum, line, l) => sum + line.slice(0, LINE_SLOTS).filter((position, slot) => gone.has(position) && !empty[l]?.[slot]).length,
    0,
  )
}

export function tradeSummary(project: RomProject, a: TradeSide, b: TradeSide): string {
  const names = (side: TradeSide) => leaving(project, side).map((p) => p.player.name).join(', ') || 'nobody'
  return `${sideName(project, a)} give ${names(a)}; ${sideName(project, b)} give ${names(b)}.`
}
