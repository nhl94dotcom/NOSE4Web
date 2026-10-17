import { attributeText } from './attributes'
import { hackDifferences, hacksSupported } from './hacks'
import { overallRating } from './rating'
import type { RomProject } from './rom'
import { menuOptions } from './settings'
import { goalieCount, teamDisplayName, teamLabels, type Player, type Team } from './team'
import { TEAM_RATINGS, teamRatings } from './teamratings'

// Describes, in plain sentences, how one project differs from another.
// Teams are matched by their position in the ROM, players and line members by
// name.

export interface Difference {
  heading: string
  changes: string[]
}

const NAME_LABELS = ['Location', 'Initials', 'Name', 'Stadium']
const ROLE_NAMES = { G: 'goalie', F: 'forward', D: 'defenceman' }
const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`
const jerseyText = (jersey: number) => jersey.toString(16).padStart(2, '0')

function role(team: Team, index: number): keyof typeof ROLE_NAMES {
  const goalies = goalieCount(team)
  return index < goalies ? 'G' : index - goalies < team.forwards ? 'F' : 'D'
}

const sameStats = (a: Player, b: Player) => a.jersey === b.jersey && a.attributes.every((v, i) => v === b.attributes[i])

// Says how the players differ, and returns where each player who stayed now
// is on the roster, by where he was.
function comparePlayers(project: RomProject, before: Team, after: Team, changes: string[]): Map<number, number> {
  const { game } = project
  // Pair up players by name, then treat an unpaired pair with identical numbers as a rename.
  const pairs: [number, number][] = []
  const unusedAfter = new Set(after.players.map((_, i) => i))
  const unusedBefore: number[] = []
  before.players.forEach((player, b) => {
    const a = [...unusedAfter].find((i) => after.players[i].name === player.name)
    if (a === undefined) unusedBefore.push(b)
    else {
      unusedAfter.delete(a)
      pairs.push([b, a])
    }
  })
  for (const b of unusedBefore.slice()) {
    const a = [...unusedAfter].find((i) => sameStats(before.players[b], after.players[i]))
    if (a === undefined) continue
    unusedAfter.delete(a)
    unusedBefore.splice(unusedBefore.indexOf(b), 1)
    changes.push(`${before.players[b].name} was renamed ${after.players[a].name}.`)
    pairs.push([b, a])
  }

  for (const b of unusedBefore) changes.push(`${before.players[b].name} was removed.`)
  for (const a of unusedAfter) {
    const player = after.players[a]
    const r = role(after, a)
    changes.push(`${player.name} was added (${ROLE_NAMES[r]}, number ${jerseyText(player.jersey)}, overall ${overallRating(player.attributes, r === 'G', project.game)}).`)
  }

  for (const [b, a] of pairs) {
    const [old, now] = [before.players[b], after.players[a]]
    const details: string[] = []
    const [oldRole, newRole] = [role(before, b), role(after, a)]
    if (oldRole !== newRole) details.push(`now a ${ROLE_NAMES[newRole]}`)
    if (old.jersey !== now.jersey) details.push(`number ${jerseyText(old.jersey)} to ${jerseyText(now.jersey)}`)
    const isGoalie = newRole === 'G'
    const labels = isGoalie ? game.goalieAttributeLabels : game.playerAttributeLabels
    const kinds = isGoalie ? game.goalieAttributeKinds : game.playerAttributeKinds
    now.attributes.forEach((value, i) => {
      if (value === old.attributes[i]) return
      const text = (v: number) => attributeText(kinds[i], v) ?? `value ${v}`
      details.push(`${labels[i]} ${text(old.attributes[i])} to ${text(value)}`)
    })
    if (details.length > 0) changes.push(`${now.name}: ${details.join('; ')}.`)
  }

  const order = (team: Team, indexes: number[]) => indexes.slice().sort((x, y) => x - y).map((i) => team.players[i].name).join('|')
  const kept = pairs.filter(([b, a]) => before.players[b].name === after.players[a].name)
  if (order(before, kept.map(([b]) => b)) !== order(after, kept.map(([, a]) => a))) changes.push('The roster order changed.')
  return new Map(pairs)
}

// A position on a line has changed if a different player is in it. The same
// player under a new name, or in a new place on the roster, is no change.
function compareLines(project: RomProject, before: Team, after: Team, stayed: Map<number, number>, changes: string[]): void {
  const { lineLabels, linePositionLabels } = project.game
  const name = (team: Team, position: number) => team.players[position - 1]?.name ?? 'nobody'
  after.lines.forEach((line, l) => {
    const swaps = linePositionLabels.flatMap((label, slot) => {
      const was = before.lines[l]?.[slot] ?? 0
      const [old, now] = [name(before, was), name(after, line[slot])]
      const samePlayer = stayed.has(was - 1) ? stayed.get(was - 1) === line[slot] - 1 : old === now
      return samePlayer ? [] : [`${label} ${old} to ${now}`]
    })
    if (swaps.length > 0) changes.push(`Line ${lineLabels[l]}: ${swaps.join('; ')}.`)
  })
}

function compareTeam(project: RomProject, before: Team, after: Team, sameGame: boolean): string[] {
  const changes: string[] = []
  after.names.forEach((text, i) => {
    if (text !== before.names[i]) changes.push(`${NAME_LABELS[i]}: "${before.names[i]}" to "${text}".`)
  })
  const stayed = comparePlayers(project, before, after, changes)
  compareLines(project, before, after, stayed, changes)

  const changedColors = (from: number) => after.palette.slice(from, from + 16).filter((w, i) => w !== before.palette[from + i]).length
  // Only within one game: the Genesis and SNES games give their colours different jobs.
  const [home, away] = sameGame ? [changedColors(0), changedColors(16)] : [0, 0]
  if (home > 0) changes.push(`${plural(home, 'home colour')} changed.`)
  if (away > 0) changes.push(`${plural(away, 'away colour')} changed.`)
  if (after.goalieNibbles.join() !== before.goalieNibbles.join()) {
    changes.push(`Goalie bytes: ${before.goalieNibbles.join(' ')} to ${after.goalieNibbles.join(' ')}.`)
  }
  if (after.shownOverall !== before.shownOverall && after.shownOverall !== undefined && before.shownOverall !== undefined) {
    changes.push(`Overall shown on the matchup screen: ${before.shownOverall} to ${after.shownOverall}.`)
  }
  const [ratedBefore, ratedAfter] = [teamRatings(before), teamRatings(after)]
  TEAM_RATINGS.forEach((rating, i) => {
    if (ratedAfter[i] !== ratedBefore[i]) changes.push(`${rating.label} rating: ${ratedBefore[i]} to ${ratedAfter[i]}.`)
  })
  return changes
}

function compareSettings(before: RomProject, after: RomProject): Difference[] {
  const sections: Difference[] = []
  const add = (heading: string, changes: string[]) => changes.length > 0 && sections.push({ heading, changes })
  const [old, now] = [before.settings, after.settings]

  const rink = after.rinkPalette.filter((word, i) => word !== before.rinkPalette[i]).length
  add('Rink colours', rink > 0 ? [`${plural(rink, 'colour')} changed.`] : [])

  const clock: string[] = []
  now.periodLengths.forEach((period, i) => {
    const was = old.periodLengths[i]
    if (!was) return
    if (period.seconds !== was.seconds) clock.push(`Period length ${i + 1}: ${was.seconds} to ${period.seconds} seconds.`)
    if (period.text !== was.text) clock.push(`Period length ${i + 1} menu text: "${was.text}" to "${period.text}".`)
  })
  if (now.overtimeSeconds !== old.overtimeSeconds) clock.push(`Overtime: ${old.overtimeSeconds} to ${now.overtimeSeconds} seconds.`)
  if (now.shootoutSeconds !== old.shootoutSeconds) clock.push(`Shootout: ${old.shootoutSeconds} to ${now.shootoutSeconds} seconds.`)
  add('Clock', clock)

  const choice = (project: RomProject, i: number) => {
    const item = project.settings.menu[i]
    return menuOptions(project.settings, project.game, i, project.teams.map(teamDisplayName))[item.value] ?? `choice ${item.value + 1}`
  }
  add(
    'Main menu',
    now.menu.flatMap((item, i) => {
      if (!old.menu[i] || choice(before, i) === choice(after, i)) return []
      return [`${item.caption}: ${choice(before, i)} to ${choice(after, i)}.`]
    }),
  )

  add(
    'Rule messages',
    now.rules.flatMap((rule, i) => {
      const was = old.rules[i]
      if (!was) return []
      const details: string[] = []
      if (rule.text !== was.text) details.push(`"${was.text}" to "${rule.text}"`)
      if (rule.delay !== was.delay) details.push(`delay ${was.delay} to ${rule.delay}`)
      if (rule.penaltyMinutes !== was.penaltyMinutes) details.push(`penalty minutes ${was.penaltyMinutes} to ${rule.penaltyMinutes}`)
      return details.length > 0 ? [`Message ${i + 1} (${rule.text}): ${details.join('; ')}.`] : []
    }),
  )

  const draws = now.playoffDraws.flatMap((draw, d) => (draw.join() === old.playoffDraws[d]?.join() ? [] : [d + 1]))
  add('Playoff draws', draws.length > 0 ? [`${plural(draws.length, 'draw')} changed: ${draws.join(', ')}.`] : [])
  return sections
}

// What changed going from `before` to `after`. Empty when nothing did.
export function compareProjects(before: RomProject, after: RomProject): Difference[] {
  const sections: Difference[] = []
  const general: string[] = []
  if (before.game.productCode !== after.game.productCode && before.source !== after.source) {
    general.push(`These are different games: ${before.game.title} and ${after.game.title}.`)
  }
  // One game's ROMs keep their teams in one order, so teams are compared by
  // place. The Genesis and SNES games keep theirs in different orders, so
  // between the two, teams are matched by name.
  const byName = before.game.platform !== after.game.platform
  const beforeNames = before.teams.map(teamDisplayName)
  const counterpart = after.teams.map((team, i) => (byName ? beforeNames.indexOf(teamDisplayName(team)) : i < before.teams.length ? i : -1))
  if (byName) {
    const unmatched = after.teams.filter((_, i) => counterpart[i] < 0).map(teamDisplayName)
    general.push(
      `Teams are matched by name, as the two games keep them in different orders.${unmatched.length > 0 ? ` No match was found for ${unmatched.join(', ')}.` : ''}`,
    )
  } else if (before.teams.length !== after.teams.length) {
    general.push(`One ROM has ${before.teams.length} teams and the other ${after.teams.length}. Only the teams both have are compared.`)
  }
  if (general.length > 0) sections.push({ heading: 'In general', changes: general })
  // Where both are one opened ROM at different moments, the hacks changed
  // are those changed since it was opened.
  if (hacksSupported(before.game) && hacksSupported(after.game)) {
    const hacks = hackDifferences(before.source === after.source ? after.source : before.bytes, after.bytes)
    if (hacks.length > 0) sections.push({ heading: 'Hacks', changes: hacks })
  }

  const labels = teamLabels(after.teams, after.game)
  after.teams.forEach((team, i) => {
    if (counterpart[i] < 0) return
    const changes = compareTeam(after, before.teams[counterpart[i]], team, !byName)
    if (changes.length > 0) sections.push({ heading: labels[i], changes })
  })
  // The SNES game's settings are not read, so there is nothing to compare them with.
  return [...sections, ...(byName ? [] : compareSettings(before, after))]
}
