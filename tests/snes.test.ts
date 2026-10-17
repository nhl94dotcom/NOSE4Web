import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readU16LE } from '../src/core/bytes'
import { colorRgb, SNES_COLORS } from '../src/core/color'
import { snesPreviewSprites } from '../src/core/snes'
import { applySnesHacks, detectSnesHacks, SNES_HACKS, type SnesHackChoices } from '../src/core/sneshacks'
import { checkProject } from '../src/core/check'
import { compareProjects } from '../src/core/compare'
import { formatCsv } from '../src/core/csv'
import { nextExpansion } from '../src/core/expand'
import { hacksSupported } from '../src/core/hacks'
import { ALL_PARTS, importTeam } from '../src/core/importteam'
import { teamSummaries } from '../src/core/league'
import { openProjectFile, saveProjectFile } from '../src/core/projectfile'
import { resetTeamPart } from '../src/core/reset'
import { buildPatch, buildRom, openRom, type RomProject } from '../src/core/rom'
import { csvFileName, importCsvSet, tablesFor } from '../src/core/tables'
import { goalieCount, teamDisplayName, teamSpace } from '../src/core/team'
import { overallRating } from '../src/core/rating'
import { trade } from '../src/core/trade'

// SNES ROMs are checked against whatever copies are on this computer: the
// original game as NHL94.smc, and league ROMs named in tests/local.json as
//   { "snesRoms": ["…", "…"] }
const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const STOCK = 'NHL94.smc'
const names = [STOCK, ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
const read = (name: string) => new Uint8Array(readFileSync(path(name)))
const teamsOf = (project: RomProject) => project.teams.map((t) => ({ ...t, freeBytes: 0 }))

// Where the game's checksum and its inverse are, in a file with or without
// the copier header.
const checksumBytes = (headerSize: number) => [0x7fdc, 0x7fdd, 0x7fde, 0x7fdf].map((o) => o + headerSize)
function checksumIsRight(file: Uint8Array, headerSize: number): boolean {
  const rom = file.subarray(headerSize)
  let sum = 0
  for (let i = 0; i < rom.length; i++) sum += checksumBytes(0).includes(i) ? 0 : rom[i]
  sum += 0x1fe
  return readU16LE(rom, 0x7fde) === (sum & 0xffff) && readU16LE(rom, 0x7fdc) === (~sum & 0xffff)
}

describe.skipIf(names.length === 0)('every SNES ROM on this computer', () => {
  names.forEach((name, n) => {
    describe(`SNES ROM ${n + 1}`, () => {
      it('opens as the SNES game, and is rebuilt as it was when nothing is changed', () => {
        const file = read(name)
        const project = openRom(file)
        expect(project.game.platform).toBe('snes')
        expect(project.teams).toHaveLength(28)
        const headerSize = project.copierHeader?.length ?? 0
        const rebuilt = buildRom(project)
        expect(rebuilt.length).toBe(file.length)
        const differing: number[] = []
        // Only the checksum may differ, where the ROM had it wrong.
        for (let i = 0; i < file.length; i++) if (rebuilt[i] !== file[i] && !checksumBytes(headerSize).includes(i)) differing.push(i)
        expect(differing).toEqual([])
      })

      it('keeps a longer roster in its place and reads it back', () => {
        const project = openRom(read(name))
        const before = teamSpace(project.teams, project.layout)
        const team = project.teams[1]
        const shorter = project.teams[2]
        const room = before.available - before.used
        const extra = 'x'.repeat(Math.min(10, room))
        const teams = project.teams.map((t, i) =>
          i === 1
            ? {
                ...t,
                players: t.players.map((p, j) => (j === 3 ? { ...p, name: p.name + extra, jersey: 0x99 } : p)),
                shownOverall: 77,
                palette: t.palette.map((w, k) => (k === 12 ? 0x001f : k === 28 ? 0x7c00 : w)),
              }
            : i === 2
              ? { ...t, names: [t.names[0], t.names[1], t.names[2], 'Arena'] }
              : t,
        )
        const edited = { ...project, teams }
        const reopened = openRom(buildRom(edited))
        expect(reopened.teams[1].players[3]).toEqual({ ...team.players[3], name: team.players[3].name + extra, jersey: 0x99 })
        expect(reopened.teams[1].shownOverall).toBe(77)
        expect([reopened.teams[1].palette[12], reopened.teams[1].palette[28]]).toEqual([0x001f, 0x7c00])
        expect(reopened.teams.map((t) => t.palette)).toEqual(teams.map((t) => t.palette))
        expect(reopened.teams[2].names[3]).toBe('Arena')
        expect(teamDisplayName(reopened.teams[2])).toBe(teamDisplayName(shorter))
        expect(reopened.teams.map((t) => t.players)).toEqual(teams.map((t) => t.players))
        expect(teamSpace(reopened.teams, reopened.layout).available).toBe(before.available)
      })

      it('says so when the rosters no longer fit', () => {
        const project = openRom(read(name))
        const { available, used } = teamSpace(project.teams, project.layout)
        const long = 'y'.repeat(available - used + 1)
        const teams = project.teams.map((t, i) => (i === 0 ? { ...t, names: [t.names[0] + long, ...t.names.slice(1)] } : t))
        expect(() => buildRom({ ...project, teams })).toThrow(/too large/)
      })

      it('has nothing the checker calls a problem, and none of the Genesis-only parts', () => {
        const project = openRom(read(name))
        expect(checkProject(project).filter((finding) => finding.level === 'problem')).toEqual([])
        for (const team of project.teams) expect(goalieCount(team)).toBeGreaterThan(0)
        for (const summary of teamSummaries(project)) expect(summary.startingGoalie).not.toBeNull()
        expect([project.graphicsSupported, project.game.settingsSupported, hacksSupported(project.game)]).toEqual([false, false, false])
        expect(nextExpansion(project)).toBeNull()
        expect(project.rinkPalette).toEqual([])
      })

      it('comes back the same from a full set of spreadsheet files and from a project file', () => {
        const project = openRom(read(name))
        const files = tablesFor(project.game).map((table) => ({ name: csvFileName('Set', table), text: formatCsv(table.rows(project)) }))
        const result = importCsvSet(project, files)
        expect(result.files.flatMap((file) => file.warnings)).toEqual([])
        expect(teamsOf(result.project)).toEqual(teamsOf(project))
        expect(buildRom(result.project)).toEqual(buildRom(project))

        const teams = project.teams.map((t, i) => (i === 3 ? { ...t, shownOverall: 66 } : t))
        const edited = { ...project, teams }
        const csv = tablesFor(project.game).find((table) => table.id === 'teams')!
        expect(formatCsv(csv.rows(edited))).toContain('Overall shown')
        const fromCsv = importCsvSet(project, [{ name: csvFileName('Set', csv), text: formatCsv(csv.rows(edited)) }])
        expect(fromCsv.project.teams[3].shownOverall).toBe(66)

        const reopened = openProjectFile(openRom(read(name)), saveProjectFile(edited, project, 'Set'))
        expect(reopened.notes).toEqual([])
        expect(buildRom(reopened.project)).toEqual(buildRom(edited))
      })

      it('trades players, resets the team ratings, and makes a patch', () => {
        const project = openRom(read(name))
        const last = (team: number) => project.teams[team].players.length - 1
        const traded = trade(project, { team: 0, picks: [last(0)] }, { team: 1, picks: [last(1)] })
        const rebuilt = openRom(buildRom(traded))
        expect(rebuilt.teams.map((t) => t.players)).toEqual(traded.teams.map((t) => t.players))
        expect(checkProject(traded).filter((finding) => finding.level === 'problem')).toEqual([])

        const team = { ...project.teams[5], shownOverall: 1, teamBytes: [0, 0, 0] }
        expect(resetTeamPart(team, project.teams[5], 'ratings')).toEqual(project.teams[5])

        const changes = compareProjects(project, { ...project, teams: project.teams.map((t, i) => (i === 5 ? team : t)) })
        expect(changes.flatMap((d) => d.changes).join(' ')).toContain(`Overall shown on the matchup screen: ${project.teams[5].shownOverall} to 1.`)
        expect(buildPatch(project).length).toBeLessThan(64)
      })

      it('puts the checksum right where the ROM is of a standard size', () => {
        const project = openRom(read(name))
        const headerSize = project.copierHeader?.length ?? 0
        const teams = project.teams.map((t, i) => (i === 0 ? { ...t, shownOverall: (t.shownOverall ?? 0) ^ 1 } : t))
        const rebuilt = buildRom({ ...project, teams })
        const standard = (project.bytes.length & (project.bytes.length - 1)) === 0
        expect(checksumIsRight(rebuilt, headerSize)).toBe(standard)
      })
    })
  })
})

describe.skipIf(!existsSync(path(STOCK)))('the original SNES game', () => {
  it('reads its teams, players, lines and ratings', () => {
    const project = openRom(read(STOCK))
    expect(project.copierHeader).toBeNull()
    expect(project.teams.map(teamDisplayName).slice(0, 3)).toEqual(['Anaheim Mighty Ducks', 'Boston Bruins', 'Buffalo Sabres'])
    expect(project.teams[26].names).toEqual(['All Stars East', 'ASE', '', 'Madison Square Garden'])
    const ase = project.teams[26]
    expect(ase.players[0]).toEqual({ name: 'Patrick Roy', jersey: 0x33, attributes: [6, 6, 4, 4, 4, 6, 0, 1, 0, 0, 5, 5, 6, 6] })
    expect(ase.players.find((p) => p.name === 'Kevin Stevens')?.jersey).toBe(0x25)
    expect(ase.teamBytes).toEqual([0x77, 0x20, 0x00])
    expect([ase.forwards, ase.defense, ase.shownOverall]).toEqual([14, 8, 91])
    expect(ase.lines[0]).toEqual([1, 0x13, 0x12, 7, 4, 0x10, 9, 0])
    expect(project.teams[0].shownOverall).toBe(52)
    // Chicago: white at home, red away, on the jersey.
    const chicago = project.teams[4]
    expect(chicago.palette).toHaveLength(32)
    expect(colorRgb(chicago.palette[12], SNES_COLORS).every((level) => level > 200)).toBe(true)
    const [red, green, blue] = colorRgb(chicago.palette[16 + 12], SNES_COLORS)
    expect([red > 200, green < 50, blue < 50]).toEqual([true, true, true])
    // The players to show colours on are drawn from the ROM.
    const players = snesPreviewSprites(project.bytes)
    expect(players).toHaveLength(3)
    for (const image of players) {
      expect(image.width).toBeGreaterThan(10)
      expect(image.height).toBeGreaterThan(20)
      expect(image.pixels.some((colour) => colour === 12)).toBe(true)
    }
    // Overall ratings as the game works them out, which for goalies can be one above the Genesis game's.
    expect(overallRating(ase.players[0].attributes, true, project.game)).toBe(94)
    const fuhr = ase.players.find((p) => p.name === 'Grant Fuhr')!
    expect(overallRating(fuhr.attributes, true, project.game)).toBe(85)
    expect(overallRating(fuhr.attributes, true)).toBe(84)
    const lemieux = ase.players.find((p) => p.name === 'Mario Lemieux')!
    expect(overallRating(lemieux.attributes, false, project.game)).toBe(overallRating(lemieux.attributes, false))
  })
})

const GENESIS = 'nhl94.bin'
describe.skipIf(!existsSync(path(STOCK)) || !existsSync(path(GENESIS)))('the SNES and Genesis games together', () => {
  it('takes a Genesis team into an SNES ROM, leaving its colours behind', () => {
    // The SNES Boston roster is a player short of the Genesis one, and the
    // original ROM has no room to spare, so some is made first.
    const stock = openRom(read(STOCK))
    const snes = { ...stock, teams: stock.teams.map((t, i) => (i >= 2 && i < 6 ? { ...t, names: [...t.names.slice(0, 3), 'Rink'] } : t)) }
    const genesis = openRom(read(GENESIS))
    const from = genesis.teams.findIndex((t) => teamDisplayName(t) === 'Boston Bruins')
    const to = snes.teams.findIndex((t) => teamDisplayName(t) === 'Boston Bruins')
    const { project, notes } = importTeam(snes, genesis, from, to, ALL_PARTS)
    expect(project.teams[to].players).toEqual(genesis.teams[from].players)
    expect(project.teams[to].palette).toEqual(snes.teams[to].palette)
    expect(project.teams[to].shownOverall).toBe(snes.teams[to].shownOverall)
    expect(notes.join(' ')).toMatch(/Colours were not brought in/)
    expect(openRom(buildRom(project)).teams[to].players).toEqual(genesis.teams[from].players)
  })

  it('compares the two by team name', () => {
    const differences = compareProjects(openRom(read(GENESIS)), openRom(read(STOCK)))
    const general = differences.find((d) => d.heading === 'In general')!.changes.join(' ')
    expect(general).toMatch(/different games/)
    expect(general).toMatch(/matched by name/)
    // The SNES game has one Boston player fewer, and no settings to compare.
    const boston = differences.find((d) => d.heading === 'Boston Bruins')!.changes
    expect(boston[0]).toBe('Gord Murphy was removed.')
    expect(boston.slice(1).every((change) => change.startsWith('Line '))).toBe(true)
    expect(differences.map((d) => d.heading)).not.toContain('Clock')
  })
})

describe.skipIf(names.length === 0)('SNES hacks', () => {
  const allOn = Object.fromEntries(SNES_HACKS.map((hack) => [hack, true])) as SnesHackChoices
  const allOff = Object.fromEntries(SNES_HACKS.map((hack) => [hack, false])) as SnesHackChoices

  names.forEach((name, n) => {
    it(`are recognised in SNES ROM ${n + 1}, and go in and come out again`, () => {
      const project = openRom(read(name))
      const before = detectSnesHacks(project.bytes)
      expect(before.unknown).toEqual([])
      const on = applySnesHacks(project, allOn)
      expect(detectSnesHacks(on.bytes).choices).toEqual(allOn)
      const reopened = openRom(buildRom(on))
      expect(detectSnesHacks(reopened.bytes).choices).toEqual(allOn)
      expect(teamsOf(reopened)).toEqual(teamsOf(project))
      // Back to what it had, byte for byte.
      expect(applySnesHacks(on, before.choices).bytes).toEqual(project.bytes)
    })
  })

  it.skipIf(!existsSync(path(STOCK)))('puts in the hot and cold fix as the disassembly has it, and leaves code it does not know alone', () => {
    const project = openRom(read(STOCK))
    expect(detectSnesHacks(project.bytes).choices).toEqual(allOff)
    const fixed = applySnesHacks(project, { hotColdFix: true })
    const at = (address: number, count: number) => Array.from(fixed.bytes.subarray(address, address + count))
    // $9F:D234 and $9F:FB32 in the ROM.
    expect(at(0xfd234, 5)).toEqual([0x20, 0x32, 0xfb, 0xea, 0xea])
    expect(at(0xffb32, 3)).toEqual([0xb9, 0x12, 0x1a])
    const differing = fixed.bytes.reduce((count, byte, i) => count + (byte !== project.bytes[i] ? 1 : 0), 0)
    expect(differing).toBeLessThanOrEqual(5 + 17)

    const changes = compareProjects(project, fixed).flatMap((d) => (d.heading === 'Hacks' ? d.changes : []))
    expect(changes).toEqual(['Hot and cold bug fix: off to on.'])

    // A project file brings its hacks to a fresh copy of the ROM.
    const reopened = openProjectFile(openRom(read(STOCK)), saveProjectFile(fixed, project, 'Set'))
    expect(detectSnesHacks(reopened.project.bytes).choices.hotColdFix).toBe(true)

    // Something else where a hack goes: it is not recognised, and is not changed.
    const other = project.bytes.slice()
    other[0xffb40] = 0x00
    const odd = { ...project, bytes: other }
    expect(detectSnesHacks(other).unknown).toEqual(['hotColdFix'])
    expect(() => applySnesHacks(odd, { hotColdFix: true })).toThrow(/other code/)
    expect(applySnesHacks(odd, { skipEaIntro: true }).bytes[0xffb40]).toBe(0x00)
  })
})
