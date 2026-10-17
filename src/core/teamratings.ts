// A team's six ratings, which the game keeps as the halves of three bytes
// near the start of its data. What they mean was worked out by wboy and
// smozoma on the NHL94 forums. For three of them a low number is the good
// one. Home, Away, Power play and Penalty kill are added to or taken off some
// of each player's ratings, on the game's scale where a rating point is worth
// 5, as a player comes on the ice (shown by the NHL94 Match Viewer project's
// recordings). No use in play has been found for Offence and Defence.

import type { Team } from './team'

export interface TeamRating {
  label: string
  // The most the original game gives any team; half a byte can hold up to 15.
  most: number
  // Whether the higher number is the better one.
  higherIsBetter: boolean
  about: string
}

export const TEAM_RATINGS: TeamRating[] = [
  { label: 'Offence', most: 7, higherIsBetter: true, about: '7 is the best and 0 the worst' },
  { label: 'Defence', most: 7, higherIsBetter: false, about: '0 is the best and 7 the worst' },
  { label: 'Power play', most: 2, higherIsBetter: true, about: '2 is the best and 0 the worst' },
  { label: 'Penalty kill', most: 2, higherIsBetter: false, about: '0 is the best and 2 the worst' },
  { label: 'Home', most: 2, higherIsBetter: true, about: '2 is the best and 0 the worst' },
  { label: 'Away', most: 3, higherIsBetter: false, about: '0 is the best; the original game gives its weakest teams 3' },
]

const HIGHEST = 15

export function teamRatings(team: Team): number[] {
  return team.teamBytes.flatMap((byte) => [byte >> 4, byte & 0x0f])
}

export function setTeamRating(team: Team, index: number, value: number): Team {
  const ratings = teamRatings(team)
  ratings[index] = Math.max(0, Math.min(HIGHEST, Math.round(value)))
  return { ...team, teamBytes: team.teamBytes.map((_, i) => (ratings[i * 2] << 4) | ratings[i * 2 + 1]) }
}

// The values to offer for a rating: those the original game uses, and the
// team's own if it is beyond them.
export function teamRatingChoices(index: number, current: number): number[] {
  const usual = Array.from({ length: TEAM_RATINGS[index].most + 1 }, (_, value) => value)
  return usual.includes(current) ? usual : [...usual, current]
}
