import { attributeText } from './attributes'
import type { RomProject } from './rom'
import { menuOptions } from './settings'
import { goalieCount, teamDisplayName, teamSpace, type Team } from './team'

// Looks over a project for things that are likely to cause trouble in the
// game. Nothing here stops a download; it is a list for the user to review.

export interface Finding {
  // "problem": expect the game to misbehave. "note": unusual, worth a look.
  level: 'problem' | 'note'
  // Where it is: a team's name, or a part of the game settings.
  where: string
  // The team to go to, when the finding is about one.
  team?: number
  message: string
}

const LINE_SLOTS = 7
const EXTRA_ATTACKER_SLOT = 6
const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`

function checkTeam(project: RomProject, team: Team, index: number, findings: Finding[]): void {
  const { game } = project
  const where = teamDisplayName(team)
  const add = (level: Finding['level'], message: string) => findings.push({ level, where, team: index, message })
  const goalies = goalieCount(team)
  const count = team.players.length

  team.players.forEach((player, i) => {
    const label = player.name || `Player ${i + 1}`
    if (player.name.trim() === '') add('problem', `Player ${i + 1} has no name.`)
    else if (!player.name.includes(' ')) add('note', `${label} has no space in the name. The game expects a first and last name.`)
    if ((player.jersey >> 4) > 9 || (player.jersey & 0x0f) > 9) add('problem', `${label} has a jersey number that is not 00 to 99.`)

    const kinds = i < goalies ? game.goalieAttributeKinds : game.playerAttributeKinds
    const labels = i < goalies ? game.goalieAttributeLabels : game.playerAttributeLabels
    const odd = labels.filter((_, a) => attributeText(kinds[a], player.attributes[a]) === null)
    if (odd.length > 0) add('note', `${label} has ${odd.join(', ')} set to a value the game does not normally use.`)
  })

  const jerseys = new Map<number, string[]>()
  for (const player of team.players) jerseys.set(player.jersey, [...(jerseys.get(player.jersey) ?? []), player.name])
  for (const [jersey, names] of jerseys) {
    if (names.length > 1) add('note', `${names.join(' and ')} share jersey number ${jersey.toString(16).padStart(2, '0')}.`)
  }

  if (goalies + team.forwards + team.defense !== count) {
    add('note', `The roster has ${plural(count, 'player')}, but the goalie, forward and defence counts add up to ${goalies + team.forwards + team.defense}.`)
  }

  team.lines.forEach((line, l) => {
    const name = `Line ${game.lineLabels[l]}`
    const slots = line.slice(0, LINE_SLOTS)
    const missing = slots.some((position) => position === 0 || position > count)
    if (missing) add('problem', `${name} has a position with no valid player.`)
    if (!missing && slots[0] !== 1) add('note', `${name} does not have the first goalie in goal.`)
    if (slots.slice(1).some((position) => position >= 1 && position <= goalies)) {
      add('problem', `${name} has a goalie in a skater's position.`)
    }
    // The extra attacker is left out: the original game often repeats a player there.
    const valid = slots.slice(0, EXTRA_ATTACKER_SLOT).filter((position) => position >= 1 && position <= count)
    if (new Set(valid).size < valid.length) add('note', `${name} uses the same player twice.`)
  })
}

export function checkProject(project: RomProject): Finding[] {
  const { game, teams, settings, layout } = project
  const findings: Finding[] = []

  const space = teamSpace(teams, layout)
  if (space.used > space.available) {
    findings.push({
      level: 'problem',
      where: 'Space',
      message: `The team data is ${space.used - space.available} bytes too large. The ROM cannot be downloaded until it fits.`,
    })
  }

  teams.forEach((team, i) => checkTeam(project, team, i, findings))

  settings.playoffDraws.forEach((draw, d) => {
    const where = `Playoff draw ${d + 1}`
    if (draw.some((team) => team >= teams.length)) {
      findings.push({ level: 'problem', where, message: 'It names a team the ROM does not have.' })
    } else if (new Set(draw).size < draw.length) {
      findings.push({ level: 'note', where, message: 'A team appears in it more than once.' })
    }
  })

  const names = teams.map(teamDisplayName)
  settings.menu.forEach((item, i) => {
    if (item.value >= menuOptions(settings, game, i, names).length) {
      findings.push({ level: 'problem', where: 'Main menu', message: `"${item.caption}" starts on a choice that does not exist.` })
    }
  })

  return findings
}
