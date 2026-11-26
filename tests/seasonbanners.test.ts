import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { currentPicture } from '../src/core/pictureset'
import { buildRom, openRom } from '../src/core/rom'
import { applySeason, DEFAULT_SEASON_OPTIONS, defaultPlacement, parseSeason, rateSeason } from '../src/core/seasonbuilder'
import { teamDisplayName } from '../src/core/team'

// A season's team in another city's place (1987-88's Minnesota North Stars where the original game has the Dallas
// Stars; Match Viewer saw DALLAS on its banners, 2026-11-26): lettered with its city on NHL 94 for the Genesis, and
// named in the notes where it cannot be, and for its logo.

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const seasons = new URL('../public/seasons/', import.meta.url)
const json = (file: string) => JSON.parse(readFileSync(new URL(file, seasons), 'utf8'))
const bring = (name: string) => {
  const rom = openRom(new Uint8Array(readFileSync(path(name))))
  const season = parseSeason(json('19871988.json'))
  const placement = defaultPlacement(rom, season, json('franchises.json'))
  const result = applySeason(rom, season, placement, DEFAULT_SEASON_OPTIONS, rateSeason(rom.game, season).teams)
  const slot = result.project.teams.findIndex((t) => teamDisplayName(t) === 'Minnesota North Stars')
  return { rom, result, slot }
}

describe('a season’s teams in another city’s place', () => {
  it.skipIf(!existsSync(path('nhl94.bin')))('get banners lettered with their city on the Genesis, and only they', () => {
    const { rom, result, slot } = bring('nhl94.bin')
    expect(rom.teams[slot].names[0]).toBe('Dallas')
    expect(result.notes.filter((n) => n.includes('more room'))).toEqual(["The logos and banners were given more room for the lettering (the ROM grew to 2 MB), as the team page's button does."])
    expect(result.notes).toContain('Banners lettered with their city, as they had another city’s: Minnesota North Stars.'.replace('’', "'"))
    expect(result.notes).toContain("Still with another team's logo (import your own on each team's page): Minnesota North Stars.")
    expect(result.notes.some((n) => n.startsWith('Still with another city'))).toBe(false)
    // Minnesota's banners are new; every other team's are as they were.
    for (const kind of ['menuBanner', 'gameBanner'] as const) {
      result.project.teams.forEach((_, team) => {
        const changed = JSON.stringify(currentPicture(result.project, team, kind)) !== JSON.stringify(currentPicture(rom, team, kind))
        expect(changed, `${kind} ${team}`).toBe(team === slot)
      })
    }
    // And it all goes into the ROM.
    expect(() => buildRom(result.project)).not.toThrow()
  })

  it.skipIf(!existsSync(path('NHL94.smc')))('are named in the notes on the SNES, whose banners NOSE4Web does not letter', () => {
    const { result } = bring('NHL94.smc')
    expect(result.notes).toContain("Still with another city's banners (change them on each team's page): Minnesota North Stars.")
    expect(result.notes).toContain("Still with another team's logo (import your own on each team's page): Minnesota North Stars.")
  })
})
