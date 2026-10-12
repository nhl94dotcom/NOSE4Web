import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { copiedPlayerCount, copyPlayers, pastePlayers } from '../src/core/clipboard'
import { openRom } from '../src/core/rom'
import { goalieCount } from '../src/core/team'

const romPath = fileURLToPath(new URL('../../nhl94.bin', import.meta.url))

describe.skipIf(!existsSync(romPath))('copying players', () => {
  // Called inside each test: the body of a skipped group still runs, and
  // without a ROM there is nothing to open.
  function setup() {
    const [anaheim, boston] = openRom(new Uint8Array(readFileSync(romPath))).teams
    return { anaheim, boston, skater: goalieCount(boston) } // skater: Boston's first
  }

  it('pastes players into another team', () => {
    const { anaheim, boston, skater } = setup()
    const text = copyPlayers(boston, [skater, skater + 1])
    expect(copiedPlayerCount(text)).toBe(2)
    const target = goalieCount(anaheim) + 3
    const next = pastePlayers(anaheim, [target, target + 1], text, false)
    expect(next.players[target]).toEqual(boston.players[skater])
    expect(next.players[target + 1]).toEqual(boston.players[skater + 1])
    expect(next.players[target + 2]).toBe(anaheim.players[target + 2])
    expect(next.lines).toBe(anaheim.lines)
  })

  it('repeats the copied players over a longer selection', () => {
    const { anaheim, boston, skater } = setup()
    const text = copyPlayers(boston, [skater])
    const rows = [4, 5, 6]
    const next = pastePlayers(anaheim, rows, text, false)
    for (const row of rows) expect(next.players[row]).toEqual(boston.players[skater])
  })

  it('can paste attributes without the name and number', () => {
    const { anaheim, boston, skater } = setup()
    const next = pastePlayers(anaheim, [5], copyPlayers(boston, [skater]), true)
    expect(next.players[5]).toEqual({ ...anaheim.players[5], attributes: boston.players[skater].attributes })
  })

  it('keeps goalies and skaters apart, and rejects other clipboard text', () => {
    const { anaheim, boston, skater } = setup()
    expect(() => pastePlayers(anaheim, [0], copyPlayers(boston, [skater]), false)).toThrow(/Goalies can only be pasted over goalies/)
    expect(pastePlayers(anaheim, [1], copyPlayers(boston, [0]), false).players[1]).toEqual(boston.players[0])
    expect(() => pastePlayers(anaheim, [5], 'Patrick Roy', false)).toThrow('The clipboard does not hold copied players.')
    expect(() => pastePlayers(anaheim, [5], '{"format":"nose-web players","players":[{"name":"X"}]}', false)).toThrow(
      'The clipboard does not hold copied players.',
    )
    expect(() => pastePlayers(anaheim, [], copyPlayers(boston, [skater]), false)).toThrow(/Select the players/)
  })
})
