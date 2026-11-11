import { readU16, readU32, reorderEntries, writeU16 } from './bytes'
import type { GameConfig } from './games'
import { bannersFollowable, graphicsInTeamOrder } from './graphics'
import { genesisScoreLogoTable, SCORE_LOGO_ENTRY } from './genesisscorelogos'
import { playoffLast } from './menuteams'
import { teamSongsRoom, withRoomForTeamSongs } from './teamsongs'
import { photoLayout } from './photos'
import { snesBlockColourTable } from './snesblockcolours'
import { SNES_PHOTO_SLOTS, snesPhotoTables } from './snesphotos'
import { NO_SNES_PICTURE_EDITS, snesPicturesInTeamOrder, snesPicturesSupported } from './snespictures'
import { SNES_SCORE_LOGO_ENTRY, snesScoreLogoTable } from './snesscorelogos'
import { redirectedTeam, type RomProject } from './rom'
import type { Settings } from './settings'
import { teamDisplayName, type TeamLayout } from './team'

// Moving teams: giving teams new team numbers, so that the Game Setup menu
// offers them in a new order and the spreadsheet files list them in it.
//
// The game finds everything about a team by its number, in a table of one
// entry a team for each kind of thing. (From the disassembly,
// abdulahmad/NHL94Genesis, docs/EXPANDING_THE_ROM.md's team checklist.) The
// Genesis game has eleven: the team data (TeamList), the menu logos
// (TeamLogoBitmaps) and their colours (TeamLogoPalettes), the menu colours
// and banner stripes (TeamPalettes), the player photos (FeaturedPictures),
// the organ songs (TeamSongs), the centre-ice logos (TeamGfxList), the team
// rating the player cards show (TeamRatings), the two banner maps of two rows
// a team (Teamblocksmap and TeamBitmaps), and the playoff draws, which hold
// team numbers. A move puts every one of them in the new order, together with
// what the editor holds by team number: replaced pictures, the menu's chosen
// teams, the season's starting point and the league's exempt teams. The score
// logos NOSE4Web adds have a table of their own, which moves too.
//
// Any team can be moved. The league's own teams are those up to the last
// playoff team (and that the menu offers); the All-Star teams and any unused
// ones come after, and putting the teams in alphabetical order leaves them
// there. A playoff team moved past the last one is no longer one: new
// playoffs started with it start as the last, which Check ROM looks into.

// What a move is: team n becomes the team that is team order[n] now.
export type TeamOrder = number[]

// How many of the first teams are the league's own, or why no team can be moved.
// Also how many the Game Setup menu offers, and how many are playoff teams.
export type MoveRange = { league: number; offered: number; playoffTeams: number } | { reason: string }

// The team rating byte of each team: GetTeamRating's move.w tmteam(a2),d0;
// movea.l #TeamRatings,a0; clr.w d1; move.b 0(a0,d0.w),d1.
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
function ratingsTable(rom: Uint8Array, teamCount: number): number | null {
  if (!ratingsAt.has(rom)) ratingsAt.set(rom, findRatings(rom, teamCount))
  return ratingsAt.get(rom)!
}

// The team rating each team's player cards show, as the ROM has it; null where it is not found.
export function shownTeamRatings(rom: Uint8Array, teamCount: number): number[] | null {
  const at = ratingsTable(rom, teamCount)
  return at === null ? null : Array.from(rom.subarray(at, at + teamCount))
}

// Whether teams can be moved, and how many of the first are the league's own.
export function teamMoveRange(project: RomProject): MoveRange {
  const { game, bytes } = project
  if (game.platform === 'snes') return snesMoveRange(project)
  if (!game.settingsSupported) {
    return { reason: "This ROM's hack rebuilds the menus and playoffs, so the editor cannot follow every place it keeps a team's number." }
  }
  if (!project.graphicsSupported || !bannersFollowable(bytes, game)) {
    return { reason: "This ROM keeps its logos or banners in a way the editor cannot follow, so they could not move with their teams." }
  }
  if (!photoLayout(bytes, game.teamCount)) return { reason: "This ROM keeps its player photos in a way the editor cannot follow, so they could not move with their teams." }
  if (ratingsTable(bytes, game.teamCount) === null) return { reason: "The team ratings the player cards show are not where the editor expects, so they could not move with their teams." }
  if (project.teams.some((team) => !team.songs)) return { reason: "This ROM's organ songs are not where the editor expects, so they could not move with their teams." }
  const last = playoffLast(bytes, game)
  if (last === null) return { reason: 'The editor cannot tell which teams are the playoff teams in this ROM.' }
  return leagueRange(project, last)
}

