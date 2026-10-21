// A team's six ratings, which the game keeps as the halves of three bytes
// near the start of its data, as the Genesis disassembly (abdulahmad's
// NHL94Genesis) reads them, and the SNES game alike:
//   byte 0: Offence and Defence, the rows of the table that scores the other
//     playoff games the game plays out during yours (SetScore), counted from
//     0 to 7: a team's goals in each period are drawn with its Offence row
//     and the other team's Defence row added together
//   byte 1: what a team killing a penalty takes off some of each player's
//     ratings, then what a team on the power play adds
//   byte 2: what the home team adds, then what the away team takes off
// The bonuses count on the game's scale, where a rating point is worth 5, as
// a player comes on the ice. wboy and smozoma first worked out what the bytes
// mean. The original game's data, and the forums, have the halves of byte 1
// the other way round, power play first; the game reads them as here (the
// disassembly calls it a bug), so these follow what happens in play.

import type { Team } from './team'

export interface TeamRating {
  label: string
  // Its column in the Teams spreadsheet.
  column: string
  // The most the original game gives any team; half a byte can hold up to 15.
  most: number
  // Whether the higher number is the better one.
  higherIsBetter: boolean
  about: string
}

export const TEAM_RATINGS: TeamRating[] = [
  {
    label: 'Offence',
    column: 'Offence rating',
    most: 7,
    higherIsBetter: true,
    about: '7 is the best and 0 the worst; it sets how many goals the team scores in the playoff games the game plays out',
  },
  {
    label: 'Defence',
    column: 'Defence rating',
    most: 7,
    higherIsBetter: false,
    about: '0 is the best and 7 the worst; it sets how many goals other teams score against it in the playoff games the game plays out',
  },
  {
    label: 'Penalty kill',
    column: 'Penalty kill cost',
    most: 2,
    higherIsBetter: false,
    about: "0 is the best and 2 the worst; it is taken off some of each player's ratings while the team kills a penalty",
  },
  {
    label: 'Power play',
    column: 'Power play bonus',
    most: 2,
    higherIsBetter: true,
    about: "2 is the best and 0 the worst; it is added to some of each player's ratings while the team is on the power play",
  },
  { label: 'Home', column: 'Home rating', most: 2, higherIsBetter: true, about: '2 is the best and 0 the worst' },
  { label: 'Away', column: 'Away rating', most: 3, higherIsBetter: false, about: '0 is the best; the original game gives its weakest teams 3' },
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
