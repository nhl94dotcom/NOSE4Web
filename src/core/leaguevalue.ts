// Match Viewer's league value for Genesis players (its RATING_VALUES.md, chunk
// D): one 0-99 number per player, from what each rating step was worth in the
// Classic leagues' own results, where the game's Overall predicts little.
// A weighted sum of the stored ratings (steps 0-6, Weight as stored), by
// position, put on a fixed scale whose ends are the retail roster's lowest and
// highest sums, so that a value means the same on any ROM.

export type Role = 'G' | 'F' | 'D'

// [attribute index, weight], the index in the editor's attribute order
// (0 Wgt, 1 Agl, 2 Spd, 3 OfA, 4 DfA, 5 ShP, 6 Chk, 7 H/F, 8 StH, 9 ShA, 10 End, 11 Rgh, 12 Pas, 13 Agr).
const WEIGHTS: Record<Role, [number, number][]> = {
  F: [[5, 0.29], [2, 0.22], [9, 0.15], [8, 0.1], [1, 0.09], [0, -0.52]],
  D: [[12, 0.06], [6, 0.042], [1, 0.033], [2, 0.026], [5, 0.013], [9, 0.009], [0, -0.022], [3, -0.018], [8, -0.01]],
  G: [[1, 0.27]],
}
const SCALE: Record<Role, [number, number]> = { F: [-5.29, 2.17], D: [-0.089, 0.589], G: [0.54, 1.62] }

export function leagueValue(attributes: number[], role: Role): number {
  const sum = WEIGHTS[role].reduce((total, [at, weight]) => total + weight * attributes[at], 0)
  const [low, high] = SCALE[role]
  return Math.min(99, Math.max(0, Math.round(40 + (59 * (sum - low)) / (high - low))))
}

// Only the Genesis game with its own ratings: the SNES plays differently, and
// ROMs with 0-15 ratings are not on the steps the weights were fitted to.
export function hasLeagueValue(game: { overallIsEstimate: boolean; platform?: 'genesis' | 'snes' }): boolean {
  return game.platform !== 'snes' && !game.overallIsEstimate
}

export const LEAGUE_VALUE_TITLE =
  "League value: Match Viewer's 0-99 rating from what each rating was worth in the Classic leagues' results. Forwards: Shot Power, Speed, Shot Accuracy, Stickhandling and Agility count, and Weight counts against. Defencemen: offence only. Goalies: Agility only. See Help."
