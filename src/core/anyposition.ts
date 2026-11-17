import { detectHacks } from './hacks'
import { detectNhl95Hacks, nhl95HacksSupported } from './nhl95hacks'
import type { RomProject } from './rom'
import { snesAnyPosition } from './sneshacks'

// Whether the game's Edit Lines may put any skater at any position in this
// ROM: the SNES hack from NHL94SNESVault, or the Genesis one (NHL 94's or NHL '95's).
export function anyPosition(project: Pick<RomProject, 'game' | 'bytes'>): boolean {
  if (project.game.platform === 'snes') return snesAnyPosition(project)
  if (nhl95HacksSupported(project.game)) return detectNhl95Hacks(project.bytes).choices.anyPosition
  return project.game.settingsSupported && detectHacks(project.bytes).choices.anyPosition
}
