// A project file holds everything the user has done, without the ROM: the
// teams, colours, settings, replaced pictures and free agents. Opened over a
// ROM, it puts that work back. It moves work between computers, keeps a copy
// of a season as it stood, and passes changes to someone with their own ROM.

import { expandTeamSpace, nextExpansion } from './expand'
import { applyHacks, hackState, sameHacks, type HackChoices } from './hacks'
import { cleanLeagueRules, type LeagueRules } from './leaguerules'
import { expandPictureSpace, NO_GRAPHICS_EDITS, pictureSpace, writeGraphics, type GraphicsEdits, type Picture } from './graphics'
import { currentPicture, pictureKinds, type PictureKind } from './pictureset'
import type { RomProject } from './rom'
import type { Baseline } from './season'
import { MAX_ROSTER } from './roster'
import type { Settings } from './settings'
import { teamDisplayName, type Team } from './team'
import type { FreeAgent } from './trade'

const FORMAT = 1
const MARK = 'NOSE4Web project'

type StoredPicture = { width: number; height: number; pixels: string }
type StoredTeam = Omit<Team, 'freeBytes'>

interface ProjectFile {
  file: typeof MARK
  format: number
  name: string
  productCode: string
  game: string
  savedAt: string
  // Room the user had made in the ROM, to be made again before the rest goes in.
  expansions: { rosterSpace: number; pictureSpace: boolean }
  teams: StoredTeam[]
  rinkPalette: number[]
  settings: Settings | null
  pictures: Record<Exclude<keyof GraphicsEdits, 'menuPalettes'>, Record<string, StoredPicture>>
  menuPalettes: Record<string, number[]>
  freeAgents: FreeAgent[]
  leagueRules?: LeagueRules
  // The hacks the ROM had, to be put into the ROM the project is opened over.
  hacks?: HackChoices
  baseline?: (Omit<Baseline, 'teams'> & { teams: StoredTeam[] }) | null
}

const PICTURE_SETS: Record<Exclude<keyof GraphicsEdits, 'menuPalettes'>, PictureKind> = {
  rinkLogos: 'rinkLogo',
  menuLogos: 'menuLogo',
  menuBanners: 'menuBanner',
  visitorBanners: 'visitorBanner',
  gameBanners: 'gameBanner',
}
const SET_NAMES = Object.keys(PICTURE_SETS) as (keyof typeof PICTURE_SETS)[]

// Pixels are packed as text, four characters for every three pixels.
function pack(bytes: Uint8Array): string {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(text)
}
function unpack(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0))
}

// How much room had been made in the ROM since it was opened.
function expansionsMade(project: RomProject, opened: RomProject): ProjectFile['expansions'] {
  let rosterSpace = 0
  for (let step = opened; nextExpansion(step) && step.layout.end - step.layout.start < project.layout.end - project.layout.start; ) {
    step = expandTeamSpace(step)
    rosterSpace++
  }
  const pictureRoom = (p: RomProject) => p.graphicsSupported && pictureSpace(p) !== null
  return { rosterSpace, pictureSpace: pictureRoom(opened) && !pictureRoom(project) }
}

// The project as the text of a file. `opened` is the ROM as it was opened.
export function saveProjectFile(project: RomProject, opened: RomProject, name: string): string {
  const pictures = Object.fromEntries(
    SET_NAMES.map((set) => [
      set,
      Object.fromEntries(
        Object.entries(project.graphics[set]).map(([team, picture]) => [team, { width: picture.width, height: picture.height, pixels: pack(picture.pixels) }]),
      ),
    ]),
  ) as ProjectFile['pictures']
  const file: ProjectFile = {
    file: MARK,
    format: FORMAT,
    name,
    productCode: project.game.productCode,
    game: project.game.title,
    savedAt: new Date().toISOString(),
    expansions: expansionsMade(project, opened),
    // Without the unused room each has in the ROM, which is the ROM's to say.
    teams: project.teams.map((team) => ({ ...team, freeBytes: undefined })),
    rinkPalette: project.rinkPalette,
    settings: project.game.settingsSupported ? project.settings : null,
    pictures,
    menuPalettes: project.graphics.menuPalettes,
    freeAgents: project.freeAgents,
    leagueRules: project.leagueRules,
    hacks: hackState(project)?.choices,
    baseline: project.baseline,
  }
  return JSON.stringify(file)
}

