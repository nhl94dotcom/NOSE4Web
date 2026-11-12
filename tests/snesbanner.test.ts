import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkProject } from '../src/core/check'
import { openRom } from '../src/core/rom'
import { snesBannerNameProblem, snesBannerNameWidth } from '../src/core/snesblockpicture'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))

describe('SNES banner names', () => {
  it('only the letters the game draws; a name wider than the banner noted', () => {
    expect(snesBannerNameWidth('All Stars W.')).toBe(67)
    expect(snesBannerNameProblem('Los Angeles')).toBeNull()
    expect(snesBannerNameProblem('St. Louis')).toBeNull()
    for (const name of ['St-Louis', "Hell's", 'A&M', 'N/A', 'Team 2', 'Q@Z']) expect(snesBannerNameProblem(name)?.level, name).toBe('problem')
    expect(snesBannerNameProblem('Saskatchewan Wheat Kings')?.level).toBe('note')
  })

  it.skipIf(!existsSync(path('NHL94.smc')))('the check names the team, and the original game has none', () => {
    const rom = openRom(new Uint8Array(readFileSync(path('NHL94.smc'))))
    expect(checkProject(rom).filter((f) => /banner name/.test(f.message))).toEqual([])
    const teams = rom.teams.map((team, i) => (i === 3 ? { ...team, placeName: 'St-Louis' } : team))
    const found = checkProject({ ...rom, teams }).filter((f) => /banner name/.test(f.message))
    expect(found).toHaveLength(1)
    expect(found[0].level).toBe('problem')
    expect(found[0].message).toMatch(/"-"/)
  })
})

describe.skipIf(!existsSync(path('NHL94.smc')))("the SNES shootout winners' box", () => {
  it('notes a Location too long for it, or with a character its big font has not', () => {
    const rom = openRom(new Uint8Array(readFileSync(path('NHL94.smc'))))
    expect(checkProject(rom).filter((f) => /shootout's winners/.test(f.message))).toEqual([])
    const teams = rom.teams.map((team, i) => (i === 2 ? { ...team, names: ['Saskatchewan Rivers', ...team.names.slice(1)] } : i === 5 ? { ...team, names: ['Big_Town', ...team.names.slice(1)] } : team))
    const found = checkProject({ ...rom, teams }).filter((f) => /shootout's winners/.test(f.message))
    expect(found.map((f) => f.level)).toEqual(['note', 'note'])
    expect(found[0].message).toMatch(/19 letters/)
    expect(found[1].message).toMatch(/"_"/)
  })
})

describe.skipIf(!existsSync(path('NHL94.smc')))('SNES team names', () => {
  it('an empty Location, Name or Stadium is a problem, as Ron Barr types them', () => {
    const rom = openRom(new Uint8Array(readFileSync(path('NHL94.smc'))))
    expect(checkProject(rom).filter((f) => /is empty|are empty/.test(f.message))).toEqual([])
    const teams = rom.teams.map((team, i) => (i === 1 ? { ...team, names: [team.names[0], team.names[1], '', team.names[3]] } : team))
    const found = checkProject({ ...rom, teams }).filter((f) => /empty/.test(f.message))
    expect(found).toHaveLength(1)
    expect(found[0].level).toBe('problem')
    expect(found[0].message).toMatch(/Name is empty/)
  })
})
