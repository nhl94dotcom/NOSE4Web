// Overall rating as the game shows it on the roster screens, for NHL 94.
// Each weight applies to the attribute after weight, in label order.
const GOALIE_WEIGHTS = [2.25, 0, 0, 2.25, 2.25, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5]
const PLAYER_WEIGHTS = [1, 1.5, 1.5, 1, 0.5, 1, 0, 1.5, 1, 0.5, 0, 0.5, 0]
const BASE = 25

export function overallRating(attributes: number[], isGoalie: boolean): number {
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
