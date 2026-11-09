import { goalieCount, type Team } from './team'

// The positions on a line: goalie, two defence, three forwards, extra attacker.
export const LINE_SLOTS = 7

// Hacks that put fewer skaters on the ice (3 on 3, 2 on 2, 1 on 1) leave the
// unused positions of a line empty, stored as 0, on every team. A position
// counts as empty by design when most teams have it empty on that line; a
// stray empty position on one team is still a mistake.
export function emptyLineSlots(teams: Team[]): boolean[][] {
  const lineCount = teams[0]?.lines.length ?? 0
  return Array.from({ length: lineCount }, (_, line) =>
    Array.from({ length: LINE_SLOTS }, (_, slot) => {
      const empty = teams.filter((team) => team.lines[line]?.[slot] === 0).length
      return empty * 2 > teams.length
    }),
  )
}

// The skaters' positions on a line: two defence and three forwards. The
// extra attacker is left out; the original game often repeats a player there.
export const SKATER_LINE_SLOTS = [1, 2, 3, 4, 5]
const DEFENCE_LINE_SLOTS = [1, 2]

// The positions of a line held by a player who is already in an earlier one.
// The game plays such a line a skater short: when it next works out who should
// be on the ice, the second copy of him finds no position and leaves it.
export function repeatedLineSlots(line: number[]): number[] {
  const seen = new Set<number>()
  return SKATER_LINE_SLOTS.filter((slot) => {
    const position = line[slot]
    if (position === 0) return false
    if (seen.has(position)) return true
    seen.add(position)
    return false
  })
}

// A line with each repeated skater replaced by one not on it yet: a defenceman
// for a defence position and a forward for a forward's, if there is one free.
export function withoutRepeats(team: Team, line: number[]): number[] {
  const repeated = repeatedLineSlots(line)
  if (repeated.length === 0) return line
  const next = line.slice()
  for (const slot of repeated) {
    const pick = freeSkater(team, next, slot)
    if (pick !== undefined) next[slot] = pick
  }
  return next
}

// A skater for `slot` who holds none of the line's other skaters' positions:
// one of the position's own if there is one, else any.
export function freeSkater(team: Team, line: number[], slot: number): number | undefined {
  const goalies = goalieCount(team)
  const taken = new Set(SKATER_LINE_SLOTS.filter((s) => s !== slot).map((s) => line[s]))
  const free = team.players.map((_, i) => i + 1).filter((position) => position > goalies && !taken.has(position))
  return free.find((position) => suitsSlot(team, slot, position)) ?? free[0]
}

export type LineRole = 'goalie' | 'defence' | 'forward' | 'skater'

// Who a position on a line is for. The extra attacker may be any skater, and
// so may any skater's position with `anyPosition`: in an SNES ROM with
// NHL94SNESVault's hack that lets Edit Lines put any skater anywhere.
export function slotRole(slot: number, anyPosition = false): LineRole {
  return slot === 0 ? 'goalie' : anyPosition || slot >= 6 ? 'skater' : DEFENCE_LINE_SLOTS.includes(slot) ? 'defence' : 'forward'
}

// A roster position's role, counted from 1: goalies, then forwards, then defence.
export function playerRole(team: Team, position: number): Exclude<LineRole, 'skater'> {
  const goalies = goalieCount(team)
  return position <= goalies ? 'goalie' : position - goalies <= team.forwards ? 'forward' : 'defence'
}

export function suitsSlot(team: Team, slot: number, position: number, anyPosition = false): boolean {
  const role = slotRole(slot, anyPosition)
  return role === 'skater' ? playerRole(team, position) !== 'goalie' : playerRole(team, position) === role
}

// A forward on defence or a defenceman up front: the game's own Edit Lines
// does not offer it, but some ROMs do it on purpose, as forwards on the points
// of a power play.
export function outOfRoleSlots(team: Team, line: number[], anyPosition = false): number[] {
  return SKATER_LINE_SLOTS.filter(
    (slot) => line[slot] >= 1 && line[slot] <= team.players.length && playerRole(team, line[slot]) !== 'goalie' && !suitsSlot(team, slot, line[slot], anyPosition),
  )
}
