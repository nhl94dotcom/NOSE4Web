import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { attributeText } from '../src/core/attributes'
import { openRom } from '../src/core/rom'
import { goalieCount } from '../src/core/team'

const romPath = fileURLToPath(new URL('../../nhl94.bin', import.meta.url))

it('describes attribute values', () => {
  expect(attributeText('weight', 4)).toBe('172')
  expect(attributeText('rating', 6)).toBe('99')
  expect(attributeText('rating', 7)).toBeNull()
  expect(attributeText('handedFighting', 0)).toBe('L/0')
  expect(attributeText('handedFighting', 9)).toBe('R/57')
  expect(attributeText('gloveHand', 1)).toBe('R')
  expect(attributeText('zero', 3)).toBeNull()
})

it.skipIf(!existsSync(romPath))('has text for every attribute value in the base ROM', () => {
  const { game, teams } = openRom(new Uint8Array(readFileSync(romPath)))
  const unexpected: string[] = []
  for (const team of teams) {
    team.players.forEach((player, index) => {
      const kinds = index < goalieCount(team) ? game.goalieAttributeKinds : game.playerAttributeKinds
      player.attributes.forEach((value, a) => {
        if (attributeText(kinds[a], value) === null) unexpected.push(`${team.names[0]} ${player.name} #${a}=${value}`)
      })
    })
  }
  expect(unexpected).toEqual([])
})
