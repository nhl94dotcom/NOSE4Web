import { readText, readU16, readU32, textSize, writeText, writeU16, writeU32 } from './bytes'
import type { GameConfig } from './games'

// A team block in the ROM, in order:
//   0x00  six offset words (roster, palette, names, lines, team bytes, goalie bytes)
//   0x0C  palette: 32 colour words, home strip then away strip
//   0x4C  three team bytes, then one byte holding the forward and defence counts
//   0x50  two goalie bytes (four nibbles)
//   0x52  lines: 8 bytes each, roster positions counted from 1
//   ....  free bytes (0xFF), if any
//   ....  roster: players, goalies first, closed by an empty length word
//   ....  four names: location, initials, name, stadium
const PALETTE_OFFSET = 0x0c
const TEAM_BYTES_OFFSET = 0x4c
const GOALIE_BYTES_OFFSET = 0x50
const LINES_OFFSET = 0x52
const LINE_SIZE = 8
const PLAYER_ATTRIBUTE_BYTES = 8
const ROSTER_END_SIZE = 2
const NAME_COUNT = 4

export interface Player {
  name: string
  // Stored as two decimal digits in one byte, so 0x33 is number 33.
  jersey: number
  // Fourteen values of 0-15, in the order of the game's attribute labels.
  attributes: number[]
}

export interface Team {
  palette: number[]
  // Six ratings, two to a byte: see teamratings.ts.
  teamBytes: number[]
  forwards: number
  defense: number
  goalieNibbles: number[]
  lines: number[][]
  freeBytes: number
  players: Player[]
  // Location, initials, name, stadium.
  names: string[]
}

// Where the team data sits in the ROM, so it can be written back to the same place.
export interface TeamLayout {
  start: number
  end: number
  // Team table positions in the order their blocks appear in the ROM.
  fileOrder: number[]
  // Only for ROMs that give each team a place of its own, with unused room
  // after it: where each team's place is and how big, by team. Such teams do
  // not share their room, and none of them moves.
  slots?: { at: number; size: number }[]
}

// A team's name with its league, where a ROM has several leagues and the
// name alone is not enough: "Boston Bruins (NHL '94)".
export function teamLabels(teams: Team[], game: GameConfig): string[] {
  const names = teams.map(teamDisplayName)
  const groups = game.teamGroups.flatMap((group) => new Array<string>(group.teams).fill(group.name))
  return names.map((name, i) => (groups[i] && names.filter((other) => other === name).length > 1 ? `${name} (${groups[i]})` : name))
}

// A name that tells apart teams sharing a location, such as the two in New York.
export function teamDisplayName(team: Team): string {
  return `${team.names[0]} ${team.names[2]}`.trim()
}

export function goalieCount(team: Team): number {
  for (let i = 3; i >= 0; i--) if (team.goalieNibbles[i] !== 0) return i + 1
  return 0
}

function parseTeam(rom: Uint8Array, game: GameConfig, p: number): { team: Team; end: number } {
  const lineCount = game.lineLabels.length
  const rosterOffset = readU16(rom, p)
  const namesOffset = readU16(rom, p + 4)
  const linesEnd = LINES_OFFSET + lineCount * LINE_SIZE
  const header = [2, 6, 8, 10].map((o) => readU16(rom, p + o))
  const expected = [PALETTE_OFFSET, LINES_OFFSET, TEAM_BYTES_OFFSET, GOALIE_BYTES_OFFSET]
  if (header.some((v, i) => v !== expected[i]) || rosterOffset < linesEnd || namesOffset <= rosterOffset) {
    throw new Error(`Team at 0x${p.toString(16)} does not have the expected layout.`)
  }

  const palette: number[] = []
  for (let i = 0; i < 32; i++) palette.push(readU16(rom, p + PALETTE_OFFSET + i * 2))

  const counts = rom[p + TEAM_BYTES_OFFSET + 3]
  const goalieNibbles: number[] = []
  for (let i = 0; i < 2; i++) {
    const b = rom[p + GOALIE_BYTES_OFFSET + i]
    goalieNibbles.push(b >> 4, b & 0x0f)
  }

  const lines: number[][] = []
  for (let i = 0; i < lineCount; i++) {
    const o = p + LINES_OFFSET + i * LINE_SIZE
    lines.push(Array.from(rom.subarray(o, o + LINE_SIZE)))
  }

  const players: Player[] = []
  const names = p + namesOffset
  let o = p + rosterOffset
  while (o + readU16(rom, o) < names) {
    const { text, size } = readText(rom, o)
    o += size
    const attributes: number[] = []
    for (let i = 1; i < PLAYER_ATTRIBUTE_BYTES; i++) attributes.push(rom[o + i] >> 4, rom[o + i] & 0x0f)
    players.push({ name: text, jersey: rom[o], attributes })
    o += PLAYER_ATTRIBUTE_BYTES
  }
  if (o + ROSTER_END_SIZE !== names || readU16(rom, o) !== ROSTER_END_SIZE) {
    throw new Error(`Team at 0x${p.toString(16)} has an unexpected roster ending.`)
  }

  const teamNames: string[] = []
  o = names
  for (let i = 0; i < NAME_COUNT; i++) {
    const { text, size } = readText(rom, o)
    teamNames.push(text)
    o += size
  }

  const team: Team = {
    palette,
    teamBytes: Array.from(rom.subarray(p + TEAM_BYTES_OFFSET, p + TEAM_BYTES_OFFSET + 3)),
    forwards: counts >> 4,
    defense: counts & 0x0f,
    goalieNibbles,
    lines,
    freeBytes: rosterOffset - linesEnd,
    players,
    names: teamNames,
  }
  return { team, end: o }
}

