import { goalieCount, type Team } from './team'

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
