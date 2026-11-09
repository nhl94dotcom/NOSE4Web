import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkProject } from '../src/core/check'
import { outOfRoleSlots, playerRole, repeatedLineSlots, suitsSlot, withoutRepeats } from '../src/core/lines'
import { openRom } from '../src/core/rom'
import { deletePlayer } from '../src/core/roster'
import { goalieCount, type Team } from '../src/core/team'

const romPath = fileURLToPath(new URL('../../nhl94.bin', import.meta.url))
const hasRom = existsSync(romPath)
const open = () => openRom(new Uint8Array(readFileSync(romPath)))
const BOSTON = 1
const LW = 3
const C = 4

describe.skipIf(!hasRom)('a player twice on a line', () => {
  it('is found, leaving out the extra attacker', () => {
    expect(repeatedLineSlots([1, 10, 11, 4, 4, 6, 4, 0])).toEqual([C])
    expect(repeatedLineSlots([1, 10, 11, 4, 5, 6, 4, 0])).toEqual([])
    // The original rosters never have one.
    for (const team of open().teams) for (const line of team.lines) expect(repeatedLineSlots(line)).toEqual([])
  })

  it('is a problem for the checker, as Match Viewer saw in play', () => {
    const project = open()
    const team = project.teams[BOSTON]
    const lines = team.lines.map((line, l) => (l === 0 ? line.map((v, s) => (s === LW ? line[C] : v)) : line))
    const findings = checkProject({ ...project, teams: project.teams.map((t, i) => (i === BOSTON ? { ...team, lines } : t)) })
    const repeated = findings.filter((f) => f.level === 'problem' && f.team === BOSTON)
    expect(repeated).toHaveLength(1)
    expect(repeated[0].message).toContain(`${team.players[team.lines[0][C] - 1].name} at both LW and C`)
  })

  it('is replaced by a free player of the position', () => {
    const team = open().teams[BOSTON]
    const line = team.lines[0].map((v, s) => (s === LW ? team.lines[0][C] : v))
    const fixed = withoutRepeats(team, line)
    expect(repeatedLineSlots(fixed)).toEqual([])
    // The later of the two positions is the one given someone else.
    expect(fixed[LW]).toBe(line[LW])
    expect(playerRole(team, fixed[C])).toBe('forward')
  })

  it('is not made by deleting a player', () => {
    const team = open().teams[BOSTON]
    // Delete each skater in turn: his places fall to the last player, who may be on the line already.
    for (let i = goalieCount(team); i < team.players.length; i++) {
      for (const line of deletePlayer(team, i).lines) expect(repeatedLineSlots(line)).toEqual([])
    }
  })
})

describe.skipIf(!hasRom)('roles on a line', () => {
  it('match the original rosters', () => {
    for (const team of open().teams) for (const line of team.lines) expect(outOfRoleSlots(team, line)).toEqual([])
  })

  it('tell goalies, forwards and defence apart, with any skater as extra attacker', () => {
    const team: Team = open().teams[BOSTON]
    const goalies = goalieCount(team)
    const forward = goalies + 1
    const defence = goalies + team.forwards + 1
    expect(suitsSlot(team, 0, 1)).toBe(true)
    expect(suitsSlot(team, 1, defence)).toBe(true)
    expect(suitsSlot(team, 1, forward)).toBe(false)
    expect(suitsSlot(team, C, forward)).toBe(true)
    expect(suitsSlot(team, C, defence)).toBe(false)
    expect(suitsSlot(team, 6, defence)).toBe(true)
    expect(suitsSlot(team, 6, 1)).toBe(false)
    const line = team.lines[0].map((v, s) => (s === 1 ? forward : v))
    expect(outOfRoleSlots(team, line)).toEqual([1])
  })
})
