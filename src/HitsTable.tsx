import { HITS_TO_EMPTY } from './core/hitstoempty'

// The knockdown and hold costs for a skater to be emptied by so many knockdowns, each row with a button that sets
// both. `knockdown` and `hold` are what is set now, to mark the row that matches.
export function HitsTable({ knockdown, hold, disabled, onUse }: { knockdown: number; hold: number; disabled: boolean; onUse: (knockdown: number, hold: number) => void }) {
  return (
    <div className="hits-table">
      <table>
        <caption>Knockdowns to empty a skater</caption>
        <thead>
          <tr>
            <th>Knockdowns</th>
            <th>Energy per knockdown</th>
            <th>Energy per hold</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {HITS_TO_EMPTY.map((row) => {
            const current = row.knockdown === knockdown && row.hold === hold
            return (
              <tr key={row.hits} className={current ? 'current' : undefined}>
                <td>{row.hits}</td>
                <td>{row.knockdown}</td>
                <td>{row.hold}</td>
                <td>
                  <button type="button" disabled={disabled || current} aria-label={`Use ${row.hits} knockdowns to empty a skater`} onClick={() => onUse(row.knockdown, row.hold)}>
                    {current ? 'Set' : 'Use'}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="note">
        Full energy is 4096. Each row splits it between that many knockdowns, a hold costing half of one; 3 is what
        Energy from hits only sets. For energy lost to hits alone, press Energy from hits only first, then pick a row.
        The game stops a skater's energy at 0, so a cost a little higher empties him just the same. He gets it back on
        the bench as usual.
      </p>
    </div>
  )
}
