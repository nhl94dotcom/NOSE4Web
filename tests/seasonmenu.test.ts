import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkProject } from '../src/core/check'
import { buildRom, openRom } from '../src/core/rom'
import { applySeason, DEFAULT_SEASON_OPTIONS, defaultPlacement, parseSeason, rateSeason } from '../src/core/seasonbuilder'
import { offerOnly, offersOnly } from '../src/core/seasonmenu'
import { teamDisplayName } from '../src/core/team'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const seasons = new URL('../public/seasons/', import.meta.url)
const json = (file: string) => JSON.parse(readFileSync(new URL(file, seasons), 'utf8'))

// The walkthrough's 1987-88 on the original game: 21 teams into 26 places and two All-Star teams.
describe.skipIf(!existsSync(path('nhl94.bin')))('offering only a season’s teams in the menu', () => {
  it('moves the 21 teams of 1987-88 to the top, offers them and the All-Stars, and makes draws of them alone', () => {
    const rom = openRom(new Uint8Array(readFileSync(path('nhl94.bin'))))
    const season = parseSeason(json('19871988.json'))
    const placement = defaultPlacement(rom, season, json('franchises.json'))
    const options = { ...DEFAULT_SEASON_OPTIONS, allStars: true }
    const { project } = applySeason(rom, season, placement, options, rateSeason(rom.game, season, options).teams)
    const slots = placement.flatMap((s, slot) => (s === null ? [] : [slot]))
    expect(slots).toHaveLength(21)
    expect(offersOnly(project, slots)).toBe(false)

    const result = offerOnly(project, slots)
    if ('reason' in result) throw new Error(result.reason)
    expect(result.offered).toBe(23)
    const out = result.project
    // The season's teams first, in the order they were in, then the All-Stars, then the five later teams.
    expect(out.teams.slice(0, 21).map(teamDisplayName)).toEqual(slots.map((slot) => teamDisplayName(project.teams[slot])))
    expect(out.teams.slice(21, 23).map(teamDisplayName)).toEqual(['All Stars East', 'All Stars West'])
    expect(out.teams.slice(23).map(teamDisplayName)).toEqual(['Anaheim Mighty Ducks', 'Florida Panthers', 'Ottawa Senators', 'San Jose Sharks', 'Tampa Bay Lightning'])
    expect(out.settings.menuTeams).toEqual({ offered: 23 })
    // Every draw holds only the season's teams, each of them in one at least.
    expect(out.settings.playoffDraws.flat().every((team) => team < 21)).toBe(true)
    expect(new Set(out.settings.playoffDraws.flat()).size).toBe(21)
    expect(out.settings.playoffDraws.every((draw) => new Set(draw).size === draw.length)).toBe(true)
    // Nothing for Check ROM to find, and the ROM keeps it all.
    expect(checkProject(out).filter((finding) => finding.level !== 'note')).toEqual([])
    const again = openRom(buildRom(out))
    expect(again.settings.menuTeams).toEqual({ offered: 23 })
    expect(again.teams.slice(0, 21).map(teamDisplayName)).toEqual(out.teams.slice(0, 21).map(teamDisplayName))
    expect(offersOnly(again, out.teams.slice(0, 21).map((_, n) => n))).toBe(true)
  })
})
