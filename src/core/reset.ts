// Putting one part of the work back to how it is in the ROM that was opened,
// without touching the rest.

import {
  bannerColors,
  bannerSharedWith,
  menuPalette,
  rinkLogoSharedWith,
  withBannerColors,
  type GraphicsEdits,
} from './graphics'
import { pictureKinds } from './pictureset'
import type { RomProject } from './rom'
import type { Settings } from './settings'
import type { Team } from './team'

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// ---------------------------------------------------------------- team data

export type TeamPart = 'names' | 'ratings' | 'roster' | 'lines' | 'home' | 'away'

const TEAM_PARTS: Record<TeamPart, (team: Team) => unknown> = {
  names: (team) => team.names,
  ratings: (team) => team.teamBytes,
  // Who is on the team and how the roster is split into positions.
  roster: (team) => [team.players, team.forwards, team.defense, team.goalieNibbles],
  lines: (team) => team.lines,
  home: (team) => team.palette.slice(0, 16),
  away: (team) => team.palette.slice(16),
}

export function teamPartChanged(team: Team, original: Team, part: TeamPart): boolean {
  return !same(TEAM_PARTS[part](team), TEAM_PARTS[part](original))
}

export function resetTeamPart(team: Team, original: Team, part: TeamPart): Team {
  switch (part) {
    case 'names':
      return { ...team, names: original.names }
    case 'ratings':
      return { ...team, teamBytes: original.teamBytes }
    case 'roster':
      return {
        ...team,
        players: original.players,
        forwards: original.forwards,
        defense: original.defense,
        goalieNibbles: original.goalieNibbles,
      }
    case 'lines':
      return { ...team, lines: original.lines }
    case 'home':
      return { ...team, palette: [...original.palette.slice(0, 16), ...team.palette.slice(16)] }
    case 'away':
      return { ...team, palette: [...team.palette.slice(0, 16), ...original.palette.slice(16)] }
  }
}

// ------------------------------------------------------------ team pictures

export type PicturePart = 'rinkLogo' | 'menuLogo' | 'menuBanner' | 'visitorBanner' | 'gameBanner' | 'bannerColors'

const without = <T>(record: Record<number, T>, teams: number[]): Record<number, T> =>
  Object.fromEntries(Object.entries(record).filter(([team]) => !teams.includes(Number(team))))

// A project with no picture edits shows the pictures as they were opened.
const unedited = (project: RomProject): RomProject => ({
  ...project,
  graphics: Object.fromEntries(Object.keys(project.graphics).map((key) => [key, {}])) as unknown as GraphicsEdits,
})

export function pictureChanged(project: RomProject, team: number, part: PicturePart): boolean {
  const edits = project.graphics
  switch (part) {
    case 'rinkLogo':
      return team in edits.rinkLogos
    case 'menuLogo':
      return team in edits.menuLogos
    case 'menuBanner':
      return team in edits.menuBanners
    case 'visitorBanner':
      return team in edits.visitorBanners
    case 'gameBanner':
      return team in edits.gameBanners
    case 'bannerColors':
      return !same(bannerColors(project, team), bannerColors(unedited(project), team))
  }
}

// The edits with one picture as it was opened. A picture several teams share
// goes back for all of them.
export function resetPicture(project: RomProject, team: number, part: PicturePart): GraphicsEdits {
  const edits = project.graphics
  const original = unedited(project)
  // A team's menu colours: its banner stripes, and the colours of a replaced logo.
  const menuPalettes = (stripes: number[], logoReplaced: boolean) => {
    const stripesChanged = !same(stripes, bannerColors(original, team))
    if (!logoReplaced && !stripesChanged) return without(edits.menuPalettes, [team])
    const palette = logoReplaced ? menuPalette(project, team) : menuPalette(original, team)
    return { ...edits.menuPalettes, [team]: withBannerColors(palette, stripes) }
  }
  switch (part) {
    case 'rinkLogo':
      return { ...edits, rinkLogos: without(edits.rinkLogos, rinkLogoSharedWith(project, team)) }
    case 'menuLogo':
      return {
        ...edits,
        menuLogos: without(edits.menuLogos, [team]),
        menuPalettes: menuPalettes(bannerColors(project, team), false),
      }
    case 'menuBanner':
      return { ...edits, menuBanners: without(edits.menuBanners, bannerSharedWith(project, 'menu', team)) }
    case 'visitorBanner':
      return { ...edits, visitorBanners: without(edits.visitorBanners, bannerSharedWith(project, 'visitor', team)) }
    case 'gameBanner':
      return { ...edits, gameBanners: without(edits.gameBanners, bannerSharedWith(project, 'game', team)) }
    case 'bannerColors':
      return { ...edits, menuPalettes: menuPalettes(bannerColors(original, team), team in edits.menuLogos) }
  }
}

const TEAM_PART_LIST = Object.keys(TEAM_PARTS) as TeamPart[]

const pictureParts = (project: RomProject): PicturePart[] =>
  project.graphicsSupported ? [...pictureKinds(project), 'bannerColors'] : []

// Whether anything about a team differs from the ROM that was opened.
export function teamChanged(project: RomProject, original: RomProject, team: number): boolean {
  return (
    TEAM_PART_LIST.some((part) => teamPartChanged(project.teams[team], original.teams[team], part)) ||
    pictureParts(project).some((part) => pictureChanged(project, team, part))
  )
}

// Everything about one team as it was opened: names, roster, lines, colours
// and pictures.
export function resetTeam(project: RomProject, original: RomProject, team: number): RomProject {
  let next = project
  for (const part of pictureParts(project)) next = { ...next, graphics: resetPicture(next, team, part) }
  const restored = TEAM_PART_LIST.reduce((t, part) => resetTeamPart(t, original.teams[team], part), next.teams[team])
  return { ...next, teams: next.teams.map((t, i) => (i === team ? restored : t)) }
}

// ----------------------------------------------------------------- settings

export type SettingsPart = 'clock' | 'menu' | 'rules' | 'playoffDraws'

const SETTINGS_PARTS: Record<SettingsPart, (keyof Settings)[]> = {
  clock: ['periodLengths', 'overtimeSeconds', 'shootoutSeconds'],
  menu: ['menu'],
  rules: ['rules'],
  playoffDraws: ['playoffDraws'],
}

export function settingsPartChanged(settings: Settings, original: Settings, part: SettingsPart): boolean {
  return SETTINGS_PARTS[part].some((key) => !same(settings[key], original[key]))
}

export function resetSettingsPart(settings: Settings, original: Settings, part: SettingsPart): Settings {
  return { ...settings, ...Object.fromEntries(SETTINGS_PARTS[part].map((key) => [key, original[key]])) }
}
