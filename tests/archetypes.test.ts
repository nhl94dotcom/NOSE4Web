import { describe, expect, it } from 'vitest'
import { attributeText, shootsRight } from '../src/core/attributes'
import { GOALIE_ARCHETYPES, LEVELS, madeAttributes, SKATER_ARCHETYPES } from '../src/core/archetypes'
import { NHL94, NHL94_EVO, NHL94_SNES, NHL95, type GameConfig } from '../src/core/games'
import { overallRating } from '../src/core/rating'

// A steady "random" for tests: the same numbers each run.
function steady(seed = 1) {
  let x = seed
  return () => {
    x = (x * 16807) % 2147483647
    return (x - 1) / 2147483646
  }
}

const WIDE: GameConfig = {
  ...NHL94,
  playerAttributeKinds: NHL94.playerAttributeKinds.map((k) => (k === 'rating' ? 'value' : k)),
  goalieAttributeKinds: NHL94.goalieAttributeKinds.map((k) => (k === 'rating' ? 'value' : k)),
}
const GAMES: [string, GameConfig][] = [
  ['NHL 94', NHL94],
  ['SNES', NHL94_SNES],
  ["NHL '95", NHL95],
  ['wide ratings', WIDE],
  ['EVO', NHL94_EVO],
]
const star = LEVELS.find((l) => l.value === 'star')!
const weak = LEVELS.find((l) => l.value === 'weak')!
const skater = (game: GameConfig) => new Array<number>(game.playerAttributeKinds.length).fill(1)

describe('made-up attributes', () => {
  for (const [name, game] of GAMES) {
    it(`${name}: every archetype, level and random one is a value the game can hold`, () => {
      const random = steady()
      for (const isGoalie of [false, true]) {
        const kinds = isGoalie ? game.goalieAttributeKinds : game.playerAttributeKinds
        for (const make of [...(isGoalie ? GOALIE_ARCHETYPES : SKATER_ARCHETYPES).map((archetype) => ({ archetype })), { random: true as const }])
          for (const level of LEVELS) {
            const made = madeAttributes(game, isGoalie, skater(game), make, level, random)
            expect(made).toHaveLength(kinds.length)
            made.forEach((v, i) => expect(attributeText(kinds[i], v), `${kinds[i]} ${v}`).not.toBeNull())
          }
      }
    })
  }

  it('a higher level makes a better player, for every archetype', () => {
    for (const game of [NHL94, NHL94_SNES, NHL95])
      for (const [isGoalie, list] of [[false, SKATER_ARCHETYPES], [true, GOALIE_ARCHETYPES]] as const)
        for (const archetype of list) {
          const overall = (level: (typeof LEVELS)[number]) =>
            overallRating(madeAttributes(game, isGoalie, skater(game), { archetype }, level, () => 0.5), isGoalie, game)
          expect(overall(star), `${archetype.label}`).toBeGreaterThan(overall(weak))
        }
  })

  it('an archetype has its strengths: a sniper shoots straighter than an enforcer, who fights more and weighs more', () => {
    const at = (value: string) =>
      madeAttributes(NHL94, false, skater(NHL94), { archetype: SKATER_ARCHETYPES.find((a) => a.value === value)! }, star, () => 0.5)
    const [sniper, enforcer] = [at('sniper'), at('enforcer')]
    expect(sniper[9]).toBeGreaterThan(enforcer[9]) // ShA
    expect(enforcer[7] >> 1).toBe(7) // fighting 100
    expect(enforcer[0]).toBeGreaterThan(sniper[0]) // weight
    // Aggression stays in the lower half, where the original game does not wrap it round.
    expect(enforcer[13]).toBeLessThanOrEqual(3)
  })

  it('an archetype keeps his shooting and glove hand; random may change them', () => {
    const lefty = skater(NHL94).map((v, i) => (i === 7 ? 4 : v)) // shoots left
    const made = madeAttributes(NHL94, false, lefty, { archetype: SKATER_ARCHETYPES[1] }, star, steady())
    expect(shootsRight('handedFighting', made[7])).toBe(false)
    const ninetyFive = madeAttributes(NHL95, false, skater(NHL95).map((v, i) => (i === 7 ? 2 : v)), { archetype: SKATER_ARCHETYPES[1] }, star, steady())
    expect(shootsRight('handedFighting93', ninetyFive[7])).toBe(true)
    const goalie = new Array<number>(14).fill(2).map((v, i) => (i === 7 ? 1 : v))
    expect(madeAttributes(NHL94, true, goalie, { archetype: GOALIE_ARCHETYPES[0] }, star)[7]).toBe(1)
  })

  it('EVO: the values whose meaning is not known are left as they are', () => {
    const goalie = [3, 3, 3, 3, 3, 3, 9, 1, 8, 7, 3, 3, 3, 3]
    const made = madeAttributes(NHL94_EVO, true, goalie, { random: true }, star, steady())
    expect([made[6], made[7], made[8], made[9]]).toEqual([9, 1, 8, 7])
  })
})
