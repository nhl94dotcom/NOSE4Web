// Bringing one team in from another ROM: a team an owner edited in their own
// copy, or one carried over from last season.

import {
  banner,
  bannerColors,
  bannerSharedWith,
  bannersEditable,
  bannersSupported,
  menuLogo,
  menuLogoPalette,
  menuLogoStart,
  rinkLogo,
  visitorBannersApart,
  withBanner,
  withBannerColors,
  withRinkLogo,
  writeGraphics,
  type BannerKind,
} from './graphics'
import { convertWeight, isRating, weightBase, type AttributeKind } from './attributes'
import { NHL94 } from './games'
import { importPhotos } from './photoimport'
import { snesBlockColours, withSnesBlockColours } from './snesblockcolours'
import { HACK_PARTS, hackState, narrowRating, widenRating } from './hacks'
import { detectSnesHacks } from './sneshacks'
import type { RomProject } from './rom'
import { MAX_ROSTER } from './roster'
import { goalieCount, teamDisplayName } from './team'

export interface ImportParts {
  names: boolean
  // Players, positions and lines, which only make sense together.
  roster: boolean
  colours: boolean
  pictures: boolean
  // Player photos, which come only with the roster: a photo is for a place on it.
  photos?: boolean
}

export const ALL_PARTS: ImportParts = { names: true, roster: true, colours: true, pictures: true, photos: true }

// Colours 5 and up of a menu logo's 16 are its own; see graphics.ts.
const LOGO_OWN_COLORS_FROM = 5

export interface ImportResult {
  project: RomProject
  // What was brought in, and anything that could not be.
  notes: string[]
}

