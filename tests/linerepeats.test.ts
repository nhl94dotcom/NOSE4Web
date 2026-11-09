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
    // The later of the two positions is the one given someone else, unless the other is the one just changed.
    expect(fixed[LW]).toBe(line[LW])
    expect(playerRole(team, fixed[C])).toBe('forward')
    const changedFirst = withoutRepeats(team, line, [LW])
    expect(changedFirst[C]).toBe(line[C])
    expect(repeatedLineSlots(changedFirst)).toEqual([])
    expect(playerRole(team, changedFirst[LW])).toBe('forward')
  })

  it('is not made by deleting a player', () => {
    const team = open().teams[BOSTON]
    // Delete each skater in turn: his places fall to the last player, who may be on the line already.
    for (let i = goalieCount(team); i < team.players.length; i++) {
      const next = deletePlayer(team, i)
      next.lines.forEach((line, l) => {
        expect(repeatedLineSlots(line)).toEqual([])
        // Every other position keeps its player.
        for (let slot = 0; slot < 7; slot++) {
          if (team.lines[l][slot] !== i + 1) expect(next.players[line[slot] - 1].name).toBe(team.players[team.lines[l][slot] - 1].name)
        }
      })
    }
  })
})

describe.skipIf(!hasRom)('roles on a line', () => {
  it('match the original rosters', () => {
    for (const team of open().teams) for (const line of team.lines) expect(outOfRoleSlots(team, line)).toEqual([])
  })

  it('tell goalies, forwards and defence apart, with a forward as extra attacker but where Edit Lines allows any skater', () => {
    const team: Team = open().teams[BOSTON]
    const goalies = goalieCount(team)
    const forward = goalies + 1
    const defence = goalies + team.forwards + 1
    expect(suitsSlot(team, 0, 1)).toBe(true)
    expect(suitsSlot(team, 1, defence)).toBe(true)
    expect(suitsSlot(team, 1, forward)).toBe(false)
    expect(suitsSlot(team, C, forward)).toBe(true)
    expect(suitsSlot(team, C, defence)).toBe(false)
    expect(suitsSlot(team, 6, forward)).toBe(true)
    expect(suitsSlot(team, 6, defence)).toBe(false)
    expect(suitsSlot(team, 6, defence, true)).toBe(true)
    expect(suitsSlot(team, 1, forward, true)).toBe(true)
    expect(suitsSlot(team, 6, 1, true)).toBe(false)
    const line = team.lines[0].map((v, s) => (s === 1 ? forward : s === 6 ? defence : v))
    expect(outOfRoleSlots(team, line)).toEqual([1, 6])
    expect(outOfRoleSlots(team, line, true)).toEqual([])
  })
})
