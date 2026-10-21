import { hackState } from './hacks'
import type { RomProject } from './rom'
import { detectSnesHacks } from './sneshacks'
import { teamRatingsFor, type TeamRating } from './teamratings'

// Whether the ROM has the power play and penalty kill fix, so that the
// halves of a team's second rating byte mean what the data was written for.
export function hasPpPkFix(project: Pick<RomProject, 'game' | 'bytes'>): boolean {
  if (project.game.platform === 'snes') return detectSnesHacks(project.bytes).choices.ppPkFix
  return hackState(project as RomProject)?.choices.ppPkFix ?? false
}

// The six team ratings as this ROM reads them.
export const projectTeamRatings = (project: Pick<RomProject, 'game' | 'bytes'>): TeamRating[] => teamRatingsFor(hasPpPkFix(project))
