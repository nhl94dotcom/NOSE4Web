import { readSnesText, readU16LE, snesTextSize, writeSnesText, writeU16LE } from './bytes'
import type { GameConfig } from './games'
import { loRomAddress, loRomBank, loRomOffset, snesStripTables, STRIP_BYTES } from './snes'
import { writeSnesPlaceNames } from './snesplacenames'
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
// The team colours are kept apart from the blocks; see snes.ts.
// The team table holds each block's address as a word, its bank and a zero.
// The game looks for every block in the one bank, so they must stay there,
// but anywhere in it: it keeps only the word of each address and takes the
// bank from the table's. Teams that no longer fit where the game has them go
// into the unused room at the end of that bank (the original game has 1.7 KB
// there, the 32-team builds about 9.8 KB).
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
const BANK_SIZE = 0x8000
// Unused room counts as room for teams only in a run this long, and some of
// its start is left alone, in case the data before it ends in $FF bytes.
const MIN_OVERFLOW = 256
const OVERFLOW_MARGIN = 16

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
  const bankEnd = next - (next % BANK_SIZE) + BANK_SIZE
  // Where the first run of blocks ends and a second, in the bank's unused room, starts.
  let mainEnd = -1
  let overflowStart = -1
  for (const index of fileOrder) {
    const p = pointers[index]
    const gapIsFree = p >= next && isFree(rom.subarray(next, p))
    if (p >= next && !gapIsFree && mainEnd < 0 && p < bankEnd) [mainEnd, overflowStart] = [next, p]
    else if (!gapIsFree) throw new Error('The team data is not stored as one continuous run, so it cannot be edited safely.')
    const { team, end } = parseTeam(rom, game, p)
    teams[index] = team
    next = end
  }
  let overflow: { start: number; end: number } | undefined
  if (mainEnd >= 0) {
    let end = next
    while (end < bankEnd && rom[end] === 0xff) end++
    overflow = { start: overflowStart, end }
  } else {
    mainEnd = next
    overflow = unusedRoom(rom, mainEnd, bankEnd)
  }
  // Home strip then away strip, as for the Genesis game, where the ROM keeps them as the editor expects.
  const strips = snesStripTables(rom)
  if (strips) {
    const strip = (table: number, team: number) =>
      Array.from({ length: STRIP_BYTES / 2 }, (_, i) => readU16LE(rom, table + team * STRIP_BYTES + i * 2))
    teams.forEach((team, i) => (team.palette = [...strip(strips.home, i), ...strip(strips.away, i)]))
  }
  return { teams, layout: { start: pointers[fileOrder[0]], end: mainEnd, fileOrder, snes: true, ...(overflow ? { overflow } : {}) } }
}

// The last run of unused bytes between `from` and the end of the bank, if long enough.
function unusedRoom(rom: Uint8Array, from: number, bankEnd: number): { start: number; end: number } | undefined {
  let end = Math.min(bankEnd, rom.length)
  while (end > from) {
    let start = end
    while (start > from && rom[start - 1] === 0xff) start--
    if (end - start >= MIN_OVERFLOW) return { start: start + OVERFLOW_MARGIN, end }
    end = start - 1
  }
  return undefined
}

// How many free bytes each of `order`'s teams keeps so that together they fill
// `room` (`fill`) or fit in it: a shortfall is taken from the free bytes,
// working back from the last team, and spare room goes to the last. Null if
// they do not fit.
function fitFree(content: number[], free: number[], order: number[], room: number, fill: boolean): number[] | null {
  const kept = free.slice()
  let spare = room - order.reduce((sum, index) => sum + content[index] + kept[index], 0)
  for (let i = order.length - 1; i >= 0 && spare < 0; i--) {
    const taken = Math.min(kept[order[i]], -spare)
    kept[order[i]] -= taken
    spare += taken
  }
  if (spare < 0) return null
  if (fill && order.length > 0) kept[order[order.length - 1]] += spare
  return kept
}

// Where each team's block goes and how many free bytes it keeps. Teams stay
// where the game has them while they fit; those last in ROM order that no
// longer do go into the room at the end of the bank.
function placeTeams(teams: Team[], layout: TeamLayout): { at: number[]; free: number[] } {
  const content = teams.map(snesTeamContentSize)
  const free = teams.map((team) => team.freeBytes)
  const order = layout.fileOrder
  const mainRoom = layout.end - layout.start
  const place = (split: number, kept: number[]) => {
    const at: number[] = []
    let p = layout.start
    order.forEach((index, i) => {
      if (i === split) p = layout.overflow!.start
      at[index] = p
      p += content[index] + kept[index]
    })
    return { at, free: kept }
  }
  const all = fitFree(content, free, order, mainRoom, true)
  if (all) return place(order.length, all)
  const total = order.reduce((sum, index) => sum + content[index], 0)
  const overflowRoom = layout.overflow ? layout.overflow.end - layout.overflow.start : 0
  for (let split = order.length - 1; split > 0 && overflowRoom > 0; split--) {
    const [main, rest] = [order.slice(0, split), order.slice(split)]
    const kept = fitFree(content, free, main, mainRoom, true)
    const keptRest = kept && fitFree(content, kept, rest, overflowRoom, false)
    if (keptRest) return place(split, keptRest)
  }
  throw new Error(`The team data is ${total - mainRoom - overflowRoom} bytes too large to fit in the ROM.`)
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

// Rewrites every team block and the team table into `rom`.
export function writeSnesTeams(rom: Uint8Array, game: GameConfig, teams: Team[], layout: TeamLayout): void {
  const { at, free } = placeTeams(teams, layout)
  const strips = snesStripTables(rom)
  if (strips) {
    teams.forEach((team, t) =>
      team.palette.forEach((word, i) => writeU16LE(rom, (i < 16 ? strips.home : strips.away) + t * STRIP_BYTES + (i % 16) * 2, word)),
    )
  }
  // The names on the team banners, where every team has one and they fit; Check ROM says when they do not.
  if (teams.every((team) => team.placeName !== undefined)) writeSnesPlaceNames(rom, teams.map((team) => team.placeName!), layout.overflow)
  const bank = rom[game.teamTableOffset + 2]
  // Teams that were in the room at the end of the bank and are no longer leave it unused.
  if (layout.overflow) rom.fill(0xff, layout.overflow.start, layout.overflow.end)
  for (const index of layout.fileOrder) {
    const entry = game.teamTableOffset + index * TABLE_ENTRY
    writeU16LE(rom, entry, loRomAddress(at[index]))
    rom[entry + 2] = loRomBank(at[index], bank)
    writeTeam(rom, at[index], teams[index], free[index])
  }
}
