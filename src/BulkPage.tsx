import { useState } from 'react'
import {
  applyBulk,
  BULK_ACTIONS,
  BULK_GROUPS,
  bulkAttributes,
  bulkValues,
  previewBulk,
  type BulkAction,
  type BulkChange,
  type BulkGroup,
} from './core/bulk'
import type { RomProject } from './core/rom'
import { teamLabels } from './core/team'

const PREVIEW_LIMIT = 300
const optionalNumber = (text: string) => (text.trim() === '' || Number.isNaN(Number(text)) ? null : Number(text))

interface Props {
  project: RomProject
  onChange: (project: RomProject) => void
}

export function BulkPage({ project, onChange }: Props) {
  const [group, setGroup] = useState<BulkGroup>('skaters')
  const [team, setTeam] = useState<number | null>(null)
  const [attribute, setAttribute] = useState(-1)
  const [action, setAction] = useState<BulkAction>('raise')
  const [amount, setAmount] = useState(1)
  const [atLeast, setAtLeast] = useState('')
  const [atMost, setAtMost] = useState('')
  const [notice, setNotice] = useState('')

  const attributes = bulkAttributes(project.game, group)
  // Goalies and skaters have different attributes, so the choice may not carry over.
  const chosen = attributes.find((a) => a.index === attribute) ?? attributes[0]
  const values = bulkValues(chosen.kind)
  const steps = action === 'raise' || action === 'lower'
  const change: BulkChange = {
    group,
    team,
    attribute: chosen.index,
    action,
    amount: steps ? Math.max(1, amount) : (values.find((v) => v.value === amount) ?? values[0]).value,
    overallAtLeast: optionalNumber(atLeast),
    overallAtMost: optionalNumber(atMost),
  }
  const effects = previewBulk(project, change)
  const names = teamLabels(project.teams, project.game)
  const text = (value: number) => values.find((v) => v.value === value)?.text ?? String(value)
  const people = (count: number) => (count === 1 ? '1 player' : `${count} players`)

  return (
    <main className="team help">
      <h2>Bulk changes</h2>
      <p className="note">
        Changes one attribute for many players at once. Nothing happens until you press Apply, and the list below
        shows exactly who would change first. Values stop at the ends of the attribute's range.
      </p>
      <div className="fields">
        <label>
          Who
          <select aria-label="Players to change" value={group} onChange={(e) => setGroup(e.target.value as BulkGroup)}>
            {BULK_GROUPS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          On
          <select className="wide" aria-label="Teams to change" value={team ?? ''} onChange={(e) => setTeam(e.target.value === '' ? null : Number(e.target.value))}>
            <option value="">Every team</option>
            {names.map((name, i) => (
              <option key={i} value={i}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Attribute
          <select className="wide" aria-label="Attribute to change" value={chosen.index} onChange={(e) => setAttribute(Number(e.target.value))}>
            {attributes.map((a) => (
              <option key={a.index} value={a.index}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="fields">
        <label>
          Change
          <select
            className="wide"
            aria-label="Kind of change"
            value={action}
            onChange={(e) => {
              setAction(e.target.value as BulkAction)
              setAmount(1)
            }}
          >
            {BULK_ACTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {steps ? 'Steps' : 'Value'}
          {steps ? (
            <input className="num" type="number" min={1} max={15} value={change.amount} onChange={(e) => setAmount(Number(e.target.value) || 1)} />
          ) : (
            <select aria-label="Value to use" value={change.amount} onChange={(e) => setAmount(Number(e.target.value))}>
              {values.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.text}
                </option>
              ))}
            </select>
          )}
        </label>
        <label>
          Only overall at least
          <input className="num" inputMode="numeric" placeholder="any" value={atLeast} onChange={(e) => setAtLeast(e.target.value)} />
        </label>
        <label>
          and at most
          <input className="num" inputMode="numeric" placeholder="any" value={atMost} onChange={(e) => setAtMost(e.target.value)} />
        </label>
      </div>
      <p className="note">
        {chosen.kind === 'rating'
          ? 'A rating has seven steps, shown as the range the game displays for each. One step is one of those.'
          : chosen.kind === 'value'
            ? 'This ROM uses all sixteen values, 0 to 15. One step is one value.'
            : 'Weight goes in steps of 8 pounds.'}
      </p>
      <p>
        <button
          disabled={effects.length === 0}
          onClick={() => {
            onChange(applyBulk(project, change))
            setNotice(`Changed ${people(effects.length)}. Undo puts them back.`)
          }}
        >
          Apply to {people(effects.length)}
        </button>{' '}
        <span className="note">{notice}</span>
      </p>
      {effects.length === 0 ? (
        <p>Nobody would change.</p>
      ) : (
        <table className="left">
          <thead>
            <tr>
              <th>Player</th>
              <th>Team</th>
              <th>Pos</th>
              <th>{chosen.name}</th>
              <th>Overall</th>
            </tr>
          </thead>
          <tbody>
            {effects.slice(0, PREVIEW_LIMIT).map((effect) => (
              <tr key={`${effect.team}-${effect.index}`}>
                <td>{effect.name}</td>
                <td>{names[effect.team]}</td>
                <td>{effect.role}</td>
                <td>
                  {text(effect.from)} to {text(effect.to)}
                </td>
                <td>
                  {effect.overallFrom === effect.overallTo ? effect.overallTo : `${effect.overallFrom} to ${effect.overallTo}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {effects.length > PREVIEW_LIMIT && (
        <p className="note">
          The first {PREVIEW_LIMIT} are shown; all {effects.length} would change.
        </p>
      )}
    </main>
  )
}