const leagueRange = (project: RomProject, last: number): MoveRange => {
  const count = project.teams.length
  const offered = Math.min(project.settings.menuTeams?.offered ?? count, count)
  const playoffTeams = Math.min(last + 1, count)
  return { league: Math.max(1, Math.min(playoffTeams, offered)), offered, playoffTeams }
}

// The SNES game keeps its team colours, place names and songs apart from its
// team data, and the editor holds them with each team; the rest are tables.
function snesMoveRange(project: RomProject): MoveRange {
  const { game, bytes } = project
  const count = project.teams.length
  if (!snesPicturesSupported(bytes, count)) return { reason: "This ROM keeps its logos in a way the editor cannot follow, so they could not move with their teams." }
  if (snesBlockColourTable(bytes, count) === null) return { reason: "This ROM's banner colours are not where the editor expects, so they could not move with their teams." }
  if (!snesPhotoTables(bytes, count)) return { reason: "This ROM keeps its player photos in a way the editor cannot follow, so they could not move with their teams." }
  if (project.teams.some((team) => !team.snesSongs || team.placeName === undefined)) {
    return { reason: "This ROM's organ songs or banner names are not where the editor expects, so they could not move with their teams." }
  }
  if (project.settings.playoffDraws.length === 0) return { reason: "This ROM's playoff draws are not where the editor expects, so they could not follow their teams." }
  const last = playoffLast(bytes, game)
  if (last === null) return { reason: 'The editor cannot tell which teams are the playoff teams in this ROM.' }
  return leagueRange(project, last)
}

// The settings with team numbers changed as the teams move: `place` gives
// each team's new number.
export function settingsInTeamOrder(settings: Settings, game: GameConfig, place: (team: number) => number): Settings {
  return {
    ...settings,
    playoffDraws: settings.playoffDraws.map((draw) => draw.map(place)),
    menu: settings.menu.map((item, i) => (game.menuTeamItems.includes(i) ? { ...item, value: place(item.value) } : item)),
  }
}

function checkOrder(project: RomProject, order: TeamOrder): void {
  const range = teamMoveRange(project)
  if ('reason' in range) throw new Error(range.reason)
  const count = project.teams.length
  if (order.length !== count || new Set(order).size !== count || order.some((team) => !Number.isInteger(team) || team < 0 || team >= count)) {
    throw new Error('A new order must have every team once.')
  }
}

// The project with its teams in a new order: team n is the team that was team
// order[n]. Everything that names a team by number goes with it.
export function withTeamOrder(project: RomProject, order: TeamOrder): RomProject {
  checkOrder(project, order)
  if (order.every((team, n) => team === n)) return project
  const { game } = project
  const count = project.teams.length
  if (game.platform === 'snes') return withSnesTeamOrder(project, order)
  // In 30-team ROMs the songs table has room for 28, the last two teams
  // reading what follows it; a team moved there needs a table with room for all.
  const room = teamSongsRoom(project.bytes, count) ?? count
  const from = order.some((was, n) => was !== n && (n >= room || was >= room)) ? withRoomForTeamSongs(project.bytes, count) : project.bytes
  if (!from) throw new Error('There is no room in the ROM to give every team organ songs of its own, which moving these teams needs.')
  const rom = from.slice()

  // The game's own tables, read from the ROM as it was.
  const graphics = graphicsInTeamOrder(from, rom, game, project.graphics, order)
  reorderEntries(from, rom, photoLayout(from, game.teamCount)!.tableAt, 4, order)
  reorderEntries(from, rom, ratingsTable(from, game.teamCount)!, 1, order)
  const scoreLogos = genesisScoreLogoTable(from, count)
  if (scoreLogos !== null) reorderEntries(from, rom, scoreLogos, SCORE_LOGO_ENTRY, order)
  // The Game Setup menu's full names of the two New York teams, by number.
  for (const redirect of game.teamNameRedirects) {
    const team = redirectedTeam(from, game, redirect)
    if (readU16(from, redirect.pointerOffset - 10) === 0xb67c) writeU16(rom, redirect.pointerOffset - 8, newNumberOf(order, team))
  }
  return { ...followers(project, order), bytes: rom, graphics }
}

