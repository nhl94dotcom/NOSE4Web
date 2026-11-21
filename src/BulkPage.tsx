import { useEffect, useState } from 'react'
import { applyBulk, BULK_ACTIONS, BULK_GROUPS, previewBulk } from './core/bulk'
import { isRating, isWeight } from './core/attributes'
import type { RomProject } from './core/rom'
import { rosterAverage } from './core/shownrating'
import { teamLabels } from './core/team'
import { NumberField } from './NumberField'
import { BULK_START, bulkSetup, people, type BulkForm, type BulkKept } from './pagedrafts'
import { useAttributeOrder } from './useColumnOrder'

const PREVIEW_LIMIT = 300

interface Props {
  project: RomProject
  onChange: (project: RomProject) => void
  // The form as it was left, kept while other pages show (pagedrafts.ts).
  kept: BulkKept | null
  onKeep: (kept: BulkKept) => void
}

export function BulkPage({ project, onChange, kept, onKeep }: Props) {
  const [form, setForm] = useState<BulkForm>(kept?.form ?? BULK_START)
  const [touched, setTouched] = useState(kept?.touched ?? false)
  const [notice, setNotice] = useState('')
  const edit = (part: Partial<BulkForm>) => {
    setForm({ ...form, ...part })
    setTouched(true)
    setNotice('')
  }
  const { group, team, atLeast, atMost } = form

  // Listed in the order the tables show the columns in.
  const order = useAttributeOrder(project.game, group === 'goalies' ? 'goalies' : 'skaters')
  const { attributes, chosen, values, ownBase, usable, steps, bases, change } = bulkSetup(project, form, order)
  // The attribute chosen is kept by its index, so that it is the same one whatever the order.
  useEffect(() => onKeep({ form: { ...form, attribute: chosen.index }, touched }), [form, touched, chosen.index, onKeep])
  const effects = previewBulk(project, change)
  const names = teamLabels(project.teams, project.game)
  const text = (value: number) => values.find((v) => v.value === value)?.text ?? String(value)

  // Each team's overall shown, set to its roster's average.
  const shownTeams = project.teams.flatMap((t, i) => (t.shownOverall === undefined ? [] : [i]))
  const shownChanges = shownTeams.flatMap((t) => {
    const to = rosterAverage(project.teams[t], project.game)
    return to === project.teams[t].shownOverall ? [] : [{ t, to }]
  })
  const labels = teamLabels(project.teams, project.game)
  function applyAverages() {
    const to = new Map(shownChanges.map(({ t, to }) => [t, to]))
    onChange({ ...project, teams: project.teams.map((team, t) => (to.has(t) ? { ...team, shownOverall: to.get(t) } : team)) })
  }

  return (
    <main className="team help">
      <h2>Bulk changes</h2>
      <p className="note">
        Changes one attribute for many players at once. Nothing happens until you press Apply, and the list below
        shows exactly who would change. Values stop at the ends of the attribute's range.
      </p>
      <div className="fields">
        <label>
          Who
          <select aria-label="Players to change" value={group} onChange={(e) => edit({ group: e.target.value as BulkForm['group'] })}>
            {BULK_GROUPS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          On
          <select className="wide" aria-label="Teams to change" value={team ?? ''} onChange={(e) => edit({ team: e.target.value === '' ? null : Number(e.target.value) })}>
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
          <select className="wide" aria-label="Attribute to change" value={chosen.index} onChange={(e) => edit({ attribute: Number(e.target.value) })}>
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
            value={usable}
            onChange={(e) => edit({ action: e.target.value as BulkForm['action'], amount: 1 })}
          >
            {BULK_ACTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
            {isWeight(chosen.kind) && <option value="fromBase">Convert from another era's weights</option>}
          </select>
        </label>
        <label>
          {usable === 'fromBase' ? 'Set for a base weight of' : steps ? 'Steps' : 'Value'}
          {usable === 'fromBase' ? (
            <select aria-label="Base weight the players were set for" value={change.amount} onChange={(e) => edit({ amount: Number(e.target.value) })}>
              {bases.map((base) => (
                <option key={base} value={base}>
                  {base}
                </option>
              ))}
            </select>
          ) : steps ? (
            <NumberField min={1} max={15} value={change.amount} onValue={(amount) => edit({ amount })} />
          ) : (
            <select aria-label="Value to use" value={change.amount} onChange={(e) => edit({ amount: Number(e.target.value) })}>
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
          <input className="num" inputMode="numeric" placeholder="any" value={atLeast} onChange={(e) => edit({ atLeast: e.target.value })} />
        </label>
        <label>
          and at most
          <input className="num" inputMode="numeric" placeholder="any" value={atMost} onChange={(e) => edit({ atMost: e.target.value })} />
        </label>
      </div>
      <p className="note">
        {usable === 'fromBase'
          ? `For players whose weights were set in a ROM with another base weight, such as a team brought in by spreadsheet. This ROM's weights start at ${ownBase} pounds. Each player is moved to the weight here nearest the pounds he had, which can be up to 4 pounds out.`
          : isRating(chosen.kind)
          ? 'A rating has seven steps, shown as the range the game displays for each. One step is one of those.'
          : chosen.kind === 'stickHandling95'
            ? "NHL '95 keeps stick handling in sixteen steps, 0 to 15 (in brackets), which play groups into the seven of the other ratings. One step is one of the sixteen."
          : chosen.kind === 'value'
            ? 'This ROM uses all sixteen values, 0 to 15. One step is one value.'
            : 'Weight goes in steps of 8 pounds.'}
      </p>
      <p>
        <button
          disabled={effects.length === 0}
          onClick={() => {
            onChange(applyBulk(project, change))
            setTouched(false)
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
      {shownTeams.length > 0 && (
        <>
          <h2>Overall shown</h2>
          <p className="note">
            The team rating the game shows on the matchup screens and the player cards is a stored number, so it does
            not change when rosters do. This sets every team's to the average overall rating of everyone on its roster,
            goalies included.
          </p>
          <p>
            <button disabled={shownChanges.length === 0} onClick={applyAverages}>
              Use each team's roster average
            </button>{' '}
            <span className="note">
              {shownChanges.length === 0
                ? 'Every team already shows its roster average.'
                : `${shownChanges.length === 1 ? '1 team changes' : `${shownChanges.length} teams change`}: ${shownChanges.map(({ t, to }) => `${labels[t]} ${project.teams[t].shownOverall} to ${to}`).join(', ')}.`}
            </span>
          </p>
        </>
      )}
    </main>
  )
}
