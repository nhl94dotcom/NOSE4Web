import { readU32, writeU16, writeU32 } from './bytes'
import type { RomProject } from './rom'

// Ports NOSE's two "Apply Hack > Free Bytes" operations. In the original ROM
// the team data is followed directly by the playoff draw tables and then the
// opening screen text. Moving those to the unused end of the ROM, and
// repointing the game at them, leaves the space for longer rosters.

const PLAYOFF_DRAW_SIZE = 16
// NOSE marks the end of the used part of the ROM with this instruction.
const END_MARKER = 0x60fe
const END_MARKER_SIZE = 2

export interface Expansion {
  step: 'introText' | 'playoffDraws'
  gain: number
  // Size of the ROM file afterwards, which may be larger than it is now.
  romSize: number
}

function findDataEnd(rom: Uint8Array): number {
  for (let o = rom.length - 2; o >= 0; o--) {
    if (rom[o] === 0x60 && rom[o + 1] === 0xfe) return o + END_MARKER_SIZE
  }
  return -1
}

function grownSize(size: number): number {
  if (size === 0x80000 || size === 0x100000) return size * 2
  if (size === 0x200000) return 0x300000
  return -1
}

// The next expansion that can be applied, or null when there is none left.
export function nextExpansion(project: RomProject): Expansion | null {
  const { game, bytes, layout } = project
  const playoffs = game.playoffDrawPointerOffsets.map((o) => readU32(bytes, o))
  const playoffSize = game.playoffDrawCount * PLAYOFF_DRAW_SIZE
  const copyright = readU32(bytes, game.copyrightTextPointerOffset)
  const intro = readU32(bytes, game.introTextPointerOffset)
  const dataEnd = findDataEnd(bytes)
  // Both steps need the playoff tables to sit right after the team data.
  if (dataEnd < 0 || playoffs.some((p) => p !== layout.end)) return null

  const textFollows = copyright === layout.end + playoffSize
  if (textFollows && intro <= copyright) return null
  const step = textFollows ? 'introText' : 'playoffDraws'
  const gain = textFollows ? intro + game.introTextSize - copyright : playoffSize

  let romSize = bytes.length
  if (dataEnd + gain > romSize) romSize = grownSize(romSize)
  return romSize < 0 ? null : { step, gain, romSize }
}

export function expandTeamSpace(project: RomProject): RomProject {
  const expansion = nextExpansion(project)
  if (!expansion) return project
  const { game, layout } = project
  const { gain } = expansion

  const bytes = new Uint8Array(expansion.romSize).fill(0xff)
  bytes.set(project.bytes)
  const playoffSize = game.playoffDrawCount * PLAYOFF_DRAW_SIZE
  // The moved data replaces the old end marker, and a new marker follows it.
  const destination = findDataEnd(bytes) - END_MARKER_SIZE

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
  writeU16(bytes, destination + gain, END_MARKER)
  bytes.fill(0xff, destination + gain + END_MARKER_SIZE)

  return { ...project, bytes, layout: { ...layout, end: layout.end + gain } }
}
