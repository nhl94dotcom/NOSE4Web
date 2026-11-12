import { attributeText } from './attributes'
import { colorRgb } from './color'
import { creditsFit } from './credits'
import { scoutingLineProblem, scoutingUsed } from './scouting'
import { isSong, teamSongsRoom } from './teamsongs'
import { checkLeagueRules } from './leaguerules'
import { emptyLineSlots, LINE_SLOTS, outOfRoleSlots, playerRole, repeatedLineSlots } from './lines'
import type { RomProject } from './rom'
import { playoffLastWritten, teamsMissingFromDraws } from './menuteams'
import { photoLayout, setupCardCount } from './photos'
import { snesPlaceNameRoom } from './snesplacenames'
import { snesLogosThatSpill } from './snespictures'
import { anyPosition } from './anyposition'
import { menuOptions } from './settings'
import { goalieCount, overfullTeams, teamLabels, teamSpace, type Team } from './team'
import { snesBannerNameProblem } from './snesblockpicture'

// Looks over a project for things that are likely to cause trouble in the
// game. Nothing here stops a download; it is a list for the user to review.

export interface Finding {
  // "problem": expect the game to misbehave. "rule": against the league's own
  // rules, which the game does not care about. "note": unusual, worth a look.
  level: 'problem' | 'rule' | 'note'
  // Where it is: a team's name, or a part of the game settings.
  where: string
  // The team to go to, when the finding is about one.
  team?: number
  message: string
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`

function checkTeam(project: RomProject, team: Team, index: number, where: string, emptySlots: boolean[][], findings: Finding[]): void {
  const { game } = project
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
    if (names.length < 2) continue
    const number = jersey.toString(16).padStart(2, '0')
    // Some hacks fill a roster with copies of one player.
    if (new Set(names).size === 1) add('note', `${names[0]} is on the roster ${names.length} times, with jersey number ${number}.`)
    else add('note', `${[...new Set(names)].join(' and ')} share jersey number ${number}.`)
  }

  if (goalies + team.forwards + team.defense !== count) {
    add('note', `The roster has ${plural(count, 'player')}, but the goalie, forward and defence counts add up to ${goalies + team.forwards + team.defense}.`)
  }

  team.lines.forEach((line, l) => {
    const name = `Line ${game.lineLabels[l]}`
    const slots = line.slice(0, LINE_SLOTS)
    // A position this ROM leaves empty on every team is not a mistake.
    const missing = slots.some((position, slot) => position > count || (position === 0 && !emptySlots[l]?.[slot]))
    if (missing) add('problem', `${name} has a position with no valid player.`)
    if (!missing && slots[0] !== 1) add('note', `${name} does not have the first goalie in goal.`)
    if (slots.slice(1).some((position) => position >= 1 && position <= goalies)) {
      add('problem', `${name} has a goalie in a skater's position.`)
    }
    // The extra attacker is left out: the original game often repeats a player there.
    const valid = (slot: number) => slots[slot] >= 1 && slots[slot] <= count
    const at = (slot: number) => game.linePositionLabels[slot]
    for (const slot of repeatedLineSlots(slots).filter(valid)) {
      const first = slots.findIndex((position) => position === slots[slot])
      add(
        'problem',
        `${name} has ${team.players[slots[slot] - 1].name} at both ${at(first)} and ${at(slot)}. The game plays such a line a skater short, with no penalty, until a line change: one copy of him leaves the ice and no one takes his place.`,
      )
    }
    for (const slot of outOfRoleSlots(team, slots, anyPosition(project))) {
      const role = playerRole(team, slots[slot]) === 'forward' ? 'a forward' : 'a defenceman'
      add('note', `${name} has ${team.players[slots[slot] - 1].name}, ${role}, at ${at(slot)}.`)
    }
  })
}

// A strip's colours are 16 of a team's 32: the home strip first, then the
// away. These are the ones that say what a player looks like from a distance.
const BODY = [11, 12, 13]
const PANTS = [3, 4, 5]
const ICE = 0
// How far apart two colours must be to be told apart at a glance, as a
// distance between them where black to white is about 440.
const TOO_CLOSE = 40
const GHOSTLY = 60