export class ProjectFileError extends Error {}

const isNumbers = (value: unknown, length: number, max: number): value is number[] =>
  Array.isArray(value) && value.length === length && value.every((v) => Number.isInteger(v) && v >= 0 && v <= max)

function checkPlayer(player: unknown): boolean {
  const p = player as FreeAgent['player']
  return typeof p?.name === 'string' && Number.isInteger(p.jersey) && p.jersey >= 0 && p.jersey <= 0xff && isNumbers(p.attributes, 14, 15)
}

function checkTeam(team: StoredTeam, like: Team): boolean {
  return (
    isNumbers(team?.palette, 32, 0xffff) &&
    isNumbers(team.teamBytes, like.teamBytes.length, 0xff) &&
    isNumbers(team.goalieNibbles, 4, 15) &&
    Number.isInteger(team.forwards) &&
    Number.isInteger(team.defense) &&
    Array.isArray(team.lines) &&
    team.lines.length === like.lines.length &&
    team.lines.every((line, i) => isNumbers(line, like.lines[i].length, 0xff)) &&
    Array.isArray(team.players) &&
    team.players.length >= 1 &&
    team.players.length <= MAX_ROSTER &&
    team.players.every(checkPlayer) &&
    Array.isArray(team.names) &&
    team.names.length === like.names.length &&
    team.names.every((name) => typeof name === 'string')
  )
}

// Settings from a file, laid over the ROM's own. Where each text sits in the
// ROM and how long it may be are the ROM's to say, not the file's.
function mergeSettings(base: Settings, from: Settings, teamCount: number, notes: string[]): Settings {
  const fits =
    Array.isArray(from?.playoffDraws) &&
    from.playoffDraws.length === base.playoffDraws.length &&
    from.playoffDraws.every((draw, i) => isNumbers(draw, base.playoffDraws[i].length, teamCount - 1)) &&
    Array.isArray(from.rules) &&
    from.rules.length === base.rules.length &&
    Array.isArray(from.periodLengths) &&
    from.periodLengths.length === base.periodLengths.length &&
    Array.isArray(from.menu) &&
    from.menu.length === base.menu.length
  if (!fits) {
    notes.push('The game settings in the file do not match this ROM, so they were left as they are.')
    return base
  }
  const text = (value: unknown, old: { text: string; maxLength: number }) => (typeof value === 'string' ? value.slice(0, old.maxLength) : old.text)
  const number = (value: unknown, old: number) => (Number.isInteger(value) && (value as number) >= 0 ? (value as number) : old)
  return {
    playoffDraws: from.playoffDraws,
    rules: base.rules.map((rule, i) => ({
      ...rule,
      text: text(from.rules[i]?.text, rule),
      delay: number(from.rules[i]?.delay, rule.delay),
      penaltyMinutes: number(from.rules[i]?.penaltyMinutes, rule.penaltyMinutes),
    })),
    periodLengths: base.periodLengths.map((period, i) => ({
      ...period,
      text: text(from.periodLengths[i]?.text, period),
      seconds: number(from.periodLengths[i]?.seconds, period.seconds),
    })),
    overtimeSeconds: number(from.overtimeSeconds, base.overtimeSeconds),
    shootoutSeconds: number(from.shootoutSeconds, base.shootoutSeconds),
    menu: base.menu.map((item, i) => ({ ...item, value: number(from.menu[i]?.value, item.value) })),
  }
}

export interface ProjectFileOptions {
  // Put each team in the file where the ROM has a team of the same name, not
  // where it stood in the file. For a ROM that lists the teams in another order.
  byName?: boolean
}

// Where each of a file's teams goes in the ROM, going by name. Every team has
// to find a place of its own, or the file is not matched at all.
function placesByName(file: ProjectFile, opened: RomProject): number[] {
  const names = opened.teams.map(teamDisplayName)
  const taken = new Set<number>()
  const missing: string[] = []
  const places = file.teams.map((team, i) => {
    const name = `${team?.names?.[0] ?? ''} ${team?.names?.[2] ?? ''}`.trim()
    const matches = names.flatMap((other, index) => (other === name && !taken.has(index) ? [index] : []))
    // Of several teams with one name, the one in the same place is preferred.
    const place = matches.includes(i) ? i : matches[0]
    if (place === undefined) missing.push(name || `team ${i + 1}`)
    else taken.add(place)
    return place ?? -1
  })
  if (missing.length > 0) {
    throw new ProjectFileError(
      `Matching by name, the ROM has no team of its own for: ${missing.join(', ')}. Open the project without matching by name, or rename the teams to agree.`,
    )
  }
  return places
}

