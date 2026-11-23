import { isHandedFighting, shootsRight, stickHandling95Step } from './attributes'
import type { GameConfig } from './games'
import { overallRating } from './rating'
import type { RomProject } from './rom'
import { goalieCount } from './team'

// The players file the league website takes when a new league is set up (its admin's format, from their
// "nhl26snes" file): a row for each player, their name in two, their team's initials, position, jersey number,
// overall and the 14 ratings in the order the game keeps them. A goalie's ratings go under the same
// headings, which name both where they differ (ShP-PkC: a skater's ShP, a goalie's PkC).
export const WEBSITE_HEADINGS = [
  'First', 'Last', 'Team', 'Pos', 'JNo', 'Ovr',
  'Wgt', 'Agl', 'Spd', 'OfA', 'DfA', 'ShP-PkC', 'Chk', 'Hnd', 'StH', 'ShA', 'End-StR', 'Rgh-StL', 'Pas-GlR', 'Agr-GlL',
]
const HAND = 7
const STICK_HANDLING = 8

// The games whose players keep the ratings in that order, 0 to 6: NHL 94 (both systems), most of its hacks and NHL '95.
export function websiteRosterSupported(game: GameConfig): boolean {
  // Not ROMs rated 0 to 15 or with an overall of their own (EVO): the website takes 0 to 6 and NHL 94's overall.
  return !game.overallIsEstimate && game.playerAttributeKinds.length === 14 && isHandedFighting(game.playerAttributeKinds[HAND])
}

export function websiteRosterFileName(setName: string): string {
  return `${setName}_website_players.csv`
}

// The name in two at its first space ("James van Riemsdyk" is James and van Riemsdyk), as the admin chose.
function splitName(name: string): [string, string] {
  const trimmed = name.trim()
  const at = trimmed.indexOf(' ')
  return at < 0 ? ['', trimmed] : [trimmed.slice(0, at), trimmed.slice(at + 1).trim()]
}

const quote = (cell: string | number) => {
  const text = String(cell)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function websiteRosterRows(project: RomProject): (string | number)[][] {
  const { game } = project
  const rows: (string | number)[][] = [WEBSITE_HEADINGS]
  for (const team of project.teams) {
    const goalies = goalieCount(team)
    team.players.forEach((player, i) => {
      const isGoalie = i < goalies
      const position = isGoalie ? 'G' : i - goalies < team.forwards ? 'F' : 'D'
      const ratings = player.attributes.map((value, a) => {
        if (isGoalie) return value
        // The hand alone, 1 for a right shot; the fighting kept with it in the ROM left out.
        if (a === HAND) return shootsRight(game.playerAttributeKinds[HAND], value) ? 1 : 0
        // NHL '95's stick handling, in 16 steps, as the 0 to 6 rating it stands for.
        if (a === STICK_HANDLING && game.playerAttributeKinds[a] === 'stickHandling95') return stickHandling95Step(value)
        return value
      })
      // The overall as the website has it: NHL 94's Genesis roster screen's (the SNES game shows a goalie's one
      // higher at times, and up to 100), at most 99.
      const overall = Math.min(99, overallRating(player.attributes, isGoalie, { overallIsEstimate: false, edition: game.edition }))
      const jersey = (player.jersey >> 4) * 10 + (player.jersey & 0x0f)
      rows.push([...splitName(player.name), team.names[1] ?? '', position, jersey, overall, ...ratings])
    })
  }
  return rows
}

// Plain, as the website's own file is: commas, no byte-order mark, a line feed after each row.
export function websiteRosterCsv(project: RomProject): string {
  return websiteRosterRows(project).map((row) => row.map(quote).join(',')).join('\n') + '\n'
}
