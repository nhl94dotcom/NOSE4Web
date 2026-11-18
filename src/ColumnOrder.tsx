import { useState } from 'react'
import { defaultOrder, DEFAULT_ORDER_NAMES, groupLabels, moveColumn, type AttributeGroup } from './core/columnorder'
import type { GameConfig } from './core/games'
import { setAttributeOrder, useAttributeOrder } from './useColumnOrder'

// One group's columns, each with buttons to move it up or down.
export function ColumnOrderList({ game, group }: { game: GameConfig; group: AttributeGroup }) {
  const order = useAttributeOrder(game, group)
  const labels = groupLabels(game, group)
  const names = group === 'goalies' ? game.goalieAttributeNames : game.playerAttributeNames
  const isDefault = order.join() === defaultOrder(labels, DEFAULT_ORDER_NAMES[group]).join()
  const title = group === 'goalies' ? 'Goalies' : 'Skaters'
  return (
    <div className="column-order">
      <strong>{title}</strong>
      <ol aria-label={`${title} column order`}>
        {order.map((at, position) => (
          <li key={`${at}`}>
            <span title={names[at]}>{labels[at]}</span>{' '}
            <button
              aria-label={`Move ${names[at]} up`}
              disabled={position === 0}
              onClick={() => setAttributeOrder(game, group, moveColumn(order, position, -1))}
            >
              ↑
            </button>
            <button
              aria-label={`Move ${names[at]} down`}
              disabled={position === order.length - 1}
              onClick={() => setAttributeOrder(game, group, moveColumn(order, position, 1))}
            >
              ↓
            </button>
          </li>
        ))}
      </ol>
      <button disabled={isDefault} onClick={() => setAttributeOrder(game, group, null)}>
        Reset to default
      </button>
    </div>
  )
}

// Both groups' column order, for the panel a Columns button opens.
export function ColumnOrderLists({ game }: { game: GameConfig }) {
  return (
    <div className="column-orders">
      <ColumnOrderList game={game} group="skaters" />
      <ColumnOrderList game={game} group="goalies" />
    </div>
  )
}

// A button that opens the order of the attribute columns, the same on every page.
export function ColumnOrderButton({ game }: { game: GameConfig }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="column-control">
      <button aria-expanded={open} onClick={() => setOpen(!open)}>
        Columns…
      </button>{' '}
      <span className="note">Choose the order of the attribute columns.</span>
      {open && (
        <div className="column-panel" role="group" aria-label="Order of the attribute columns">
          <p className="note">The order of the attribute columns on every page. The ROM keeps its own order.</p>
          <ColumnOrderLists game={game} />
          <button onClick={() => setOpen(false)}>Close</button>
        </div>
      )}
    </div>
  )
}