// The file with its teams, and everything that refers to a team by number,
// moved to the places given.
function moveTeams(file: ProjectFile, places: number[], game: RomProject['game']): ProjectFile {
  const moved = <T>(list: T[]): T[] => {
    const out = new Array<T>(list.length)
    list.forEach((item, i) => (out[places[i]] = item))
    return out
  }
  const keys = <T>(record: Record<string, T> | undefined): Record<string, T> =>
    Object.fromEntries(Object.entries(record ?? {}).flatMap(([team, value]) => (places[Number(team)] === undefined ? [] : [[String(places[Number(team)]), value]])))
  const number = (team: number) => places[team] ?? team
  const settings = (from: Settings | null): Settings | null =>
    from && Array.isArray(from.playoffDraws) && Array.isArray(from.menu)
      ? {
          ...from,
          playoffDraws: from.playoffDraws.map((draw) => (Array.isArray(draw) ? draw.map(number) : draw)),
          menu: from.menu.map((item, i) => (game.menuTeamItems.includes(i) && item ? { ...item, value: number(item.value) } : item)),
        }
      : from
  return {
    ...file,
    teams: moved(file.teams),
    settings: settings(file.settings),
    pictures: Object.fromEntries(SET_NAMES.map((set) => [set, keys(file.pictures?.[set])])) as ProjectFile['pictures'],
    menuPalettes: keys(file.menuPalettes),
    leagueRules: file.leagueRules && Array.isArray(file.leagueRules.exempt) ? { ...file.leagueRules, exempt: file.leagueRules.exempt.map(number) } : file.leagueRules,
    baseline:
      file.baseline && Array.isArray(file.baseline.teams) && file.baseline.teams.length === places.length
        ? { ...file.baseline, teams: moved(file.baseline.teams), settings: settings(file.baseline.settings) ?? file.baseline.settings }
        : file.baseline,
  }
}

export interface OpenedProjectFile {
  project: RomProject
  name: string
  // Anything in the file that could not be used, and why.
  notes: string[]
}

