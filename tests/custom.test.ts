import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readU16, readU32 } from '../src/core/bytes'
import { formatCsv } from '../src/core/csv'
import { nextExpansion } from '../src/core/expand'
import { buildRom, openRom } from '../src/core/rom'
import { addPlayer } from '../src/core/roster'
import { CSV_TABLES, importCsvSet } from '../src/core/tables'
import { goalieCount, teamSpace } from '../src/core/team'

// ROMs are copyrighted and are not part of the project. Each group of tests
// runs only if its ROM is in the folder above the project.
const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const load = (name: string) => (existsSync(path(name)) ? new Uint8Array(readFileSync(path(name))) : null)

function differingOffsets(a: Uint8Array, b: Uint8Array): number[] {
  const offsets: number[] = []
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) offsets.push(i)
  return offsets
}

const base = load('nhl94.bin')
describe.skipIf(!base)('New York team names in NHL 94', () => {
  const ISLANDERS = 13
  const pointer = 0xf7ca8
  const builtIn = 0xf7cb2

  it('keeps the built-in text while the team is still in New York', () => {
    const project = openRom(base!)
    project.teams[ISLANDERS].names[2] = 'Isles'
    expect(readU32(buildRom(project), pointer)).toBe(builtIn)
  })

  it("uses the team's own name once it moves, and switches back", () => {
    const project = openRom(base!)
    project.teams[ISLANDERS].names[0] = 'Brooklyn'
    const rom = buildRom(project)
    const team = readU32(rom, 0x30e + ISLANDERS * 4)
    expect(readU32(rom, pointer)).toBe(team + readU16(rom, team + 4))

    const reopened = openRom(rom)
    reopened.teams[ISLANDERS].names[0] = 'New York'
    expect(readU32(buildRom(reopened), pointer)).toBe(builtIn)
  })
})

// The league ROM's file name is kept out of the repository, in tests/local.json.
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { league30Rom?: string } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const league = local.league30Rom ? load(local.league30Rom) : null
describe.skipIf(!league)('30-team league ROM', () => {
  it('opens with its 30 teams', () => {
    const project = openRom(league!)
    expect(project.game.title).toBe('NHL 94 (30 teams)')
    expect(project.teams).toHaveLength(30)
    expect(project.teams[0].names).toEqual(['Boston', 'BOS', 'Bruins', 'TD Garden'])
    expect(project.teams[20].names.slice(0, 3)).toEqual(['Seattle', 'SEA', 'Kraken'])
    for (const team of project.teams) {
      expect(goalieCount(team) + team.forwards + team.defense).toBe(team.players.length)
      for (const line of team.lines) for (const slot of line.slice(0, 7)) expect(slot).toBeLessThanOrEqual(team.players.length)
    }
    expect(project.settings.playoffDraws).toHaveLength(32)
    expect(project.settings.periodLengths.map((p) => p.text)).toEqual(['5 Minutes', '7 Minutes', '10 Minutes', '20 Minutes'])
    // Its team data is fenced in by other data, so the stock expansions do not apply.
    expect(nextExpansion(project)).toBeNull()
  })

  it('rebuilds unedited with nothing changed but the header checksum', () => {
    const built = buildRom(openRom(league!))
    expect(built.length).toBe(league!.length)
    expect(differingOffsets(league!, built).filter((o) => o < 0x18e || o > 0x18f)).toEqual([])
  })

  it('saves edits inside its own free space', () => {
    const project = openRom(league!)
    const before = teamSpace(project.teams, project.layout)
    project.teams[29] = addPlayer(project.teams[29])
    project.teams[3].players[0].name = 'A Much Longer Goalie Name'
    project.teams[3].names[3] = 'Cow Palace'
    project.settings.menu[2].value = 29
    const rom = buildRom(project)

    const reopened = openRom(rom)
    expect(reopened.teams.map((t) => ({ ...t, freeBytes: 0 }))).toEqual(project.teams.map((t) => ({ ...t, freeBytes: 0 })))
    expect(reopened.settings).toEqual(project.settings)
    expect(reopened.layout).toEqual(project.layout)
    expect(teamSpace(reopened.teams, reopened.layout).available).toBe(before.available)
    // Nothing outside the team table, team data, menu defaults and checksum is touched.
    const allowed = (o: number) =>
      (o >= 0x18e && o <= 0x18f) ||
      (o >= 0x30e && o < 0x30e + 30 * 4) ||
      (o >= project.layout.start && o < project.layout.end) ||
      (o >= 0x17c8e && o < 0x17c8e + 18)
    expect(differingOffsets(league!, rom).filter((o) => !allowed(o))).toEqual([])
  })

  it('round-trips through a full set of spreadsheet files', () => {
    const project = openRom(league!)
    const files = CSV_TABLES.map((t) => ({ name: `League_${t.id}.csv`, text: formatCsv(t.rows(project)) }))
    const result = importCsvSet(project, files)
    expect(result.project.teams).toEqual(project.teams)
    expect(result.project.settings).toEqual(project.settings)
    expect(result.files.flatMap((f) => f.warnings)).toEqual([])
  })
})
