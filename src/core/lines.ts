import type { Team } from './team'

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
