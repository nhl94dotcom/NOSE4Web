import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { expandTeamSpace } from '../src/core/expand'
import { NHL94 } from '../src/core/games'
import { buildRom, openRom } from '../src/core/rom'
import { menuOptions } from '../src/core/settings'

const romPath = fileURLToPath(new URL('../../nhl94.bin', import.meta.url))
const hasRom = existsSync(romPath)

describe.skipIf(!hasRom)('game settings', () => {
  const original = hasRom ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()

  it('reads the clock, menu, rules and playoff draws', () => {
    const { settings, teams } = openRom(original)
    expect(settings.periodLengths.map((p) => p.seconds)).toEqual([300, 600, 1200, 30])
    expect(settings.periodLengths.map((p) => p.text)).toEqual(['5 Minutes', '10 Minutes', '20 Minutes', '30 Seconds'])
    expect(settings.periodLengths[0].maxLength).toBe(20)
    expect(settings.overtimeSeconds).toBe(600)
    expect(settings.shootoutSeconds).toBe(25)

    expect(settings.menu.map((m) => m.caption)).toEqual([
      'Play Mode', 'Players', 'Team 1', 'Team 2', 'Per. Length', 'Goalies', 'User Records', 'Penalties', 'Line Changes',
    ])
    const names = teams.map((t) => t.names[0])
    const chosen = settings.menu.map((m, i) => menuOptions(settings, NHL94, i, names)[m.value])
    expect(chosen).toEqual([
      'Regular Season', 'One - Home', 'Montreal', 'Los Angeles', '10 Minutes', 'Manual Control', 'Off', 'Off', 'Off',
    ])
    expect(settings.menu[0].options).toHaveLength(5)
    expect(settings.menu[8].options).toEqual(['On', 'Off', 'Auto'])

    expect(settings.rules).toHaveLength(26)
    expect(settings.rules[0]).toMatchObject({ text: 'Period Over', maxLength: 12, delay: 1, penaltyMinutes: 0 })
    expect(settings.rules.at(-1)).toMatchObject({ text: 'Fight Instigator', delay: 0x28, penaltyMinutes: 2 })

    expect(settings.playoffDraws).toHaveLength(32)
    for (const draw of settings.playoffDraws) {
      expect(draw).toHaveLength(16)
      expect(new Set(draw).size).toBe(16)
      expect(Math.max(...draw)).toBeLessThan(26) // the two All Stars teams never qualify
    }
  })

  it('saves changes', () => {
    const project = openRom(original)
    const { settings } = project
    settings.periodLengths[0] = { ...settings.periodLengths[0], seconds: 420, text: '7 Minutes' }
    settings.overtimeSeconds = 300
    settings.shootoutSeconds = 40
    settings.menu[4].value = 0
    settings.menu[2].value = 1
    settings.rules[4] = { ...settings.rules[4], text: 'Offside!', delay: 3, penaltyMinutes: 1 }
    settings.playoffDraws[5][0] = 0

    const rom = buildRom(project)
    expect(openRom(rom).settings).toEqual(settings)
    // Text is padded with spaces to fill its slot.
    const padded = String.fromCharCode(...rom.subarray(0xf7f3c + 2, 0xf7f3c + 22))
    expect(padded).toBe('7 Minutes'.padEnd(20, ' '))
  })

  it('carries settings through both roster space expansions', () => {
    const project = openRom(original)
    project.settings.playoffDraws[0][0] = 9
    const once = expandTeamSpace(project)
    const twice = expandTeamSpace(openRom(buildRom(once)))
    expect(openRom(buildRom(twice)).settings).toEqual(project.settings)
  })
})