// The same for the SNES game.
function withSnesTeamOrder(project: RomProject, order: TeamOrder): RomProject {
  const from = project.bytes
  const rom = from.slice()
  const count = project.teams.length
  const snesPictures = snesPicturesInTeamOrder(from, rom, count, project.snesPictures ?? NO_SNES_PICTURE_EDITS, order)
  reorderEntries(from, rom, snesBlockColourTable(from, count)!, 4, order)
  const photos = snesPhotoTables(from, count)!
  reorderEntries(from, rom, photos.photos, SNES_PHOTO_SLOTS * 4, order)
  reorderEntries(from, rom, photos.palettes, 4, order)
  const scoreLogos = snesScoreLogoTable(from, count)
  if (scoreLogos !== null) reorderEntries(from, rom, scoreLogos, SNES_SCORE_LOGO_ENTRY, order)
  // GetTeamLongName's two teams with full names of their own, the New York
  // teams, by number.
  const longNames = snesLongNameTeams(from)
  if (longNames !== null) {
    for (const at of [longNames + 1, longNames + 6]) if (from[at] < count) rom[at] = newNumberOf(order, from[at])
  }
  return { ...followers(project, order), bytes: rom, snesPictures }
}

// Team `team`'s number once the teams are in `order`.
const newNumberOf = (order: TeamOrder, team: number) => (order.indexOf(team) < 0 ? team : order.indexOf(team))

// GetTeamLongName (SNES): cmp #a; beq; cmp #b; beq; asl; asl; tay, where a and b
// are the teams whose full names are its own (LongNYI and LongNYR in the
// original game). Where it is: the first cmp; null where it is not found once.
export function snesLongNameTeams(rom: Uint8Array): number | null {
  const found: number[] = []
  for (let at = 0; at + 13 <= rom.length; at++) {
    if (rom[at] !== 0xc9 || rom[at + 2] !== 0 || rom[at + 3] !== 0xf0 || rom[at + 5] !== 0xc9 || rom[at + 7] !== 0) continue
    if (rom[at + 8] === 0xf0 && rom[at + 10] === 0x0a && rom[at + 11] === 0x0a && rom[at + 12] === 0xa8) found.push(at)
  }
  return found.length === 1 ? found[0] : null
}

// What moves with the teams on either game: the teams themselves, and what
// names them by number.
function followers(project: RomProject, order: TeamOrder): RomProject {
  const { game } = project
  const count = project.teams.length
  const newNumber = new Array<number>(count)
  order.forEach((was, n) => (newNumber[was] = n))
  const place = (team: number) => (team >= 0 && team < count ? newNumber[team] : team)
  // The team data goes where it was, each team's own place with it, and the
  // team table is rewritten from it when the ROM is built.
  const layout: TeamLayout = {
    ...project.layout,
    fileOrder: project.layout.fileOrder.map(place),
    ...(project.layout.slots ? { slots: order.map((was) => project.layout.slots![was]) } : {}),
  }
  const moved = <T>(list: T[]) => order.map((was) => list[was])
  const before = project.teamOrder ?? project.teams.map((_, n) => n)
  return {
    ...project,
    teams: moved(project.teams),
    layout,
    settings: settingsInTeamOrder(project.settings, game, place),
    leagueRules: { ...project.leagueRules, exempt: project.leagueRules.exempt.map(place).sort((a, b) => a - b) },
    baseline: project.baseline && {
      ...project.baseline,
      teams: moved(project.baseline.teams),
      settings: settingsInTeamOrder(project.baseline.settings, game, place),
    },
    teamOrder: moved(before),
  }
}

// One team moved to number `to` (counted from 0), the teams between moving up
// or down one to make room.
export function teamMovedTo(count: number, team: number, to: number): TeamOrder {
  const order = Array.from({ length: count }, (_, n) => n)
  order.splice(team, 1)
  order.splice(to, 0, team)
  return order
}

// The first `league` teams in alphabetical order by name, the rest where they are.
export function alphabeticalOrder(project: RomProject, league: number): TeamOrder {
  const names = project.teams.map(teamDisplayName)
  const sorted = Array.from({ length: league }, (_, n) => n).sort((a, b) => names[a].localeCompare(names[b], 'en', { sensitivity: 'base' }) || a - b)
  return [...sorted, ...project.teams.slice(league).map((_, i) => league + i)]
}
