// A project file holds everything the user has done, without the ROM: the
// teams, colours, settings, replaced pictures and free agents. Opened over a
// ROM, it puts that work back. It moves work between computers, keeps a copy
// of a season as it stood, and passes changes to someone with their own ROM.

import { menuPictureBytes, withMenuPictureBytes, withOriginalMenuPicture } from './menupicture'
import { splashBytes, withOriginalSplash, withSplashBytes } from './splash'
import { customSongBytes, withSongBytes } from './genesismusic'
import { snesCustomSongBytes, withSnesSongBytes } from './snesmusic'
import { snesSongChoices } from './snessongs'
import { SONG_NUMBERS } from './teamsongs'
import { FEWEST_MENU_TEAMS } from './menuteams'
import { creditsFit, type Credits } from './credits'
import { expandTeamSpace, nextExpansion } from './expand'
import { applyHacks, hackState, sameHacks, type HackChoices } from './hacks'
import { applySnesHacks, detectSnesHacks, SNES_AMOUNT_RANGES, SNES_AMOUNTS, SNES_HACKS, type SnesAmount, type SnesHackChoices } from './sneshacks'
import { NO_SNES_PICTURE_EDITS, snesCentreIce, snesPicturesSupported, writeSnesPictures, LOGO_SIZE, type SnesPictureEdits } from './snespictures'
import { cleanLeagueRules, type LeagueRules } from './leaguerules'
import { expandPictureSpace, NO_GRAPHICS_EDITS, pictureSpace, writeGraphics, type GraphicsEdits, type Picture } from './graphics'
import { currentPicture, pictureKinds, type PictureKind } from './pictureset'
import { applyIps, createIps } from './ips'
import { buildRom, openRom, type RomProject } from './rom'
import type { Baseline } from './season'
import { MAX_ROSTER } from './roster'
import { hasSettings, type Settings } from './settings'
import { teamDisplayName, type Team } from './team'
import { withTeamOrder } from './teamorder'
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
  // Where the teams were moved: team n is the team that was team order[n] in
  // the ROM as opened, whose teams were named `from`. Absent where none was.
  teamOrder?: { order: number[]; from: string[] }
  // The hacks the ROM had, to be put into the ROM the project is opened over.
  hacks?: HackChoices
  // The same for an SNES ROM, with the amounts of those that hold one.
  snesHacks?: SnesHackChoices
  snesHackAmounts?: Partial<Record<SnesAmount, number>>
  // An SNES ROM's replaced logos.
  snesPictures?: {
    logos: Record<string, { pixels: string; palette: number[] }>
    centreIce: Record<string, { width: number; height: number; pixels: string }>
  }
  baseline?: (Omit<Baseline, 'teams'> & { teams: StoredTeam[] }) | null
  // Songs put in from MIDI files: the Genesis's by number, the SNES's by where they were.
  songs?: { genesis?: { number: number; bytes: string }[]; snes?: { pointer: number; bytes: string }[] }
  // The Genesis's splash screen and main menu background, where the project changed them: the original's
  // again, or a picture of the league's own as its bytes.
  screens?: { splash?: { original: true } | { bytes: string; ownColours: boolean }; menuPicture?: { original: true } | { bytes: string } }
  // The finished ROM, as a patch to the ROM the project was made on, and that
  // ROM's fingerprint. Opened over the same ROM, it puts back everything,
  // including what is kept only in the ROM itself: player photos, score
  // logos, head blood, and the SNES banner and photo colours.
  rom?: { fingerprint: string; patch: string }
}

// A ROM file's fingerprint: its length and an FNV-1a hash of its bytes.
function fingerprint(bytes: Uint8Array): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < bytes.length; i++) hash = Math.imul(hash ^ bytes[i], 0x01000193) >>> 0
  return `${bytes.length}:${hash.toString(16).padStart(8, '0')}`
}

// The finished ROM as a patch to the ROM as opened, where the rest of the file
// opened over a fresh copy of that ROM would not give it exactly: where some
// of the work is kept only in the ROM itself. None where it cannot be built.
function romPatch(project: RomProject, opened: RomProject, rest: ProjectFile): ProjectFile['rom'] {
  let built: Uint8Array
  try {
    built = buildRom(project)
  } catch {
    return undefined
  }
  try {
    const replayed = buildRom(openProjectFile(openRom(opened.source), JSON.stringify(rest)).project)
    if (replayed.length === built.length && replayed.every((byte, i) => byte === built[i])) return undefined
  } catch {
    // The rest of the file alone does not give the ROM, so the patch is needed.
  }
  return { fingerprint: fingerprint(opened.source), patch: pack(createIps(opened.source, built)) }
}

