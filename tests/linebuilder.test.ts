import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkProject } from '../src/core/check'
import { brokenLines, buildLines } from '../src/core/linebuilder'
import { emptyLineSlots, playerRole, SKATER_LINE_SLOTS } from '../src/core/lines'
import { buildRom, openRom } from '../src/core/rom'
import { goalieCount } from '../src/core/team'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { league30Rom?: string; otherRoms?: string[]; snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['nhl94.bin', 'NHL94.smc', ...(local.league30Rom ? [local.league30Rom] : []), ...(local.otherRoms ?? []), ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const [G, LD, RD, LW, C, RW, EA] = [0, 1, 2, 3, 4, 5, 6]

describe.skipIf(!existsSync(path('nhl94.bin')))('building lines from the ratings', () => {
  it('makes lines a hockey coach would recognise, on the original game', () => {
    const project = open('nhl94.bin')
    const empty = emptyLineSlots(project.teams)
    const labels = project.game.lineLabels
    const at = (label: string) => labels.indexOf(label)
    for (const team of project.teams) {
      const { lines } = buildLines(team, project.game, team.lines.map((_, l) => l), empty)
      const forwards = (l: number) => [lines[l][LW], lines[l][C], lines[l][RW]]
      const defence = (l: number) => [lines[l][LD], lines[l][RD]]
      for (const line of lines) {
        // The team's starting goalie stays in goal, defencemen on defence, forwards up front and as extra attacker.
        expect(line[G]).toBe(team.lines[0][G])
        for (const slot of [LD, RD]) expect(playerRole(team, line[slot])).toBe('defence')
        for (const slot of [LW, C, RW, EA]) expect(playerRole(team, line[slot])).toBe('forward')
        expect(new Set(SKATER_LINE_SLOTS.map((slot) => line[slot])).size).toBe(5)
        expect(SKATER_LINE_SLOTS.map((slot) => line[slot])).not.toContain(line[EA])
      }
      // The two scoring lines, the checking line, and the two power-play and penalty-kill lines each share no one.
      const disjoint = (a: number[], b: number[]) => expect(a.filter((p) => b.includes(p))).toEqual([])
      disjoint(forwards(at('Sc1')), forwards(at('Sc2')))
      disjoint([...forwards(at('Sc1')), ...forwards(at('Sc2'))], forwards(at('Chk')))
      disjoint(defence(at('Sc1')), defence(at('Sc2')))
      disjoint(forwards(at('PP1')), forwards(at('PP2')))
      disjoint(defence(at('PK1')), defence(at('PK2')))
      // The penalty kill's two forwards (LW and C) rest the power play's where the roster has enough.
      const killers = [lines[at('PK1')][LW], lines[at('PK1')][C], lines[at('PK2')][LW], lines[at('PK2')][C]]
      expect(new Set(killers).size).toBe(4)
      if (team.forwards >= 10) disjoint(killers, [...forwards(at('PP1')), ...forwards(at('PP2'))])
      // The first line is the best players, as is the first scoring line's forwards.
      expect(lines[at('NLC')]).toHaveLength(8)
    }
  })

  it('changes only the lines asked for, leaves each line\'s last byte, and does it the same way twice', () => {
    const project = open('nhl94.bin')
    const team = project.teams[1]
    expect(buildLines(team, project.game, []).lines).toEqual(team.lines)
    const once = buildLines(team, project.game, [1, 4])
    once.lines.forEach((line, l) => {
      if (![1, 4].includes(l)) expect(line).toEqual(team.lines[l])
      expect(line[7]).toBe(team.lines[l][7])
    })
    expect(once.changed.every((l) => [1, 4].includes(l))).toBe(true)
    const twice = buildLines({ ...team, lines: once.lines }, project.game, [1, 4])
    expect(twice.lines).toEqual(once.lines)
    expect(twice.changed).toEqual([])
  })

  it('finds broken lines, and fixing them builds only those', () => {
    const project = open('nhl94.bin')
    const team = project.teams[1]
    expect(brokenLines(team)).toEqual([])
    const lines = team.lines.map((line) => line.slice())
    lines[2][C] = lines[2][LW] // a skater twice
    lines[5][RD] = 0 // an empty position
    lines[6][G] = team.players.length // a skater in goal
    lines[7][LW] = team.players.length + 3 // past the end of the roster
    const bad = { ...team, lines }
    expect(brokenLines(bad)).toEqual([2, 5, 6, 7])
    const fixed = buildLines(bad, project.game, brokenLines(bad))
    expect(brokenLines({ ...bad, lines: fixed.lines })).toEqual([])
    expect(fixed.changed).toEqual([2, 5, 6, 7])
    expect(fixed.lines[0]).toEqual(team.lines[0])
  })
})

describe.skipIf(names.length === 0)('building every team\'s lines on every ROM', () => {
  names.forEach((name) => {
    it(`${name}: nothing broken, no new problems, the positions this ROM leaves empty still empty`, () => {
      const project = open(name)
      const empty = emptyLineSlots(project.teams)
      const teams = project.teams.map((team) => ({ ...team, lines: buildLines(team, project.game, team.lines.map((_, l) => l), empty).lines }))
      for (const [t, team] of teams.entries()) {
        expect(brokenLines(team, empty), `team ${t}`).toEqual([])
        team.lines.forEach((line, l) =>
          line.forEach((position, slot) => {
            if (empty[l]?.[slot]) expect(position).toBe(0)
            if (slot === G) expect(position).toBeLessThanOrEqual(goalieCount(team))
          }),
        )
      }
      const built = { ...project, teams }
      const problems = (p: typeof project) => checkProject(p).filter((f) => f.level === 'problem' && /line/i.test(f.message)).map((f) => f.message)
      expect(problems(built).filter((m) => !problems(project).includes(m))).toEqual([])
      expect(openRom(buildRom(built)).teams.map((team) => team.lines)).toEqual(teams.map((team) => team.lines))
    })
  })
})