// Replaces parts of team `to` in `project` with team `from` of `other`.
export function importTeam(project: RomProject, other: RomProject, from: number, to: number, parts: ImportParts): ImportResult {
  const source = other.teams[from]
  let team = project.teams[to]
  if (!source || !team) throw new Error('That team is not in the ROM.')
  const notes: string[] = []

  if (parts.names) {
    // On the SNES the banner name comes too, between ROMs that keep one.
    team = { ...team, names: source.names, placeName: team.placeName !== undefined && source.placeName !== undefined ? source.placeName : team.placeName }
    notes.push('Names brought in.')
  }
  if (parts.roster) {
    if (source.players.length > MAX_ROSTER) throw new Error(`${teamDisplayName(source)} has more players than a team can hold.`)
    team = {
      ...team,
      players: source.players,
      forwards: source.forwards,
      defense: source.defense,
      goalieNibbles: source.goalieNibbles,
      teamBytes: source.teamBytes,
      // The SNES game's overall rating as it shows it, kept with the team, goes with the players it rates.
      shownOverall: team.shownOverall !== undefined && source.shownOverall !== undefined ? source.shownOverall : team.shownOverall,
      // A line keeps its last, unused byte; its seven positions come across.
      lines: team.lines.map((line, l) => (source.lines[l] ? [...source.lines[l].slice(0, 7), ...line.slice(7)] : line)),
    }
    notes.push(`Roster and lines brought in: ${source.players.length} players.`)
    // The power play and penalty kill fix changes which half of the team's
    // second rating byte the game reads for each. Where one ROM has it and
    // the other not, the halves are swapped, so the team plays as it did.
    const [theirFix, ourFix] = [ppPkFixed(other), ppPkFixed(project)]
    if (theirFix !== null && ourFix !== null && theirFix !== ourFix) {
      const [first, second, third] = team.teamBytes
      team = { ...team, teamBytes: [first, ((second & 0x0f) << 4) | (second >> 4), third] }
      notes.push(
        `The other ROM ${theirFix ? 'has' : 'does not have'} the power play and penalty kill fix and this one ${ourFix ? 'does' : 'does not'}, so the team's power play and penalty kill ratings were swapped to play as they did.`,
      )
    } else if ((theirFix === null || ourFix === null) && other.game.productCode !== project.game.productCode) {
      notes.push(
        "NOSE4Web cannot tell whether one of the two ROMs has the power play and penalty kill fix, which changes how those two ratings are read, so they came across as stored: check them.",
      )
    }
    // Where the two ROMs are set up for different eras' weights, each player
    // keeps as near as can be the pounds he weighed.
    const [theirs, ours] = [weightBase(other.game.playerAttributeKinds[0]), weightBase(project.game.playerAttributeKinds[0])]
    if (theirs !== null && ours !== null && theirs !== ours) {
      team = { ...team, players: team.players.map((p) => ({ ...p, attributes: p.attributes.map((v, a) => (a === 0 ? convertWeight(v, theirs, ours) : v)) })) }
      notes.push(`The other ROM's weights start at ${theirs} pounds and this one's at ${ours}. Each player's weight was moved to the nearest here.`)
    }
    // The two games' 0 to 6 ratings are kept alike, though their screens show them a little differently.
    const ratings = (kinds: AttributeKind[]) => kinds.slice(1).map((kind) => (isRating(kind) ? 'rating' : kind)).join()
    // Between the original 0 to 6 ratings and a ROM hacked for 0 to 15, each
    // rating is restated so that the player plays as he did.
    const [theirScale, ourScale] = [hackState(other), hackState(project)]
    if (theirScale && ourScale && theirScale.choices.wideRatings !== ourScale.choices.wideRatings && ![...theirScale.unknown, ...ourScale.unknown].includes('ratings')) {
      const restate = ourScale.choices.wideRatings ? widenRating : narrowRating
      const goalies = goalieCount(team)
      team = {
        ...team,
        players: team.players.map((p, i) => {
          const kinds = i < goalies ? NHL94.goalieAttributeKinds : NHL94.playerAttributeKinds
          return { ...p, attributes: p.attributes.map((v, a) => (kinds[a] === 'rating' ? restate(v) : v)) }
        }),
      }
      const scale = (wide: boolean) => (wide ? '0 to 15' : '0 to 6')
      notes.push(`The other ROM rates players from ${scale(theirScale.choices.wideRatings)} and this one from ${scale(ourScale.choices.wideRatings)}. Each rating was restated on this ROM's scale.`)
    } else if (ratings(project.game.playerAttributeKinds) !== ratings(other.game.playerAttributeKinds)) {
      notes.push('The two ROMs rate players on different scales. The attributes came across as the values stored, so they will need adjusting.')
    }
  }
  // The Genesis and SNES games give their 16 strip colours different jobs.
  if (parts.colours && (project.game.platform !== other.game.platform || source.palette.length !== team.palette.length)) {
    notes.push('Colours were not brought in: the two games keep them in different ways.')
  } else if (parts.colours) {
    team = { ...team, palette: source.palette }
    notes.push('Home and away colours brought in.')
  }
  let next: RomProject = { ...project, teams: project.teams.map((t, i) => (i === to ? team : t)) }
  // On the SNES the team's block, its name banner, has colours of its own, which come with its strips.
  if (parts.colours && project.game.platform === 'snes' && other.game.platform === 'snes') {
    const block = snesBlockColours(other, from)
    if (block && snesBlockColours(next, to)) {
      try {
        next = withSnesBlockColours(next, to, block)
        notes.push('Its name banner colours brought in.')
      } catch (e) {
        notes.push(`Its name banner colours were left alone: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  if (parts.pictures) {
    if (!project.graphicsSupported || !other.graphicsSupported) {
      notes.push('Logos and banners were left alone: one of the two ROMs keeps them in a way the editor cannot read.')
    } else {
      next = importPictures(next, other, from, to, notes)
    }
  }
  if (parts.photos) {
    if (parts.roster) next = importPhotos(next, other, from, to, notes)
    else notes.push('Player photos were left alone: they come only with the roster, since each is for a place on it.')
  }
  return { project: next, notes }
}

function importPictures(project: RomProject, other: RomProject, from: number, to: number, notes: string[]): RomProject {
  let next = project
  // Each picture is tried on its own, so one that does not fit does not stop the rest.
  const attempt = (name: string, make: (current: RomProject) => RomProject) => {
    try {
      const made = make(next)
      writeGraphics(made.bytes.slice(), made.game, made.graphics)
      next = made
      notes.push(`${name} brought in.`)
    } catch (e) {
      notes.push(`${name} left alone: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  attempt('Centre-ice logo', (p) => ({ ...p, graphics: withRinkLogo(p, to, rinkLogo(other, from)) }))
  attempt('Menu logo', (p) => {
    const palette = menuLogoStart(p, to)
    menuLogoPalette(other, from).forEach((word, i) => {
      if (i >= LOGO_OWN_COLORS_FROM) palette[i] = palette[16 + i] = word
    })
    return {
      ...p,
      graphics: {
        ...p.graphics,
        menuLogos: { ...p.graphics.menuLogos, [to]: menuLogo(other, from) },
        menuPalettes: { ...p.graphics.menuPalettes, [to]: withBannerColors(palette, bannerColors(p, to)) },
      },
    }
  })
  attempt('Menu banner colours', (p) => ({
    ...p,
    graphics: {
      ...p.graphics,
      menuPalettes: {
        ...p.graphics.menuPalettes,
        [to]: withBannerColors(p.graphics.menuPalettes[to] ?? menuLogoStart(p, to), bannerColors(other, from)),
      },
    },
  }))

  if (!bannersSupported(project) || !bannersSupported(other)) {
    notes.push('Banners left alone: one of the two ROMs keeps them in a way the editor cannot follow.')
    return next
  }
  const banners: [BannerKind, BannerKind, string][] = [
    ['menu', 'menu', visitorBannersApart(project) ? 'Menu banner (home)' : 'Menu banner'],
    ['game', 'game', 'In-game banner'],
  ]
  // A ROM without visitor banners of its own shows its menu banner for both sides.
  if (visitorBannersApart(project)) banners.push([visitorBannersApart(other) ? 'visitor' : 'menu', 'visitor', 'Menu banner (visitor)'])
  for (const [theirs, ours, name] of banners) {
    if (!bannersEditable(project, ours)) {
      notes.push(`${name} left alone: this ROM keeps it in a way the editor cannot change.`)
    } else if (bannerSharedWith(project, ours, to).length > 1) {
      notes.push(`${name} left alone: in this ROM every team shows the same one. Give the logos and banners more room first if each team should have its own.`)
    } else {
      attempt(name, (p) => ({ ...p, graphics: withBanner(p, ours, to, banner(other, theirs, from)) }))
    }
  }
  return next
}

// Whether a ROM has the power play and penalty kill fix, or null where it has other code there.
function ppPkFixed(project: RomProject): boolean | null {
  if (project.game.platform === 'snes') {
    const state = detectSnesHacks(project.bytes)
    return state.unknown.includes('ppPkFix') ? null : state.choices.ppPkFix
  }
  const state = hackState(project)
  if (!state) return null
  return state.unknown.includes(HACK_PARTS.ppPkFix) ? null : state.choices.ppPkFix
}
