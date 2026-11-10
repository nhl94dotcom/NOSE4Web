import { detectHacks } from './hacks'
import type { RomProject } from './rom'
import { snesAnyPosition } from './sneshacks'

// Whether the game's Edit Lines may put any skater at any position in this
// ROM: the SNES hack from NHL94SNESVault, or the Genesis one.
export function anyPosition(project: RomProject): boolean {
  if (project.game.platform === 'snes') return snesAnyPosition(project)
  return project.game.settingsSupported && detectHacks(project.bytes).choices.anyPosition
}
