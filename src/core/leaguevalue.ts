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
    F: [[5, 0.29], [2, 0.22], [9, 0.15], [8, 0.1], [1, 0.09], [0, -0.52]],
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
  genesis: { F: [-6.344, 2.175], D: [-0.187, 0.589], G: [0.531, 1.594] },
  snes: { F: [1.16, 4.54], D: [0.815, 2.422], G: [0.072, 0.215] },
}

export function leagueValue(attributes: number[], role: Role, platform: Platform = 'genesis'): number {
  const sum = WEIGHTS[platform][role].reduce((total, [at, weight]) => total + weight * attributes[at], 0)
  const [low, high] = SCALE[platform][role]
  return Math.min(99, Math.max(0, Math.round(40 + (59 * (sum - low)) / (high - low))))
}

// ROMs with 0-15 ratings are not on the steps the weights were fitted to.
export function hasLeagueValue(game: { overallIsEstimate: boolean }): boolean {
  return !game.overallIsEstimate
}

export const LEAGUE_VALUE_TITLE =
  "League value: Match Viewer's 0-99 rating from what each rating was worth in the leagues' results, worked out for this ROM's system. See Help."