// The finished ROM the project was saved with, opened, where `given` is the
// very ROM the project was made on; null where it is not, or the patch does
// not open.
function exactRom(given: RomProject, stored: ProjectFile['rom']): RomProject | null {
  if (!stored || typeof stored.patch !== 'string' || stored.fingerprint !== fingerprint(given.source)) return null
  try {
    return openRom(applyIps(given.source, unpack(stored.patch)))
  } catch {
    return null
  }
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
    settings: hasSettings(project.game, project.settings) ? project.settings : null,
    pictures,
    menuPalettes: project.graphics.menuPalettes,
    freeAgents: project.freeAgents,
    leagueRules: project.leagueRules,
    teamOrder: project.teamOrder && { order: project.teamOrder, from: opened.teams.map(teamDisplayName) },
    hacks: hackState(project)?.choices,
    snesHacks: project.game.platform === 'snes' ? detectSnesHacks(project.bytes).choices : undefined,
    snesHackAmounts: project.game.platform === 'snes' ? detectSnesHacks(project.bytes).amounts : undefined,
    snesPictures: project.snesPictures && {
      logos: Object.fromEntries(
        Object.entries(project.snesPictures.logos).map(([team, logo]) => [team, { pixels: pack(logo.picture.pixels), palette: logo.palette }]),
      ),
      centreIce: Object.fromEntries(
        Object.entries(project.snesPictures.centreIce).map(([team, picture]) => [team, { width: picture.width, height: picture.height, pixels: pack(picture.pixels) }]),
      ),
    },
    baseline: project.baseline,
    songs: savedSongs(project),
    screens: savedScreens(project, opened),
  }
  return JSON.stringify({ ...file, rom: romPatch(project, opened, file) })
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
    isNumbers(team?.palette, like.palette.length, 0xffff) &&
    (like.shownOverall === undefined || (Number.isInteger(team.shownOverall) && team.shownOverall! >= 0 && team.shownOverall! <= 0xff)) &&
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
    menuTeams: base.menuTeams && { offered: teamsOffered(from.menuTeams?.offered, base.menuTeams.offered, teamCount) },
    cpuPullGoalie: base.cpuPullGoalie && {
      goalsUnder: Math.min(0xff, number(from.cpuPullGoalie?.goalsUnder, base.cpuPullGoalie.goalsUnder)),
      secondsUnder: Math.min(0xffff, number(from.cpuPullGoalie?.secondsUnder, base.cpuPullGoalie.secondsUnder)),
    },
    credits: base.credits && fileCredits(from.credits, base.credits),
  }
}