export function parseTeams(rom: Uint8Array, game: GameConfig): { teams: Team[]; layout: TeamLayout } {
  const pointers: number[] = []
  for (let i = 0; i < game.teamCount; i++) pointers.push(readU32(rom, game.teamTableOffset + i * 4))
  const fileOrder = pointers.map((_, i) => i).sort((a, b) => pointers[a] - pointers[b])

  const teams: Team[] = new Array(game.teamCount)
  const ends: number[] = new Array(game.teamCount)
  let next = pointers[fileOrder[0]]
  let gaps = false
  for (const index of fileOrder) {
    // Unused room between one team and the next is fine if it is plainly
    // unused. Anything else there is something the editor does not know.
    const gap = rom.subarray(next, pointers[index])
    if (pointers[index] < next || !gap.every((byte) => byte === 0xff)) {
      throw new Error('The team data is not stored as one continuous run, so it cannot be edited safely.')
    }
    gaps ||= gap.length > 0
    const { team, end } = parseTeam(rom, game, pointers[index])
    teams[index] = team
    ends[index] = end
    next = end
  }
  const layout: TeamLayout = { start: pointers[fileOrder[0]], end: next, fileOrder }
  if (!gaps) return { teams, layout }

  // Each team has the room up to the next. The last has as much as the others
  // where they all have the same and that much is unused after it.
  const sizes = fileOrder.slice(0, -1).map((index, i) => pointers[fileOrder[i + 1]] - pointers[index])
  const last = fileOrder[fileOrder.length - 1]
  const usual = sizes.every((size) => size === sizes[0]) ? sizes[0] : 0
  const spare = rom.subarray(ends[last], pointers[last] + usual)
  const lastSize = pointers[last] + usual <= rom.length && spare.every((byte) => byte === 0xff) && usual > 0 ? usual : ends[last] - pointers[last]
  const slots = new Array<{ at: number; size: number }>(game.teamCount)
  fileOrder.forEach((index, i) => (slots[index] = { at: pointers[index], size: i < sizes.length ? sizes[i] : lastSize }))
  return { teams, layout: { ...layout, end: pointers[last] + lastSize, slots } }
}

// Bytes a team needs, not counting its free bytes.
export function teamContentSize(team: Team): number {
  let size = LINES_OFFSET + team.lines.length * LINE_SIZE + ROSTER_END_SIZE
  for (const player of team.players) size += textSize(player.name) + PLAYER_ATTRIBUTE_BYTES
  for (const name of team.names) size += textSize(name)
  return size
}

// How far each team that has outgrown its own place is over. Empty for ROMs
// whose teams share their room.
export function overfullTeams(teams: Team[], layout: TeamLayout): { team: number; over: number }[] {
  return (layout.slots ?? []).flatMap((slot, team) => {
    const over = teamContentSize(teams[team]) + teams[team].freeBytes - slot.size
    return over > 0 ? [{ team, over }] : []
  })
}

