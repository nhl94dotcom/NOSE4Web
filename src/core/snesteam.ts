import { readSnesText, readU16LE, snesTextSize, writeSnesText, writeU16LE } from './bytes'
import type { GameConfig } from './games'
import { loRomAddress, loRomBank, loRomOffset } from './snes'
import type { Player, Team, TeamLayout } from './team'

// A team block in the SNES game, in order. It holds what a Genesis block
// holds, without the team colours, and with words stored low byte first:
//   0x00  seven offset words (roster, team bytes, names, second line, team
//         bytes, goalie bytes, lines)
//   0x0E  three team bytes, then one byte holding the forward and defence counts
//   0x12  the team's overall rating, shown on the matchup screen
//   0x13  two goalie bytes (four nibbles)
//   0x15  lines: 8 bytes each, roster positions counted from 1
//   0x55  roster: players, goalies first, closed by an empty length word
//   ....  free bytes, if any: 0xFF, and where there are two or more, ending
//         with another empty length word, as SNES league editors leave them.
//         The game stops at the first one.
//   ....  four names: location, initials, name, stadium
// The team table holds each block's address as a word, its bank and a zero.
// The game looks for every block in the one bank, so they must stay there.
const TEAM_BYTES_OFFSET = 0x0e
const OVERALL_OFFSET = 0x12
const GOALIE_BYTES_OFFSET = 0x13
const LINES_OFFSET = 0x15
const LINE_SIZE = 8
const HEADER_WORDS = [-1, TEAM_BYTES_OFFSET, -1, LINES_OFFSET + LINE_SIZE, TEAM_BYTES_OFFSET, GOALIE_BYTES_OFFSET, LINES_OFFSET]
const PLAYER_ATTRIBUTE_BYTES = 8
const ROSTER_END_SIZE = 2
const NAME_COUNT = 4
const TABLE_ENTRY = 4

const isFree = (bytes: Uint8Array) => bytes.every((byte) => byte === 0xff)
const isFreeAfterRoster = (bytes: Uint8Array) =>
  isFree(bytes) || (bytes.length >= 2 && isFree(bytes.subarray(0, -2)) && readU16LE(bytes, bytes.length - 2) === ROSTER_END_SIZE)

function parseTeam(rom: Uint8Array, game: GameConfig, p: number): { team: Team; end: number } {
  const linesEnd = LINES_OFFSET + game.lineLabels.length * LINE_SIZE
  const header = HEADER_WORDS.map((_, i) => readU16LE(rom, p + i * 2))
  const rosterOffset = header[0]
  const namesOffset = header[2]
  if (header.some((v, i) => HEADER_WORDS[i] >= 0 && v !== HEADER_WORDS[i]) || rosterOffset < linesEnd || namesOffset <= rosterOffset) {
    throw new Error(`Team at 0x${p.toString(16)} does not have the expected layout.`)
  }
  if (!isFree(rom.subarray(p + linesEnd, p + rosterOffset))) {
    throw new Error(`Team at 0x${p.toString(16)} has something unexpected before its roster.`)
  }

  const counts = rom[p + TEAM_BYTES_OFFSET + 3]
  const goalieNibbles: number[] = []
  for (let i = 0; i < 2; i++) {
    const b = rom[p + GOALIE_BYTES_OFFSET + i]
    goalieNibbles.push(b >> 4, b & 0x0f)
  }
  const lines: number[][] = []
  for (let i = 0; i < game.lineLabels.length; i++) {
    const o = p + LINES_OFFSET + i * LINE_SIZE
    lines.push(Array.from(rom.subarray(o, o + LINE_SIZE)))
  }

  const players: Player[] = []
  const names = p + namesOffset
  let o = p + rosterOffset
  while (readU16LE(rom, o) !== ROSTER_END_SIZE) {
    const { text, size } = readSnesText(rom, o)
    if (size < ROSTER_END_SIZE || o + size + PLAYER_ATTRIBUTE_BYTES > names) {
      throw new Error(`Team at 0x${p.toString(16)} has an unexpected roster ending.`)
    }
    o += size
    const attributes: number[] = []
    for (let i = 1; i < PLAYER_ATTRIBUTE_BYTES; i++) attributes.push(rom[o + i] >> 4, rom[o + i] & 0x0f)
    players.push({ name: text, jersey: rom[o], attributes })
    o += PLAYER_ATTRIBUTE_BYTES
  }
  o += ROSTER_END_SIZE
  if (o > names || !isFreeAfterRoster(rom.subarray(o, names))) {
    throw new Error(`Team at 0x${p.toString(16)} has something unexpected after its roster.`)
  }

  const teamNames: string[] = []
  o = names
  for (let i = 0; i < NAME_COUNT; i++) {
    const { text, size } = readSnesText(rom, o)
    teamNames.push(text)
    o += size
  }

  const team: Team = {
    palette: [],
    teamBytes: Array.from(rom.subarray(p + TEAM_BYTES_OFFSET, p + TEAM_BYTES_OFFSET + 3)),
    forwards: counts >> 4,
    defense: counts & 0x0f,
    goalieNibbles,
    shownOverall: rom[p + OVERALL_OFFSET],
    lines,
    freeBytes: rosterOffset - linesEnd + (names - (p + rosterOffset) - rosterSize(players)),
    players,
    names: teamNames,
  }
  return { team, end: o }
}

