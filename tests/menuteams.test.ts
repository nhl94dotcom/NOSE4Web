import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readU16, readU16LE } from '../src/core/bytes'
import { checkProject } from '../src/core/check'
import { compareProjects } from '../src/core/compare'
import { leagueDraws, playoffTeamCount, teamsMissingFromDraws } from '../src/core/menuteams'
import { openProjectFile, saveProjectFile } from '../src/core/projectfile'
import { resetSettingsPart, settingsPartChanged } from '../src/core/reset'
import { buildRom, openRom, type RomProject } from '../src/core/rom'
import { CSV_TABLES, importCsv } from '../src/core/tables'
import { formatCsv } from '../src/core/csv'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const GENESIS = path('nhl94.bin')
const SNES = path('NHL94.smc')
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[]; otherRoms?: string[]; league30Rom?: string } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}

const withTeams = (project: RomProject, offered: number): RomProject => ({ ...project, settings: { ...project.settings, menuTeams: { offered } } })
const open = (file: string) => openRom(new Uint8Array(readFileSync(file)))

// A simple repeatable stand-in for Math.random.
function seeded(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

describe('playoff draws for a smaller league', () => {
  it('counts the playoff teams as far as the draws have them', () => {
    const draws = [[0, 1, 2, 3], [2, 3, 4, 5]]
    expect(playoffTeamCount(10, draws)).toBe(6)
    expect(playoffTeamCount(4, draws)).toBe(4)
    expect(teamsMissingFromDraws(10, [[0, 2, 3, 5]])).toEqual([1, 4])
    expect(teamsMissingFromDraws(10, [])).toEqual([])
    // With the ROM's own last playoff team: a team past it starts as it, so if no draw has that team,
    // every team from it on freezes the game.
    expect(teamsMissingFromDraws(10, [[0, 1, 2, 3, 4, 5]], 7)).toEqual([6, 7, 8, 9])
    expect(teamsMissingFromDraws(10, [[0, 1, 2, 3, 4, 5]], 5)).toEqual([])
  })

  it('makes draws of different teams from the league only, every team in one', () => {
    const teams = Array.from({ length: 20 }, (_, t) => t)
    for (const seed of [1, 2, 3, 99]) {
      const draws = leagueDraws(teams, 32, 16, seeded(seed))
      expect(draws).toHaveLength(32)
      for (const draw of draws) {
        expect(draw).toHaveLength(16)
        expect(new Set(draw).size).toBe(16)
        expect(draw.every((team) => team < 20)).toBe(true)
      }
      expect(new Set(draws.flat()).size).toBe(20)
    }
    // Even when chance would leave a team out: a random that always gives 0.
    const draws = leagueDraws(teams, 2, 16, () => 0)
    expect(new Set(draws.flat()).size).toBe(20)
    expect(() => leagueDraws(teams.slice(0, 12), 32, 16)).toThrow(/16 different teams/)
  })

  it('puts every team in a draw, whatever chance gives, for any league size', () => {
    for (let size = 16; size <= 64; size++) {
      const league = Array.from({ length: size }, (_, t) => t)
      for (const seed of [1, 7, 42]) {
        for (const drawCount of [4, 8, 32]) {
          if (drawCount * 16 < size) continue
          const draws = leagueDraws(league, drawCount, 16, seeded(seed * size + drawCount))
          expect(new Set(draws.flat()).size, `${size} teams, ${drawCount} draws`).toBe(size)
          for (const draw of draws) expect(new Set(draw).size).toBe(16)
        }
      }
    }
    // More teams than the draws have places: said, not left to freeze the game.
    expect(() => leagueDraws(Array.from({ length: 40 }, (_, t) => t), 2, 16)).toThrow(/no room/)
  })
})

describe.skipIf(!existsSync(GENESIS))('playoff draws that would freeze the game, Genesis', () => {
  it("are a problem in Check ROM, by the ROM's own last playoff team", () => {
    const project = openRom(new Uint8Array(readFileSync(GENESIS)))
    expect(checkProject(project).filter((f) => f.where === 'Playoff draws')).toEqual([])
    // Take team 25, the last playoff team, out of every draw: new playoffs with it, or with the
    // All-Star teams after it, which start as it, freeze the game.
    const draws = project.settings.playoffDraws.map((draw) => draw.map((team) => (team === 25 ? 24 : team)))
    const findings = checkProject({ ...project, settings: { ...project.settings, playoffDraws: draws } }).filter((f) => f.where === 'Playoff draws')
    expect(findings.find((f) => f.level === 'problem' && f.message.startsWith('Starting new playoffs with'))?.message).toContain('freezes the game')
    // And the draws now have team 24 twice.
    expect(findings.some((f) => f.message.includes('twice'))).toBe(true)
    // A team the ROM does not have.
    const invalid = project.settings.playoffDraws.map((draw, d) => (d === 0 ? [40, ...draw.slice(1)] : draw))
    expect(checkProject({ ...project, settings: { ...project.settings, playoffDraws: invalid } }).some((f) => f.message.includes('a team this ROM does not have'))).toBe(true)
  })
})

describe.skipIf(!existsSync(GENESIS))('teams in the menu, Genesis', () => {
  // Where the original game keeps its team counts.
  const at = {
    menu: [0xf791e + 4, 0xf791e + 6, 0xf7930 + 4, 0xf7930 + 6],
    demo: [0xf73e6 + 1, 0xf73e6 + 13],
    playoffs: 0xf79dc + 9,
    lastPlayoff: [0x17d34 + 2, 0x17d34 + 9],
    others: 0x18032 + 1,
  }
  const counts = (rom: Uint8Array) => ({
    menu: at.menu.map((o) => readU16(rom, o)),
    demo: at.demo.map((o) => rom[o]),
    playoffs: rom[at.playoffs],
    lastPlayoff: [readU16(rom, at.lastPlayoff[0]), rom[at.lastPlayoff[1]]],
    others: rom[at.others],
  })

  it('reads 28, and writes the menu, the demo, the playoffs and the other games', () => {
    const project = open(GENESIS)
    expect(project.settings.menuTeams).toEqual({ offered: 28 })
    expect(counts(project.bytes)).toEqual({ menu: [28, 28, 28, 28], demo: [28, 28], playoffs: 26, lastPlayoff: [25, 25], others: 26 })

    const ten = buildRom(withTeams(project, 10))
    expect(counts(ten)).toEqual({ menu: [10, 10, 10, 10], demo: [10, 10], playoffs: 10, lastPlayoff: [9, 9], others: 26 })
    expect(openRom(ten).settings.menuTeams).toEqual({ offered: 10 })

    // With 18 or more, the other games of the day keep to them too.
    expect(counts(buildRom(withTeams(project, 20)))).toMatchObject({ playoffs: 20, lastPlayoff: [19, 19], others: 20 })

    // Back to 28: the playoffs go back to the 26 the draws have.
    const back = buildRom(withTeams(openRom(ten), 28))
    expect(counts(back)).toEqual(counts(project.bytes))
    expect(back).toEqual(buildRom(project))
  })

  it('says so when a team line starts past the teams in the menu', () => {
    const project = open(GENESIS)
    const ten = withTeams(project, 10)
    // Montreal and Los Angeles, the starting teams, are not among the first 10.
    const past = ten.game.menuTeamItems.filter((item) => project.settings.menu[item].value >= 10)
    expect(past).toHaveLength(2)
    expect(checkProject(ten).filter((finding) => finding.where === 'Main menu').map((finding) => finding.level)).toEqual(['note', 'note'])
  })

  it('warns of playoff draws with other teams, and of league teams no draw has', () => {
    const project = open(GENESIS)
    const playoffNotes = (p: RomProject) => checkProject(p).filter((finding) => finding.where === 'Playoff draws')
    expect(playoffNotes(project)).toEqual([])
    const twenty = withTeams(project, 20)
    expect(playoffNotes(twenty).map((finding) => finding.level)).toEqual(['note'])

    const filled = { ...twenty, settings: { ...twenty.settings, playoffDraws: leagueDraws(Array.from({ length: 20 }, (_, t) => t), 32, 16, seeded(7)) } }
    expect(playoffNotes(filled)).toEqual([])
    // Take team 3 out of every draw: picking it for new playoffs would freeze the game.
    const without = filled.settings.playoffDraws.map((draw) => draw.map((team) => (team === 3 ? 19 : team)))
    const frozen = { ...filled, settings: { ...filled.settings, playoffDraws: without } }
    // (Team 19 is now twice in some draws, which is a problem too.)
    expect(playoffNotes(frozen).filter((finding) => /freezes the game/.test(finding.message)).map((finding) => finding.level)).toEqual(['problem'])
  })

  it('is compared, reset, and kept in a project file and a spreadsheet', () => {
    const project = open(GENESIS)
    // As the settings page leaves it: the team lines start on the last team offered.
    const unclamped = withTeams(project, 10)
    const ten = { ...unclamped, settings: { ...unclamped.settings, menu: unclamped.settings.menu.map((item, i) => (project.game.menuTeamItems.includes(i) ? { ...item, value: 9 } : item)) } }
    expect(compareProjects(project, ten).find((section) => section.heading === 'Main menu')?.changes).toContain('Teams in the menu: 28 to 10.')
    expect(settingsPartChanged(ten.settings, project.settings, 'menu')).toBe(true)
    expect(resetSettingsPart(ten.settings, project.settings, 'menu').menuTeams).toEqual({ offered: 28 })

    expect(openProjectFile(open(GENESIS), saveProjectFile(ten, project)).project.settings.menuTeams).toEqual({ offered: 10 })

    const menu = CSV_TABLES.find((table) => table.id === 'menu')!
    const csv = formatCsv(menu.rows(ten))
    expect(csv).toContain('Teams in the menu,10')
    expect(importCsv(menu, project, csv).project.settings.menuTeams).toEqual({ offered: 10 })
  })
})

describe.skipIf(!existsSync(SNES))('teams in the menu, SNES', () => {
  const at = { demo: [0xea7a3 + 1, 0xea7b1 + 1], playoffs: [0xea903 + 16, 0xe98fd + 1], lastPlayoff: 0xe98fd + 6, others: 0xfc7d7 + 1 }
  const counts = (rom: Uint8Array) => ({
    demo: at.demo.map((o) => readU16LE(rom, o)),
    playoffs: at.playoffs.map((o) => readU16LE(rom, o)),
    lastPlayoff: readU16LE(rom, at.lastPlayoff),
    others: readU16LE(rom, at.others),
  })

  it('reads 28, and writes the menu, the demo, the playoffs and the other games', () => {
    const project = open(SNES)
    expect(project.settings.menuTeams).toEqual({ offered: 28 })
    expect(counts(project.bytes)).toEqual({ demo: [28, 28], playoffs: [26, 26], lastPlayoff: 25, others: 26 })
    const reopened = openRom(buildRom(withTeams(project, 12)))
    expect(reopened.settings.menuTeams).toEqual({ offered: 12 })
    expect(counts(reopened.bytes)).toEqual({ demo: [12, 12], playoffs: [12, 12], lastPlayoff: 11, others: 26 })
    expect(counts(buildRom(withTeams(reopened, 28)))).toEqual(counts(project.bytes))
  })
})

// Every other ROM on this computer: the number is found, and one changed and
// built comes back.
const others = [local.league30Rom, ...(local.otherRoms ?? []), ...(local.snesRoms ?? [])].filter(
  (name): name is string => !!name && existsSync(path(name)),
)
describe.skipIf(others.length === 0)('teams in the menu, every ROM on this computer', () => {
  others.forEach((name, n) => {
    it(`ROM ${n + 1}`, () => {
      const project = open(path(name))
      if (!project.settings.menuTeams) return
      const offered = project.settings.menuTeams.offered
      expect(offered).toBeGreaterThanOrEqual(2)
      expect(offered).toBeLessThanOrEqual(project.teams.length)
      const changed = openRom(buildRom(withTeams(project, 16)))
      expect(changed.settings.menuTeams).toEqual({ offered: 16 })
      expect(changed.teams.map((t) => t.players)).toEqual(project.teams.map((t) => t.players))
      expect(changed.settings.playoffDraws).toEqual(project.settings.playoffDraws)
    })
  })
})