// The room the team data takes and has. Where each team has a place of its
// own, this is for the team with the least to spare, which `team` names.
export function teamSpace(teams: Team[], layout: TeamLayout): { used: number; available: number; team?: number } {
  if (layout.slots) {
    const spare = layout.slots.map((slot, team) => slot.size - teamContentSize(teams[team]) - teams[team].freeBytes)
    const team = spare.indexOf(Math.min(...spare))
    return { used: layout.slots[team].size - spare[team], available: layout.slots[team].size, team }
  }
  const used = teams.reduce((sum, team) => sum + teamContentSize(team), 0)
  return { used, available: layout.end - layout.start }
}

// Decides how many free bytes each team gets so the blocks exactly fill the
// space. Spare room goes to the last team in the ROM; a shortfall is taken
// from existing free bytes, working back from the last team.
function allocateFreeBytes(teams: Team[], layout: TeamLayout): number[] {
  const free = teams.map((team) => team.freeBytes)
  const total = teams.reduce((sum, team, i) => sum + teamContentSize(team) + free[i], 0)
  let spare = layout.end - layout.start - total
  const last = layout.fileOrder[layout.fileOrder.length - 1]
  if (spare >= 0) {
    free[last] += spare
    return free
  }
  for (let i = layout.fileOrder.length - 1; i >= 0 && spare < 0; i--) {
    const index = layout.fileOrder[i]
    const taken = Math.min(free[index], -spare)
    free[index] -= taken
    spare += taken
  }
  if (spare < 0) throw new Error(`The team data is ${-spare} bytes too large to fit in the ROM.`)
  return free
}

function writeTeam(rom: Uint8Array, p: number, team: Team, freeBytes: number): number {
  const rosterOffset = LINES_OFFSET + team.lines.length * LINE_SIZE + freeBytes
  for (let i = 0; i < 32; i++) writeU16(rom, p + PALETTE_OFFSET + i * 2, team.palette[i])
  rom.set(team.teamBytes, p + TEAM_BYTES_OFFSET)
  rom[p + TEAM_BYTES_OFFSET + 3] = (team.forwards << 4) | team.defense
  for (let i = 0; i < 2; i++) {
    rom[p + GOALIE_BYTES_OFFSET + i] = (team.goalieNibbles[i * 2] << 4) | team.goalieNibbles[i * 2 + 1]
  }
  team.lines.forEach((line, i) => rom.set(line, p + LINES_OFFSET + i * LINE_SIZE))
  rom.fill(0xff, p + rosterOffset - freeBytes, p + rosterOffset)

  let o = p + rosterOffset
  for (const player of team.players) {
    o += writeText(rom, o, player.name)
    rom[o] = player.jersey
    for (let i = 1; i < PLAYER_ATTRIBUTE_BYTES; i++) {
      rom[o + i] = (player.attributes[i * 2 - 2] << 4) | player.attributes[i * 2 - 1]
    }
    o += PLAYER_ATTRIBUTE_BYTES
  }
  writeU16(rom, o, ROSTER_END_SIZE)
  o += ROSTER_END_SIZE

  const namesOffset = o - p
  for (const name of team.names) o += writeText(rom, o, name)

  writeU16(rom, p, rosterOffset)
  writeU16(rom, p + 2, PALETTE_OFFSET)
  writeU16(rom, p + 4, namesOffset)
  writeU16(rom, p + 6, LINES_OFFSET)
  writeU16(rom, p + 8, TEAM_BYTES_OFFSET)
  writeU16(rom, p + 10, GOALIE_BYTES_OFFSET)
  return o
}

// Rewrites every team block and the team table into `rom`.
export function writeTeams(rom: Uint8Array, game: GameConfig, teams: Team[], layout: TeamLayout): void {
  if (layout.slots) {
    const [worst] = overfullTeams(teams, layout).sort((a, b) => b.over - a.over)
    if (worst) {
      throw new Error(`${teamDisplayName(teams[worst.team])} is ${worst.over} bytes too large for its place in the ROM.`)
    }
    layout.slots.forEach((slot, index) => {
      writeU32(rom, game.teamTableOffset + index * 4, slot.at)
      const end = writeTeam(rom, slot.at, teams[index], teams[index].freeBytes)
      rom.fill(0xff, end, slot.at + slot.size)
    })
    return
  }
  const free = allocateFreeBytes(teams, layout)
  let p = layout.start
  for (const index of layout.fileOrder) {
    writeU32(rom, game.teamTableOffset + index * 4, p)
    p = writeTeam(rom, p, teams[index], free[index])
  }
}
