import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readU16LE } from '../src/core/bytes'
import { colorRgb, SNES_COLORS } from '../src/core/color'
import { projectTeamRatings } from '../src/core/ppfix'
import { findSnesTeamTable, fixSnesChecksum, snesCodeInPlace, snesPreviewSprites, snesStripTables } from '../src/core/snes'
import { applySnesHacks, detectSnesHacks, SNES_HACKS, type SnesHackChoices } from '../src/core/sneshacks'
import { checkProject } from '../src/core/check'
import { pictureToImage, type Picture } from '../src/core/graphics'
import { unpackHuffman } from '../src/core/huffman'
import {
  LOGO_SIZE,
  logoFrame,
  NO_SNES_PICTURE_EDITS,
  snesCentreIce,
  snesCentreIceFromImage,
  snesLogo,
  snesLogoFromImage,
  snesLogoTable,
  SnesPictureRoomError,
  snesPicturesSupported,
  writeSnesPictures,
  type SnesPictureEdits,
} from '../src/core/snespictures'
import { NHL94_SNES } from '../src/core/games'
import { compareProjects } from '../src/core/compare'
import { formatCsv } from '../src/core/csv'
import { nextExpansion } from '../src/core/expand'
import { hacksSupported } from '../src/core/hacks'
import { ALL_PARTS, importTeam } from '../src/core/importteam'
import { teamSummaries } from '../src/core/league'
import { openProjectFile, saveProjectFile } from '../src/core/projectfile'
import { resetSettingsPart, resetTeamPart, settingsPartChanged } from '../src/core/reset'
import { menuOptions } from '../src/core/settings'
import { SNES_MENU_CAPTIONS } from '../src/core/snesmenu'
import { drawSnesRink, snesRinkRowsUsed } from '../src/core/snesrink'
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
        expect(project.teams).toHaveLength(findSnesTeamTable(project.bytes)!.count)
        // The colours are found, wherever the ROM keeps them.
        expect(snesStripTables(project.bytes)).not.toBeNull()
        for (const team of project.teams) expect(team.palette).toHaveLength(32)
        expect(snesPreviewSprites(project.bytes)).toHaveLength(3)
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

      it('moves teams that no longer fit into the unused room at the end of their bank, and back again', () => {
        const project = openRom(read(name))
        const { layout } = project
        expect(layout.overflow).toBeDefined()
        const overflow = layout.overflow!
        const bank = (offset: number) => Math.floor(offset / 0x8000)
        expect([bank(overflow.start), bank(overflow.end - 1)]).toEqual([bank(layout.start), bank(layout.start)])
        const space = teamSpace(project.teams, project.layout)
        expect(space.available).toBe(layout.end - layout.start + overflow.end - overflow.start)

        // More players for the first team in the ROM than the teams' room where the game has them can hold.
        const first = layout.fileOrder[0]
        const count = Math.ceil((layout.end - layout.start - space.used + 200) / 22)
        const extra = Array.from({ length: count }, (_, i) => ({ ...project.teams[first].players.at(-1)!, name: `Extra Skater ${i + 1}`.slice(0, 14) }))
        const teams = project.teams.map((t, i) => (i === first ? { ...t, players: [...t.players, ...extra] } : t))
        expect(teamSpace(teams, layout).used).toBeGreaterThan(layout.end - layout.start)
        const built = buildRom({ ...project, teams })
        const reopened = openRom(built)
        expect(reopened.teams.map((t) => t.players)).toEqual(teams.map((t) => t.players))
        expect(reopened.teams.map((t) => t.names)).toEqual(teams.map((t) => t.names))
        expect(reopened.teams.map((t) => t.lines)).toEqual(teams.map((t) => t.lines))
        expect(reopened.layout.overflow!.end).toBe(overflow.end)
        expect(teamSpace(reopened.teams, reopened.layout).available).toBe(space.available)
        // Only the teams, their table, their bank's unused room and the checksum change.
        const header = project.copierHeader?.length ?? 0
        const file = read(name)
        const table = project.game.teamTableOffset
        const changedElsewhere = [...built.keys()].filter((i) => {
          if (built[i] === file[i] || checksumBytes(header).includes(i)) return false
          const o = i - header
          return !(o >= layout.start && o < layout.end) && !(o >= overflow.start && o < overflow.end) && !(o >= table && o < table + project.teams.length * 4)
        })
        expect(changedElsewhere).toEqual([])
        // The hacks still go in, none of them into the teams' bank.
        const hacks = Object.fromEntries(SNES_HACKS.filter((hack) => hack !== 'showMaxBoost' && !detectSnesHacks(reopened.bytes).unknown.includes(hack)).map((hack) => [hack, true]))
        const hacked = applySnesHacks(reopened, hacks)
        expect(hacked.bytes.subarray(bank(layout.start) * 0x8000, bank(layout.start) * 0x8000 + 0x8000)).toEqual(
          reopened.bytes.subarray(bank(layout.start) * 0x8000, bank(layout.start) * 0x8000 + 0x8000),
        )
        expect(openRom(buildRom(hacked)).teams.map((t) => t.players)).toEqual(teams.map((t) => t.players))

        // Taken out again, every team is back where the game had it.
        expect(buildRom({ ...reopened, teams: project.teams })).toEqual(buildRom(project))
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
        expect(project.rinkPalette).toHaveLength(128)
      })

      it('draws the rink, and changes its colours and nothing else', () => {
        const project = openRom(read(name))
        const rink = drawSnesRink(project.bytes, null)!
        expect([rink.width, rink.height]).toEqual([48 * 8, 113 * 8])
        expect(snesRinkRowsUsed(project.bytes)).toEqual([0, 1, 2, 3])
        const rinkPalette = project.rinkPalette.map((word, i) => (i === 17 ? 0x7c00 : i === 0x50 + 3 ? 0x001f : word))
        const edited = { ...project, rinkPalette }
        const [before, after] = [buildRom(project), buildRom(edited)]
        const header = project.copierHeader?.length ?? 0
        const changed = [...after.keys()].filter((i) => after[i] !== before[i] && !checksumBytes(header).includes(i))
        expect(changed.length).toBeLessThanOrEqual(4)
        expect(openRom(after).rinkPalette).toEqual(rinkPalette)
        expect(compareProjects(project, edited).find((section) => section.heading === 'Rink colours')?.changes).toEqual(['2 colours changed.'])
        // The centre ice logos are shown, and imported, in the rink's colours as edited.
        if (snesPicturesSupported(project.bytes, project.teams.length)) {
          const ice = snesCentreIce(project.bytes, project.teams.length, NO_SNES_PICTURE_EDITS, 0, rinkPalette)
          if (!ice.ownColours) expect(ice.palette[0x53]).toBe(0x001f)
        }
        expect(openProjectFile(openRom(read(name)), saveProjectFile(edited, project)).project.rinkPalette).toEqual(rinkPalette)
      })

      it("sets the main menu's starting choices, changing nothing else, and keeps them in a project file", () => {
        const project = openRom(read(name))
        const { menu } = project.settings
        expect(menu.map((item) => item.caption)).toEqual(SNES_MENU_CAPTIONS.slice(0, menu.length))
        expect(menu.length).toBeGreaterThanOrEqual(7)
        const teamNames = project.teams.map(teamDisplayName)
        // Every line on its last choice.
        const last = menu.map((item, i) => ({ ...item, value: menuOptions(project.settings, project.game, i, teamNames).length - 1 }))
        const edited = { ...project, settings: { ...project.settings, menu: last } }
        const [before, after] = [buildRom(project), buildRom(edited)]
        const changed = [...after.keys()].filter((i) => after[i] !== before[i])
        const header = project.copierHeader?.length ?? 0
        expect(changed.filter((i) => !checksumBytes(header).includes(i)).length).toBeLessThanOrEqual(menu.length * 2)
        expect(openRom(after).settings.menu).toEqual(last)
        expect(compareProjects(project, edited).find((section) => section.heading === 'Main menu')?.changes).toHaveLength(last.filter((item, i) => item.value !== menu[i].value).length)
        const reopened = openProjectFile(openRom(read(name)), saveProjectFile(edited, project)).project
        expect(reopened.settings.menu).toEqual(last)
        expect(resetSettingsPart(edited.settings, project.settings, 'menu')).toEqual(project.settings)
      })

      it('edits the clock, the penalty messages and the playoff draws, and keeps them in a project file', () => {
        const project = openRom(read(name))
        const { settings } = project
        expect(settings.periodLengths.map((period) => period.seconds)).toEqual([300, 600, 1200, 30])
        expect(settings.playoffDraws).toHaveLength(32)
        expect(settings.rules.map((rule) => rule.text)).toContain('Charging')
        const charging = settings.rules.findIndex((rule) => rule.text === 'Charging')
        const edited = {
          ...project,
          settings: {
            ...settings,
            periodLengths: settings.periodLengths.map((period, i) => ({ ...period, seconds: [120, 240, 480, 45][i], text: i === 2 ? '15 Minutes' : period.text })),
            overtimeSeconds: 180,
            shootoutSeconds: 40,
            rules: settings.rules.map((rule, i) => (i === charging ? { ...rule, text: 'Charge', penaltyMinutes: 3, delay: 6 } : rule)),
            playoffDraws: settings.playoffDraws.map((draw, d) => (d === 0 ? [draw[1], draw[0], ...draw.slice(2)] : draw)),
          },
        }
        const reopened = openRom(buildRom(edited))
        // The menu reads its period texts from the same place, so it offers the edited one.
        const values = (menu: { value: number }[]) => menu.map((item) => item.value)
        expect({ ...reopened.settings, menu: [] }).toEqual({ ...edited.settings, menu: [] })
        expect(values(reopened.settings.menu)).toEqual(values(settings.menu))
        expect(reopened.settings.menu[3].options?.[2]).toBe('15 Minutes')
        expect(reopened.teams.map((t) => t.players)).toEqual(project.teams.map((t) => t.players))
        expect(compareProjects(project, edited).map((section) => section.heading)).toEqual(['Clock', 'Rule messages', 'Playoff draws'])
        // The menu offers the edited text.
        expect(menuOptions(edited.settings, edited.game, 3, [])[2]).toBe('15 Minutes')
        expect({ ...openProjectFile(openRom(read(name)), saveProjectFile(edited, project)).project.settings, menu: [] }).toEqual({ ...edited.settings, menu: [] })
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
    expect(project.game).toBe(NHL94_SNES)
    expect(project.teams).toHaveLength(28)
    expect(snesCodeInPlace(project.bytes)).toBe(true)
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
  const allOff = Object.fromEntries(SNES_HACKS.map((hack) => [hack, false])) as SnesHackChoices

  names.forEach((name, n) => {
    it(`are recognised in SNES ROM ${n + 1}, and go in and come out again, wherever its code is`, () => {
      const project = openRom(read(name))
      const before = detectSnesHacks(project.bytes)
      // Every hack is found, wherever the ROM's code is, but the extra attacker fix, which uses the original game's
      // work memory, the hacks of Edit Lines and the pads, and the injury risk (its counts in the original's free memory),
      // all offered only in ROMs laid out as the original.
      expect(before.unknown).toEqual(snesCodeInPlace(project.bytes) ? [] : ['extraAttackerFix', 'forwardsAndDefence', 'showMaxBoost', 'manualPullGoalie', 'injuryBonus'])
      const wanted = Object.fromEntries(SNES_HACKS.filter((hack) => hack !== 'showMaxBoost' && !before.unknown.includes(hack)).map((hack) => [hack, true]))
      const on = applySnesHacks(project, wanted)
      expect(detectSnesHacks(on.bytes).choices).toEqual({ ...allOff, ...wanted })
      // The 30-second periods offer a fourth period length on the menu.
      expect(on.settings.menu[3].options).toEqual(['5 Minutes', '10 Minutes', '20 Minutes', '30 Seconds'])
      const reopened = openRom(buildRom(on))
      expect(detectSnesHacks(reopened.bytes).choices).toEqual({ ...allOff, ...wanted })
      expect(teamsOf(reopened)).toEqual(teamsOf(project))
      // Back to what it had, byte for byte.
      expect(applySnesHacks(on, before.choices).bytes).toEqual(project.bytes)
      if (snesCodeInPlace(project.bytes)) return
      // Where the code has moved, the call an intro skip takes out is found from the ROM as opened; a ROM opened
      // with the skip in cannot have it taken out.
      expect(() => applySnesHacks(reopened, { skipEaIntro: false })).toThrow(/cannot be taken out/)
      expect(detectSnesHacks(applySnesHacks(reopened, { hotColdFix: false }).bytes).choices.hotColdFix).toBe(false)
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

describe.skipIf(!existsSync(path(STOCK)))('an SNES ROM laid out differently from the original', () => {
  // Made from the original: its team table moved to free space at the end of
  // the ROM with two more entries, and its code moved, as far as the editor
  // can tell, by changing the home colour loader's first instruction.
  function rebuilt(): Uint8Array {
    const rom = read(STOCK)
    const original = findSnesTeamTable(rom)!
    const table = 0xff000
    rom.copyWithin(table, original.offset, original.offset + original.count * 4)
    // Two more teams, copies of the first two.
    rom.copyWithin(table + original.count * 4, original.offset, original.offset + 8)
    rom.fill(0, table + (original.count + 2) * 4, table + (original.count + 3) * 4)
    // The table loader, LDA #$9F STA $8F LDA #$F000 STA $8D: bank $9F holds $FF000.
    const loader = Buffer.from(rom).indexOf(Buffer.from('0a0aa8a99c00858fa9e7a5858d', 'hex'))
    rom.set([0x9f, 0x00, 0x85, 0x8f, 0xa9, 0x00, 0xf0], loader + 4)
    return rom
  }

  it('finds the team table and the teams through the game code, and keeps the hacks out where its code has moved', () => {
    const rom = rebuilt()
    // The copies share their blocks with the first two teams, which the editor cannot keep apart.
    expect(findSnesTeamTable(rom)).toEqual({ offset: 0xff000, count: 30 })
    expect(() => openRom(rom)).toThrow(/continuous|unexpected/)

    // A ROM with the original's table and its code moved.
    const moved = read(STOCK)
    moved[0xfb91c] = 0xae
    fixSnesChecksum(moved)
    const project = openRom(moved)
    expect(project.game.title).toBe("NHL '94 (SNES), 28 teams, rebuilt")
    expect(project.game.notice).toMatch(/found where this ROM has the code they change/)
    expect(project.teams.every((team) => team.palette.length === 0)).toBe(true)
    // The hacks are found by the code around them; those that need to know where the game's variables are cannot
    // be put in, as that is read from the colour loader changed here.
    expect(detectSnesHacks(moved).unknown).toEqual(['defenceControl', 'noGoalPosts', 'faceoffFix', 'extraAttackerFix', 'forwardsAndDefence', 'showMaxBoost', 'manualPullGoalie', 'injuryBonus'])
    expect(() => applySnesHacks(project, { noGoalPosts: true })).toThrow(/other code/)
    expect(detectSnesHacks(applySnesHacks(project, { skipEaIntro: true }).bytes).choices.skipEaIntro).toBe(true)
    expect(buildRom(project)).toEqual(moved)
  })
})

describe.skipIf(!existsSync(path(STOCK)))("the original SNES game's main menu", () => {
  it('starts on Montreal at home to Los Angeles, and gains a period length with the 30-second periods', () => {
    const project = openRom(read(STOCK))
    const choices = (p: RomProject) => p.settings.menu.map((item, i) => menuOptions(p.settings, p.game, i, p.teams.map(teamDisplayName))[item.value])
    expect(choices(project)).toEqual(['Regular Season', 'Montreal Canadiens', 'Los Angeles Kings', '10 Minutes', 'Off', 'Off', 'Automatic'])
    const hacked = applySnesHacks(project, { thirtySecondPeriods: true })
    expect(hacked.settings.menu[3].options).toEqual(['5 Minutes', '10 Minutes', '20 Minutes', '30 Seconds'])
    expect(settingsPartChanged(hacked.settings, project.settings, 'menu')).toBe(false)
    const thirty = { ...hacked, settings: { ...hacked.settings, menu: hacked.settings.menu.map((item, i) => (i === 3 ? { ...item, value: 3 } : item)) } }
    expect(checkProject(thirty).filter((finding) => finding.where === 'Main menu')).toEqual([])
    // Without the hack the choice is not on offer.
    const unhacked = applySnesHacks(thirty, { thirtySecondPeriods: false })
    expect(checkProject(unhacked).filter((finding) => finding.where === 'Main menu')).toHaveLength(1)
  })

  it('shows the one-minute penalties in the penalty messages, and keeps them when the ROM is built', () => {
    const project = openRom(read(STOCK))
    const minutes = (p: RomProject) => p.settings.rules.filter((rule) => rule.text === 'Charging').map((rule) => rule.penaltyMinutes)
    expect(minutes(project)).toEqual([2])
    const hacked = applySnesHacks(project, { oneMinutePenalties: true })
    expect(minutes(hacked)).toEqual([1])
    const built = openRom(buildRom(hacked))
    expect(detectSnesHacks(built.bytes).choices.oneMinutePenalties).toBe(true)
    expect(minutes(built)).toEqual([1])
  })
})

describe.skipIf(!existsSync(path(STOCK)))('an SNES ROM with the SA-1 chip', () => {
  it('opens, as the 32-team build is one', () => {
    const rom = read(STOCK)
    // The header's map mode: $23 for an SA-1 cartridge, $30 for the original game.
    rom[0x7fd5] = 0x23
    const project = openRom(rom)
    expect(project.teams).toHaveLength(28)
    expect(buildRom(project)[0x7fd5]).toBe(0x23)
  })
})

describe.skipIf(!existsSync(path(STOCK)))('the SNES power play and penalty kill fix', () => {
  it('rewrites the two in the same 32 bytes, with the branches to them, and the editor names them to match', () => {
    const project = openRom(read(STOCK))
    const fixed = applySnesHacks(project, { ppPkFix: true })
    // $9F:CF9D in the ROM.
    const at = (rom: Uint8Array) => Buffer.from(rom.subarray(0xfcf9d, 0xfcf9d + 34)).toString('hex')
    expect(at(project.bytes)).toBe('f00da00100b789290f008d0b0d8013a00100b7894a4a4a4a290f0049ffff1a8d090d')
    expect(at(fixed.bytes)).toBe('f011a00100b7894a4a4a4a290f008d0b0d800fa00100b789290f0049ffff1a8d090d')
    expect(detectSnesHacks(fixed.bytes).choices.ppPkFix).toBe(true)
    expect(projectTeamRatings(fixed).map((rating) => rating.label).slice(2, 4)).toEqual(['Power play', 'Penalty kill'])
    expect(applySnesHacks(fixed, { ppPkFix: false }).bytes).toEqual(project.bytes)
  })
})

describe.skipIf(names.length === 0)('SNES logos', () => {
  const none = NO_SNES_PICTURE_EDITS
  const samePicture = (a: Picture, b: Picture) => a.width === b.width && a.height === b.height && a.pixels.every((p, i) => p === b.pixels[i])
  // The logo set is at $81:ABDE in the original game.
  const LOGO_SET = 0xabde

  names.forEach((name, n) => {
    it(`are read in SNES ROM ${n + 1} where it keeps them as the original game does, and left alone where not`, () => {
      const project = openRom(read(name))
      const teams = project.teams.length
      if (!snesPicturesSupported(project.bytes, teams)) {
        expect(snesCodeInPlace(project.bytes)).toBe(false)
        expect(() => writeSnesPictures(project.bytes.slice(), teams, { logos: { 0: snesLogo(read(STOCK), 28, none, 0) }, centreIce: {} })).toThrow(/cannot read/)
        return
      }
      for (let team = 0; team < teams; team++) {
        const logo = snesLogo(project.bytes, teams, none, team)
        expect(logo.picture.pixels.some((p) => p > 0)).toBe(true)
        expect(logo.palette).toHaveLength(16)
        const ice = snesCentreIce(project.bytes, teams, none, team)
        expect(ice.picture.pixels.some((p) => p > 0)).toBe(true)
        // A team with centre ice colours of its own keeps to them; its logo comes back from an image in them.
        if (ice.ownColours) {
          expect(ice.rows).toEqual([5])
          const back = snesCentreIceFromImage(pictureToImage(ice.picture, ice.palette, SNES_COLORS), ice.picture.width, ice.picture.height, ice)
          const rgb = (p: number) => (p ? colorRgb(ice.palette[p], SNES_COLORS).join() : 'none')
          expect(back.pixels.every((p, i) => rgb(p) === rgb(ice.picture.pixels[i]))).toBe(true)
        }
      }
      // Every logo given back as it is: nothing in the ROM changes.
      const all: SnesPictureEdits = { logos: {}, centreIce: {} }
      for (let team = 0; team < teams; team++) {
        all.logos[team] = snesLogo(project.bytes, teams, none, team)
        all.centreIce[team] = snesCentreIce(project.bytes, teams, none, team).picture
      }
      const rom = project.bytes.slice()
      writeSnesPictures(rom, teams, all)
      expect(rom).toEqual(project.bytes)
    })

    it(`replace logos in SNES ROM ${n + 1} where it keeps them unpacked in the ROM, moving them to free space as they need`, () => {
      const project = openRom(read(name))
      const teams = project.teams.length
      const table = snesLogoTable(project.bytes, teams)
      if (table === null) return
      // Team 1's logo onto team 0, and the last team's onto the next six, with team 1's centre ice onto team 0.
      const edits: SnesPictureEdits = { logos: { 0: snesLogo(project.bytes, teams, none, 1) }, centreIce: {} }
      for (let team = 2; team < 8; team++) edits.logos[team] = snesLogo(project.bytes, teams, none, teams - 1)
      const ice = snesCentreIce(project.bytes, teams, none, 1).picture
      if (ice.width === snesCentreIce(project.bytes, teams, none, 0).picture.width) edits.centreIce[0] = ice
      const reopened = openRom(buildRom({ ...project, snesPictures: edits }))
      for (let team = 0; team < teams; team++) {
        const want = edits.logos[team] ?? snesLogo(project.bytes, teams, none, team)
        const got = snesLogo(reopened.bytes, teams, none, team)
        expect(samePicture(got.picture, want.picture)).toBe(true)
        expect(got.palette.slice(1)).toEqual(want.palette.slice(1))
        const wantIce = edits.centreIce[team] ?? snesCentreIce(project.bytes, teams, none, team).picture
        expect(samePicture(snesCentreIce(reopened.bytes, teams, none, team).picture, wantIce)).toBe(true)
      }
      expect(teamsOf(reopened)).toEqual(teamsOf(project))

      // A logo two teams draw: replacing one team's leaves the other's alone.
      const sharing = project.bytes.slice()
      sharing.copyWithin(table, table + 4, table + 8)
      const shared = snesLogo(sharing, teams, none, 1)
      expect(samePicture(snesLogo(sharing, teams, none, 0).picture, shared.picture)).toBe(true)
      const changed = sharing.slice()
      writeSnesPictures(changed, teams, { logos: { 0: snesLogo(project.bytes, teams, none, 2) }, centreIce: {} })
      expect(samePicture(snesLogo(changed, teams, none, 0).picture, snesLogo(project.bytes, teams, none, 2).picture)).toBe(true)
      expect(samePicture(snesLogo(changed, teams, none, 1).picture, shared.picture)).toBe(true)
    })
  })

  it.skipIf(!existsSync(path(STOCK)))('replace a team’s logo and centre ice logo, which read back exactly and change nothing else', () => {
    const project = openRom(read(STOCK))
    const boston = snesLogo(project.bytes, 28, none, 1)
    const bostonIce = snesCentreIce(project.bytes, 28, none, 1)
    const edits: SnesPictureEdits = { logos: { 0: boston }, centreIce: { 0: bostonIce.picture } }
    const reopened = openRom(buildRom({ ...project, snesPictures: edits }))
    for (let team = 0; team < 28; team++) {
      const want = team === 0 ? boston : snesLogo(project.bytes, 28, none, team)
      const got = snesLogo(reopened.bytes, 28, none, team)
      expect(samePicture(got.picture, want.picture)).toBe(true)
      expect(got.palette.slice(1)).toEqual(want.palette.slice(1))
      const ice = snesCentreIce(reopened.bytes, 28, none, team).picture
      expect(samePicture(ice, team === 0 ? bostonIce.picture : snesCentreIce(project.bytes, 28, none, team).picture)).toBe(true)
    }
    expect(reopened.teams).toEqual(project.teams)
    // The logos fit the room the game unpacks them into, and the place they were.
    const set = unpackHuffman(reopened.bytes, LOGO_SET)
    expect(set.data.length).toBeLessThanOrEqual(unpackHuffman(project.bytes, LOGO_SET).data.length)
    expect(set.packedSize).toBeLessThanOrEqual(unpackHuffman(project.bytes, LOGO_SET).packedSize)
  })

  it.skipIf(!existsSync(path(STOCK)))('say so when the logos no longer fit the room the game unpacks them into', () => {
    const project = openRom(read(STOCK))
    const boston = snesLogo(project.bytes, 28, none, 1)
    const edits: SnesPictureEdits = { logos: { 5: boston, 6: boston, 24: boston, 27: boston }, centreIce: {} }
    expect(() => writeSnesPictures(project.bytes.slice(), 28, edits)).toThrow(SnesPictureRoomError)
    expect(() => buildRom({ ...project, snesPictures: edits })).toThrow(/logos share one space in the game's memory, which the original logos fill/)
  })

  it.skipIf(!existsSync(path(STOCK)))('come from images: up to 15 colours of the logo’s own, and the rink’s colours for the centre ice', () => {
    const project = openRom(read(STOCK))
    const boston = snesLogo(project.bytes, 28, none, 1)
    const image = pictureToImage(boston.picture, boston.palette, SNES_COLORS)
    const made = snesLogoFromImage(image, LOGO_SIZE, LOGO_SIZE)
    // The same picture, though its colours may be numbered differently.
    const colour = (logo: { picture: Picture; palette: number[] }, i: number) =>
      logo.picture.pixels[i] ? colorRgb(logo.palette[logo.picture.pixels[i]], SNES_COLORS).join() : 'none'
    expect(made.picture.pixels.every((_, i) => colour(made, i) === colour(boston, i))).toBe(true)
    expect(() => snesLogoFromImage(image, 48, 48)).toThrow(/56 by 56/)

    const ice = snesCentreIce(project.bytes, 28, none, 3)
    const back = snesCentreIceFromImage(pictureToImage(ice.picture, ice.palette, SNES_COLORS), ice.picture.width, ice.picture.height, ice)
    const rgb = (word: number) => colorRgb(word, SNES_COLORS).join()
    expect(back.pixels.every((p, i) => (p === 0 ? ice.picture.pixels[i] === 0 : rgb(ice.palette[p]) === rgb(ice.palette[ice.picture.pixels[i]])))).toBe(true)
  })

  it.skipIf(!existsSync(path(STOCK)))('lay a logo out as the game draws it: at most 36 tiles, sent in two runs', () => {
    const project = openRom(read(STOCK))
    const set = unpackHuffman(project.bytes, LOGO_SET).data
    const frameAt = (f: number) => readU16LE(set, f * 4) | (readU16LE(set, f * 4 + 2) << 16)
    for (let team = 0; team < 28; team++) {
      const frame = logoFrame(snesLogo(project.bytes, 28, none, team).picture, set.slice(frameAt(team), frameAt(team + 1)))
      const [pieces, tiles, first, second, tileData] = [frame[0], readU16LE(frame, 2), readU16LE(frame, 0x0c) / 32, readU16LE(frame, 0x0e) / 32, readU16LE(frame, 0x10)]
      expect(tiles).toBeLessThanOrEqual(36)
      expect(first + second).toBe(tiles)
      expect(tileData).toBe(0x16 + pieces * 7)
      expect(frame.length).toBe(tileData + tiles * 32)
      // Every piece's tiles are among those sent.
      const secondAt = Math.max(1, Math.ceil(first / 16)) * 16
      const sent = (place: number) => place < first || (place >= secondAt && place < secondAt + second)
      for (let p = 0; p < pieces; p++) {
        const [place, big] = [frame[0x16 + p * 7 + 4], frame[0x16 + p * 7 + 6] === 0xff]
        for (const offset of big ? [0, 1, 16, 17] : [0]) expect(sent(place + offset)).toBe(true)
      }
    }
  })

  it.skipIf(!existsSync(path(STOCK)))('draw a centre ice logo in the rows of colours the game draws it in', () => {
    const project = openRom(read(STOCK))
    // The most used colour of each logo, as red, green and blue.
    const main = (team: number) => {
      const { picture, palette } = snesCentreIce(project.bytes, 28, none, team)
      const counts = new Map<number, number>()
      for (const p of picture.pixels) if (p) counts.set(p, (counts.get(p) ?? 0) + 1)
      const top = [...counts].sort((a, b) => b[1] - a[1])[0][0]
      return { row: Math.floor(top / 16), rgb: colorRgb(palette[top], SNES_COLORS) }
    }
    // Detroit's map uses row 0 and Boston's row 1; the game draws them five rows on.
    const detroit = main(6)
    expect(detroit.row).toBe(5)
    expect(detroit.rgb[0]).toBeGreaterThan(detroit.rgb[1] + 40)
    expect(main(1).row).toBe(6)
  })

  it.skipIf(!existsSync(path(STOCK)))('move a centre ice logo that has grown to free space, and point the game at it', () => {
    const project = openRom(read(STOCK))
    const boston = snesCentreIce(project.bytes, 28, none, 1).picture
    const rom = project.bytes.slice()
    // Buffalo's is smaller than Boston's, so Boston's does not fit in its place.
    writeSnesPictures(rom, 28, { logos: {}, centreIce: { 2: boston } })
    expect(samePicture(snesCentreIce(rom, 28, none, 2).picture, boston)).toBe(true)
    // The centre ice table is at $9C:83B7; Buffalo's tiles were at $9A:C... and are now elsewhere.
    const entry = 0xe03b7 + 2 * 8
    const before = readU16LE(project.bytes, entry) | (project.bytes[entry + 2] << 16)
    const after = readU16LE(rom, entry) | (rom[entry + 2] << 16)
    expect(after).not.toBe(before)
    for (let team = 0; team < 28; team++) {
      if (team !== 2) expect(samePicture(snesCentreIce(rom, 28, none, team).picture, snesCentreIce(project.bytes, 28, none, team).picture)).toBe(true)
    }
  })

  it.skipIf(!existsSync(path(STOCK)))('are kept in a project file', () => {
    const project = openRom(read(STOCK))
    const boston = snesLogo(project.bytes, 28, none, 1)
    const edited = { ...project, snesPictures: { logos: { 0: boston }, centreIce: { 2: snesCentreIce(project.bytes, 28, none, 1).picture } } }
    const reopened = openProjectFile(openRom(read(STOCK)), saveProjectFile(edited, project, 'Set'))
    expect(reopened.notes).toEqual([])
    expect(buildRom(reopened.project)).toEqual(buildRom(edited))
  })
})
