import { readU16LE, writeU16LE } from './bytes'
import type { RomProject } from './rom'
import { findCode, loRomAddress, loRomBank, loRomOffset } from './snes'
import { freeSpace, keptBanks } from './snespictures'

// The colours of each SNES team's block, the banner its name is drawn on
// (TeamBlockPalettes, a long address a team of 16 colours; DrawTeamBlocks in
// abdulahmad/NHL94SNES). Kept apart from the team's strip colours.

// DrawTeamBlocks: asl; asl; tax; lda.l TeamBlockPalettes+2,x; sta p0+2; lda.l TeamBlockPalettes,x; sta p0; ldx #16; jsl SetColours.
const LOADER = '0a0aaabf......850ebf(....)(..)850ca2100022'
const COLOURS = 16

function table(rom: Uint8Array, teamCount: number): number | null {
  const code = findCode(rom, LOADER)
  if (!code || code.groups[0] < 0x8000) return null
  const at = loRomOffset(code.groups[1], code.groups[0])
  const ok = Array.from({ length: teamCount }, (_, t) => colourAt(rom, at, t)).every((p) => p >= 0 && p + COLOURS * 2 <= rom.length)
  return ok ? at : null
}

const colourAt = (rom: Uint8Array, at: number, team: number) => {
  const address = readU16LE(rom, at + team * 4)
  return address >= 0x8000 ? loRomOffset(rom[at + team * 4 + 2], address) : -1
}

export function snesBlockColours(project: RomProject, team: number): number[] | null {
  if (project.game.platform !== 'snes') return null
  const at = table(project.bytes, project.teams.length)
  if (at === null) return null
  const p = colourAt(project.bytes, at, team)
  return Array.from({ length: COLOURS }, (_, i) => readU16LE(project.bytes, p + i * 2))
}

// A team's block colours set: where they are if no other team shares them,
// else in free space with the team pointed there.
export function withSnesBlockColours(project: RomProject, team: number, colours: number[]): RomProject {
  const at = table(project.bytes, project.teams.length)
  if (at === null) throw new Error('This ROM keeps its team block colours in a way the editor cannot read.')
  const rom = project.bytes.slice()
  const p = colourAt(rom, at, team)
  const shared = project.teams.some((_, other) => other !== team && colourAt(rom, at, other) === p)
  const to = shared ? freeSpace(rom, COLOURS * 2, keptBanks(rom)) : p
  if (to < 0) throw new Error('The ROM has no free space left for these block colours.')
  colours.forEach((word, i) => writeU16LE(rom, to + i * 2, word))
  writeU16LE(rom, at + team * 4, loRomAddress(to))
  rom[at + team * 4 + 2] = loRomBank(to, rom[at + team * 4 + 2])
  return { ...project, bytes: rom }
}
