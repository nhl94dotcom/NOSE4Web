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
    // The heaviest with no ratings: −7.8, below the retail low of −6.344.
    expect(leagueValue(forward(0, 0, 0, 0, 0, 15), 'F')).toBe(30)
    expect(leagueValue(forward(0, 0, 0, 0, 0, 100), 'F')).toBe(0)
    // Goalies: Agility alone, 0.2655 a step, 0.531 at 2 steps (40) and 1.594 at 6 (99).
    const goalie = (agl: number) => [5, agl, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    expect(leagueValue(goalie(2), 'G')).toBe(40)
    expect(leagueValue(goalie(6), 'G')).toBe(99)
    expect(leagueValue(goalie(4), 'G')).toBe(69)
  })

  it("counts a defenceman's Weight by band too, each system its own way", () => {
    // All ratings 3: only Weight changes. Genesis: a middleweight (7-9) loses 0.138; SNES: 7-9 gains 0.552, 10+ 0.486.
    const defenceman = (wgt: number) => [wgt, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3]
    const genesis = [6, 7, 9, 10].map((w) => leagueValue(defenceman(w), 'D', 'genesis'))
    expect(genesis[1]).toBeLessThan(genesis[0])
    expect(genesis[3]).toBeGreaterThan(genesis[2])
    const snes = [6, 7, 10].map((w) => leagueValue(defenceman(w), 'D', 'snes'))
    expect(snes[1]).toBeGreaterThan(snes[0] + 10)
    expect(snes[2]).toBeGreaterThan(snes[0] + 10)
  })

  it('is left out only on ROMs with 0-15 ratings', () => {
    expect(hasLeagueValue({ overallIsEstimate: false })).toBe(true)
    expect(hasLeagueValue({ overallIsEstimate: true })).toBe(false)
  })

  it('has its own formula on the SNES, where Weight counts for a player', () => {
    const forward = (wgt: number) => [wgt, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3]
    expect(leagueValue(forward(10), 'F', 'snes')).toBeGreaterThan(leagueValue(forward(5), 'F', 'snes'))
    expect(leagueValue(forward(10), 'F', 'genesis')).toBeLessThan(leagueValue(forward(5), 'F', 'genesis'))
    // Goalies: Agility 2 and 6 at the scale's ends, as on the Genesis.
    const goalie = (agl: number) => [5, agl, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    expect([2, 4, 6].map((agl) => leagueValue(goalie(agl), 'G', 'snes'))).toEqual([40, 69, 99])
  })
})

// Opened when a test runs, not when the file is read, so that the tests skip where the ROMs are not.
let genesis: ReturnType<typeof openRom> | undefined
const genesisProject = () => (genesis ??= openRom(new Uint8Array(readFileSync(GENESIS))))
let snes: ReturnType<typeof openRom> | undefined
const snesProject = () => (snes ??= openRom(new Uint8Array(readFileSync(SNES))))

describe.skipIf(!existsSync(GENESIS))('league value in the original game', () => {
  const players = () => genesisProject().teams.flatMap((team) => {
    const goalies = goalieCount(team)
    return team.players.map((p, i) => {
      const role: Role = i < goalies ? 'G' : i - goalies < team.forwards ? 'F' : 'D'
      return { name: p.name, role, value: leagueValue(p.attributes, role) }
    })
  })
  const of = (name: string) => players().find((p) => p.name.trim() === name)?.value

  it("gives the values Match Viewer's study gives", () => {
    // Top forwards, defencemen and goalies, as Match Viewer lists them.
    expect(of('Jeremy Roenick')).toBe(99)
    expect(of('Theoren Fleury')).toBe(98)
    expect(of('Ray Bourque')).toBe(99)
    expect(of('Ed Belfour')).toBe(99)
    expect(of('Patrick Roy')).toBe(99)
    expect(of('Grant Fuhr')).toBe(84)
    for (const role of ['F', 'D', 'G'] as const) expect(Math.max(...players().filter((p) => p.role === role).map((p) => p.value))).toBe(99)
  })

  it('is in the Players spreadsheet beside Overall', () => {
    const rows = CSV_TABLES.find((t) => t.id === 'players')!.rows(genesisProject())
    const at = rows[0].indexOf('League value')
    expect(at).toBe(rows[0].indexOf('Overall') + 1)
    const roy = rows.find((row) => String(row[4]).trim() === 'Patrick Roy')!
    expect(roy[at]).toBe(99)
  })
})

describe.skipIf(!existsSync(SNES))('league value in the original SNES game', () => {
  const rows = () => CSV_TABLES.find((t) => t.id === 'players')!.rows(snesProject())
  const at = () => rows()[0].indexOf('League value')
  // Two Stephane Richers are in the game (the leagues call the defenceman StephaneD), so a team can be given too.
  const of = (name: string, team = '') =>
    rows().find((row) => String(row[4]).trim() === name && String(row[1]).includes(team))?.[at()]

  it("is in the spreadsheet, worked out the SNES's way", () => {
    expect(at()).toBe(rows()[0].indexOf('Overall') + 1)
    // Match Viewer's values for the bigger moves against Overall: Klima, Carson and Richer up; Gilmour, Fleury and LaFontaine down.
    const values = [of('Petr Klima'), of('Jimmy Carson'), of('Stephane Richer', 'New Jersey'), of('Doug Gilmour'), of('Theoren Fleury'), of('Pat LaFontaine')]
    expect(values).toEqual([93, 88, 86, 81, 80, 82])
    for (const position of ['F', 'D', 'G']) {
      expect(Math.max(...rows().slice(1).filter((row) => row[3] === position).map((row) => Number(row[at()])))).toBe(99)
    }
  })
})
