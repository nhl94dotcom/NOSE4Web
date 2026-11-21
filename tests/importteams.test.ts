import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { importTeams, teamsByName } from '../src/core/importteam'
import { buildRom, openRom } from '../src/core/rom'
import { teamDisplayName } from '../src/core/team'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))

describe.skipIf(!existsSync(path('nhl94.bin')))('every team at once, matched by name', () => {
  it('matches each team of the same name, or of a nickname only one team in each ROM has', () => {
    const project = open('nhl94.bin')
    const other = open('nhl94.bin')
    // The other ROM's teams in another order, and two of them renamed.
    const teams = other.teams.slice().reverse()
    const anaheim = teams.findIndex((t) => t.names[2] === 'Mighty Ducks')
    teams[anaheim] = { ...teams[anaheim], names: ['Orange County', 'OC', 'Mighty Ducks', ''] }
    const stars = teams.findIndex((t) => t.names[2] === 'Stars')
    teams[stars] = { ...teams[stars], names: ['Somewhere', 'SW', 'Comets', ''] }
    const pairs = teamsByName(project, { ...other, teams })
    const name = (to: number) => teamDisplayName(project.teams[to])
    const theirs = (to: number) => teamDisplayName(teams[pairs.find((p) => p.to === to)!.from])
    expect(pairs.map((p) => p.to)).not.toContain(project.teams.findIndex((t) => t.names[2] === 'Stars'))
    const ducks = project.teams.findIndex((t) => t.names[2] === 'Mighty Ducks')
    expect(theirs(ducks)).toBe('Orange County Mighty Ducks')
    const boston = project.teams.findIndex((t) => t.names[2] === 'Bruins')
    expect(theirs(boston)).toBe(name(boston))
    // The two All-Star teams have no nickname, and match by their full names.
    expect(pairs).toHaveLength(27)
  })

  it.skipIf(!existsSync(path('CDL_Season_12.bin')))("brings a league ROM's logos and colours in, and the ROM still builds", () => {
    const project = open('nhl94.bin')
    const other = open('CDL_Season_12.bin')
    const pairs = teamsByName(project, other)
    expect(pairs.length).toBeGreaterThan(10)
    const result = importTeams(project, other, pairs, { colours: true, pictures: true })
    expect(result.notes).toHaveLength(pairs.length)
    for (const n of result.notes) expect(n.notes).toContain('Home and away colours brought in.')
    // Names and rosters stay.
    result.project.teams.forEach((t, i) => {
      expect(t.names).toEqual(project.teams[i].names)
      expect(t.players).toEqual(project.teams[i].players)
    })
    const boston = pairs.find((p) => project.teams[p.to].names[2] === 'Bruins')!
    expect(result.project.teams[boston.to].palette).toEqual(other.teams[boston.from].palette)
    expect(() => buildRom(result.project)).not.toThrow()
  })
})
