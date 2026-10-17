import { readU32, writeU32 } from './bytes'
import type { RomProject } from './rom'
import { claimSpace } from './space'

// Ports NOSE's two "Apply Hack > Free Bytes" operations. In the original ROM
// the team data is followed directly by the playoff draw tables and then the
// opening screen text. Moving those to the unused end of the ROM, and
// repointing the game at them, leaves the space for longer rosters.

const PLAYOFF_DRAW_SIZE = 16

export interface Expansion {
  step: 'introText' | 'playoffDraws'
  gain: number
  // Size of the ROM file afterwards, which may be larger than it is now.
  romSize: number
}

// The next expansion that can be applied, or null when there is none left.
export function nextExpansion(project: RomProject): Expansion | null {
  const { game, bytes, layout } = project
  if (game.platform === 'snes') return null
  const playoffs = game.playoffDrawPointerOffsets.map((o) => readU32(bytes, o))
  const playoffSize = game.playoffDrawCount * PLAYOFF_DRAW_SIZE
  const copyright = readU32(bytes, game.copyrightTextPointerOffset)
  const intro = readU32(bytes, game.introTextPointerOffset)
  // Both steps need the playoff tables to sit right after the team data.
  if (playoffs.some((p) => p !== layout.end)) return null

  const textFollows = copyright === layout.end + playoffSize
  if (textFollows && intro <= copyright) return null
  const step = textFollows ? 'introText' : 'playoffDraws'
  const gain = textFollows ? intro + game.introTextSize - copyright : playoffSize

  const claimed = claimSpace(bytes, gain)
  return claimed ? { step, gain, romSize: claimed.rom.length } : null
}

export function expandTeamSpace(project: RomProject): RomProject {
  const expansion = nextExpansion(project)
  if (!expansion) return project
  const { game, layout } = project
  const { gain } = expansion

  // The moved data goes beyond everything already in the ROM, including any
  // code a hack program has added there.
  const claimed = claimSpace(project.bytes, gain)
  if (!claimed) return project
  const { rom: bytes, at: destination } = claimed
  const playoffSize = game.playoffDrawCount * PLAYOFF_DRAW_SIZE

  if (expansion.step === 'introText') {
    const copyright = readU32(bytes, game.copyrightTextPointerOffset)
    const intro = readU32(bytes, game.introTextPointerOffset)
    bytes.copyWithin(destination, copyright, copyright + gain)
    writeU32(bytes, game.copyrightTextPointerOffset, destination)
    writeU32(bytes, game.introTextPointerOffset, destination + (intro - copyright))
    // The playoff tables slide along into the space the text left.
    bytes.copyWithin(layout.end + gain, layout.end, layout.end + playoffSize)
    for (const o of game.playoffDrawPointerOffsets) writeU32(bytes, o, layout.end + gain)
  } else {
    bytes.copyWithin(destination, layout.end, layout.end + playoffSize)
    for (const o of game.playoffDrawPointerOffsets) writeU32(bytes, o, destination)
  }

  return { ...project, bytes, layout: { ...layout, end: layout.end + gain } }
}