function rosterSize(players: Player[]): number {
  return players.reduce((sum, player) => sum + snesTextSize(player.name) + PLAYER_ATTRIBUTE_BYTES, ROSTER_END_SIZE)
}

export function parseSnesTeams(rom: Uint8Array, game: GameConfig): { teams: Team[]; layout: TeamLayout } {
  const entries = Array.from({ length: game.teamCount }, (_, i) => game.teamTableOffset + i * TABLE_ENTRY)
  const bank = rom[entries[0] + 2]
  if (entries.some((at) => rom[at + 2] !== bank || rom[at + 3] !== 0)) {
    throw new Error('The teams are not all kept in one bank of the ROM, so they cannot be edited safely.')
  }
  const pointers = entries.map((at) => loRomOffset(bank, readU16LE(rom, at)))
  const fileOrder = pointers.map((_, i) => i).sort((a, b) => pointers[a] - pointers[b])

  const teams: Team[] = new Array(game.teamCount)
  let next = pointers[fileOrder[0]]
  for (const index of fileOrder) {
    if (pointers[index] < next || !isFree(rom.subarray(next, pointers[index]))) {
      throw new Error('The team data is not stored as one continuous run, so it cannot be edited safely.')
    }
    const { team, end } = parseTeam(rom, game, pointers[index])
    teams[index] = team
    next = end
  }
  return { teams, layout: { start: pointers[fileOrder[0]], end: next, fileOrder, snes: true } }
}

// Bytes a team needs, not counting its free bytes.
export function snesTeamContentSize(team: Team): number {
  const names = team.names.reduce((sum, name) => sum + snesTextSize(name), 0)
  return LINES_OFFSET + team.lines.length * LINE_SIZE + rosterSize(team.players) + names
}

// Writes a team block at `p`, with its free bytes after the roster, as SNES
// league ROMs have them. Returns where the block ends.
function writeTeam(rom: Uint8Array, p: number, team: Team, freeBytes: number): number {
  const rosterOffset = LINES_OFFSET + team.lines.length * LINE_SIZE
  rom.set(team.teamBytes, p + TEAM_BYTES_OFFSET)
  rom[p + TEAM_BYTES_OFFSET + 3] = (team.forwards << 4) | team.defense
  rom[p + OVERALL_OFFSET] = team.shownOverall ?? 0
  for (let i = 0; i < 2; i++) {
    rom[p + GOALIE_BYTES_OFFSET + i] = (team.goalieNibbles[i * 2] << 4) | team.goalieNibbles[i * 2 + 1]
  }
  team.lines.forEach((line, i) => rom.set(line, p + LINES_OFFSET + i * LINE_SIZE))

  let o = p + rosterOffset
  for (const player of team.players) {
    o += writeSnesText(rom, o, player.name)
    rom[o] = player.jersey
    for (let i = 1; i < PLAYER_ATTRIBUTE_BYTES; i++) {
      rom[o + i] = (player.attributes[i * 2 - 2] << 4) | player.attributes[i * 2 - 1]
    }
    o += PLAYER_ATTRIBUTE_BYTES
  }
  writeU16LE(rom, o, ROSTER_END_SIZE)
  o += ROSTER_END_SIZE
  rom.fill(0xff, o, o + freeBytes)
  o += freeBytes
  if (freeBytes >= 2) writeU16LE(rom, o - 2, ROSTER_END_SIZE)

  const namesOffset = o - p
  for (const name of team.names) o += writeSnesText(rom, o, name)
  HEADER_WORDS.forEach((word, i) => writeU16LE(rom, p + i * 2, i === 0 ? rosterOffset : i === 2 ? namesOffset : word))
  return o
}

// Rewrites every team block and the team table into `rom`, given how many
// free bytes each team is to have.
export function writeSnesTeams(rom: Uint8Array, game: GameConfig, teams: Team[], layout: TeamLayout, free: number[]): void {
  const bank = rom[game.teamTableOffset + 2]
  let p = layout.start
  for (const index of layout.fileOrder) {
    const at = game.teamTableOffset + index * TABLE_ENTRY
    writeU16LE(rom, at, loRomAddress(p))
    rom[at + 2] = loRomBank(p, bank)
    p = writeTeam(rom, p, teams[index], free[index])
  }
}