// Puts the work in a project file onto a ROM. `opened` is the ROM as it was
// opened, which the work starts again from; whatever else had been done to it
// in the editor is replaced.
export function openProjectFile(given: RomProject, text: string, options: ProjectFileOptions = {}): OpenedProjectFile {
  let opened = given
  let file: ProjectFile
  try {
    file = JSON.parse(text) as ProjectFile
  } catch {
    throw new ProjectFileError('This is not a project file.')
  }
  if (file?.file !== MARK) throw new ProjectFileError('This is not a project file.')
  if (file.format > FORMAT) throw new ProjectFileError('This project file was made by a newer version of the editor. Reload the page to get it, and try again.')
  const notes: string[] = []
  // A project made on a hacked ROM brings its hacks with it.
  const hacksNow = hackState(opened)
  if (file.hacks && hacksNow && !sameHacks({ ...hacksNow.choices, ...file.hacks }, hacksNow.choices)) {
    try {
      opened = applyHacks(opened, { ...hacksNow.choices, ...file.hacks })
      notes.push("The project's hacks were put into this ROM. See the Hacks page for what it now has.")
    } catch (e) {
      throw new ProjectFileError(`This project's hacks could not be put into this ROM: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  const { game } = opened
  // The same code can stand for more than one kind of ROM, so both are checked.
  if (file.productCode !== game.productCode || file.game !== game.title) {
    throw new ProjectFileError(`This project is for ${file.game}, and the ROM in the editor is ${game.title}. Open a ROM of the same kind first.`)
  }
  if (!Array.isArray(file.teams) || file.teams.length !== opened.teams.length) {
    throw new ProjectFileError(`This project has ${file.teams?.length ?? 0} teams and the ROM has ${opened.teams.length}.`)
  }
  file.teams.forEach((team, i) => {
    if (!checkTeam(team, opened.teams[i])) throw new ProjectFileError(`The project file is damaged: team ${i + 1} cannot be read.`)
  })
  if (options.byName) file = moveTeams(file, placesByName(file, opened), game)
  if (!isNumbers(file.rinkPalette, opened.rinkPalette.length, 0xffff)) throw new ProjectFileError('The project file is damaged: the rink colours cannot be read.')

  // First the room the user had made, then the work that needs it.
  let project = opened
  for (let i = 0; i < (file.expansions?.rosterSpace ?? 0); i++) {
    if (!nextExpansion(project)) {
      notes.push('This ROM could not be given as much roster space as the project had. Check the space meter.')
      break
    }
    project = expandTeamSpace(project)
  }
  if (file.expansions?.pictureSpace && project.graphicsSupported) project = expandPictureSpace(project)

  const teams = file.teams.map((team, i) => ({ ...team, freeBytes: project.teams[i].freeBytes }))
  const settings = game.settingsSupported && file.settings ? mergeSettings(project.settings, file.settings, teams.length, notes) : project.settings
  const freeAgents = (Array.isArray(file.freeAgents) ? file.freeAgents : []).filter((agent) => checkPlayer(agent?.player) && 'GFD'.includes(agent.role))
  const leagueRules = cleanLeagueRules(file.leagueRules, teams.length)
  // A season's starting point is kept if all of it can be read, and dropped if not.
  const started = file.baseline
  const baseline: Baseline | null =
    started &&
    typeof started.name === 'string' &&
    typeof started.startedAt === 'string' &&
    Array.isArray(started.teams) &&
    started.teams.length === teams.length &&
    started.teams.every((team, i) => checkTeam(team, opened.teams[i])) &&
    isNumbers(started.rinkPalette, opened.rinkPalette.length, 0xffff)
      ? {
          name: started.name,
          startedAt: started.startedAt,
          teams: started.teams.map((team, i) => ({ ...team, freeBytes: project.teams[i].freeBytes })),
          settings: game.settingsSupported && started.settings ? mergeSettings(project.settings, started.settings, teams.length, []) : project.settings,
          rinkPalette: started.rinkPalette,
          freeAgents: (Array.isArray(started.freeAgents) ? started.freeAgents : []).filter((agent) => checkPlayer(agent?.player) && 'GFD'.includes(agent.role)),
        }
      : null
  project = { ...project, teams, rinkPalette: file.rinkPalette, settings, freeAgents, leagueRules, baseline }

  if (project.graphicsSupported) {
    const kinds = pictureKinds(project)
    const graphics: GraphicsEdits = { ...NO_GRAPHICS_EDITS }
    let skipped = 0
    for (const set of SET_NAMES) {
      const pictures: Record<number, Picture> = {}
      for (const [team, stored] of Object.entries(file.pictures?.[set] ?? {})) {
        const index = Number(team)
        const usable = kinds.includes(PICTURE_SETS[set]) && Number.isInteger(index) && index >= 0 && index < teams.length
        const like = usable ? currentPicture(project, index, PICTURE_SETS[set]).picture : null
        const pixels = like && typeof stored?.pixels === 'string' ? unpack(stored.pixels) : null
        if (like && pixels && stored.width === like.width && stored.height === like.height && pixels.length === like.pixels.length) {
          pictures[index] = { width: like.width, height: like.height, pixels }
        } else skipped++
      }
      graphics[set] = pictures
    }
    graphics.menuPalettes = Object.fromEntries(
      Object.entries(file.menuPalettes ?? {}).filter(([team, palette]) => Number(team) < teams.length && isNumbers(palette, 32, 0xffff)),
    )
    if (skipped > 0) notes.push(`${skipped} of the project's pictures do not fit this ROM's kinds of picture, and were left out.`)
    try {
      writeGraphics(project.bytes.slice(), game, graphics)
      project = { ...project, graphics }
    } catch (e) {
      notes.push(`The project's pictures were left out: ${e instanceof Error ? e.message : String(e)}`)
    }
  } else if (SET_NAMES.some((set) => Object.keys(file.pictures?.[set] ?? {}).length > 0)) {
    notes.push('The project has pictures, but this ROM keeps its pictures in a way the editor cannot read, so they were left out.')
  }
  return { project, name: typeof file.name === 'string' ? file.name : '', notes }
}
