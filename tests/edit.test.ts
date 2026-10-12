import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readAscii, readU16, readU32 } from '../src/core/bytes'
import { expandTeamSpace, nextExpansion } from '../src/core/expand'
import { buildRom, openRom } from '../src/core/rom'
import { addPlayer, deletePlayer, MAX_ROSTER, movePlayer, setForwards, setGoalieNibble } from '../src/core/roster'
import { goalieCount, teamSpace, type Team } from '../src/core/team'

const romPath = fileURLToPath(new URL('../../nhl94.bin', import.meta.url))
const hasRom = existsSync(romPath)
const original = hasRom ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()

const ANAHEIM = 0
const BOSTON = 1

// The people on each line, so tests can check lines follow players around.
function lineNames(team: Team): string[][] {
  return team.lines.map((line) => line.slice(0, 7).map((v) => team.players[v - 1].name))
}

describe.skipIf(!hasRom)('roster changes', () => {
  it('keeps lines on the same people when a player moves', () => {
    const team = openRom(original).teams[BOSTON]
    const moved = movePlayer(team, 4, 1)
    expect(moved.players[5]).toBe(team.players[4])
    expect(moved.players[4]).toBe(team.players[5])
    expect(lineNames(moved)).toEqual(lineNames(team))
    expect(movePlayer(team, 0, -1)).toBe(team)
  })

  it('deletes a skater and repairs lines and counts', () => {
    const team = openRom(original).teams[BOSTON]
    const goalies = goalieCount(team)
    const index = goalies // the first forward
    const deletedName = team.players[index].name
    const next = deletePlayer(team, index)

    expect(next.players).toHaveLength(team.players.length - 1)
    expect(next.forwards).toBe(team.forwards - 1)
    expect(goalieCount(next) + next.forwards + next.defense).toBe(next.players.length)
    const lastName = next.players[next.players.length - 1].name
    const expected = lineNames(team).map((line) => line.map((n) => (n === deletedName ? lastName : n)))
    expect(lineNames(next)).toEqual(expected)

    expect(deletePlayer(team, 0)).toBe(team) // goalies cannot be deleted
  })

  it('adds a skater as a defenceman, up to the roster limit', () => {
    let team = openRom(original).teams[ANAHEIM]
    const before = team.players.length
    team = addPlayer(team)
    expect(team.players).toHaveLength(before + 1)
    expect(team.players[before].name).toBe('# 19')
    expect(goalieCount(team) + team.forwards + team.defense).toBe(team.players.length)
    for (let i = 0; i < 40; i++) team = addPlayer(team)
    expect(team.players).toHaveLength(MAX_ROSTER)
  })

  it('keeps forward, defence and goalie counts consistent', () => {
    const team = openRom(original).teams[BOSTON]
    const fewer = setForwards(team, 10)
    expect(fewer.forwards + fewer.defense).toBe(team.forwards + team.defense)
    expect(setForwards(team, 99).forwards).toBe(15)

    const threeGoalies = setGoalieNibble(team, 2, 1)
    expect(goalieCount(threeGoalies)).toBe(goalieCount(team) + 1)
    expect(goalieCount(threeGoalies) + threeGoalies.forwards + threeGoalies.defense).toBe(team.players.length)
    let none = team
    for (let i = 0; i < 4; i++) none = setGoalieNibble(none, i, 0)
    // Clearing the last goalie byte that is set is refused, so a goalie always remains.
    expect(none.goalieNibbles.some((v) => v !== 0)).toBe(true)
    expect(goalieCount(none)).toBeGreaterThan(0)
  })

  it('survives a save and reload after a delete frees room for an add', () => {
    const project = openRom(original)
    let team = project.teams[BOSTON]
    team = deletePlayer(team, team.players.length - 1)
    team = addPlayer(team)
    project.teams[BOSTON] = team
    const reopened = openRom(buildRom(project))
    expect(reopened.teams[BOSTON].players).toEqual(team.players)
    expect(reopened.teams[BOSTON].lines).toEqual(team.lines)
  })
})

