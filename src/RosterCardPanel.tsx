import { useState } from 'react'
import { isRating } from './core/attributes'
import type { GameConfig } from './core/games'
import { CARD_SCALES, cardSorts, usableSort, validCardOptions, type CardGroupSort, type CardScale, type CardSort, type RosterCardOptions } from './core/rostercard'
import { ColumnOrderLists } from './ColumnOrder'
import type { RosterCardLayout } from './rosterCard'
import { useAttributeOrder } from './useColumnOrder'

const KEY = 'nose4web.rosterCard'

function load(): RosterCardOptions {
  try {
    return validCardOptions(JSON.parse(window.localStorage.getItem(KEY) ?? 'null'))
  } catch {
    return validCardOptions(null)
  }
}

// The roster card's choices, kept in this browser between visits.
function useCardOptions(): [RosterCardOptions, (next: RosterCardOptions) => void] {
  const [options, setOptions] = useState(load)
  const set = (next: RosterCardOptions) => {
    setOptions(next)
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      // Not kept; the choice still holds while the page is open.
    }
  }
  return [options, set]
}

// The button for the roster card, and the choices it opens before the card is made.
export function RosterCardPanel({ game, onMake }: { game: GameConfig; onMake: (layout: RosterCardLayout) => void }) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useCardOptions()
  const skaterOrder = useAttributeOrder(game, 'skaters')
  const goalieOrder = useAttributeOrder(game, 'goalies')
  const storedOnly = !game.playerAttributeKinds.some(isRating)

  const sortPicker = (goalies: boolean) => {
    const order = goalies ? goalieOrder : skaterOrder
    const group = goalies ? 'goalies' : 'skaters'
    const sort = usableSort(game, goalies, options[group], order)
    const setSort = (next: CardGroupSort) => setOptions({ ...options, [group]: next })
    const title = goalies ? 'Goalies' : 'Skaters'
    return (
      <p>
        <label>
          Sort {title.toLowerCase()} by{' '}
          <select className="wide" aria-label={`Sort ${title.toLowerCase()} by`} value={sort.by} onChange={(e) => setSort({ ...sort, by: e.target.value as CardSort })}>
            {cardSorts(game, goalies, order).map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>{' '}
        <label>
          <input type="checkbox" checked={sort.reverse} onChange={(e) => setSort({ ...sort, reverse: e.target.checked })} /> Reverse{' '}
          {title.toLowerCase()}
        </label>
      </p>
    )
  }

  return (
    <div>
      <p>
        <button aria-expanded={open} onClick={() => setOpen(!open)}>
          Roster card (PNG)…
        </button>{' '}
        <span className="note">The roster as a picture, to post where the league can see it.</span>
      </p>
      {open && (
        <div className="card-options" role="group" aria-label="Roster card choices">
          {sortPicker(false)}
          {sortPicker(true)}
          <p>
            {!storedOnly && (
              <label>
                Ratings{' '}
                <select className="wide" aria-label="Ratings on the card" value={options.scale} onChange={(e) => setOptions({ ...options, scale: e.target.value as CardScale })}>
                  {CARD_SCALES.map((scale) => (
                    <option key={scale.value} value={scale.value}>
                      {scale.label}
                    </option>
                  ))}
                </select>
              </label>
            )}{' '}
            <label>
              <input type="checkbox" checked={options.overall} onChange={(e) => setOptions({ ...options, overall: e.target.checked })} /> Show
              overall
            </label>
          </p>
          <p className="note">Column order, the same as on the editor's pages:</p>
          <ColumnOrderLists game={game} />
          <p>
            <button onClick={() => onMake({ ...options, skaterOrder, goalieOrder })}>Make card</button>{' '}
            <button onClick={() => setOpen(false)}>Close</button>{' '}
            <span className="note">These choices are kept in this browser.</span>
          </p>
        </div>
      )}
    </div>
  )
}