// A file's number of teams in the menu, where the ROM has as many teams.
function teamsOffered(value: unknown, old: number, teamCount: number): number {
  return Number.isInteger(value) && (value as number) >= FEWEST_MENU_TEAMS && (value as number) <= teamCount ? (value as number) : old
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

// The ROM with its teams moved as the project moved them, with everything the
// game keeps by team number, so that the project's teams then go to their own
// places. A ROM already in that order, such as one downloaded after the move,
// is left as it is.
// A stored team order, where it is one: every team once.
function storedOrder(stored: ProjectFile['teamOrder'], count: number): number[] | undefined {
  const order = stored?.order
  return Array.isArray(order) && order.length === count && order.every((team) => Number.isInteger(team) && team >= 0 && team < count) && new Set(order).size === count
    ? order
    : undefined
}

function withMovedTeams(opened: RomProject, stored: ProjectFile['teamOrder'], teams: StoredTeam[], notes: string[]): RomProject {
  if (stored === undefined || stored === null) return opened
  const { order, from } = stored
  if (!Array.isArray(order) || !Array.isArray(from) || order.length !== opened.teams.length || from.length !== order.length) {
    throw new ProjectFileError('The project file is damaged: where its teams were moved cannot be read.')
  }
  // Which the ROM's teams look like, going by their names: the ROM the
  // project was made on, or one downloaded after the move (whose teams may
  // since have been renamed, as the project's own are).
  const names = opened.teams.map(teamDisplayName)
  const storedName = (n: number) => `${teams[n]?.names?.[0] ?? ''} ${teams[n]?.names?.[2] ?? ''}`.trim()
  const asMoved = names.filter((name, n) => name === from[order[n]] || name === storedName(n)).length
  const asMade = names.filter((name, n) => name === from[n]).length
  if (asMoved > asMade) {
    notes.push("This ROM already has the project's teams in their new places, so none was moved.")
    return opened
  }
  try {
    return withTeamOrder(opened, order)
  } catch (e) {
    throw new ProjectFileError(`This project moved teams, and they could not be moved in this ROM: ${e instanceof Error ? e.message : String(e)}`)
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
  // Over the very ROM the project was made on, the finished ROM is put back
  // whole: its hacks, room, moved teams, pictures, songs and screens are in it.
  const exact = exactRom(given, file.rom)
  if (exact) opened = exact
  else if (file.rom) {
    notes.push(
      'This is not the copy of the ROM the project was made on, so what is kept only in the ROM itself (player photos, score logos, head blood, and on the SNES banner and photo colours) was left as this copy has it. Everything else was put in.',
    )
  }
  // A project made on a hacked ROM brings its hacks with it.
  const hacksNow = exact ? null : hackState(opened)
  // Files from before the checking fix had three choices kept it as on or off.
  if (file.hacks && typeof (file.hacks.checkFix as unknown) === 'boolean') {
    file.hacks = { ...file.hacks, checkFix: (file.hacks.checkFix as unknown) === true ? 'all240' : 'off' }
  }
  if (file.hacks && hacksNow && !sameHacks({ ...hacksNow.choices, ...file.hacks }, hacksNow.choices)) {
    try {
      opened = applyHacks(opened, { ...hacksNow.choices, ...file.hacks })
      notes.push("The project's hacks were put into this ROM. See the Hacks page for what it now has.")
    } catch (e) {
      throw new ProjectFileError(`This project's hacks could not be put into this ROM: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  if (!exact && file.snesHacks && opened.game.platform === 'snes') {
    const { choices: now, amounts: nowAmounts } = detectSnesHacks(opened.bytes)
    // Only amounts that are whole numbers in range.
    const amounts = Object.fromEntries(
      SNES_AMOUNTS.flatMap((hack) => {
        const value = file.snesHackAmounts?.[hack]
        return typeof value === 'number' && Number.isInteger(value) && value >= SNES_AMOUNT_RANGES[hack][0] && value <= SNES_AMOUNT_RANGES[hack][1] ? [[hack, value]] : []
      }),
    ) as Partial<Record<SnesAmount, number>>
    const amountsDiffer = SNES_AMOUNTS.some((hack) => amounts[hack] !== undefined && amounts[hack] !== nowAmounts?.[hack])
    if (amountsDiffer || SNES_HACKS.some((hack) => typeof file.snesHacks![hack] === 'boolean' && file.snesHacks![hack] !== now[hack])) {
      try {
        opened = applySnesHacks(opened, file.snesHacks, false, amounts)
        notes.push("The project's hacks were put into this ROM. See the Hacks page for what it now has.")
      } catch (e) {
        throw new ProjectFileError(`This project's hacks could not be put into this ROM: ${e instanceof Error ? e.message : String(e)}`)
      }
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
  opened = exact ? { ...opened, teamOrder: storedOrder(file.teamOrder, opened.teams.length) } : withMovedTeams(opened, file.teamOrder, file.teams, notes)
  file.teams.forEach((team, i) => {
    if (!checkTeam(team, opened.teams[i])) throw new ProjectFileError(`The project file is damaged: team ${i + 1} cannot be read.`)
  })
  if (options.byName) file = moveTeams(file, placesByName(file, opened), game)
  if (!isNumbers(file.rinkPalette, opened.rinkPalette.length, 0xffff)) throw new ProjectFileError('The project file is damaged: the rink colours cannot be read.')

  // First the room the user had made, then the work that needs it.
  let project = opened
  for (let i = 0; i < (exact ? 0 : (file.expansions?.rosterSpace ?? 0)); i++) {
    if (!nextExpansion(project)) {
      notes.push('This ROM could not be given as much roster space as the project had. Check the bytes free at the top of the page.')
      break
    }
    project = expandTeamSpace(project)
  }
  if (!exact && file.expansions?.pictureSpace && project.graphicsSupported) project = expandPictureSpace(project)

  // A banner name from the file where it has a usable one, else the ROM's (files saved before there were any).
  const placeName = (stored: StoredTeam, i: number) =>
    project.teams[i].placeName === undefined ? undefined : typeof stored.placeName === 'string' ? stored.placeName : project.teams[i].placeName
  // Songs only where this ROM has them, and only as six song numbers.
  const songs = (stored: StoredTeam, i: number) => {
    const own = project.teams[i].songs
    const value = (stored as { songs?: unknown }).songs
    if (!own) return undefined
    return Array.isArray(value) && value.length === 6 && value.every((v) => Number.isInteger(v) && v >= 0 && v <= 0xff) ? (value as number[]) : own
  }
  const snesSongs = (stored: StoredTeam, i: number) => {
    const own = project.teams[i].snesSongs
    const value = (stored as { snesSongs?: unknown }).snesSongs
    if (!own) return undefined
    return Array.isArray(value) && value.length === 6 && value.every((v) => Number.isInteger(v) && v >= 0 && v <= 0xffffffff) ? (value as number[]) : own
  }
  const teams = file.teams.map((team, i) => ({
    ...team,
    freeBytes: project.teams[i].freeBytes,
    placeName: placeName(team, i),
    songs: songs(team, i),
    snesSongs: snesSongs(team, i),
  }))
  const settings = hasSettings(game, project.settings) && file.settings ? mergeSettings(project.settings, file.settings, teams.length, notes) : project.settings
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
          settings: hasSettings(game, project.settings) && started.settings ? mergeSettings(project.settings, started.settings, teams.length, []) : project.settings,
          rinkPalette: started.rinkPalette,
          freeAgents: (Array.isArray(started.freeAgents) ? started.freeAgents : []).filter((agent) => checkPlayer(agent?.player) && 'GFD'.includes(agent.role)),
        }
      : null
  project = { ...project, teams, rinkPalette: file.rinkPalette, settings, freeAgents, leagueRules, baseline }

  if (exact) {
    // The pictures are in the ROM already.
  } else if (project.graphicsSupported) {
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
  if (exact) {
    // The ROM the work goes on is still the one opened, for Reset, patches and Changes.
    project = { ...project, source: given.source, wasSmd: given.wasSmd }
  } else {
    if (game.platform === 'snes') project = withSnesPictures(project, file.snesPictures, notes)
    project = withSavedSongs(project, file.songs, notes)
    project = withSavedScreens(project, file.screens, notes)
  }
  return { project, name: typeof file.name === 'string' ? file.name : '', notes }
}

const sameBytes = (a: Uint8Array | null, b: Uint8Array | null) => a === b || (!!a && !!b && a.length === b.length && a.every((byte, i) => byte === b[i]))

// The splash screen and main menu background, where the project has changed them from the ROM it opened.
function savedScreens(project: RomProject, opened: RomProject): ProjectFile['screens'] {
  if (project.game.platform !== 'genesis') return undefined
  const screens: NonNullable<ProjectFile['screens']> = {}
  const [splash, was] = [splashBytes(project.bytes), splashBytes(opened.bytes)]
  if (!sameBytes(splash?.bytes ?? null, was?.bytes ?? null) || splash?.ownColours !== was?.ownColours) {
    screens.splash = splash ? { bytes: pack(splash.bytes), ownColours: splash.ownColours } : { original: true }
  }
  const menu = menuPictureBytes(project.bytes)
  if (!sameBytes(menu, menuPictureBytes(opened.bytes))) screens.menuPicture = menu ? { bytes: pack(menu) } : { original: true }
  return screens.splash || screens.menuPicture ? screens : undefined
}

// The project's splash screen and main menu background put in, where this ROM can take them.
function withSavedScreens(project: RomProject, screens: ProjectFile['screens'], notes: string[]): RomProject {
  if (project.game.platform !== 'genesis' || !screens) return project
  const left: string[] = []
  const splash = screens.splash
  if (splash) {
    try {
      if ('original' in splash) {
        if (splashBytes(project.bytes)) project = withOriginalSplash(project)
      } else {
        const bytes = unpack(splash.bytes)
        const there = splashBytes(project.bytes)
        if (!sameBytes(there?.bytes ?? null, bytes) || there?.ownColours !== splash.ownColours) project = withSplashBytes(project, bytes, splash.ownColours === true)
      }
    } catch {
      left.push('splash screen')
    }
  }
  const menu = screens.menuPicture
  if (menu) {
    try {
      if ('original' in menu) {
        if (menuPictureBytes(project.bytes)) project = withOriginalMenuPicture(project)
      } else {
        const bytes = unpack(menu.bytes)
        if (!sameBytes(menuPictureBytes(project.bytes), bytes)) project = withMenuPictureBytes(project, bytes)
      }
    } catch {
      left.push('main menu background')
    }
  }
  if (left.length > 0) notes.push(`The project's ${left.join(' and ')} could not be put into this ROM, and ${left.length === 1 ? 'was' : 'were'} left out.`)
  return project
}

// The songs the project has put in from MIDI files, as their bytes.
function savedSongs(project: RomProject): ProjectFile['songs'] {
  if (project.game.platform === 'genesis') {
    const genesis = SONG_NUMBERS.flatMap((number) => {
      const bytes = customSongBytes(project.bytes, number)
      return bytes ? [{ number, bytes: pack(bytes) }] : []
    })
    return genesis.length ? { genesis } : undefined
  }
  const snes = snesSongChoices(project.bytes).flatMap(({ pointer }) => {
    const bytes = snesCustomSongBytes(project.bytes, pointer)
    return bytes ? [{ pointer, bytes: pack(bytes) }] : []
  })
  return snes.length ? { snes } : undefined
}

// The project's songs put back in, each where this ROM has room for it.
function withSavedSongs(project: RomProject, songs: ProjectFile['songs'], notes: string[]): RomProject {
  let left = 0
  if (project.game.platform === 'genesis') {
    for (const song of songs?.genesis ?? []) {
      try {
        const bytes = unpack(song.bytes)
        const there = customSongBytes(project.bytes, song.number)
        if (there && there.length === bytes.length && there.every((byte, i) => byte === bytes[i])) continue
        project = { ...project, bytes: withSongBytes(project.bytes, song.number, bytes) }
      } catch {
        left++
      }
    }
  } else {
    for (const song of songs?.snes ?? []) {
      try {
        const bytes = unpack(song.bytes)
        const there = snesCustomSongBytes(project.bytes, song.pointer >>> 0)
        if (there && there.length === bytes.length && there.every((byte, i) => byte === bytes[i])) continue
        project = withSnesSongBytes(project, song.pointer >>> 0, bytes)
      } catch {
        left++
      }
    }
  }
  if (left > 0) notes.push(`${left} of the project's organ songs could not be put into this ROM, and were left out.`)
  return project
}

// An SNES project's logos, each kept where it is the right size and the
// whole only where it fits the ROM.
function withSnesPictures(project: RomProject, stored: ProjectFile['snesPictures'], notes: string[]): RomProject {
  const entries = [...Object.entries(stored?.logos ?? {}), ...Object.entries(stored?.centreIce ?? {})]
  if (entries.length === 0) return project
  const teams = project.teams.length
  if (!snesPicturesSupported(project.bytes, teams)) {
    notes.push('The project has logos, but this ROM keeps its logos in a way the editor cannot read, so they were left out.')
    return project
  }
  const edits: SnesPictureEdits = { logos: {}, centreIce: {} }
  let skipped = 0
  const team = (key: string) => (Number.isInteger(Number(key)) && Number(key) >= 0 && Number(key) < teams ? Number(key) : -1)
  for (const [key, logo] of Object.entries(stored?.logos ?? {})) {
    const pixels = typeof logo?.pixels === 'string' ? unpack(logo.pixels) : null
    if (team(key) >= 0 && pixels?.length === LOGO_SIZE * LOGO_SIZE && pixels.every((p) => p < 16) && isNumbers(logo.palette, 16, 0xffff)) {
      edits.logos[team(key)] = { picture: { width: LOGO_SIZE, height: LOGO_SIZE, pixels }, palette: logo.palette }
    } else skipped++
  }
  for (const [key, picture] of Object.entries(stored?.centreIce ?? {})) {
    const like = team(key) >= 0 ? snesCentreIce(project.bytes, teams, NO_SNES_PICTURE_EDITS, team(key)).picture : null
    const pixels = typeof picture?.pixels === 'string' ? unpack(picture.pixels) : null
    if (like && pixels && picture.width === like.width && picture.height === like.height && pixels.length === like.pixels.length && pixels.every((p) => p < 128)) {
      edits.centreIce[team(key)] = { width: like.width, height: like.height, pixels }
    } else skipped++
  }
  if (skipped > 0) notes.push(`${skipped} of the project's logos do not fit this ROM, and were left out.`)
  try {
    writeSnesPictures(project.bytes.slice(), teams, edits)
    return { ...project, snesPictures: edits }
  } catch (e) {
    notes.push(`The project's logos were left out: ${e instanceof Error ? e.message : String(e)}`)
    return project
  }
}

// A file's credits, where they are lines of text that fit this ROM's room.
function fileCredits(value: unknown, base: Credits): Credits {
  const pages = (value as Credits | undefined)?.pages
  if (!Array.isArray(pages) || !pages.every((page) => Array.isArray(page) && page.every((line) => typeof line === 'string'))) return base
  const credits = { ...base, pages: pages.map((page) => page.slice()) }
  return creditsFit(credits) ? credits : base
}
