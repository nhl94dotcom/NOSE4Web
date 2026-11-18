import { describe, expect, it } from 'vitest'
import { defaultOrder, DEFAULT_ORDER_NAMES } from '../src/core/columnorder'
import { NHL94, NHL94_EVO, NHL95 } from '../src/core/games'
import { cardRows, cardSorts, cardValueText, DEFAULT_CARD_OPTIONS, usableSort, validCardOptions } from '../src/core/rostercard'
import type { Player, Team } from '../src/core/team'

const player = (name: string, jersey: number, speed: number): Player =>
  ({ name, jersey, attributes: [4, 3, speed, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3] }) as Player
// Two goalies, three forwards, two defencemen.
const team = {
  goalieNibbles: [1, 1, 0, 0],
  forwards: 3,
  defense: 2,
  players: [
    player('Zed Goalie', 0x30, 2),
    player('Al Goalie', 0x01, 5),
    player('Wayne Gretzky', 0x99, 6),
    player('Bob Adams', 0x12, 1),
    player('Cy Young', 0x12, 4),
    player('Dan Defence', 0x02, 3),
    player('Al Back', 0x44, 6),
  ],
} as Team
const names = (rows: number[]) => rows.map((i) => team.players[i].name)

describe('roster card sorting', () => {
  it('keeps goalies and skaters apart, each in roster order by default', () => {
    expect(cardRows(NHL94, team, true, DEFAULT_CARD_OPTIONS.goalies)).toEqual([0, 1])
    expect(cardRows(NHL94, team, false, DEFAULT_CARD_OPTIONS.skaters)).toEqual([2, 3, 4, 5, 6])
  })

  it('sorts by number, name, last name and position, either way round, ties in roster order', () => {
    expect(cardRows(NHL94, team, false, { by: 'number', reverse: false })).toEqual([5, 3, 4, 6, 2])
    expect(cardRows(NHL94, team, false, { by: 'number', reverse: true })).toEqual([2, 6, 3, 4, 5])
    expect(names(cardRows(NHL94, team, false, { by: 'name', reverse: false }))).toEqual(['Al Back', 'Bob Adams', 'Cy Young', 'Dan Defence', 'Wayne Gretzky'])
    expect(names(cardRows(NHL94, team, false, { by: 'lastName', reverse: false }))).toEqual(['Bob Adams', 'Al Back', 'Dan Defence', 'Wayne Gretzky', 'Cy Young'])
    expect(cardRows(NHL94, team, false, { by: 'position', reverse: true })).toEqual([5, 6, 2, 3, 4])
    expect(names(cardRows(NHL94, team, true, { by: 'name', reverse: false }))).toEqual(['Al Goalie', 'Zed Goalie'])
  })

  it('sorts by overall or an attribute best first, or lowest first reversed', () => {
    expect(cardRows(NHL94, team, false, { by: 'attribute:2', reverse: false })).toEqual([2, 6, 4, 5, 3])
    expect(cardRows(NHL94, team, false, { by: 'attribute:2', reverse: true })).toEqual([3, 5, 4, 2, 6])
    const overall = cardRows(NHL94, team, false, { by: 'overall', reverse: false })
    expect(overall[0]).toBe(2)
    expect(overall.at(-1)).toBe(3)
  })

  it('offers each attribute to sort by in the column order, leaving out the values kept at zero', () => {
    const order = defaultOrder(NHL94.goalieAttributeLabels, DEFAULT_ORDER_NAMES.goalies)
    const sorts = cardSorts(NHL94, true, order).map((sort) => sort.value)
    expect(sorts.slice(0, 7)).toEqual(['roster', 'number', 'name', 'lastName', 'overall', 'attribute:0', 'attribute:5'])
    expect(sorts).not.toContain('attribute:6')
    expect(cardSorts(NHL94, false, [0, 1]).map((sort) => sort.value)).toContain('position')
    // A sort by a value the game keeps at zero is roster order.
    expect(usableSort(NHL94, true, { by: 'attribute:6', reverse: true }, order)).toEqual({ by: 'roster', reverse: true })
    expect(usableSort(NHL94_EVO, true, { by: 'attribute:6', reverse: false }, order)).toEqual({ by: 'attribute:6', reverse: false })
  })
})

describe('roster card scale', () => {
  it("writes ratings as shown, as the game's 0 to 6, or as stored", () => {
    expect(cardValueText('rating', 4, 'shown')).toBe('63-80')
    expect(cardValueText('rating', 4, 'ratings')).toBe('4')
    expect(cardValueText('rating', 4, 'stored')).toBe('4')
    expect(cardValueText('rating', 9, 'ratings')).toBe('!9')
    expect(cardValueText('snesRating', 6, 'ratings')).toBe('6')
    // Weights stay in pounds unless the stored value is asked for.
    expect(cardValueText('weight', 5, 'ratings')).toBe('180')
    expect(cardValueText('weight', 5, 'stored')).toBe('5')
    // Hand and fighting as the hand and the fighting step.
    expect(cardValueText('handedFighting', 9, 'shown')).toBe('R/57')
    expect(cardValueText('handedFighting', 9, 'ratings')).toBe('R/4')
    expect(cardValueText('handedFighting', 9, 'stored')).toBe('9')
    expect(cardValueText(NHL95.playerAttributeKinds[7], 8, 'ratings')).toBe('R/4')
    // NHL '95's stick handling folded to its step.
    expect(cardValueText('stickHandling95', 12, 'ratings')).toBe('5')
    expect(cardValueText('gloveHand', 1, 'ratings')).toBe('R')
  })

  it('reads kept choices, falling back to the default for anything unknown', () => {
    expect(validCardOptions(null)).toEqual(DEFAULT_CARD_OPTIONS)
    expect(validCardOptions({ scale: 'huge', overall: 'yes', skaters: { by: 'height' } })).toEqual(DEFAULT_CARD_OPTIONS)
    const kept = { skaters: { by: 'attribute:6', reverse: true }, goalies: { by: 'name', reverse: false }, scale: 'ratings', overall: false }
    expect(validCardOptions(kept)).toEqual(kept)
  })
})
