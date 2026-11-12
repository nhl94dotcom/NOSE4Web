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
    for (const name of ['St-Louis', "Hell's", 'A&M', 'N/A']) expect(snesBannerNameProblem(name)?.level, name).toBe('problem')
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
