import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkProject } from '../src/core/check'
import { buildRom, openRom } from '../src/core/rom'
import { applySnesHacks, detectSnesHacks, snesAnyPosition, withSnesHackChoice } from '../src/core/sneshacks'
import { pullGoalieText } from '../src/core/settings'
import { goalieCount } from '../src/core/team'

// The retail SNES ROM, without a copier header: NHL94SNESVault's offsets are
// the forum posts' for a headerless file.
const path = fileURLToPath(new URL('../../NHL94.smc', import.meta.url))
const hasRom = existsSync(path)
const open = () => openRom(new Uint8Array(readFileSync(path)))
const hex = (bytes: Uint8Array, at: number, count: number) => Array.from(bytes.subarray(at, at + count), (b) => b.toString(16).padStart(2, '0')).join('')

describe.skipIf(!hasRom)('NHL94SNESVault hacks for Edit Lines and the pads', () => {
  it('put in the bytes of McMarkis\'s posts, and come out again', () => {
    const project = open()
    expect(project.bytes.length).toBe(0x100000)
    const on = applySnesHacks(project, { extraAttackerFix: true, forwardsAndDefence: true, manualPullGoalie: true, showMaxBoost: true })
    // Any skater at any position: the hijack, and the new code after the extra attacker fix's.
    expect(hex(on.bytes, 0xd8e1a, 6)).toBe('eaeaea4cbace')
    expect(hex(on.bytes, 0xdceba, 33)).toBe('2200939b8da31d2200d39ea5a58dab1d22dc929b186da31d8da31dadab1d4c3b8e')
    // Pull the goalie with L and R: the hijack and 87 bytes of new code.
    expect(hex(on.bytes, 0xf50bf, 5)).toBe('206efbeaea')
    expect(hex(on.bytes, 0xf7b6e, 5)).toBe('a20000ac91')
    expect(hex(on.bytes, 0xf7b6e + 83, 4)).toBe('01000200')
    expect(on.bytes[0xf7b6e + 87]).toBe(0xff)
    // Max boost.
    expect(hex(on.bytes, 0xf9a30, 3)).toBe('4c43fb')
    const state = detectSnesHacks(openRom(buildRom(on)).bytes)
    expect(state.unknown).toEqual([])
    expect([state.choices.forwardsAndDefence, state.choices.manualPullGoalie, state.choices.showMaxBoost]).toEqual([true, true, true])
    expect(applySnesHacks(on, detectSnesHacks(project.bytes).choices).bytes).toEqual(project.bytes)
  })

  it('go together as the Vault has them', () => {
    const { choices } = detectSnesHacks(open().bytes)
    expect(withSnesHackChoice(choices, 'forwardsAndDefence', true).extraAttackerFix).toBe(true)
    expect(withSnesHackChoice({ ...choices, forwardsAndDefence: true, extraAttackerFix: true }, 'extraAttackerFix', false).forwardsAndDefence).toBe(false)
    expect(withSnesHackChoice({ ...choices, hotColdFix: true }, 'showMaxBoost', true).hotColdFix).toBe(false)
    expect(withSnesHackChoice({ ...choices, showMaxBoost: true }, 'hotColdFix', true).showMaxBoost).toBe(false)
    expect(() => applySnesHacks(open(), { forwardsAndDefence: true })).toThrow(/needs the extra attacker fix/)
    expect(() => applySnesHacks(open(), { showMaxBoost: true, hotColdFix: true })).toThrow(/cannot both be on/)
  })

  it('let a forward play defence without a note, once Edit Lines allows it', () => {
    const project = open()
    const team = project.teams[1]
    const forward = goalieCount(team) + 1
    const lines = team.lines.map((line, l) => (l === 0 ? line.map((v, s) => (s === 1 ? forward : v)) : line))
    const moved = { ...project, teams: project.teams.map((t, i) => (i === 1 ? { ...team, lines } : t)) }
    const notes = (p: typeof project) => checkProject(p).filter((f) => f.team === 1 && /, a forward, at LD/.test(f.message))
    // The forward may be on the line already; then he is there twice too, which is still a problem.
    expect(notes(moved)).toHaveLength(1)
    const hacked = applySnesHacks(moved, { extraAttackerFix: true, forwardsAndDefence: true })
    expect(snesAnyPosition(hacked)).toBe(true)
    expect(notes(hacked)).toHaveLength(0)
  })
})

describe.skipIf(!hasRom)('when the computer pulls its goalie', () => {
  it('is read and written', () => {
    const project = open()
    expect(project.settings.cpuPullGoalie).toEqual({ goalsUnder: 3, secondsUnder: 61 })
    expect(pullGoalieText(project.settings.cpuPullGoalie!)).toBe('behind by 1 to 2 goals with 60 seconds or less left')
    const changed = { ...project, settings: { ...project.settings, cpuPullGoalie: { goalsUnder: 4, secondsUnder: 121 } } }
    const bytes = buildRom(changed)
    expect(openRom(bytes).settings.cpuPullGoalie).toEqual({ goalsUnder: 4, secondsUnder: 121 })
    // The two numbers only.
    expect(bytes.filter((b, i) => b !== project.bytes[i] && !(i >= 0x7fdc && i < 0x7fe0)).length).toBe(2)
    expect(pullGoalieText({ goalsUnder: 1, secondsUnder: 61 })).toBe('never')
  })
})
