// A season's starting point, and what has changed since.
//
// The user can mark where a season starts. The editor then keeps the teams
// as they stood at that moment, and can say at any time what has been done
// since, in the words of the change report. It is part of the user's work,
// kept with it in the browser and in project files, and is not in the ROM.

import { changeReport, type ChangeReport } from './report'
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
  return changeReport(before, project)
}

// How many separate changes a report holds, for the number beside the page's name.
export function changeCount(report: ChangeReport): number {
  return report.details.reduce((sum, section) => sum + section.changes.length, 0)
}