describe.skipIf(!hasRom)('expanding roster space', () => {
  const playoffSize = 32 * 16

  // Called inside each test: the body of a skipped group still runs, and
  // without a ROM there is nothing to open.
  function setup() {
    const base = openRom(original)
    const oldPlayoffs = base.layout.end
    const oldCopyright = oldPlayoffs + playoffSize
    const playoffData = base.bytes.slice(oldPlayoffs, oldCopyright)
    const textData = base.bytes.slice(oldCopyright, oldCopyright + 934)
    return { base, oldPlayoffs, playoffData, textData }
  }

  it('moves the opening text first, without growing the ROM', () => {
    const { base, oldPlayoffs, playoffData, textData } = setup()
    expect(nextExpansion(base)).toEqual({ step: 'introText', gain: 934, romSize: 0x100000 })
    const expanded = expandTeamSpace(base)
    const space = teamSpace(expanded.teams, expanded.layout)
    expect(space.available - space.used).toBe(934)

    const rom = buildRom(expanded)
    expect(rom.length).toBe(0x100000)
    const copyright = readU32(rom, 0xff226)
    expect(readU32(rom, 0xff292) - copyright).toBe(0x42)
    expect(rom.slice(copyright, copyright + 934)).toEqual(textData)
    expect(readAscii(rom, copyright + 2, 9)).toMatch(/^[\x20-\x7e]+$/)
    expect(readU16(rom, copyright + 934)).toBe(0x60fe)
    const playoffs = readU32(rom, 0x17d26)
    expect(playoffs).toBe(oldPlayoffs + 934)
    expect(readU32(rom, 0x17d90)).toBe(playoffs)
    expect(rom.slice(playoffs, playoffs + playoffSize)).toEqual(playoffData)

    const reopened = openRom(rom)
    const expectedTeams = structuredClone(base.teams)
    expectedTeams[ANAHEIM].freeBytes = 934
    expect(reopened.teams).toEqual(expectedTeams)
    expect(reopened.layout.end).toBe(base.layout.end + 934)
  })

  it('then moves the playoff tables, growing the ROM to 2 MB', () => {
    const { base, playoffData, textData } = setup()
    const once = openRom(buildRom(expandTeamSpace(base)))
    expect(nextExpansion(once)).toEqual({ step: 'playoffDraws', gain: 512, romSize: 0x200000 })
    const twice = expandTeamSpace(once)
    const rom = buildRom(twice)

    expect(rom.length).toBe(0x200000)
    expect(readU32(rom, 0x1a4)).toBe(0x1fffff)
    const playoffs = readU32(rom, 0x17d26)
    expect(readU32(rom, 0x17d90)).toBe(playoffs)
    expect(rom.slice(playoffs, playoffs + playoffSize)).toEqual(playoffData)
    expect(readU16(rom, playoffs + playoffSize)).toBe(0x60fe)
    const copyright = readU32(rom, 0xff226)
    expect(rom.slice(copyright, copyright + 934)).toEqual(textData)

    const reopened = openRom(rom)
    expect(nextExpansion(reopened)).toBeNull()
    expect(reopened.teams[ANAHEIM].freeBytes).toBe(934 + 512)
    expect(reopened.teams[BOSTON]).toEqual(base.teams[BOSTON])
  })

  it('lets rosters grow into the new space', () => {
    const { base } = setup()
    const project = expandTeamSpace(openRom(original))
    for (let t = 0; t < 5; t++) {
      let team = project.teams[t]
      team = { ...team, players: team.players.map((p) => ({ ...p, name: p.name + ' Jr' })) }
      project.teams[t] = team.players.length < MAX_ROSTER ? addPlayer(team) : team
    }
    const reopened = openRom(buildRom(project))
    expect(reopened.teams.map((t) => t.players)).toEqual(project.teams.map((t) => t.players))
    expect(reopened.teams.map((t) => t.names)).toEqual(base.teams.map((t) => t.names))
    expect(reopened.teams.map((t) => t.lines)).toEqual(base.teams.map((t) => t.lines))
    expect(reopened.teams.map((t) => t.palette)).toEqual(base.teams.map((t) => t.palette))
  })
})
