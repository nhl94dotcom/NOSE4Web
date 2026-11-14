import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { attributeText } from '../src/core/attributes'
import { checkProject } from '../src/core/check'
import { nextExpansion } from '../src/core/expand'
import { hacksSupported } from '../src/core/hacks'
import { hasLeagueValue } from '../src/core/leaguevalue'
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
    expect(settings.menu[0].options?.slice(0, 3)).toEqual(['Game With Trades', 'Continue Playoffs', 'New Playoffs'])
  })

  it("leaves out what the editor made for NHL 94: hacks, pictures, more room, the league value", () => {
    const project = openRom(read(RETAIL))
    expect(hacksSupported(project.game)).toBe(false)
    expect(project.graphicsSupported).toBe(false)
    expect(nextExpansion(project)).toBeNull()
    expect(hasLeagueValue(project.game)).toBe(false)
    expect(project.settings.credits ?? null).toBeNull()
    expect(project.teams.every((team) => team.songs === undefined && team.shownOverall === undefined)).toBe(true)
  })

  names.forEach((name) => {
    it(`${name}: opens, comes out as it went in, and keeps an edit`, () => {
      const file = read(name)
      const project = openRom(file)
      expect(project.teams.length).toBeGreaterThanOrEqual(28)
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
