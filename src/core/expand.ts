import { isGenesis94 } from './games'
import { creditsAt, parseCredits } from './credits'
import { readU32, writeU32 } from './bytes'
import type { RomProject } from './rom'
import { claimSpace } from './space'

// Ports NOSE's two "Apply Hack > Free Bytes" operations. In the original ROM
// the team data is followed directly by the playoff draw tables and then the
// opening screen text. Moving those to the unused end of the ROM, and
// repointing the game at them, leaves the space for longer rosters.

const PLAYOFF_DRAW_SIZE = 16

// NHL '95: the teams moved from their place in the first megabyte to the unused second, with this much room more,
// as the WN95HL's ROMs have them (their table pointing at $1A7300 on). In the original game that room is unused from
// $1A72C0 (Match Viewer), where the self-check NOSE4Web takes out leaves its bra * (kept: NOSE's end mark looks the
// same). The team table is rewritten from the new place whenever the ROM is built.
const NHL95_TEAM_ROOM = 0x4000

export interface Expansion {
  step: 'introText' | 'playoffDraws' | 'moveTeams'
  gain: number
  // Size of the ROM file afterwards, which may be larger than it is now.
  romSize: number
}

// The next expansion that can be applied, or null when there is none left.
export function nextExpansion(project: RomProject): Expansion | null {
  const { game, bytes, layout } = project
  if (game.edition === 95) {
    // Once, from the first megabyte; a league ROM that has moved them already has its own room.
    if (layout.slots || layout.start >= 0x100000) return null
    const claimed = claimSpace(bytes, layout.end - layout.start + NHL95_TEAM_ROOM, true)
    return claimed ? { step: 'moveTeams', gain: NHL95_TEAM_ROOM, romSize: claimed.rom.length } : null
  }
  // Other games' opening text is not where the editor can move it.
  if (!isGenesis94(game)) return null
  const playoffs = game.playoffDrawPointerOffsets.map((o) => readU32(bytes, o))
  const playoffSize = game.playoffDrawCount * PLAYOFF_DRAW_SIZE
  const copyright = readU32(bytes, game.copyrightTextPointerOffset)
  const intro = readU32(bytes, game.introTextPointerOffset)
  // Both steps need the playoff tables to sit right after the team data.
  if (playoffs.some((p) => p !== layout.end)) return null

  const textFollows = copyright === layout.end + playoffSize
  if (textFollows && intro <= copyright) return null
  const step = textFollows ? 'introText' : 'playoffDraws'
  // The text's room: the credits' own where they start there, which an edited first page does not change.
  const credits = creditsAt(bytes) === copyright ? parseCredits(bytes) : null
  const gain = textFollows ? (credits?.room ?? intro + game.introTextSize - copyright) : playoffSize

  const claimed = claimSpace(bytes, gain)
  return claimed ? { step, gain, romSize: claimed.rom.length } : null
}

export function expandTeamSpace(project: RomProject): RomProject {
  const expansion = nextExpansion(project)
  if (!expansion) return project
  const { game, layout } = project
  const { gain } = expansion

  if (expansion.step === 'moveTeams') {
    const size = layout.end - layout.start
    const moved = claimSpace(project.bytes, size + gain, true)
    if (!moved) return project
    moved.rom.copyWithin(moved.at, layout.start, layout.end)
    return { ...project, bytes: moved.rom, layout: { ...layout, start: moved.at, end: moved.at + size + gain } }
  }

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
