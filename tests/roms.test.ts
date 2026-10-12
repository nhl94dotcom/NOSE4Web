import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkProject } from '../src/core/check'
import { formatCsv } from '../src/core/csv'
import { expandPictureSpace, menuLogoPalette, pictureSpace } from '../src/core/graphics'
import { teamSummaries } from '../src/core/league'
import { emptyLineSlots } from '../src/core/lines'
import { openProjectFile, saveProjectFile } from '../src/core/projectfile'
import { trade } from '../src/core/trade'
import { buildRom, openRom, type RomProject } from '../src/core/rom'
import { CSV_TABLES, csvFileName, importCsvSet, tablesFor } from '../src/core/tables'
import { currentPicture, pictureKinds } from '../src/core/pictureset'
import { addPlayer } from '../src/core/roster'
import { goalieCount, overfullTeams, teamContentSize, teamSpace } from '../src/core/team'

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
  project.teams.map((_, team) => [menuLogoPalette(project, team), ...pictureKinds(project).map((kind) => currentPicture(project, team, kind).picture)])

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
        const files = tablesFor(project.game).map((table) => ({ name: csvFileName('Set', table), text: formatCsv(table.rows(project)) }))
        const result = importCsvSet(project, files)
        expect(result.files.flatMap((file) => file.warnings)).toEqual([])
        expect(state(result.project)).toEqual(state(project))
        expect(buildRom(result.project)).toEqual(buildRom(project))
      })

      it('comes back the same from a project file, and trades a player', () => {
        const project = open(name)
        const reopened = openProjectFile(open(name), saveProjectFile(project, project, 'Set'))
        expect(reopened.notes).toEqual([])
        expect(buildRom(reopened.project)).toEqual(buildRom(project))

        // The last skater of one team for the last of another, and the ROM still holds together.
        const last = (team: number) => project.teams[team].players.length - 1
        const traded = trade(project, { team: 0, picks: [last(0)] }, { team: 1, picks: [last(1)] })
        expect(traded.teams[0].players).toHaveLength(project.teams[0].players.length)
        const rebuilt = openRom(buildRom(traded))
        expect(rebuilt.teams.map((t) => t.players)).toEqual(traded.teams.map((t) => t.players))
        expect(checkProject(traded).filter((finding) => finding.level === 'problem')).toEqual([])
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

// A stand-in for hacks that give each team a place of its own in the ROM,
// with unused room after it: the original game with its teams moved to
// evenly spaced places in a larger file.
describe.skipIf(!existsSync(path('nhl94.bin')))('a ROM whose teams each have their own room', () => {
  const SLOT = 0x400
  const BASE = 0x180000
  const spaced = (): RomProject => {
    const project = open('nhl94.bin')
    const bytes = new Uint8Array(0x200000).fill(0xff)
    bytes.set(project.bytes)
    const slots = project.teams.map((_, i) => ({ at: BASE + i * SLOT, size: SLOT }))
    const layout = { start: BASE, end: BASE + slots.length * SLOT, fileOrder: slots.map((_, i) => i), slots }
    return openRom(buildRom({ ...project, bytes, layout }))
  }

  it('is recognised, and rebuilt exactly as it is', () => {
    const project = spaced()
    expect(project.layout.slots).toHaveLength(28)
    expect(project.layout.slots![5]).toEqual({ at: BASE + 5 * SLOT, size: SLOT })
    expect(project.teams.map((t) => t.players)).toEqual(open('nhl94.bin').teams.map((t) => t.players))
    expect(buildRom(project)).toEqual(buildRom(openRom(buildRom(project))))
    expect(checkProject(project).filter((f) => f.level === 'problem')).toEqual([])
    // The original game's teams share their room, and have no places of their own.
    expect(open('nhl94.bin').layout.slots).toBeUndefined()
  })

  it('measures room by the fullest team, and keeps every team in its place', () => {
    const project = spaced()
    const space = teamSpace(project.teams, project.layout)
    expect(space.available).toBe(SLOT)
    expect(space.team).toBeDefined()
    expect(space.used).toBe(Math.max(...project.teams.map(teamContentSize)))

    // Anaheim has 18 players; four more still fit its own room.
    let anaheim = project.teams[0]
    while (anaheim.players.length < 22) anaheim = addPlayer(anaheim)
    const reopened = openRom(buildRom({ ...project, teams: project.teams.map((t, i) => (i === 0 ? anaheim : t)) }))
    expect(reopened.teams[0].players).toHaveLength(22)
    expect(reopened.layout.slots).toEqual(project.layout.slots)
    expect(reopened.teams.slice(1)).toEqual(project.teams.slice(1))
  })

  it('refuses a team that has outgrown its place, and says which', () => {
    const project = spaced()
    let big = project.teams[8]
    while (big.players.length < 26) big = addPlayer(big)
    big = { ...big, players: big.players.map((p) => ({ ...p, name: 'A Very Long Player Name Indeed' })) }
    const edited = { ...project, teams: project.teams.map((t, i) => (i === 8 ? big : t)) }

    expect(overfullTeams(edited.teams, edited.layout).map((o) => o.team)).toEqual([8])
    const space = teamSpace(edited.teams, edited.layout)
    expect(space.team).toBe(8)
    expect(space.used).toBeGreaterThan(space.available)
    expect(() => buildRom(edited)).toThrow(/is \d+ bytes too large for its place in the ROM/)
    const problems = checkProject(edited).filter((f) => f.level === 'problem')
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({ team: 8 })
    expect(problems[0].message).toContain('too large for its place in the ROM')
    // Room on other teams does not help: each has only its own.
    expect(overfullTeams(project.teams, project.layout)).toEqual([])
  })

  it('will not read teams with something unknown lying between them', () => {
    const rom = buildRom(spaced())
    rom[BASE + SLOT - 4] = 0x12 // not unused room after all
    expect(() => openRom(rom)).toThrow('The team data is not stored as one continuous run')
  })
})
