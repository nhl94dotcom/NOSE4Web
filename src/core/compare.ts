import { attributeText } from './attributes'
import { readMenuPicture } from './menupicture'
import { readSong } from './genesismusic'
import { readSplash } from './splash'
import { SNES_SONG_SLOTS, snesSongName } from './snessongs'
import { SONG_NUMBERS, songName, SONG_SLOTS } from './teamsongs'
import { photoDifferences, pictureDifferences, picturesMayDiffer } from './comparepictures'
import { hackDifferences, hacksSupported } from './hacks'
import { snesHackDifferences } from './sneshacks'
import { overallRating } from './rating'
import type { RomProject } from './rom'
import { menuOptions, pullGoalieText } from './settings'
import { goalieCount, teamDisplayName, teamLabels, type Player, type Team } from './team'
import { projectTeamRatings } from './ppfix'
import { teamRatings, type TeamRating } from './teamratings'
import { settingsInTeamOrder } from './teamorder'

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

function compareTeam(project: RomProject, before: Team, after: Team, sameGame: boolean, ratings: TeamRating[]): string[] {
  const changes: string[] = []
  after.names.forEach((text, i) => {
    if (text !== before.names[i]) changes.push(`${NAME_LABELS[i]}: "${before.names[i]}" to "${text}".`)
  })
  if (before.snesSongs && after.snesSongs) {
    before.snesSongs.forEach((was, slot) => {
      const now = after.snesSongs![slot]
      if (was !== now) changes.push(`Organ song, ${SNES_SONG_SLOTS[slot].toLowerCase()}: ${snesSongName(project.bytes, was)} to ${snesSongName(project.bytes, now)}.`)
    })
  }
  if (before.songs && after.songs) {
    before.songs.forEach((was, slot) => {
      const now = after.songs![slot]
      if (was !== now) changes.push(`Organ song, ${SONG_SLOTS[slot].toLowerCase()}: ${songName(was)} to ${songName(now)}.`)
    })
  }
  if (before.placeName !== undefined && after.placeName !== undefined && before.placeName !== after.placeName) {
    changes.push(`Banner name: "${before.placeName}" to "${after.placeName}".`)
  }
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
  ratings.forEach((rating, i) => {
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
  const [pullNow, pullWas] = [now.cpuPullGoalie, old.cpuPullGoalie]
  if (pullNow && pullWas && (pullNow.goalsUnder !== pullWas.goalsUnder || pullNow.secondsUnder !== pullWas.secondsUnder)) {
    add('Computer pulls its goalie', [`${pullGoalieText(pullWas)} to ${pullGoalieText(pullNow)}.`])
  }
  const [creditsNow, creditsWas] = [now.credits, old.credits]
  if (creditsNow && creditsWas) {
    const lines = creditsNow.pages.flatMap((page, i) =>
      JSON.stringify(page) === JSON.stringify(creditsWas.pages[i]) ? [] : [`Page ${i + 1}: ${page.filter((line) => line.trim()).join(' / ') || '(blank)'}.`],
    )
    if (creditsWas.pages.length > creditsNow.pages.length) lines.push(`${creditsWas.pages.length - creditsNow.pages.length} pages fewer, ${creditsNow.pages.length} in all.`)
    add('Title screen credits', lines)
  }
  if (before.game.platform === 'genesis' && after.game.platform === 'genesis') {
    const [was, now] = [readSplash(before.bytes), readSplash(after.bytes)]
    const same = was && now && was.palette.every((c, i) => c === now.palette[i]) && was.picture.pixels.every((p, i) => p === now.picture.pixels[i])
    if (was && now && !same) add('Splash screen', [now.original ? "The original game's screen again." : 'A picture of its own.'])
    const [menuWas, menuNow] = [readMenuPicture(before.bytes), readMenuPicture(after.bytes)]
    const menuSame = menuWas && menuNow && menuWas.palette.every((c, i) => c === menuNow.palette[i]) && menuWas.picture.pixels.every((p, i) => p === menuNow.picture.pixels[i])
    if (menuWas && menuNow && !menuSame) add('Main menu background', [menuNow.original ? "The original game's background again." : 'A picture of its own.'])
    const songLines = SONG_NUMBERS.flatMap((number) => {
      const [was, now] = [readSong(before.bytes, number), readSong(after.bytes, number)]
      if (!was || !now || JSON.stringify(was.events) === JSON.stringify(now.events)) return []
      return [`Song ${number - 0x2f}: ${now.custom ? `"${now.custom.name}", from a MIDI file` : "the game's own again"}.`]
    })
    add('Organ songs', songLines)
  }

  const choice = (project: RomProject, i: number) => {
    const item = project.settings.menu[i]
    return menuOptions(project.settings, project.game, i, project.teams.map(teamDisplayName))[item.value] ?? `choice ${item.value + 1}`
  }
  const offered = old.menuTeams && now.menuTeams && old.menuTeams.offered !== now.menuTeams.offered
  add('Main menu', [
    ...(offered ? [`Teams in the menu: ${old.menuTeams!.offered} to ${now.menuTeams!.offered}.`] : []),
    ...now.menu.flatMap((item, i) => {
      if (!old.menu[i] || choice(before, i) === choice(after, i)) return []
      return [`${item.caption}: ${choice(before, i)} to ${choice(after, i)}.`]
    }),
  ])

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

// Where each of `after`'s teams was in `before`, where the two are one opened
// ROM and teams were moved in between; null where none was.
export function movedPlaces(before: RomProject, after: RomProject): number[] | null {
  const identity = after.teams.map((_, n) => n)
  const [was, now] = [before.teamOrder ?? identity, after.teamOrder ?? identity]
  if (was.join() === now.join()) return null
  return now.map((original) => was.indexOf(original))
}

// Which of `before`'s teams each of `after`'s is compared with (-1 for none).
// One game's ROMs keep their teams in one order, so teams are compared by
// place; but where teams were moved in one opened ROM, each is compared with
// itself (see teamorder.ts), and where two ROMs list the same teams in other
// orders, as after teams are put in alphabetical order, by name. The Genesis
// and SNES games keep theirs in different orders, as do SNES ROMs rebuilt with
// other teams, so there teams are always matched by name.
export function teamPairing(before: RomProject, after: RomProject): { counterpart: number[]; how: 'place' | 'moved' | 'name'; gamesDiffer: boolean } {
  const gamesDiffer = before.game.platform !== after.game.platform || (after.game.platform === 'snes' && before.game.productCode !== after.game.productCode)
  if (!gamesDiffer && before.source === after.source && before.teams.length === after.teams.length) {
    const moves = movedPlaces(before, after)
    if (moves) return { counterpart: moves, how: 'moved', gamesDiffer }
  }
  const beforeNames = before.teams.map(teamDisplayName)
  const afterNames = after.teams.map(teamDisplayName)
  const taken = new Set<number>()
  // Of several teams with one name, the one in the same place is preferred.
  const byName = afterNames.map((name, i) => {
    const matches = beforeNames.flatMap((other, b) => (other === name && !taken.has(b) ? [b] : []))
    const found = matches.includes(i) ? i : (matches[0] ?? -1)
    if (found >= 0) taken.add(found)
    return found
  })
  if (gamesDiffer) return { counterpart: byName, how: 'name', gamesDiffer }
  const byPlace = afterNames.map((_, i) => (i < beforeNames.length ? i : -1))
  const agree = (counterpart: number[]) => counterpart.filter((b, i) => b >= 0 && beforeNames[b] === afterNames[i]).length
  return agree(byName) > agree(byPlace) ? { counterpart: byName, how: 'name', gamesDiffer } : { counterpart: byPlace, how: 'place', gamesDiffer }
}

// What changed going from `before` to `after`. Empty when nothing did.
export function compareProjects(before: RomProject, after: RomProject): Difference[] {
  const sections: Difference[] = []
  const general: string[] = []
  if (before.game.productCode !== after.game.productCode && before.source !== after.source) {
    general.push(`These are different games: ${before.game.title} and ${after.game.title}.`)
  }
  const samePlatform = before.game.platform === after.game.platform
  const pairing = teamPairing(before, after)
  const byName = pairing.how === 'name'
  const moves = pairing.how === 'moved' ? pairing.counterpart : null
  const { counterpart } = pairing
  if (moves) {
    const shifted = moves.flatMap((was, n) => (was === n ? [] : [`${teamDisplayName(after.teams[n])} is now team ${n + 1} (was ${was + 1})`]))
    general.push(`Teams were moved: ${shifted.join('; ')}.`)
  }
  if (byName) {
    const unmatched = after.teams.filter((_, i) => counterpart[i] < 0).map(teamDisplayName)
    general.push(
      `Teams are matched by name, as the two ${pairing.gamesDiffer ? 'games keep' : 'ROMs list'} them in different orders.${unmatched.length > 0 ? ` No match was found for ${unmatched.join(', ')}.` : ''}`,
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
  } else if (before.game.platform === 'snes' && after.game.platform === 'snes') {
    const hacks = snesHackDifferences(before.bytes, after.bytes)
    if (hacks.length > 0) sections.push({ heading: 'Hacks', changes: hacks })
  }

  const labels = teamLabels(after.teams, after.game)
  const ratings = projectTeamRatings(after)
  after.teams.forEach((team, i) => {
    if (counterpart[i] < 0) return
    const changes = compareTeam(after, before.teams[counterpart[i]], team, samePlatform, ratings)
    // Logos and banners, decoded only where they can have changed.
    if (samePlatform && picturesMayDiffer(before, after, i)) changes.push(...pictureDifferences(before, counterpart[i], after, i))
    // Photos and score logos are in the ROM's bytes, and players may have moved.
    if (samePlatform && (before.bytes !== after.bytes || before.teams !== after.teams)) changes.push(...photoDifferences(before, counterpart[i], after, i))
    if (changes.length > 0) sections.push({ heading: labels[i], changes })
  })
  // Where every team has its counterpart in one game, teams in other places
  // are compared by their numbers in `after`: the draws and menu choices too.
  // Teams matched only in part, or across games, leave the menus' team
  // choices out, as they cannot be compared.
  const whole =
    !pairing.gamesDiffer && before.teams.length === after.teams.length && counterpart.every((b) => b >= 0) && new Set(counterpart).size === counterpart.length
  if (pairing.how !== 'place' && !whole) return sections
  const was =
    pairing.how === 'place'
      ? before
      : {
          ...before,
          teams: counterpart.map((place) => before.teams[place]),
          settings: settingsInTeamOrder(before.settings, before.game, (team) => (counterpart.indexOf(team) < 0 ? team : counterpart.indexOf(team))),
        }
  return [...sections, ...compareSettings(was, after)]
}
