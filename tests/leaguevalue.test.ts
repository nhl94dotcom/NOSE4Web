import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { hasLeagueValue, leagueValue, type Role } from '../src/core/leaguevalue'
import { openRom } from '../src/core/rom'
import { goalieCount } from '../src/core/team'
import { CSV_TABLES } from '../src/core/tables'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const GENESIS = path('nhl94.bin')
const SNES = path('NHL94.smc')

describe('league value', () => {
  it('puts the scale ends at 40 and 99, and keeps to 0-99', () => {
    // A forward: 0.29·ShP + 0.22·Spd + 0.15·ShA + 0.10·StH + 0.09·Agl − 0.52·Wgt.
    const forward = (shp: number, spd: number, sha: number, sth: number, agl: number, wgt: number) => {
      const a = new Array<number>(14).fill(0)
      Object.assign(a, { 0: wgt, 1: agl, 2: spd, 5: shp, 8: sth, 9: sha })
      return a
    }
    expect(leagueValue(forward(6, 6, 6, 6, 6, 0), 'F')).toBe(99)
    // The heaviest with no ratings: −7.8, below the retail low of −5.29.
    expect(leagueValue(forward(0, 0, 0, 0, 0, 15), 'F')).toBe(20)
    expect(leagueValue(forward(0, 0, 0, 0, 0, 100), 'F')).toBe(0)
    // Goalies: Agility alone, 0.54 at 2 steps (40) and 1.62 at 6 (99).
    const goalie = (agl: number) => [5, agl, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    expect(leagueValue(goalie(2), 'G')).toBe(40)
    expect(leagueValue(goalie(6), 'G')).toBe(99)
    expect(leagueValue(goalie(4), 'G')).toBe(70)
  })

  it('is for the Genesis game with its own ratings only', () => {
    expect(hasLeagueValue({ platform: 'genesis', overallIsEstimate: false })).toBe(true)
    expect(hasLeagueValue({ platform: 'genesis', overallIsEstimate: true })).toBe(false)
    expect(hasLeagueValue({ platform: 'snes', overallIsEstimate: false })).toBe(false)
  })
})

describe.skipIf(!existsSync(GENESIS))('league value in the original game', () => {
  const project = openRom(new Uint8Array(readFileSync(GENESIS)))
  const all = project.teams.flatMap((team) => {
    const goalies = goalieCount(team)
    return team.players.map((p, i) => {
      const role: Role = i < goalies ? 'G' : i - goalies < team.forwards ? 'F' : 'D'
      return { name: p.name, role, value: leagueValue(p.attributes, role) }
    })
  })
  const of = (name: string) => all.find((p) => p.name.trim() === name)?.value

  it("gives the values Match Viewer's study gives", () => {
    // Top forwards, defencemen and goalies, as Match Viewer lists them.
    expect(of('Jeremy Roenick')).toBe(99)
    expect(of('Theoren Fleury')).toBe(98)
    expect(of('Ray Bourque')).toBe(99)
    expect(of('Ed Belfour')).toBe(99)
    expect(of('Patrick Roy')).toBe(99)
    expect(of('Grant Fuhr')).toBe(84)
    for (const role of ['F', 'D', 'G'] as const) expect(Math.max(...all.filter((p) => p.role === role).map((p) => p.value))).toBe(99)
  })

  it('is in the Players spreadsheet beside Overall', () => {
    const rows = CSV_TABLES.find((t) => t.id === 'players')!.rows(project)
    const at = rows[0].indexOf('League value')
    expect(at).toBe(rows[0].indexOf('Overall') + 1)
    const roy = rows.find((row) => String(row[4]).trim() === 'Patrick Roy')!
    expect(roy[at]).toBe(99)
  })
})

describe.skipIf(!existsSync(SNES))('league value on the SNES', () => {
  it('is left out of the spreadsheet', () => {
    const project = openRom(new Uint8Array(readFileSync(SNES)))
    expect(CSV_TABLES.find((t) => t.id === 'players')!.rows(project)[0]).not.toContain('League value')
  })
})