const mix = (palette: number[], slots: number[]): number[] => {
  const colours = slots.map((slot) => colorRgb(palette[slot]))
  return [0, 1, 2].map((channel) => colours.reduce((sum, colour) => sum + colour[channel], 0) / colours.length)
}
const apart = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

// Strips that would be hard to tell apart in a game: one team's home strip
// against another's away strip, which is how the two meet, and a strip that
// all but vanishes against the ice.
function checkStrips(project: RomProject, labels: string[], findings: Finding[]): void {
  if (!project.game.stripColorsKnown) return
  const strips = project.teams.map((team) => ({ home: team.palette.slice(0, 16), away: team.palette.slice(16) }))
  strips.forEach((mine, t) => {
    const alike = strips.flatMap((theirs, other) =>
      other !== t && apart(mix(mine.home, BODY), mix(theirs.away, BODY)) < TOO_CLOSE && apart(mix(mine.home, PANTS), mix(theirs.away, PANTS)) < TOO_CLOSE ? [labels[other]] : [],
    )
    if (alike.length > 0) {
      findings.push({
        level: 'note',
        where: labels[t],
        team: t,
        message: `The home strip looks much like the away strip of ${alike.join(', ')}. When they visit, the two teams will be hard to tell apart.`,
      })
    }
    for (const [name, strip] of [['home', mine.home], ['away', mine.away]] as const) {
      const ice = colorRgb(strip[ICE])
      if (apart(mix(strip, BODY), ice) < GHOSTLY && apart(mix(strip, PANTS), ice) < GHOSTLY) {
        findings.push({ level: 'note', where: labels[t], team: t, message: `The ${name} strip is close to the colour of the ice all over, so the players will be hard to see.` })
      }
    }
  })
}

// The setup screen shows the cards of a team's first six featured players.
// One for a place past the end of the roster shows whatever follows the team
// in the ROM for the card's name and numbers. (Later ones only go
// unused: the matchup screen finds a player's photo by his place.)
function checkPhotos(project: RomProject, labels: string[], findings: Finding[]): void {
  if (project.game.platform === 'snes') return
  const layout = photoLayout(project.bytes, project.teams.length)
  layout?.lists.forEach((list, team) => {
    const count = project.teams[team].players.length
    const shown = setupCardCount(project.bytes)
    if (list.entries.length < shown) {
      // Match Viewer, in the game: no crash, but an empty entry draws the
      // start of the ROM as a picture, and the setup screen goes on past it.
      findings.push({
        level: 'note',
        where: labels[team],
        team,
        message: `The team setup screen cycles through ${shown} player cards, but the team's photo list ends after ${list.entries.length}. The setup screen does not stop there: card ${list.entries.length + 1} shows a garbage picture, and any cards after it come from what follows in the ROM, which the matchup screens and player cards never show. Add players under Player photos.`,
      })
    }
    const past = list.entries.slice(0, shown).flatMap((entry, i) => (entry.slot >= count ? [i + 1] : []))
    if (past.length === 0) return
    const one = past.length === 1
    findings.push({
      level: 'note',
      where: labels[team],
      team,
      message: `${one ? 'Player photo' : 'Player photos'} ${past.join(', ')}, shown on the team setup screen, ${one ? 'is' : 'are'} for a place past the end of the roster, which has ${count} players. Choose who ${one ? 'it is' : 'they are'} for under Player photos.`,
    })
  })
}

