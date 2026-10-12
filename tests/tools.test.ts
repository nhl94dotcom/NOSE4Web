import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { copyDraws, copyLines, pasteDraws, pasteLines } from '../src/core/clipboard'
import { expandTeamSpace } from '../src/core/expand'
import { applyIps, createIps } from '../src/core/ips'
import { quickEdit } from '../src/core/quickedit'
import { buildPatch, buildRom, openRom } from '../src/core/rom'
import { addPlayer } from '../src/core/roster'
import { goalieCount } from '../src/core/team'

const romPath = fileURLToPath(new URL('../../nhl94.bin', import.meta.url))
const hasRom = existsSync(romPath)
const original = hasRom ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()

describe('IPS patches', () => {
  it('reproduces changes, including long runs and a longer file', () => {
    const before = Uint8Array.from({ length: 5000 }, (_, i) => i % 251)
    const after = new Uint8Array(70000 + 300)
    after.set(before)
    after[10] = 0xee
    after[14] = 0xee // a short gap, bridged into one record
    after.fill(0xaa, 2000, 2400) // a long run inside the old file
    after.fill(0xff, 5000) // growth, stored as runs
    after.set([1, 2, 3, 4, 5], 69000)
    const patch = createIps(before, after)
    expect(String.fromCharCode(...patch.subarray(0, 5))).toBe('PATCH')
    expect(String.fromCharCode(...patch.subarray(-3))).toBe('EOF')
    expect(patch.length).toBeLessThan(120)
    expect(applyIps(before, patch)).toEqual(after)
  })

  it('makes an empty patch when nothing differs', () => {
    const data = Uint8Array.from([1, 2, 3])
    expect(createIps(data, data)).toEqual(Uint8Array.from([...'PATCHEOF'].map((c) => c.charCodeAt(0))))
    expect(() => createIps(data, data.subarray(0, 2))).toThrow(/smaller/)
    expect(() => applyIps(data, data)).toThrow(/not an IPS patch/)
  })
})

describe.skipIf(!hasRom)('tools on the NHL 94 ROM', () => {
  it('makes a patch that turns the opened ROM into the edited one', () => {
    let project = openRom(original)
    project.teams[4].players[2].name = 'Ed B'
    expect(applyIps(original, buildPatch(project))).toEqual(buildRom(project))
    expect(buildPatch(project).length).toBeLessThan(40000)

    // Both expansions, which grow the ROM to 2 MB.
    project = expandTeamSpace(openRom(buildRom(expandTeamSpace(project))))
    project.teams[0] = addPlayer(project.teams[0])
    const patch = createIps(original, buildRom(project))
    expect(applyIps(original, patch)).toEqual(buildRom(project))
    expect(patch.length).toBeLessThan(40000)
  })

  it('copies lines between teams as roster positions', () => {
    const { teams } = openRom(original)
    const [anaheim, boston] = teams
    const next = pasteLines(boston, [0, 1, 2], copyLines(anaheim, [3, 4]))
    expect(next.lines[0]).toEqual(anaheim.lines[3])
    expect(next.lines[1]).toEqual(anaheim.lines[4])
    expect(next.lines[2]).toEqual(anaheim.lines[3]) // repeats
    expect(next.lines[3]).toBe(boston.lines[3])
    // Boston's lines use positions Anaheim's shorter roster does not have.
    expect(() => pasteLines(anaheim, [0], copyLines(boston, [0]))).toThrow(/but this team has 18 players/)
    expect(() => pasteLines(boston, [0], 'hello')).toThrow('The clipboard does not hold copied lines.')
  })

  it('copies playoff draws', () => {
    const draws = openRom(original).settings.playoffDraws
    const text = copyDraws(draws, [5])
    const next = pasteDraws(draws, [0, 31], text, 28)
    expect(next[0]).toEqual(draws[5])
    expect(next[31]).toEqual(draws[5])
    expect(next[1]).toBe(draws[1])
    expect(() => pasteDraws(draws, [0], text, 10)).toThrow(/but this ROM has 10 teams/)
    expect(() => pasteDraws(draws, [0], copyLines(openRom(original).teams[0], [0]), 28)).toThrow(/does not hold copied playoff draws/)
  })

  it('steps attributes and jersey numbers with quick edit keys', () => {
    const { game, teams } = openRom(original)
    const team = teams[1]
    const goalies = goalieCount(team)
    const kinds = (i: number) => (i < goalies ? game.goalieAttributeKinds : game.playerAttributeKinds)
    const rows = [goalies, goalies + 1]
    const attributes = (t: typeof team, row: number) => t.players[row].attributes

    let next = quickEdit(team, rows, 'Digit1', false, kinds)! // second attribute, agility
    for (const row of rows) expect(attributes(next, row)[1]).toBe(Math.min(6, attributes(team, row)[1] + 1))
    next = quickEdit(team, rows, 'Backquote', true, kinds)! // weight, down
    for (const row of rows) expect(attributes(next, row)[0]).toBe(Math.max(0, attributes(team, row)[0] - 1))
    expect(attributes(quickEdit(team, rows, 'Backslash', false, kinds)!, rows[0])[13]).toBe(attributes(team, rows[0])[13] + 1)

    // A rating stops at the top value the game expects, unless all values are allowed.
    let top = team
    for (let i = 0; i < 20; i++) top = quickEdit(top, [rows[0]], 'Digit2', false, kinds)!
    expect(attributes(top, rows[0])[2]).toBe(6)
    for (let i = 0; i < 20; i++) top = quickEdit(top, [rows[0]], 'Digit2', false, () => null)!
    expect(attributes(top, rows[0])[2]).toBe(15)

    const jersey = (t: typeof team) => t.players[rows[0]].jersey
    const low = { ...team, players: team.players.map((p, i) => (i === rows[0] ? { ...p, jersey: 0x09 } : p)) }
    expect(jersey(quickEdit(low, [rows[0]], 'NumpadAdd', false, kinds)!)).toBe(0x10)
    const zero = { ...team, players: team.players.map((p, i) => (i === rows[0] ? { ...p, jersey: 0 } : p)) }
    expect(jersey(quickEdit(zero, [rows[0]], 'NumpadSubtract', false, kinds)!)).toBe(0x99)

    expect(quickEdit(team, rows, 'KeyA', false, kinds)).toBeNull()
  })
})
