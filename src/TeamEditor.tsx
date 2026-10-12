import { useEffect, useState, type ReactNode } from 'react'
import { readClipboard, writeClipboard } from './clipboard'
import { attributeNote, attributeText, type AttributeKind } from './core/attributes'
import { hex } from './core/bytes'
import { copiedPlayerCount, copyLines, copyPlayers, pasteLines, pastePlayers } from './core/clipboard'
import type { GameConfig } from './core/games'
import { QUICK_EDIT_JERSEY_LABEL, QUICK_EDIT_KEY_LABELS, quickEdit } from './core/quickedit'
import { overallRating } from './core/rating'
import { resetTeamPart, teamPartChanged, type TeamPart } from './core/reset'
import {
  addPlayer,
  canAddPlayer,
  canDeletePlayer,
  deletePlayer,
  movePlayer,
  setForwards,
  setGoalieNibble,
} from './core/roster'
import { goalieCount, type Player, type Team } from './core/team'
import { gridKeyDown, stepKey, typedValue } from './gridKeys'
import { PaletteEditor, Preview } from './Palette'
import { ResetButton } from './ResetButton'
import { useNarrow } from './useNarrow'

const ATTRIBUTE_VALUES = Array.from({ length: 16 }, (_, i) => i)

// The game's font covers the printable ASCII characters only.
function cleanText(text: string): string {
  return text.replace(/[^\x20-\x7d]/g, '')
}

interface Props {
  game: GameConfig
  team: Team
  // The team as it is in the ROM that was opened, for resetting to.
  original: Team
  // Whether anything about the team, its pictures included, has been changed.
  changed: boolean
  onResetAll: () => void
  onChange: (team: Team) => void
  // Whether attributes show as the numbers stored in the ROM instead of as text.
  rawAttributes: boolean
  onRawAttributesChange: (raw: boolean) => void
  // Whether keyboard keys adjust the ticked players' attributes.
  quickKeys: boolean
  onQuickKeysChange: (on: boolean) => void
  // The order the roster tables are shown in. It never changes the roster itself.
  rosterSort: RosterSort
  onRosterSortChange: (sort: RosterSort) => void
  otherTeams: { teamName: string; index: number }[]
  // Moves players to another team. Returns a message if it cannot be done.
  onMovePlayers: (indexes: number[], to: number) => string
  // Players held on no team, to sign from, and how many there are to release to.
  freeAgents: { name: string; role: string; overall: number }[]
  // Releases players to the free agents, or signs one of them, a goalie
  // taking the place of the goalie ticked. Each returns a message if it cannot be done.
  onRelease: (indexes: number[]) => string
  onSign: (agent: number, goalies: number[]) => string
  // Saves the roster as a picture to post.
  onRosterCard: () => void
  // Positions on each line that this ROM leaves empty on every team.
  emptySlots: boolean[][]
  // Shown at the end of the page: the team's logos and banners.
  footer?: ReactNode
}

export type RosterSort = 'roster' | 'name' | 'jersey' | 'overall'

const ROSTER_SORTS: { value: RosterSort; label: string }[] = [
  { value: 'roster', label: 'Roster order' },
  { value: 'name', label: 'Name' },
  { value: 'jersey', label: 'Jersey number' },
  { value: 'overall', label: 'Overall rating, best first' },
]

