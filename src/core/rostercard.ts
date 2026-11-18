import { attributeText, isHandedFighting, isRating, isWeight, shootsRight, stickHandling95Step, type AttributeKind } from './attributes'
import type { GameConfig } from './games'
import { overallRating } from './rating'
import { goalieCount, type Team } from './team'

// The choices for a team's roster card: how each group is sorted, how the
// attributes are written and which columns it has.

// A sort by one attribute is 'attribute:' and its place in the game's order.
export type CardSort = 'roster' | 'number' | 'position' | 'name' | 'lastName' | 'overall' | `attribute:${number}`

// 'shown': as the editor's tables show them (63-80, 180 pounds). 'ratings':
// each rating as the game's own step from 0 to 6. 'stored': every value as
// the number kept in the ROM, 0 to 15.
export type CardScale = 'shown' | 'ratings' | 'stored'

export interface CardGroupSort {
  by: CardSort
  // The other way round from the sort's usual way (best first for ratings, A to Z for names).
  reverse: boolean
}

export interface RosterCardOptions {
  skaters: CardGroupSort
  goalies: CardGroupSort
  scale: CardScale
  overall: boolean
}

export const DEFAULT_CARD_OPTIONS: RosterCardOptions = {
  skaters: { by: 'roster', reverse: false },
  goalies: { by: 'roster', reverse: false },
  scale: 'shown',
  overall: true,
}

export const CARD_SCALES: { value: CardScale; label: string }[] = [
  { value: 'shown', label: 'As shown in NOSE4Web (25 to 99)' },
  { value: 'ratings', label: 'Ratings 0-6 as the game stores them' },
  { value: 'stored', label: 'Values stored in the ROM (0-15)' },
]

// The sorts a group can have: the fixed ones, then each attribute in the order given.
export function cardSorts(game: GameConfig, goalies: boolean, order: number[]): { value: CardSort; label: string }[] {
  const names = goalies ? game.goalieAttributeNames : game.playerAttributeNames
  const kinds = goalies ? game.goalieAttributeKinds : game.playerAttributeKinds
  return [
    { value: 'roster', label: 'Roster order' },
    { value: 'number', label: 'Jersey number' },
    ...(goalies ? [] : [{ value: 'position' as CardSort, label: 'Position (forwards, then defence)' }]),
    { value: 'name', label: 'First name' },
    { value: 'lastName', label: 'Last name' },
    { value: 'overall', label: 'Overall rating, best first' },
    // Values the game leaves at zero are not worth sorting by.
    ...order
      .filter((a) => kinds[a] !== 'zero')
      .map((a) => ({ value: `attribute:${a}` as CardSort, label: `${names[a]}, ${isWeight(kinds[a]) ? 'heaviest' : 'highest'} first` })),
  ]
}

const jerseyNumber = (jersey: number) => (jersey >> 4) * 10 + (jersey & 0x0f)
const lastName = (name: string) => {
  const trimmed = name.trim().toLowerCase()
  return `${trimmed.slice(trimmed.lastIndexOf(' ') + 1)} ${trimmed}`
}

// The roster places of a group's players, in the order the card lists them.
// Players that sort the same keep their roster order, whichever way round.
export function cardRows(game: GameConfig, team: Team, goalies: boolean, sort: CardGroupSort): number[] {
  const first = goalies ? 0 : goalieCount(team)
  const last = goalies ? goalieCount(team) : team.players.length
  const rows = Array.from({ length: last - first }, (_, i) => first + i)
  const player = (index: number) => team.players[index]
  const attribute = sort.by.startsWith('attribute:') ? Number(sort.by.slice('attribute:'.length)) : -1
  // Each key sorts its usual way when low comes first.
  const key = (index: number): number | string => {
    switch (sort.by) {
      case 'roster':
        return index
      case 'number':
        return jerseyNumber(player(index).jersey)
      case 'position':
        return index - first < team.forwards ? 0 : 1
      case 'name':
        return player(index).name.trim().toLowerCase()
      case 'lastName':
        return lastName(player(index).name)
      case 'overall':
        return -overallRating(player(index).attributes, goalies, game)
      default:
        return -(player(index).attributes[attribute] ?? 0)
    }
  }
  const direction = sort.reverse ? -1 : 1
  return rows.sort((a, b) => {
    const [x, y] = [key(a), key(b)]
    return x < y ? -direction : x > y ? direction : a - b
  })
}

// An attribute as the card writes it.
export function cardValueText(kind: AttributeKind, value: number, scale: CardScale): string {
  if (scale === 'stored') return String(value)
  if (scale === 'ratings') {
    if (isRating(kind)) return value <= 6 ? String(value) : `!${value}`
    if (kind === 'stickHandling95') return String(stickHandling95Step(value))
    if (isHandedFighting(kind)) return `${shootsRight(kind, value) ? 'R' : 'L'}/${value >> 1}`
  }
  return attributeText(kind, value) ?? `!${value}`
}

// Choices kept from an earlier visit, each checked, falling back to the default.
export function validCardOptions(saved: unknown): RosterCardOptions {
  const given = (saved ?? {}) as Partial<Record<keyof RosterCardOptions, unknown>>
  const sortOf = (value: unknown, fallback: CardGroupSort): CardGroupSort => {
    const sort = (value ?? {}) as Partial<Record<keyof CardGroupSort, unknown>>
    const fixed = ['roster', 'number', 'position', 'name', 'lastName', 'overall']
    const by = typeof sort.by === 'string' && (fixed.includes(sort.by) || /^attribute:\d{1,2}$/.test(sort.by)) ? (sort.by as CardSort) : fallback.by
    return { by, reverse: typeof sort.reverse === 'boolean' ? sort.reverse : fallback.reverse }
  }
  return {
    skaters: sortOf(given.skaters, DEFAULT_CARD_OPTIONS.skaters),
    goalies: sortOf(given.goalies, DEFAULT_CARD_OPTIONS.goalies),
    scale: CARD_SCALES.some((scale) => scale.value === given.scale) ? (given.scale as CardScale) : DEFAULT_CARD_OPTIONS.scale,
    overall: typeof given.overall === 'boolean' ? given.overall : DEFAULT_CARD_OPTIONS.overall,
  }
}

// A group's sort as this game can use it: one by an attribute it does not have is roster order.
export function usableSort(game: GameConfig, goalies: boolean, sort: CardGroupSort, order: number[]): CardGroupSort {
  return cardSorts(game, goalies, order).some((s) => s.value === sort.by) ? sort : { by: 'roster', reverse: sort.reverse }
}
