import { readU16, readU32 } from './bytes'
import type { GameConfig } from './games'
import { overallRating } from './rating'
import { goalieCount, type Team } from './team'

// The team rating the games show, a number kept for each team that the game
// does not work out: on the Genesis the "Team Rating" of the player cards and
// the matchup screens (TeamRatings, one byte a team, printed as two digits;
// GetTeamRating in abdulahmad/NHL94Genesis), on the SNES the overall rating of
// the matchup screen and the player cards, kept with the team (snesteam.ts).
// Neither changes when the players do, so it can be set to the roster's
// average.

// GetTeamRating: move.w tmteam(a2),d0; movea.l #TeamRatings,a0; clr.w d1;
// move.b 0(a0,d0.w),d1.
const RATINGS_CODE = [0x302a, 0x0028, 0x207c, -1, -1, 0x4241, 0x1230, 0x0000]

function findRatings(rom: Uint8Array, teamCount: number): number | null {
  const found: number[] = []
  for (let at = 0; at + RATINGS_CODE.length * 2 <= rom.length; at += 2) {
    if (rom[at] !== 0x30 || rom[at + 1] !== 0x2a) continue
    if (RATINGS_CODE.every((word, i) => word < 0 || readU16(rom, at + i * 2) === word)) found.push(readU32(rom, at + 6))
  }
  return found.length === 1 && found[0] + teamCount <= rom.length ? found[0] : null
}

const ratingsAt = new WeakMap<Uint8Array, number | null>()

// Where the Genesis table of each team's shown rating is, or null.
export function ratingsTable(rom: Uint8Array, teamCount: number): number | null {
  if (!ratingsAt.has(rom)) ratingsAt.set(rom, findRatings(rom, teamCount))
  return ratingsAt.get(rom)!
}

// The rating each Genesis team's player cards show, as the ROM has it; null where it is not found.
export function shownTeamRatings(rom: Uint8Array, teamCount: number): number[] | null {
  const at = ratingsTable(rom, teamCount)
  return at === null ? null : Array.from(rom.subarray(at, at + teamCount))
}

// Writes each Genesis team's shown rating, where the ROM has the table.
export function writeShownTeamRatings(rom: Uint8Array, teams: Team[]): void {
  const at = ratingsTable(rom, teams.length)
  if (at === null) return
  teams.forEach((team, t) => {
    if (team.shownOverall !== undefined) rom[at + t] = team.shownOverall
  })
}

// The highest shown rating the game prints as it should: the Genesis prints
// two digits.
export const shownRatingMost = (game: GameConfig) => (game.platform === 'snes' ? 255 : 99)

// The average overall rating of everyone on the roster, goalies included,
// rounded: a team rating the shown one can be set to.
export function rosterAverage(team: Team, game: GameConfig): number {
  if (team.players.length === 0) return 0
  const goalies = goalieCount(team)
  const sum = team.players.reduce((total, player, i) => total + overallRating(player.attributes, i < goalies, game), 0)
  return Math.min(shownRatingMost(game), Math.round(sum / team.players.length))
}
