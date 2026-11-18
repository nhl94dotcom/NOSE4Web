import { useSyncExternalStore } from 'react'
import { defaultOrder, DEFAULT_ORDER_NAMES, groupLabels, loadOrder, orderKey, saveOrder, type AttributeGroup, type OrderStorage } from './core/columnorder'
import type { GameConfig } from './core/games'

// One order for each set of columns, kept in this browser and shared by every
// table on the page, so that a change on one shows on all of them.
const orders = new Map<string, number[]>()
const listeners = new Set<() => void>()

function storage(): OrderStorage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function attributeOrder(game: GameConfig, group: AttributeGroup): number[] {
  const labels = groupLabels(game, group)
  const key = orderKey(group, labels)
  let order = orders.get(key)
  if (!order) {
    order = loadOrder(storage(), group, labels)
    orders.set(key, order)
  }
  return order
}

// Sets an order, or puts back the default (null).
export function setAttributeOrder(game: GameConfig, group: AttributeGroup, order: number[] | null): void {
  const labels = groupLabels(game, group)
  saveOrder(storage(), group, labels, order)
  orders.set(orderKey(group, labels), order ?? defaultOrder(labels, DEFAULT_ORDER_NAMES[group]))
  listeners.forEach((listener) => listener())
}

// The attribute places in the order to show them.
export function useAttributeOrder(game: GameConfig, group: AttributeGroup): number[] {
  const snapshot = () => attributeOrder(game, group)
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
