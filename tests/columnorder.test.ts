import { describe, expect, it } from 'vitest'
import {
  defaultOrder,
  DEFAULT_ORDER_NAMES,
  groupLabels,
  loadOrder,
  missingNames,
  moveColumn,
  orderKey,
  saveOrder,
  validOrder,
  type OrderStorage,
} from '../src/core/columnorder'
import { NHL94, NHL94_EVO, NHL94_SNES, NHL95 } from '../src/core/games'

const memory = (): OrderStorage & { items: Map<string, string> } => {
  const items = new Map<string, string>()
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  }
}
const shown = (labels: string[], order: number[]) => order.map((at) => labels[at])

describe('attribute column order', () => {
  it("puts the league's skater order first and the hand and fighting after it", () => {
    for (const game of [NHL94, NHL94_SNES, NHL95, NHL94_EVO]) {
      const labels = groupLabels(game, 'skaters')
      expect(shown(labels, defaultOrder(labels, DEFAULT_ORDER_NAMES.skaters))).toEqual([
        'Wgt', 'Chk', 'Spd', 'Agl', 'ShP', 'ShA', 'StH', 'Pas', 'OfA', 'DfA', 'End', 'Agr', 'Rgh', 'H/F',
      ])
      expect(missingNames(labels, DEFAULT_ORDER_NAMES.skaters)).toEqual([])
    }
  })

  it('finds the goalie names the games head another way, and puts the unused values last', () => {
    const labels = groupLabels(NHL94, 'goalies')
    expect(shown(labels, defaultOrder(labels, DEFAULT_ORDER_NAMES.goalies))).toEqual([
      'Wgt', 'PkC', 'Spd', 'Agl', 'OfA', 'DfA', 'StR', 'StL', 'GvR', 'GvL', 'L@0', 'GlH', 'L@0', 'L@0',
    ])
    expect(defaultOrder(labels, DEFAULT_ORDER_NAMES.goalies).slice(10)).toEqual([6, 7, 8, 9])
    expect(missingNames(labels, DEFAULT_ORDER_NAMES.goalies)).toEqual([])
    const evo = groupLabels(NHL94_EVO, 'goalies')
    expect(shown(evo, defaultOrder(evo, DEFAULT_ORDER_NAMES.goalies)).slice(10)).toEqual(['G7', 'GlH', 'G9', 'G10'])
  })

  it('appends what a game has that the list does not name, and reports names it lacks', () => {
    const labels = ['Spd', 'Foo', 'Wgt', 'Bar']
    expect(defaultOrder(labels, ['wgt', 'spd', 'Chk'])).toEqual([2, 0, 1, 3])
    expect(missingNames(labels, ['wgt', 'spd', 'Chk'])).toEqual(['Chk'])
  })

  it('takes only a saved order that names every column once', () => {
    expect(validOrder([2, 0, 1], 3)).toEqual([2, 0, 1])
    expect(validOrder([2, 0], 3)).toBeNull()
    expect(validOrder([2, 2, 1], 3)).toBeNull()
    expect(validOrder([0, 1, 3], 3)).toBeNull()
    expect(validOrder([0, 1.5, 2], 3)).toBeNull()
    expect(validOrder('0,1,2', 3)).toBeNull()
  })

  it('keeps an order in storage, falls back to the default, and resets', () => {
    const storage = memory()
    const labels = groupLabels(NHL94, 'skaters')
    const standard = defaultOrder(labels, DEFAULT_ORDER_NAMES.skaters)
    expect(loadOrder(storage, 'skaters', labels)).toEqual(standard)
    const mine = moveColumn(standard, 0, 1)
    saveOrder(storage, 'skaters', labels, mine)
    expect(loadOrder(storage, 'skaters', labels)).toEqual(mine)
    // The goalies keep their own.
    expect(loadOrder(storage, 'goalies', groupLabels(NHL94, 'goalies'))).toEqual(defaultOrder(groupLabels(NHL94, 'goalies'), DEFAULT_ORDER_NAMES.goalies))
    saveOrder(storage, 'skaters', labels, null)
    expect(loadOrder(storage, 'skaters', labels)).toEqual(standard)

    // Something broken or out of date is set aside.
    storage.setItem(orderKey('skaters', labels), '[0,1,2]')
    expect(loadOrder(storage, 'skaters', labels)).toEqual(standard)
    storage.setItem(orderKey('skaters', labels), 'not json')
    expect(loadOrder(storage, 'skaters', labels)).toEqual(standard)
    // A browser that keeps nothing.
    const refusing: OrderStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {},
    }
    expect(loadOrder(refusing, 'skaters', labels)).toEqual(standard)
    expect(() => saveOrder(refusing, 'skaters', labels, mine)).not.toThrow()
    expect(loadOrder(null, 'skaters', labels)).toEqual(standard)
  })

  it('shares one order between games headed the same, and keeps EVO goalies apart', () => {
    expect(orderKey('skaters', groupLabels(NHL94, 'skaters'))).toBe(orderKey('skaters', groupLabels(NHL95, 'skaters')))
    expect(orderKey('goalies', groupLabels(NHL94, 'goalies'))).not.toBe(orderKey('goalies', groupLabels(NHL94_EVO, 'goalies')))
  })

  it('moves a column one place, and not past either end', () => {
    expect(moveColumn([0, 1, 2], 1, -1)).toEqual([1, 0, 2])
    expect(moveColumn([0, 1, 2], 1, 1)).toEqual([0, 2, 1])
    expect(moveColumn([0, 1, 2], 0, -1)).toEqual([0, 1, 2])
    expect(moveColumn([0, 1, 2], 2, 1)).toEqual([0, 1, 2])
  })
})
