import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { attributeText } from '../src/core/attributes'
import { bulkAttributes, bulkValues } from '../src/core/bulk'
import { compareProjects } from '../src/core/compare'
import { formatCsv } from '../src/core/csv'
import { openProjectFile, saveProjectFile } from '../src/core/projectfile'
import { csvFileName, importCsvSet, importWorkbookSheets, tableRows, tablesFor, workbookSheets } from '../src/core/tables'
import { checkProject } from '../src/core/check'
import { expandTeamSpace, nextExpansion } from '../src/core/expand'
import { hacksSupported } from '../src/core/hacks'
import { hasLeagueValue } from '../src/core/leaguevalue'
import { pictureKinds } from '../src/core/pictureset'
import { overallRating } from '../src/core/rating'
import { buildRom, openRom } from '../src/core/rom'
import { TeamEditor } from '../src/TeamEditor'

// NHL '95 (USA), which you can put in ../NHL95/NHL_95.bin, and any NHL '95 league ROMs named in local.json's nhl95Roms.
const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { nhl95Roms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const RETAIL = 'NHL95/NHL_95.bin'
const names = [RETAIL, ...(local.nhl95Roms ?? [])].filter((name) => existsSync(path(name)))
const read = (name: string) => new Uint8Array(readFileSync(path(name)))

describe.skipIf(!existsSync(path(RETAIL)))("NHL '95", () => {
  it('opens the original game: its 28 teams, players, lines and game settings', () => {
    const project = openRom(read(RETAIL))
    expect(project.game.title).toBe("NHL '95")
    expect(project.teams).toHaveLength(28)
    expect(project.teams[0].names).toEqual(['Anaheim', 'ANH', 'Mighty Ducks', 'Arrowhead Pond'])
    expect(project.teams[14].names.slice(0, 3)).toEqual(['New York', 'NYR', 'Rangers'])
    const [hebert, , corkum] = project.teams[0].players
    expect([hebert.name, hebert.jersey]).toEqual(['Guy Hebert', 0x31])
    expect(corkum.name).toBe('Bob Corkum')
    // Handed/fighting as NHL '93 keeps it (an odd value a left shot), stick handling in 16 steps.
    expect(attributeText(project.game.playerAttributeKinds[7], 8)).toBe('R/57')
    expect(attributeText(project.game.playerAttributeKinds[7], 7)).toBe('L/42')
    expect(attributeText(project.game.playerAttributeKinds[8], 6)).toBe('47-62 (6)')
    // The glove hand as NHL 94 keeps it: 1 catches right (Fuhr, Barrasso and Puppa, Match Viewer).
    expect(attributeText(project.game.goalieAttributeKinds[7], 1)).toBe('R')
    // The overall (NOSE's, the game's): stick handling 6 counts as the 0 to 6 rating 3.
    expect(overallRating(corkum.attributes, false, project.game)).toBe(overallRating(corkum.attributes.map((v, i) => (i === 8 ? 3 : v)), false, { overallIsEstimate: false }))
    expect(project.teams[0].lines).toHaveLength(8)
    const { settings } = project
    expect(settings.periodLengths.map((p) => p.seconds)).toEqual([300, 600, 1200, 30])
    expect(settings.playoffDraws).toHaveLength(32)
    expect(settings.rules[0].text).toBe('Period Over')
    // The main menu: the two teams the 1994 final's, Rangers and Vancouver; the play mode by the game's own table.
    expect(settings.menu.map((item) => item.caption)).toEqual(['Play Mode', 'Team 1', 'Team 2', 'Per. Length', 'Goalies', 'User Records', 'Penalties', 'Line Changes'])
    expect(settings.menu.map((item) => item.value).slice(1, 3)).toEqual([14, 23])
    expect(settings.menu[0].options).toEqual(['Game With Trades', 'Continue Playoffs', 'New Playoffs', 'New Playoffs/7 game', 'Shootout'])
  })

  it("moves the original game's teams to the unused half of the ROM, for room, as the WN95HL's ROMs have them", () => {
    const project = openRom(read(RETAIL))
    expect(project.teams.every((team) => team.freeBytes === 0)).toBe(true)
    expect(nextExpansion(project)).toEqual({ step: 'moveTeams', gain: 0x4000, romSize: 0x200000 })
    const roomy = expandTeamSpace(project)
    expect(roomy.layout.start).toBeGreaterThanOrEqual(0x1a72c2)
    // A longer name, and a player more, now fit; the ROM opens with them and its room, the self-check's bra * kept.
    const teams = roomy.teams.map((team, i) => (i === 0 ? { ...team, players: team.players.map((p, j) => (j === 2 ? { ...p, name: 'A Considerably Longer Name' } : p)) } : team))
    const built = buildRom({ ...roomy, teams })
    expect(Buffer.from(built.subarray(0x1a72c0, 0x1a72c2)).toString('hex')).toBe('60fe')
    const again = openRom(built)
    expect(again.teams[0].players[2].name).toBe('A Considerably Longer Name')
    expect(again.teams.slice(1)).toEqual(project.teams.slice(1).map((team, i) => ({ ...team, freeBytes: again.teams[i + 1].freeBytes })))
    expect(again.teams.reduce((sum, team) => sum + team.freeBytes, 0)).toBe(0x4000 - ('A Considerably Longer Name'.length - project.teams[0].players[2].name.length))
    expect(again.settings).toEqual(project.settings)
    // Once only.
    expect(nextExpansion(again)).toBeNull()
    // A project file made after the move moves them again when opened on the original ROM.
    const reopened = openProjectFile(project, saveProjectFile({ ...roomy, teams }, project, 'set')).project
    expect(reopened.teams[0].players[2].name).toBe('A Considerably Longer Name')
    expect(reopened.layout.end - reopened.layout.start).toBe(roomy.layout.end - roomy.layout.start)
  })

  it('says new playoffs freeze with a team in no draw, as in NHL 94, past the last team the code takes', () => {
    const project = openRom(read(RETAIL))
    const freezes = (p: typeof project) => checkProject(p).filter((f) => f.where === 'Playoff draws' && /freezes the game/.test(f.message))
    expect(freezes(project)).toEqual([])
    // Match Viewer's test in the game: team 0 out of every draw, and new playoffs with it froze.
    const draws = project.settings.playoffDraws.map((draw) => draw.map((team) => (team === 0 ? 1 : team)))
    const found = freezes({ ...project, settings: { ...project.settings, playoffDraws: draws } })
    expect(found).toHaveLength(1)
    expect(found[0].message).toContain(project.teams[0].names[0])
    // The All-Star teams (26 and 27) start them as team 25, the last the code takes (cmp #$19 at $87A14).
    expect(found[0].message).not.toContain(project.teams[26].names[0])
  })

  it("leaves out what the editor made for NHL 94: its hacks, pictures but the menu logos, the league value", () => {
    const project = openRom(read(RETAIL))
    expect(hacksSupported(project.game)).toBe(false)
    // The menu logos only (nhl95logos.test.ts).
    expect(pictureKinds(project)).toEqual(['menuLogo'])
    expect(hasLeagueValue(project.game)).toBe(false)
    expect(project.settings.credits ?? null).toBeNull()
    expect(project.teams.every((team) => team.songs === undefined && team.shownOverall === undefined)).toBe(true)
  })

  names.forEach((name) => {
    it(`${name}: opens, comes out as it went in, and keeps an edit`, () => {
      const file = read(name)
      const project = openRom(file)
      expect(project.teams.length).toBeGreaterThanOrEqual(28)
      // A league ROM that has moved its teams has its own room, and is not offered more.
      if (project.layout.start >= 0x100000) expect(nextExpansion(project)).toBeNull()
      // Unchanged: only the header checksum, and in the original game its self-check taken out, as NOSE did.
      const built = buildRom(project)
      const changed: number[] = []
      for (let i = 0; i < built.length; i++) if (built[i] !== file[i]) changed.push(i)
      const allowed = (i: number) => i === 0x18e || i === 0x18f || (i >= 0x690 && i < 0x696) || (i >= 0x1a72c0 && i < 0x1a7400)
      expect(changed.filter((i) => !allowed(i))).toEqual([])
      // An edit: a name, a jersey number and a rating, read back from the finished ROM; every other team as it was.
      const team = project.teams[1]
      const player = team.players[team.players.length - 1]
      const edited = { ...player, name: 'Test Player', jersey: 0x42, attributes: player.attributes.map((v, i) => (i === 2 ? (v + 1) % 7 : v)) }
      const teams = project.teams.map((t, i) => (i === 1 ? { ...t, players: t.players.map((p) => (p === player ? edited : p)) } : t))
      const again = openRom(buildRom({ ...project, teams }))
      expect(again.teams[1].players.at(-1)).toMatchObject({ name: 'Test Player', jersey: 0x42, attributes: edited.attributes })
      again.teams.forEach((t, i) => {
        // The bytes the shorter name frees can go to another team's room.
        if (i !== 1) expect({ ...t, freeBytes: 0 }).toEqual({ ...project.teams[i], freeBytes: 0 })
      })
      expect(again.settings).toEqual(project.settings)
      // The checks find nothing wrong in the ROM as it is.
      expect(checkProject(project).filter((finding) => finding.level === 'error')).toEqual([])
    })

    it(`${name}: spreadsheet files, a workbook and a project file come back as they went out`, () => {
      const project = openRom(read(name))
      const files = tablesFor(project.game).map((table) => ({ name: csvFileName('set', table), text: formatCsv(tableRows(project, table)) }))
      expect(Buffer.compare(buildRom(importCsvSet(project, files).project), buildRom(project))).toBe(0)
      const sheets = workbookSheets(project).map((sheet) => ({ name: sheet.name, rows: sheet.rows.map((row) => row.map(String)) }))
      expect(Buffer.compare(buildRom(importWorkbookSheets(project, sheets).project), buildRom(project))).toBe(0)
      const edited = { ...project, teams: project.teams.map((t, i) => (i === 2 ? { ...t, players: t.players.map((p, j) => (j === 3 ? { ...p, name: 'Saved Name' } : p)) } : t)) }
      expect(openProjectFile(project, saveProjectFile(edited, project, 'set')).project.teams[2].players[3].name).toBe('Saved Name')
      // Compare names a stick handling change by its 16 steps.
      const sth = { ...project, teams: project.teams.map((t, i) => (i === 2 ? { ...t, players: t.players.map((p, j) => (j === 3 ? { ...p, attributes: p.attributes.map((v, a) => (a === 8 ? (v === 15 ? 14 : 15) : v)) } : p)) } : t)) }
      expect(JSON.stringify(compareProjects(project, sth))).toMatch(/StH .*(1[45])/)
      // Bulk changes offer stick handling in its 16 steps.
      const stickHandling = bulkAttributes(project.game, 'skaters').find((attribute) => attribute.index === 8)
      expect(stickHandling && bulkValues(stickHandling.kind)).toHaveLength(16)
    })

    it(`${name}: shows every team, without NHL 94's notes on what the ratings do`, () => {
      const project = openRom(read(name))
      const rest = {
        changed: false,
        freeAgents: [],
        onRelease: () => '',
        onSign: () => '',
        onRosterCard: () => {},
        emptySlots: [],
        onResetAll: () => {},
        onChange: () => {},
        rawAttributes: false,
        onRawAttributesChange: () => {},
        quickKeys: false,
        onQuickKeysChange: () => {},
        rosterSort: 'roster' as const,
        onRosterSortChange: () => {},
        otherTeams: [{ teamName: 'Other Team', index: 1 }],
        onMovePlayers: () => '',
      }
      for (const team of project.teams) {
        const html = renderToStaticMarkup(<TeamEditor game={project.game} team={team} original={team} {...rest} />)
        expect(html).not.toContain('In play:')
        expect(html.split('class="name"').length - 1).toBe(team.players.length)
      }
    })
  })
})
