// Match Viewer's league value (its RATING_VALUES.md, chunk D, and the SNES
// addendum): one 0-99 number per player, from what each rating step was worth in the
// Classic leagues' own results, where the game's Overall predicts little.
// A weighted sum of the stored ratings (steps 0-6, Weight as stored), by
// position, put on a fixed scale whose ends are the retail roster's lowest and
// highest sums (each position as the roster's own order has it, the All-Star
// teams left out), so that a value means the same on any ROM of that system.

export type Role = 'G' | 'F' | 'D'

// [attribute index, weight], the index in the editor's attribute order, the
// same on both systems (0 Wgt, 1 Agl, 2 Spd, 3 OfA, 4 DfA, 5 ShP, 6 Chk, 7 H/F,
// 8 StH, 9 ShA, 10 End, 11 Rgh, 12 Pas, 13 Agr). Each system has its own: the
// same player can be worth very different things on the two.
type Platform = 'genesis' | 'snes'
const WEIGHTS: Record<Platform, Record<Role, [number, number][]>> = {
  genesis: {
    F: [[5, 0.29], [2, 0.22], [9, 0.15], [8, 0.1], [1, 0.09], [0, -0.6]],
    D: [[12, 0.06], [6, 0.042], [1, 0.033], [2, 0.026], [5, 0.013], [9, 0.009], [0, -0.022], [3, -0.018], [8, -0.01]],
    G: [[1, 0.2655]],
  },
  // On the SNES Weight counts for a player: there is no weight bug, one checking
  // formula for everyone, and a heavier checker does a little better.
  snes: {
    F: [[2, 0.18], [5, 0.16], [9, 0.14], [1, 0.14], [8, 0.14], [0, 0.08]],
    D: [[8, 0.182], [2, 0.176], [3, 0.102], [0, 0.067], [6, 0.057], [1, -0.027], [5, -0.016], [9, -0.014], [12, -0.087]],
    G: [[1, 0.0358]],
  },
}
const SCALE: Record<Platform, Record<Role, [number, number]>> = {
  genesis: { F: [-7.486, 1.848], D: [-0.226, 0.589], G: [0.531, 1.594] },
  snes: { F: [1.16, 4.54], D: [0.806, 2.974], G: [0.072, 0.215] },
}

// A defenceman's Weight also counts by band, on top of its weight above
// (Match Viewer, comparing the defencemen each coach chose from the same
// roster): on the Genesis a middleweight (stored 7-9) suits neither kind of
// check well; on the SNES being light (6 and under) is the cost.
const DEFENCE_WEIGHT_BANDS: Record<Platform, (weight: number) => number> = {
  genesis: (weight) => (weight >= 7 && weight <= 9 ? -0.138 : 0),
  snes: (weight) => (weight <= 6 ? 0 : weight <= 9 ? 0.552 : 0.486),
}

export function leagueValue(attributes: number[], role: Role, platform: Platform = 'genesis'): number {
  const band = role === 'D' ? DEFENCE_WEIGHT_BANDS[platform](attributes[0]) : 0
  const sum = WEIGHTS[platform][role].reduce((total, [at, weight]) => total + weight * attributes[at], band)
  const [low, high] = SCALE[platform][role]
  return Math.min(99, Math.max(0, Math.round(40 + (59 * (sum - low)) / (high - low))))
}

// ROMs with 0-15 ratings are not on the steps the weights were fitted to.
export function hasLeagueValue(game: { overallIsEstimate: boolean }): boolean {
  return !game.overallIsEstimate
}

export const LEAGUE_VALUE_TITLE =
  "League value: Match Viewer's 0-99 rating from what each rating was worth in the leagues' results, worked out for this ROM's system. See Help."

// A team's strength from its best players' league values (Match Viewer's team
// fit on the Classic leagues' results, 2026-11-11): 0.71 x the average of its
// top four forwards, 0.15 x its top three defencemen, 0.14 x its best goalie.
// It explains about 69% of the teams' strength, and 50% of a team left out of
// its own fit. On the 0-99 scale of the league value. The Genesis only so far:
// the SNES teams' strengths repeat too poorly to fit one.
const STRENGTH_PARTS: { role: Role; count: number; share: number }[] = [
  { role: 'F', count: 4, share: 0.71 },
  { role: 'D', count: 3, share: 0.15 },
  { role: 'G', count: 1, share: 0.14 },
]

export function hasTeamStrength(game: { overallIsEstimate: boolean; platform?: Platform }): boolean {
  return hasLeagueValue(game) && game.platform !== 'snes'
}

// From each player's league value and role; null for a team missing a position.
export function teamStrength(players: { role: Role; value: number }[]): number | null {
  let total = 0
  for (const part of STRENGTH_PARTS) {
    const best = players
      .filter((p) => p.role === part.role)
      .map((p) => p.value)
      .sort((a, b) => b - a)
      .slice(0, part.count)
    if (best.length === 0) return null
    total += part.share * (best.reduce((sum, v) => sum + v, 0) / best.length)
  }
  return total
}
