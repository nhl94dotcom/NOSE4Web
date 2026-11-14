// A season's starting point, and what has changed since.
//
// The user can mark where a season starts. The editor then keeps the teams
// as they stood at that moment, and can say at any time what has been done
// since, in the words of the change report. It is part of the user's work,
// kept with it in the browser and in project files, and is not in the ROM.

import { changeReport, type ChangeReport } from './report'
import { detectHacks, hackChanges, hacksSupported, type HackChoices, type HackPart } from './hacks'
import { detectSnesHacks, snesHackStateChanges, type SnesHack, type SnesHackChoices, type SnesAmount } from './sneshacks'
import type { RomProject } from './rom'
import type { Settings } from './settings'
import type { Team } from './team'
import type { FreeAgent } from './trade'

export interface Baseline {
  // What the work was called when the season was started.
  name: string
  // When, as text a spreadsheet or a person can read.
  startedAt: string
  teams: Team[]
  settings: Settings
  rinkPalette: number[]
  freeAgents: FreeAgent[]
  // The game's hacks when the season began, for the Changes list. Seasons begun before NOSE4Web kept them have none.
  hacks?: HackSnapshot
}

// A ROM's hacks as detected: the choices, the amounts (SNES) and those whose code is not recognised.
export interface HackSnapshot {
  choices: Record<string, unknown>
  amounts?: Record<string, number>
  unknown: string[]
}

export function hackSnapshot(project: RomProject): HackSnapshot | undefined {
  if (hacksSupported(project.game)) {
    const { choices, unknown } = detectHacks(project.bytes)
    return { choices: { ...choices }, unknown: [...unknown] }
  }
  if (project.game.platform === 'snes') {
    const { choices, unknown, amounts } = detectSnesHacks(project.bytes)
    return { choices: { ...choices }, unknown: [...unknown], ...(amounts ? { amounts: { ...amounts } } : {}) }
  }
  return undefined
}

// The hacks changed between a snapshot and the work now.
function hackChangesSince(project: RomProject, was: HackSnapshot): string[] {
  const now = hackSnapshot(project)
  if (!now) return []
  if (hacksSupported(project.game)) {
    return hackChanges(was.choices as unknown as HackChoices, now.choices as unknown as HackChoices, [...was.unknown, ...now.unknown] as HackPart[])
  }
  const state = (s: HackSnapshot) => ({ choices: s.choices as unknown as SnesHackChoices, unknown: s.unknown as SnesHack[], amounts: s.amounts as Record<SnesAmount, number> | undefined })
  return snesHackStateChanges(state(was), state(now))
}

// "Season_12" becomes "Season_13"; a name with no number at its end gets one.
export function nextSeasonName(name: string): string {
  const match = /^(.*?)(\d+)$/.exec(name)
  if (!match) return name === '' ? 'Season_2' : `${name}_2`
  const next = String(Number(match[2]) + 1).padStart(match[2].length, '0')
  return `${match[1]}${next}`
}

export interface NewSeason {
  // Whether the free agents held over from last season are let go.
  clearFreeAgents: boolean
}

// Marks the project as it stands as the start of a season. `name` is what
// the work is called from now on.
export function startSeason(project: RomProject, name: string, options: NewSeason, now = new Date()): RomProject {
  const freeAgents = options.clearFreeAgents ? [] : project.freeAgents
  return {
    ...project,
    freeAgents,
    baseline: {
      name,
      startedAt: now.toISOString(),
      teams: project.teams,
      settings: project.settings,
      rinkPalette: project.rinkPalette,
      freeAgents,
      hacks: hackSnapshot(project),
    },
  }
}

// The project as it was at a starting point: the same ROM, with the teams
// and settings of that moment.
function asItWas(project: RomProject, baseline: Baseline): RomProject {
  return { ...project, teams: baseline.teams, settings: baseline.settings, rinkPalette: baseline.rinkPalette, freeAgents: baseline.freeAgents }
}

// What has changed since the season started, or since the ROM was opened.
export function changesSince(project: RomProject, start: Baseline | RomProject): ChangeReport {
  const before = 'bytes' in start ? start : asItWas(project, start)
  // Teams are compared one for one, so both must have the same number.
  if (before.teams.length !== project.teams.length) return changeReport(project, project)
  const report = changeReport(before, project)
  if ('bytes' in start) return report
  // Since a season began, the hacks are compared with those it began with. A season begun before those were kept
  // has the hacks changed since the ROM was opened, and says so.
  const others = report.details.filter((section) => section.heading !== 'Hacks')
  const sinceOpened = report.details.find((section) => section.heading === 'Hacks')
  const hacks = start.hacks
    ? { heading: 'Hacks', changes: hackChangesSince(project, start.hacks) }
    : sinceOpened && { heading: 'Hacks (since the ROM was opened)', changes: sinceOpened.changes }
  if (!hacks || hacks.changes.length === 0) return { ...report, details: others }
  // Where compareProjects puts them: after In general, before the teams.
  const at = others.findIndex((section) => section.heading === 'In general') + 1
  return { ...report, details: [...others.slice(0, at), hacks, ...others.slice(at)] }
}

// How many separate changes a report holds, for the number beside the page's name.
export function changeCount(report: ChangeReport): number {
  return report.details.reduce((sum, section) => sum + section.changes.length, 0)
}