export function checkProject(project: RomProject): Finding[] {
  const { game, teams, settings, layout } = project
  const findings: Finding[] = []

  const labels = teamLabels(teams, game)
  for (const { team, over } of overfullTeams(teams, layout)) {
    findings.push({
      level: 'problem',
      where: labels[team],
      team,
      message: `The team is ${over} bytes too large for its place in the ROM. The ROM cannot be downloaded until it fits: shorten names or remove a player.`,
    })
  }
  const space = teamSpace(teams, layout)
  if (!layout.slots && space.used > space.available) {
    findings.push({
      level: 'problem',
      where: 'Space',
      message: `The team data is ${space.used - space.available} bytes too large. The ROM cannot be downloaded until it fits.`,
    })
  }

  const emptySlots = emptyLineSlots(teams)
  teams.forEach((team, i) => checkTeam(project, team, i, labels[i], emptySlots, findings))
  checkStrips(project, labels, findings)
  checkPhotos(project, labels, findings)
  if (project.game.platform === 'snes' && teams.every((team) => team.placeName !== undefined)) {
    teams.forEach((team, i) => {
      const problem = snesBannerNameProblem(team.placeName!)
      if (problem) findings.push({ level: problem.level, where: labels[i], message: `Its banner name, "${team.placeName}", ${problem.message} Change it under Banner name on the team page.` })
    })
    const room = snesPlaceNameRoom(project.bytes, teams.map((team) => team.placeName!), project.layout.overflow)
    if (room && room.used > room.room) {
      findings.push({
        level: 'problem',
        where: 'Banner names',
        message: `The names on the team banners need ${room.used - room.room} bytes more than the ROM has room for, so they are not written: shorten some under Banner name on the team pages.`,
      })
    }
  }

  // Logos an earlier NOSE4Web laid out past their room in the game's sprite
  // tile cache, which show stray blocks; saving the ROM lays them out again.
  if (project.game.platform === 'snes') {
    for (const team of snesLogosThatSpill(project.bytes, teams.length)) {
      if (project.snesPictures?.logos[team]) continue
      findings.push({
        level: 'problem',
        where: labels[team],
        team,
        message:
          "Its logo was laid out by an earlier NOSE4Web in a way that can show stray blocks of colour in the game, on it or elsewhere on the screen. Download the ROM from NOSE4Web and it is laid out again, looking the same.",
      })
    }
  }

  // Teams past the organ song table's room play what follows it (Match Viewer).
  const songRoom = project.game.platform === 'genesis' ? teamSongsRoom(project.bytes, teams.length) : null
  if (songRoom !== null) {
    teams.forEach((team, t) => {
      if (t < songRoom || !team.songs) return
      const silent = team.songs.filter((value) => !isSong(value)).length
      findings.push({
        level: 'note',
        where: labels[t],
        team: t,
        message: `The ROM's organ song table has room for only ${songRoom} teams, so this team's home games use what follows it in the ROM: ${
          silent === 0 ? "the game's random songs, not songs of its own" : `${plural(silent, 'song slot')} with no song at all`
        }. Choosing a song under Organ songs on the team page moves the table, so that every team has its own.`,
      })
    })
  }

  if (settings.credits && !creditsFit(settings.credits)) {
    findings.push({
      level: 'problem',
      where: 'Title screen credits',
      message:
        settings.credits.format === 'snes' && settings.credits.pages.some((page) => page.length < 2)
          ? 'A credit title has no name under it, which the game cannot show, so the credits are not written: give each title a name on the Game settings page.'
          : `The credits need more room than the ROM has for them (${settings.credits.room} bytes), so they are not written: shorten them on the Game settings page.`,
    })
  }

  const scouting = settings.scouting
  if (scouting) {
    const where = "Ron Barr's matchup screen text"
    const bad = scouting.lines.findIndex((line) => scoutingLineProblem(scouting.platform, line.text))
    const used = scoutingUsed(scouting)
    if (bad >= 0) {
      findings.push({ level: 'problem', where, message: `Line ${bad + 1}: ${scoutingLineProblem(scouting.platform, scouting.lines[bad].text)} The text is not written until it is put right on the Game settings page.` })
    } else if (used !== null && used > scouting.room) {
      findings.push({ level: 'problem', where, message: `The lines take ${used} letters and the ROM has room for ${scouting.room}, so they are not written: shorten them on the Game settings page.` })
    }
    if (scouting.missing) {
      findings.push({
        level: 'note',
        where,
        message: `The script has ${scouting.missing === 1 ? 'one line' : `${scouting.missing} lines`} fewer than the game reads, as if taken out by hand, so the lines after it show in the wrong places, and when one team is much hotter the game reads its last line from past the script and freezes. "Put the missing line back" in Ron Barr's matchup screen text, on the Game settings page, fixes it.`,
      })
    }
    const blank = scouting.lines.findIndex((line) => line.blank && line.text.trim())
    if (blank >= 0) {
      findings.push({
        level: 'note',
        where,
        message: `Line ${blank + 1} is the one the game shows as the empty line between paragraphs, several times over, and it has text, so that text shows each time. Lines that come after an added or removed line move up or down, so this is usually a line in the wrong place.`,
      })
    }
  }

  settings.playoffDraws.forEach((draw, d) => {
    const where = `Playoff draw ${d + 1}`
    if (draw.some((team) => team >= teams.length)) {
      findings.push({ level: 'problem', where, message: 'It names a team the ROM does not have.' })
    } else if (new Set(draw).size < draw.length) {
      findings.push({ level: 'note', where, message: 'A team appears in it more than once.' })
    }
  })

  if (project.freeAgents.length > 0) {
    findings.push({
      level: 'note',
      where: 'Free agents',
      message: `${plural(project.freeAgents.length, 'free agent')} ${project.freeAgents.length === 1 ? 'is' : 'are'} not on any team, and so not in the ROM. They are kept with your work in this browser and in a project file.`,
    })
  }

  const names = labels
  settings.menu.forEach((item, i) => {
    if (item.value >= menuOptions(settings, game, i, names).length) {
      findings.push({ level: 'problem', where: 'Main menu', message: `"${item.caption}" starts on a choice that does not exist.` })
    }
  })

  // New playoffs with a team no draw has freeze the game, whatever the menu offers.
  {
    const offered = settings.menuTeams?.offered ?? teams.length
    const last = playoffLastWritten(project.bytes, project.game, settings.menuTeams, settings.playoffDraws)
    const missing = teamsMissingFromDraws(offered, settings.playoffDraws, last)
    if (missing.length > 0) {
      const one = missing.length === 1
      findings.push({
        level: 'problem',
        where: 'Playoff draws',
        message: `Starting new playoffs with ${missing.map((team) => names[team]).join(', ')} freezes the game: ${one ? 'it is' : 'they are'} in none of the playoff draws${last !== null && missing.some((team) => team > last) ? ` (a team after ${names[last]} starts them as ${names[last]})` : ''}. Put ${one ? 'it' : 'them'} in a draw, or use "Fill the draws with the league's teams" on the Game settings page.`,
      })
    }
  }

  if (settings.menuTeams) {
    const { offered } = settings.menuTeams
    game.menuTeamItems.forEach((i) => {
      const item = settings.menu[i]
      if (item && item.value >= offered && item.value < teams.length) {
        findings.push({
          level: 'note',
          where: 'Main menu',
          message: `"${item.caption}" starts on ${names[item.value]}, which is not among the ${offered} teams the menu offers. The game shows it when switched on, but cannot go back to it.`,
        })
      }
    })
    const outside = settings.playoffDraws.flatMap((draw, d) => (draw.some((team) => team >= offered && team < teams.length) ? [d + 1] : []))
    if (offered < teams.length && outside.length > 0) {
      findings.push({
        level: 'note',
        where: 'Playoff draws',
        message: `${plural(outside.length, 'draw')} ${outside.length === 1 ? 'has' : 'have'} teams the menu does not offer, who would play in those playoffs: ${outside.length === settings.playoffDraws.length ? 'every draw' : `draw ${outside.join(', ')}`}. "Fill the draws with the league's teams" on the Game settings page fixes this.`,
      })
    }
  }

  // Draws themselves: a team the ROM does not have, or one team twice.
  if (settings.playoffDraws.length > 0) {
    const invalid = settings.playoffDraws.flatMap((draw, d) => (draw.some((team) => team >= teams.length) ? [d + 1] : []))
    if (invalid.length > 0) {
      findings.push({
        level: 'problem',
        where: 'Playoff draws',
        message: `${plural(invalid.length, 'draw')} ${invalid.length === 1 ? 'has' : 'have'} a team this ROM does not have (shown as Invalid): draw ${invalid.join(', ')}. Playoffs drawn so would read team data that is not there; choose a team in its place.`,
      })
    }
    const twice = settings.playoffDraws.flatMap((draw, d) => (new Set(draw).size < draw.length ? [d + 1] : []))
    if (twice.length > 0) {
      findings.push({
        level: 'problem',
        where: 'Playoff draws',
        message: `A team is in ${twice.length === 1 ? 'draw' : 'draws'} ${twice.join(', ')} twice, which the game was not made for: such playoffs can pit a team against itself. Choose another team for one of the places.`,
      })
    }
  }

  return [...findings, ...checkLeagueRules(project)]
}
