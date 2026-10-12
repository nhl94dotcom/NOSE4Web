import { goalieCount, type Player, type Team } from './team'

// Limits NOSE enforces because of the game engine.
export const MAX_ROSTER = 26
export const MIN_ROSTER = 5
const MAX_COUNT = 15

// Fits the forward and defence counts to the roster, keeping `forwards` if it can.
export function withSkaterCounts(team: Team, forwards: number): Team {
  const skaters = team.players.length - goalieCount(team)
  const clamped = Math.max(0, Math.min(forwards, skaters, MAX_COUNT))
  return { ...team, forwards: clamped, defense: Math.min(MAX_COUNT, skaters - clamped) }
}

function mapLines(team: Team, map: (position: number) => number): number[][] {
  return team.lines.map((line) => line.map(map))
}

// Swaps a player with a neighbour. Lines keep pointing at the same people.
export function movePlayer(team: Team, index: number, delta: -1 | 1): Team {
  const target = index + delta
  if (target < 0 || target >= team.players.length) return team
  const players = team.players.slice()
  ;[players[index], players[target]] = [players[target], players[index]]
  const a = index + 1
  const b = target + 1
  return { ...team, players, lines: mapLines(team, (v) => (v === a ? b : v === b ? a : v)) }
}

export function canAddPlayer(team: Team): boolean {
  return team.players.length < MAX_ROSTER
}

// Adds a blank skater at the end of the roster, which makes them a defenceman.
export function addPlayer(team: Team): Team {
  if (!canAddPlayer(team)) return team
  const number = String(team.players.length + 1).padStart(2, '0')
  const player = { name: `# ${number}`, jersey: 0, attributes: new Array<number>(14).fill(0) }
  return withSkaterCounts({ ...team, players: [...team.players, player] }, team.forwards)
}

export function canDeletePlayer(team: Team, index: number): boolean {
  return index >= goalieCount(team) && team.players.length > MIN_ROSTER
}

// Removes a skater. Line slots that used them fall to the last player on the
// roster, and later players move up one position.
export function deletePlayer(team: Team, index: number): Team {
  if (!canDeletePlayer(team, index)) return team
  const position = index + 1
  const last = team.players.length - 1
  const wasForward = index - goalieCount(team) < team.forwards
  const next = {
    ...team,
    players: team.players.filter((_, i) => i !== index),
    lines: mapLines(team, (v) => (v === position ? last : v > position && v <= last + 1 ? v - 1 : v)),
  }
  return withSkaterCounts(next, team.forwards - (wasForward ? 1 : 0))
}

// Puts a skater on a roster: after the last forward, or at the end as a
// defenceman. Lines keep pointing at the same people.
export function insertSkater(team: Team, player: Player, asForward: boolean): Team {
  if (!asForward || team.forwards >= MAX_COUNT) {
    return withSkaterCounts({ ...team, players: [...team.players, player] }, team.forwards)
  }
  const at = goalieCount(team) + team.forwards
  const players = [...team.players.slice(0, at), player, ...team.players.slice(at)]
  const lines = mapLines(team, (v) => (v > at && v <= team.players.length ? v + 1 : v))
  return withSkaterCounts({ ...team, players, lines }, team.forwards + 1)
}

// Moves skaters from one team to another, as in a trade. They keep their role
// as forward or defenceman, and both teams' lines are kept in step.
export function transferPlayers(teams: Team[], from: number, indexes: number[], to: number): Team[] {
  let source = teams[from]
  let target = teams[to]
  if (from === to) throw new Error('Choose a different team to move the players to.')
  if (indexes.length === 0) throw new Error('Tick the players to move first.')
  const goalies = goalieCount(source)
  if (indexes.some((i) => i < goalies)) {
    throw new Error('Goalies cannot be moved this way. Copy the goalie and paste over one on the other team.')
  }
  if (source.players.length - indexes.length < MIN_ROSTER) {
    throw new Error(`A team needs at least ${MIN_ROSTER} players, so that many cannot leave.`)
  }
  if (target.players.length + indexes.length > MAX_ROSTER) {
    throw new Error(`The other team would have more than ${MAX_ROSTER} players.`)
  }

  const ordered = [...indexes].sort((a, b) => a - b)
  const moving = ordered.map((i) => ({ player: source.players[i], forward: i - goalies < source.forwards }))
  for (const i of ordered.reverse()) source = deletePlayer(source, i)
  for (const { player, forward } of moving) target = insertSkater(target, player, forward)
  return teams.map((team, i) => (i === from ? source : i === to ? target : team))
}

// Sets how many skaters, counted from the top, are forwards. The rest are defence.
export function setForwards(team: Team, forwards: number): Team {
  return withSkaterCounts(team, forwards)
}

// The goalie bytes hold four values; the game treats the roster's first
// players as goalies up to the last value that is not zero.
export function setGoalieNibble(team: Team, index: number, value: number): Team {
  const goalieNibbles = team.goalieNibbles.map((v, i) => (i === index ? value & 0x0f : v))
  if (goalieNibbles.every((v) => v === 0)) return team
  return withSkaterCounts({ ...team, goalieNibbles }, team.forwards)
}
