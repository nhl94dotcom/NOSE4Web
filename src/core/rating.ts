// Overall rating as the game shows it on the roster screens, for NHL 94.
// Each weight applies to the attribute after weight, in label order.
const GOALIE_WEIGHTS = [2.25, 0, 0, 2.25, 2.25, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5]
const PLAYER_WEIGHTS = [1, 1.5, 1.5, 1, 0.5, 1, 0, 1.5, 1, 0.5, 0, 0.5, 0]
const BASE = 25

// Hacks with a formula of their own get a plain average of the values, on
// the same 25 to 99 scale: good for comparing players, not what the game shows.
function averageRating(attributes: number[]): number {
  const values = attributes.slice(1)
  return Math.round(BASE + (values.reduce((sum, v) => sum + v, 0) / values.length / 15) * (99 - BASE))
}

// The SNES game's own way, read from its roster screens' Overall column: a
// weighted sum of the ratings (the weights at $9F9AD8, the ratings counted
// chosen by the column's mask), halved for goalies, then shown as it is up to
// 100, or as half of it plus 25 below 50. Skaters come out as on the Genesis;
// a goalie can come out one higher, as only the total is halved.
// Each weight applies to the attribute after weight, in label order.
const SNES_GOALIE_WEIGHTS = [9, 0, 0, 9, 9, 0, 0, 0, 0, 2, 2, 2, 2]
const SNES_PLAYER_WEIGHTS = [2, 3, 3, 2, 1, 2, 0, 3, 2, 1, 0, 1, 0]

function snesRating(attributes: number[], isGoalie: boolean): number {
  const weights = isGoalie ? SNES_GOALIE_WEIGHTS : SNES_PLAYER_WEIGHTS
  let sum = weights.reduce((total, weight, i) => total + weight * attributes[i + 1], 0)
  if (isGoalie) sum = Math.floor(sum / 2)
  return sum >= 50 ? Math.min(sum, 100) : Math.floor(sum / 2) + 25
}

export function overallRating(
  attributes: number[],
  isGoalie: boolean,
  game?: { overallIsEstimate: boolean; platform?: 'genesis' | 'snes' },
): number {
  if (game?.overallIsEstimate) return averageRating(attributes)
  if (game?.platform === 'snes') return snesRating(attributes, isGoalie)
  const weights = isGoalie ? GOALIE_WEIGHTS : PLAYER_WEIGHTS
  let rating = 0
  for (let i = 0; i < weights.length; i++) {
    const value = attributes[i + 1]
    rating += value * weights[i]
    // The game rounds a goalie's 2.25-weighted attributes down to the nearest half.
    if (isGoalie && weights[i] === 2.25 && value % 2 === 1) rating -= 0.25
  }
  const bonus = Math.max(0, rating - BASE)
  return Math.floor(rating + bonus + BASE)
}
