import type { GameConfig } from './games'

// The order the attribute columns are shown in. The editor's tables, and the
// players table of exported spreadsheet files (in the skaters' order), follow
// it; the ROM keeps the game's own order, and files are read by their headings.

export type AttributeGroup = 'skaters' | 'goalies'

// The league's order, by the column headings the NHL 94 Genesis tables show.
// Name, position and number come first as before.
export const DEFAULT_ORDER_NAMES: Record<AttributeGroup, string[]> = {
  skaters: ['Wgt', 'Chk', 'Spd', 'Agl', 'Shp', 'Sha', 'Sth', 'Pas', 'Ofa', 'Dfa', 'End', 'Agr', 'Rgh'],
  goalies: ['Wgt', 'Pcl', 'Spd', 'Agl', 'Ofa', 'Dfa', 'Str', 'Stl', 'Glr', 'Gll'],
}

// The league's names for goalie columns the games head another way: puck
// control is PkC, and the glove sides are GvR and GvL.
const ALIASES: Record<string, string> = { pcl: 'pkc', glr: 'gvr', gll: 'gvl' }

export const groupLabels = (game: GameConfig, group: AttributeGroup): string[] =>
  group === 'goalies' ? game.goalieAttributeLabels : game.playerAttributeLabels

// Where each wanted name is among a game's headings, case aside; -1 where it is not.
function findNames(labels: string[], names: string[]): number[] {
  const lower = labels.map((label) => label.toLowerCase())
  return names.map((name) => {
    const key = name.toLowerCase()
    const at = lower.indexOf(key)
    return at >= 0 ? at : ALIASES[key] ? lower.indexOf(ALIASES[key]) : -1
  })
}

// The default order of a game's columns, as attribute places: the league's
// names in its order, then whatever else the game has, in the game's order.
export function defaultOrder(labels: string[], names: string[]): number[] {
  const found = findNames(labels, names).filter((at, i, all) => at >= 0 && all.indexOf(at) === i)
  return [...found, ...labels.map((_, i) => i).filter((i) => !found.includes(i))]
}

// The league's names that a game has no column for.
export const missingNames = (labels: string[], names: string[]): string[] =>
  names.filter((_, i) => findNames(labels, names)[i] < 0)

// A saved order, if it is one: every place from 0 to count - 1, each once.
export function validOrder(saved: unknown, count: number): number[] | null {
  if (!Array.isArray(saved) || saved.length !== count) return null
  const seen = new Set<number>()
  for (const at of saved) {
    if (!Number.isInteger(at) || at < 0 || at >= count || seen.has(at)) return null
    seen.add(at)
  }
  return saved as number[]
}

// Games whose columns are headed the same share one order.
export const orderKey = (group: AttributeGroup, labels: string[]): string => `nose4web.columnOrder.${group}.${labels.join(',')}`

export interface OrderStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

// The order kept in a browser's storage, or the default where none is kept or it no longer fits.
export function loadOrder(storage: OrderStorage | null, group: AttributeGroup, labels: string[]): number[] {
  try {
    const saved: unknown = JSON.parse(storage?.getItem(orderKey(group, labels)) ?? 'null')
    return validOrder(saved, labels.length) ?? defaultOrder(labels, DEFAULT_ORDER_NAMES[group])
  } catch {
    return defaultOrder(labels, DEFAULT_ORDER_NAMES[group])
  }
}

// Keeps an order, or forgets it (null) to go back to the default.
export function saveOrder(storage: OrderStorage | null, group: AttributeGroup, labels: string[], order: number[] | null): void {
  try {
    if (order === null) storage?.removeItem(orderKey(group, labels))
    else storage?.setItem(orderKey(group, labels), JSON.stringify(order))
  } catch {
    // Not kept; the order still holds while the page is open.
  }
}

// An order with the column at `position` moved one place up (-1) or down (1).
export function moveColumn(order: number[], position: number, step: -1 | 1): number[] {
  const to = position + step
  if (position < 0 || position >= order.length || to < 0 || to >= order.length) return order
  const next = order.slice()
  next.splice(to, 0, ...next.splice(position, 1))
  return next
}
