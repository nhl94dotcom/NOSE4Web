import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkProject } from '../src/core/check'
import { formatCsv } from '../src/core/csv'
import { expandPictureSpace, banner, menuLogo, menuLogoPalette, pictureSpace, rinkLogo, visitorBannersApart } from '../src/core/graphics'
import { teamSummaries } from '../src/core/league'
import { emptyLineSlots } from '../src/core/lines'
import { buildRom, openRom, type RomProject } from '../src/core/rom'
import { CSV_TABLES, csvFileName, importCsvSet } from '../src/core/tables'
import { goalieCount } from '../src/core/team'

// Hacked ROMs are checked against whatever copies are on this computer. Their
// file names are listed in tests/local.json, which is not part of the project:
//   { "league30Rom": "…", "otherRoms": ["…", "…"] }
const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { league30Rom?: string; otherRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['nhl94.bin', local.league30Rom, ...(local.otherRoms ?? [])].filter((name): name is string => !!name && existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const state = (project: RomProject) => ({ teams: project.teams.map((t) => ({ ...t, freeBytes: 0 })), settings: project.settings, rink: project.rinkPalette })
const pictures = (project: RomProject) =>
  project.teams.map((_, team) => [
    rinkLogo(project, team),
    menuLogo(project, team),
    menuLogoPalette(project, team),
    banner(project, 'menu', team),
    banner(project, 'game', team),
    ...(visitorBannersApart(project) ? [banner(project, 'visitor', team)] : []),
  ])

describe.skipIf(names.length === 0)('every ROM on this computer', () => {
  // Numbered, so that no ROM's name appears in the test results.
  names.forEach((name, n) => {
    describe(`ROM ${n + 1}`, () => {
      it('opens, and is rebuilt exactly as it is when nothing is changed', () => {
        const project = open(name)
        const rebuilt = buildRom(project)
        expect(rebuilt.length).toBe(project.bytes.length)
        const differing: number[] = []
        // Only the header's checksum and end address may differ.
        for (let i = 0; i < rebuilt.length; i++) if (rebuilt[i] !== project.bytes[i] && !(i >= 0x18e && i < 0x190) && !(i >= 0x1a4 && i < 0x1a8)) differing.push(i)
        expect(differing).toEqual([])
        expect(state(openRom(rebuilt))).toEqual(state(project))
      })

      it('has nothing the checker calls a problem', () => {
        const project = open(name)
        expect(checkProject(project).filter((finding) => finding.level === 'problem')).toEqual([])
        for (const summary of teamSummaries(project)) {
          expect(summary.startingSkaters).not.toBeNull()
          expect(summary.startingGoalie).not.toBeNull()
        }
        // Every team has a goalie and fits the game's limits.
        for (const team of project.teams) {
          expect(goalieCount(team)).toBeGreaterThan(0)
          expect(team.players.length).toBeLessThanOrEqual(26)
        }
      })

      it('comes back the same from a full set of spreadsheet files', () => {
        const project = open(name)
        const files = CSV_TABLES.map((table) => ({ name: csvFileName('Set', table), text: formatCsv(table.rows(project)) }))
        const result = importCsvSet(project, files)
        expect(result.files.flatMap((file) => file.warnings)).toEqual([])
        expect(state(result.project)).toEqual(state(project))
        expect(buildRom(result.project)).toEqual(buildRom(project))
      })

      it('shows its pictures, and keeps them when they are given more room', () => {
        const project = open(name)
        expect(project.graphicsSupported).toBe(true)
        const before = pictures(project)
        const roomy = expandPictureSpace(project)
        expect(pictureSpace(roomy)).toBeNull()
        const reopened = openRom(buildRom(roomy))
        expect(pictures(reopened)).toEqual(before)
        expect(state(reopened)).toEqual(state(project))
      })
    })
  })

  it('treats a position as empty by design only when most teams leave it empty', () => {
    const project = open(names[0])
    expect(emptyLineSlots(project.teams).flat().some(Boolean)).toBe(names[0] !== 'nhl94.bin')
  })
})

// A stand-in for the hacks that put fewer skaters on the ice, made from the
// original game by emptying two positions on every line of every team.
describe.skipIf(!existsSync(path('nhl94.bin')))('a ROM with fewer skaters on the ice', () => {
  const LEFT_DEFENCE = 1
  const RIGHT_WING = 5
  const fewer = (): RomProject => {
    const project = open('nhl94.bin')
    const teams = project.teams.map((team) => ({
      ...team,
      lines: team.lines.map((line) => line.map((v, slot) => (slot === LEFT_DEFENCE || slot === RIGHT_WING ? 0 : v))),
    }))
    return openRom(buildRom({ ...project, teams }))
  }

  it('knows which positions are empty by design, and does not call them problems', () => {
    const project = fewer()
    const empty = emptyLineSlots(project.teams)
    expect(empty).toHaveLength(8)
    for (const line of empty) expect(line).toEqual([false, true, false, false, false, true, false])
    expect(checkProject(project).filter((f) => f.level === 'problem')).toEqual([])
    expect(emptyLineSlots(open('nhl94.bin').teams).flat()).not.toContain(true)
  })

  it('still calls an empty position a problem where the ROM does not leave it empty', () => {
    const project = fewer()
    const teams = project.teams.map((team, t) => (t === 4 ? { ...team, lines: team.lines.map((l, i) => (i === 2 ? l.map((v, s) => (s === 3 ? 0 : v)) : l)) } : team))
    const problems = checkProject({ ...project, teams }).filter((f) => f.level === 'problem')
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({ team: 4, message: 'Line Sc2 has a position with no valid player.' })
    // And in the original game a single empty position is always one.
    const stock = open('nhl94.bin')
    const broken = stock.teams.map((team, t) => (t === 0 ? { ...team, lines: team.lines.map((l) => l.map((v, s) => (s === 1 ? 0 : v))) } : team))
    expect(checkProject({ ...stock, teams: broken }).filter((f) => f.level === 'problem')).toHaveLength(8)
  })

  it('rates the first line on the skaters it has', () => {
    const [project, stock] = [fewer(), open('nhl94.bin')]
    const [summary, full] = [teamSummaries(project)[11], teamSummaries(stock)[11]]
    expect(summary.startingSkaters).not.toBeNull()
    expect(summary.startingSkaters).not.toBe(full.startingSkaters)
    expect(summary.startingGoalie).toBe(full.startingGoalie)
    expect(summary.skaters).toBe(full.skaters)
  })

  it('writes empty positions to the lines sheet as blanks and reads them back', () => {
    const project = fewer()
    const lines = CSV_TABLES.find((table) => table.id === 'lines')!
    const rows = lines.rows(project)
    const [ld, rw, c] = ['LD', 'RW', 'C'].map((label) => rows[0].indexOf(label))
    for (const row of rows.slice(1)) {
      expect([row[ld], row[rw]]).toEqual(['', ''])
      expect(row[c]).not.toBe('')
    }
    const files = CSV_TABLES.map((table) => ({ name: csvFileName('Set', table), text: formatCsv(table.rows(project)) }))
    expect(state(importCsvSet(project, files).project)).toEqual(state(project))
    // A blank where the ROM expects a player is still refused.
    const bad = rows.map((row, i) => (i === 1 ? row.map((cell, col) => (col === c ? '' : cell)) : row))
    expect(() => importCsvSet(project, [{ name: 'Set_lines.csv', text: formatCsv(bad) }])).toThrow(/C: no player named ""/)
    // And in the original game a blank is refused everywhere.
    const stock = open('nhl94.bin')
    expect(() => importCsvSet(stock, [{ name: 'Set_lines.csv', text: formatCsv(rows) }])).toThrow(/no player named ""/)
  })
})