export function TeamEditor(props: Props) {
  const { game, team, onChange, rawAttributes, onRawAttributesChange, quickKeys, onQuickKeysChange } = props
  const { rosterSort, onRosterSortChange, otherTeams, onMovePlayers, footer, original, emptySlots } = props
  const goalies = goalieCount(team)
  // Roster rows ticked for copying and pasting. Undo can shorten the roster
  // under them, so ticks past its end are dropped.
  const [allTicked, setTicked] = useState<number[]>([])
  const ticked = allTicked.filter((index) => index < team.players.length)
  const [notice, setNotice] = useState('')
  const [nameFilter, setNameFilter] = useState('')
  // On a narrow window, the players whose cards are open for editing.
  const narrow = useNarrow()
  const [openCards, setOpenCards] = useState<number[]>([])
  const [moveTo, setMoveTo] = useState(otherTeams[0]?.index ?? 0)
  const [signing, setSigning] = useState(0)

  function releaseTicked() {
    const count = ticked.length
    const problem = props.onRelease(ticked)
    if (!problem) setTicked([])
    setNotice(problem || `Released ${count === 1 ? '1 player' : `${count} players`} to the free agents.`)
  }

  function sign() {
    const agent = props.freeAgents[Math.min(signing, props.freeAgents.length - 1)]
    const problem = props.onSign(Math.min(signing, props.freeAgents.length - 1), ticked.filter((index) => index < goalies))
    if (!problem) setTicked([])
    setNotice(problem || `Signed ${agent.name}.`)
  }
  const plainView = rosterSort === 'roster' && nameFilter.trim() === ''

  function moveTicked() {
    const count = ticked.length
    const problem = onMovePlayers(ticked, moveTo)
    if (!problem) setTicked([])
    const destination = otherTeams.find((other) => other.index === moveTo)?.teamName
    setNotice(problem || `Moved ${count === 1 ? '1 player' : `${count} players`} to ${destination}.`)
  }

  // Roster positions shift when players move, so the ticks are cleared.
  function changeRoster(next: Team) {
    setTicked([])
    onChange(next)
  }

  async function copyTicked() {
    await writeClipboard(copyPlayers(team, ticked))
    setNotice(`Copied ${ticked.length === 1 ? team.players[ticked[0]].name : `${ticked.length} players`}.`)
  }

  async function pasteOverTicked(attributesOnly: boolean) {
    try {
      const text = await readClipboard()
      onChange(pastePlayers(team, ticked, text, attributesOnly))
      const count = copiedPlayerCount(text)
      const repeated = ticked.length > count ? ', repeating them to fill the rows' : ''
      setNotice(`Pasted ${attributesOnly ? 'the attributes of ' : ''}${count === 1 ? '1 player' : `${count} players`}${repeated}.`)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
    }
  }

  const [tickedLines, setTickedLines] = useState<number[]>([])
  const [lineNotice, setLineNotice] = useState('')

  async function copyTickedLines() {
    await writeClipboard(copyLines(team, tickedLines))
    setLineNotice(`Copied ${tickedLines.length === 1 ? '1 line' : `${tickedLines.length} lines`}.`)
  }

  async function pasteOverTickedLines() {
    try {
      onChange(pasteLines(team, tickedLines, await readClipboard()))
      setLineNotice('Pasted.')
    } catch (e) {
      setLineNotice(e instanceof Error ? e.message : String(e))
    }
  }

  // Quick edit keys act on the ticked players unless the user is typing in a field.
  useEffect(() => {
    if (!quickKeys) return
    function onKeyDown(event: KeyboardEvent) {
      const typing = (event.target as HTMLElement).matches('input:not([type=checkbox]), select, textarea')
      if (typing || event.ctrlKey || event.altKey || event.metaKey || ticked.length === 0) return
      const kindsFor = (index: number) =>
        rawAttributes ? null : index < goalies ? game.goalieAttributeKinds : game.playerAttributeKinds
      const next = quickEdit(team, ticked, event.code, event.shiftKey, kindsFor)
      if (!next) return
      event.preventDefault()
      onChange(next)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const fewerSkaters = emptySlots.some((slots) => slots.some(Boolean))
  // Some hacks' attributes have no wording but the values stored.
  const storedOnly = game.playerAttributeKinds.every((kind) => kind !== 'rating')
  const lineTick = (l: number) => (
    <input
      type="checkbox"
      title="Select for copy and paste"
      aria-label={`Select line ${game.lineLabels[l]}`}
      checked={tickedLines.includes(l)}
      onChange={(e) => setTickedLines(e.target.checked ? [...tickedLines, l].sort((a, b) => a - b) : tickedLines.filter((i) => i !== l))}
    />
  )
  const lineBox = (l: number, slot: number, line: number[]) => (
    <select
      aria-label={`${game.linePositionLabels[slot]} on line ${game.lineLabels[l]}`}
      value={line[slot]}
      onChange={(e) => setLineSlot(l, slot, Number(e.target.value))}
    >
      {emptySlots[l]?.[slot] && <option value={0}>Empty</option>}
      {(line[slot] === 0 && !emptySlots[l]?.[slot]) || line[slot] > team.players.length ? (
        <option value={line[slot]}>Invalid ({hex(line[slot])})</option>
      ) : null}
      {team.players.map((player, i) => (
        <option key={i} value={i + 1}>
          {hex(player.jersey)} {player.name}
        </option>
      ))}
    </select>
  )

  const reset = (part: TeamPart, what: string) => (
    <ResetButton
      what={what}
      changed={teamPartChanged(team, original, part)}
      onReset={() => (part === 'roster' ? changeRoster : onChange)(resetTeamPart(team, original, part))}
    />
  )

  function setPlayer(index: number, player: Player) {
    onChange({ ...team, players: team.players.map((p, i) => (i === index ? player : p)) })
  }

  function setLineSlot(line: number, slot: number, value: number) {
    const lines = team.lines.map((l, i) => (i === line ? l.map((v, s) => (s === slot ? value : v)) : l))
    onChange({ ...team, lines })
  }

  function attributeTitle(name: string, kind: AttributeKind, index: number): string {
    const title = attributeNote(kind) ? `${name} (${attributeNote(kind)})` : name
    return quickKeys ? `${title} [${QUICK_EDIT_KEY_LABELS[index]}]` : title
  }

  function roster(title: string, isGoalies: boolean, from: number, to: number) {
    const labels = isGoalies ? game.goalieAttributeLabels : game.playerAttributeLabels
    const names = isGoalies ? game.goalieAttributeNames : game.playerAttributeNames
    const kinds = isGoalies ? game.goalieAttributeKinds : game.playerAttributeKinds
    // The rows to show, as roster positions, after filtering and sorting.
    const wanted = nameFilter.trim().toLowerCase()
    const sortKey: Record<RosterSort, (index: number) => string | number> = {
      roster: (index) => index,
      name: (index) => team.players[index].name.toLowerCase(),
      jersey: (index) => team.players[index].jersey,
      overall: (index) => -overallRating(team.players[index].attributes, isGoalies, game),
    }
    const key = sortKey[rosterSort]
    const shown = Array.from({ length: to - from }, (_, row) => from + row)
      .filter((index) => team.players[index].name.toLowerCase().includes(wanted))
      .sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : a - b))
    const moveHint = plainView ? '' : ' (show the roster in roster order, unfiltered, to move players)'
    const position = (index: number) => (index < goalies ? 'G' : index - goalies < team.forwards ? 'F' : 'D')
    const overall = (index: number) => overallRating(team.players[index].attributes, isGoalies, game)
    const tickBox = (index: number) => (
      <input
        type="checkbox"
        title="Select for copy and paste"
        aria-label={`Select ${team.players[index].name}`}
        checked={ticked.includes(index)}
        onChange={(e) => setTicked(e.target.checked ? [...ticked, index].sort((a, b) => a - b) : ticked.filter((i) => i !== index))}
      />
    )
    const nameBox = (index: number) => {
      const player = team.players[index]
      return (
        <input
          className="name"
          aria-label={`Name of player ${index + 1}`}
          value={player.name}
          onChange={(e) => setPlayer(index, { ...player, name: cleanText(e.target.value) })}
        />
      )
    }
    const numberBox = (index: number) => {
      const player = team.players[index]
      return (
        <input
          className="num"
          aria-label={`Jersey number of ${player.name}`}
          inputMode="numeric"
          value={hex(player.jersey)}
          maxLength={2}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '')
            setPlayer(index, { ...player, jersey: parseInt(digits || '0', 16) })
          }}
        />
      )
    }
    const attributeBox = (index: number, a: number) => {
      const player = team.players[index]
      const value = player.attributes[a]
      const allowed = (v: number) => v >= 0 && v <= 15 && (rawAttributes || attributeText(kinds[a], v) !== null)
      const set = (next: number) => setPlayer(index, { ...player, attributes: player.attributes.map((v, i) => (i === a ? next : v)) })
      return (
        <select
          className={attributeText(kinds[a], value) === null ? 'attribute invalid' : 'attribute'}
          aria-label={`${names[a]} of ${player.name}`}
          value={value}
          onChange={(e) => set(Number(e.target.value))}
          onKeyDown={(e) => {
            // Plus and minus step to the next value the list offers, and stop at its ends.
            const step = stepKey(e)
            if (step !== 0) {
              e.preventDefault()
              let next = value + step
              while (next >= 0 && next <= 15 && !allowed(next)) next += step
              if (allowed(next)) set(next)
              return
            }
            // Where the stored values are showing, typing one sets it.
            if (!rawAttributes && kinds[a] !== 'value') return
            const typed = typedValue(e, allowed)
            if (typed === null) return
            e.preventDefault()
            set(typed)
          }}
        >
          {ATTRIBUTE_VALUES.map((v) => {
            const text = attributeText(kinds[a], v)
            // As text, values the game does not expect are only offered if already in use.
            if (!rawAttributes && text === null && v !== value) return null
            return (
              <option key={v} value={v}>
                {rawAttributes ? v : (text ?? `! ${v}`)}
              </option>
            )
          })}
        </select>
      )
    }
    const actions = (index: number) => (
      <>
        <button title={`Move up${moveHint}`} disabled={!plainView || index === 0} onClick={() => changeRoster(movePlayer(team, index, -1))}>
          ↑
        </button>
        <button
          title={`Move down${moveHint}`}
          disabled={!plainView || index === team.players.length - 1}
          onClick={() => changeRoster(movePlayer(team, index, 1))}
        >
          ↓
        </button>
        {index >= goalies && (
          <button title="Delete player" disabled={!canDeletePlayer(team, index)} onClick={() => changeRoster(deletePlayer(team, index))}>
            ✕
          </button>
        )}
      </>
    )

    // On a narrow window each player is a card: a line to read, opened to edit.
    if (narrow) {
      return (
        <section>
          <h2>{title}</h2>
          <div className="cards">
            {shown.map((index) => {
              const open = openCards.includes(index)
              return (
                <div key={index} className={open ? 'card open' : 'card'}>
                  <div className="card-head">
                    {tickBox(index)}
                    <span className="card-place">
                      {index + 1} {position(index)}
                    </span>
                    {nameBox(index)}
                    <button
                      className="card-toggle"
                      aria-expanded={open}
                      aria-label={`${open ? 'Close' : 'Open'} ${team.players[index].name}, overall ${overall(index)}`}
                      onClick={() => setOpenCards(open ? openCards.filter((i) => i !== index) : [...openCards, index])}
                    >
                      {overall(index)} {open ? '▴' : '▾'}
                    </button>
                  </div>
                  {open && (
                    <div className="card-body">
                      <label>
                        <span>Jersey number</span>
                        {numberBox(index)}
                      </label>
                      {names.map((name, a) => (
                        <label key={a}>
                          <span>{name}</span>
                          {attributeBox(index, a)}
                        </label>
                      ))}
                      <div className="actions">{actions(index)}</div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )
    }

    return (
      <section>
        <h2>{title}</h2>
        <div className="scroll">
          <table onKeyDown={gridKeyDown}>
            <thead>
              <tr>
                <th />
                <th>#</th>
                <th>Pos</th>
                <th className="pin">Name</th>
                <th>No.</th>
                <th>Ovr</th>
                {labels.map((label, i) => (
                  <th key={i} title={attributeTitle(names[i], kinds[i], i)}>
                    {label}
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((index) => (
                <tr key={index}>
                  <td>{tickBox(index)}</td>
                  <td>{index + 1}</td>
                  <td>{position(index)}</td>
                  <td className="pin">{nameBox(index)}</td>
                  <td>{numberBox(index)}</td>
                  <td>{overall(index)}</td>
                  {team.players[index].attributes.map((_, a) => (
                    <td key={a}>{attributeBox(index, a)}</td>
                  ))}
                  <td className="actions">{actions(index)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    )
  }

  return (
    <main className="team">
      {game.notice && <p className="notice">{game.notice}</p>}
      {fewerSkaters && (
        <p className="notice">
          This ROM is a hack that puts fewer skaters on the ice. Such ROMs are played with line changes off, and are
          known to crash with them on, so only the first line (NLC) is used. Editing them has been tested less widely
          than editing the original game, so keep a copy of the file you opened.
        </p>
      )}
      <section>
        <h2>Team</h2>
        <p>
          <ResetButton what="whole team" changed={props.changed} onReset={props.onResetAll} /> {reset('names', 'names')}{' '}
          <span className="note">
            Each Reset button puts one thing back to how it is in the ROM you opened and leaves the rest alone.
          </span>
        </p>
        <div className="fields">
          {game.teamNameLabels.map((label, i) => (
            <label key={i}>
              {label}
              <input
                value={team.names[i]}
                onChange={(e) =>
                  onChange({ ...team, names: team.names.map((n, j) => (j === i ? cleanText(e.target.value) : n)) })
                }
              />
            </label>
          ))}
        </div>
        <div className="fields">
          <label>
            Forwards
            <input
              className="num"
              type="number"
              min={0}
              max={15}
              value={team.forwards}
              onChange={(e) => onChange(setForwards(team, Number(e.target.value) || 0))}
            />
          </label>
          <label>
            Goalie bytes
            <span>
              {team.goalieNibbles.map((value, i) => (
                <input
                  key={i}
                  className="num"
                  type="number"
                  min={0}
                  max={15}
                  value={value}
                  onChange={(e) => changeRoster(setGoalieNibble(team, i, Number(e.target.value) || 0))}
                />
              ))}
            </span>
          </label>
        </div>
        <p className="note">
          {team.players.length} players: {goalies} goalies, {team.forwards} forwards, {team.defense} defence. The
          first skaters on the roster are the forwards. The roster's first players are goalies, one for each goalie
          byte up to the last that is not zero.
        </p>
      </section>

      <p>
        {!storedOnly && (
          <label>
            <input type="checkbox" checked={rawAttributes} onChange={(e) => onRawAttributesChange(e.target.checked)} />{' '}
            Show attributes as stored values (0–15)
          </label>
        )}{' '}
        <label>
          <input type="checkbox" checked={quickKeys} onChange={(e) => onQuickKeysChange(e.target.checked)} /> Quick
          edit keys
        </label>
      </p>
      {quickKeys && (
        <p className="note">
          With players ticked, the keys {QUICK_EDIT_KEY_LABELS.slice(0, 13).join(' ')} and Backspace each raise one
          attribute, in column order from {game.playerAttributeLabels[0]} to {game.playerAttributeLabels[13]}. Hold Shift
          to lower it. The {QUICK_EDIT_JERSEY_LABEL} keys change the jersey number. Hover a column heading to see its key.
        </p>
      )}
      <p>
        <button disabled={ticked.length === 0} onClick={() => void copyTicked()}>
          Copy ticked
        </button>{' '}
        <button disabled={ticked.length === 0} onClick={() => void pasteOverTicked(false)}>
          Paste over ticked
        </button>{' '}
        <button disabled={ticked.length === 0} onClick={() => void pasteOverTicked(true)}>
          Paste attributes only
        </button>{' '}
        <span className="note">{notice || 'Tick players to copy them, or to choose which ones a paste replaces.'}</span>
      </p>
      <p className="note" hidden={narrow}>
        In the tables, the arrow keys and Enter move from box to box, as in a spreadsheet. Hold Alt with the down
        arrow to open a list. In an attribute's list, + and - raise and lower it
        {storedOnly || rawAttributes ? ', and typing a number sets it' : ''}.
      </p>
      <p>
        {reset('roster', 'roster')}{' '}
        <span className="note">The players, their order and attributes, and the forwards and goalie bytes.</span>
      </p>
      <p>
        <button disabled={ticked.length === 0 || otherTeams.length === 0} onClick={moveTicked}>
          Move ticked to
        </button>{' '}
        <select className="wide" aria-label="Team to move players to" value={moveTo} onChange={(e) => setMoveTo(Number(e.target.value))}>
          {otherTeams.map((other) => (
            <option key={other.index} value={other.index}>
              {other.teamName}
            </option>
          ))}
        </select>{' '}
        <button disabled={ticked.length === 0} onClick={releaseTicked}>
          Release ticked
        </button>
      </p>
      <p>
        <button disabled={props.freeAgents.length === 0} onClick={sign}>
          Sign
        </button>{' '}
        <select
          className="wide"
          aria-label="Free agent to sign"
          disabled={props.freeAgents.length === 0}
          value={Math.min(signing, Math.max(0, props.freeAgents.length - 1))}
          onChange={(e) => setSigning(Number(e.target.value))}
        >
          {props.freeAgents.length === 0 && <option value={0}>no free agents</option>}
          {props.freeAgents.map((agent, i) => (
            <option key={i} value={i}>
              {agent.role} {agent.name} ({agent.overall})
            </option>
          ))}
        </select>{' '}
        <span className="note">
          Released players wait as free agents, off every team and out of the ROM. To sign a goalie, tick the goalie
          he replaces.
        </span>
      </p>
      <p>
        <button onClick={props.onRosterCard}>Roster card (PNG)</button>{' '}
        <span className="note">The roster as a picture, to post where the league can see it.</span>
      </p>
      <p>
        <label>
          Show in order of{' '}
          <select className="wide" value={rosterSort} onChange={(e) => onRosterSortChange(e.target.value as RosterSort)}>
            {ROSTER_SORTS.map((sort) => (
              <option key={sort.value} value={sort.value}>
                {sort.label}
              </option>
            ))}
          </select>
        </label>{' '}
        <label>
          Find{' '}
          <input placeholder="part of a name" value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} />
        </label>{' '}
        {!plainView && <span className="note">This changes only what is shown, not the roster.</span>}
      </p>
      {roster('Goalies', true, 0, goalies)}
      {roster('Skaters', false, goalies, team.players.length)}
      <p>
        <button disabled={!canAddPlayer(team)} onClick={() => onChange(addPlayer(team))}>
          Add player
        </button>
      </p>

      <section>
        <h2>Lines</h2>
        <p>
          <button disabled={tickedLines.length === 0} onClick={() => void copyTickedLines()}>
            Copy ticked
          </button>{' '}
          <button disabled={tickedLines.length === 0} onClick={() => void pasteOverTickedLines()}>
            Paste over ticked
          </button>{' '}
          {reset('lines', 'lines')}{' '}
          <span className="note">
            {lineNotice || 'Lines are copied as roster positions, so they suit a team with the same roster order.'}
          </span>
        </p>
        {fewerSkaters && (
          <p className="note">
            This ROM puts fewer skaters on the ice, so some positions are empty on every team. Leave them empty unless
            you know the ROM uses them. Only the NLC line is played.
          </p>
        )}
        {narrow ? (
          <div className="cards">
            {team.lines.map((line, l) => (
              <div key={l} className="card open">
                <div className="card-head">
                  {lineTick(l)}
                  <strong>{game.lineLabels[l]}</strong>
                </div>
                <div className="card-body">
                  {game.linePositionLabels.map((label, slot) => (
                    <label key={slot}>
                      <span>{label}</span>
                      {lineBox(l, slot, line)}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="scroll">
            <table onKeyDown={gridKeyDown}>
              <thead>
                <tr>
                  <th />
                  <th>Line</th>
                  {game.linePositionLabels.map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {team.lines.map((line, l) => (
                  <tr key={l}>
                    <td>{lineTick(l)}</td>
                    <td>{game.lineLabels[l]}</td>
                    {game.linePositionLabels.map((_, slot) => (
                      <td key={slot}>{lineBox(l, slot, line)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {['Home', 'Away'].map((label, strip) => {
        const colors = team.palette.slice(strip * 16, strip * 16 + 16)
        const other = team.palette.slice((1 - strip) * 16, (1 - strip) * 16 + 16)
        const setColors = (next: number[]) =>
          onChange({ ...team, palette: strip === 0 ? [...next, ...other] : [...other, ...next] })
        return (
          <section key={label}>
            <h2>{label} colours</h2>
            <div className="strip">
              <Preview template="strip" palette={colors} scale={3} />
              <Preview template="sprites" palette={colors} scale={2} />
              <div>
                <PaletteEditor palette={colors} labels={game.stripColorLabels} onChange={setColors} />
                <button onClick={() => setColors(other)}>Copy from {strip === 0 ? 'away' : 'home'}</button>{' '}
                {reset(strip === 0 ? 'home' : 'away', `${label.toLowerCase()} colours`)}
              </div>
            </div>
          </section>
        )
      })}
      {footer}
    </main>
  )
}
