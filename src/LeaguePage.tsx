import { useMemo, useState } from 'react'
import { hex } from './core/bytes'
import { findPlayers, isAllStarTeam, leagueAverages, leagueBalance, lineAverages, teamSummaries, type SummaryColumn, type TeamSummary } from './core/league'
import type { RomProject } from './core/rom'
import { teamDisplayName, teamLabels } from './core/team'

const COLUMNS: { key: SummaryColumn; label: string; title: string; decimals: number }[] = [
  {
    key: 'overall',
    label: 'Overall',
    title: "Average overall of every skater on the Sc1, Sc2 and Chk lines, each counted once, and the first line's goalie: the team as it plays with line changes",
    decimals: 1,
  },
  {
    key: 'strength',
    label: 'Strength',
    title:
      "Match Viewer's team strength, from the league value: 71% the average of the team's top four forwards, 15% its top three defencemen and 14% its best goalie. It explains about half of how strong the leagues' teams have played, where the game's Overall explains almost none. Genesis only; see Help",
    decimals: 1,
  },
  { key: 'startingSkaters', label: 'First line', title: 'Average overall of the skaters on the first line (NLC), the one that plays when line changes are off', decimals: 1 },
  { key: 'startingGoalie', label: 'Its goalie', title: 'Overall of the goalie on the first line', decimals: 0 },
  { key: 'skaters', label: 'Skaters', title: 'Average overall of every skater on the roster', decimals: 1 },
  { key: 'forwards', label: 'Forwards', title: 'Average overall of the forwards', decimals: 1 },
  { key: 'defence', label: 'Defence', title: 'Average overall of the defencemen', decimals: 1 },
  { key: 'bestGoalie', label: 'Best goalie', title: 'Highest overall among the goalies', decimals: 0 },
  { key: 'players', label: 'Players', title: 'Players on the roster', decimals: 0 },
  { key: 'goalies', label: 'Goalies', title: 'Goalies on the roster', decimals: 0 },
  { key: 'size', label: 'Bytes', title: 'Room the team takes in the ROM', decimals: 0 },
]

// More than this far from the league average is marked as standing out.
const STANDS_OUT = { overall: 4, strength: 4, startingSkaters: 4, startingGoalie: 8, skaters: 4, forwards: 4, defence: 4, bestGoalie: 8 } as Partial<Record<SummaryColumn, number>>
const LINE_STANDS_OUT = 4

// A column of the table: how to read it from a team's summary, its league
// average, how far from that stands out, and what a cell says on hover.
interface Column {
  id: string
  label: string
  title: string
  decimals: number
  value: (summary: TeamSummary) => number | null
  average: number | null
  standsOut?: number
  cellTitle?: (summary: TeamSummary) => string | undefined
}

const SEARCH_LIMIT = 200

// The ratings the league's balance can be measured by.
const BALANCE_BY: { key: SummaryColumn; label: string }[] = [
  { key: 'strength', label: 'Strength (from the league value)' },
  { key: 'overall', label: 'Overall (with line changes)' },
  { key: 'startingSkaters', label: 'First line (without line changes)' },
  { key: 'skaters', label: 'All skaters' },
]

interface Props {
  project: RomProject
  onGoToTeam: (team: number) => void
  // Moves skaters to another team, as on a team's page; returns a message if they cannot go.
  onMovePlayers: (from: number, indexes: number[], to: number) => string
}

export function LeaguePage({ project, onGoToTeam, onMovePlayers }: Props) {
  const [search, setSearch] = useState('')
  const [moved, setMoved] = useState<{ text: string; failed: boolean } | null>(null)
  const [sort, setSort] = useState<{ key: string; down: boolean }>({ key: 'team', down: false })
  const [everyLine, setEveryLine] = useState(false)
  const [pair, setPair] = useState<[number, number]>([0, Math.min(1, project.teams.length - 1)])
  const [balanceBy, setBalanceBy] = useState<SummaryColumn>('overall')
  const [withAllStars, setWithAllStars] = useState(false)
  const summaries = useMemo(() => teamSummaries(project), [project])
  const averages = useMemo(() => leagueAverages(summaries), [summaries])
  const linesAverage = useMemo(() => lineAverages(summaries), [summaries])
  const found = useMemo(() => findPlayers(project, search), [project, search])
  // The original games' All-Star teams are far above the rest; leagues that keep them do not play them.
  const allStars = useMemo(() => project.teams.flatMap((team, t) => (isAllStarTeam(teamDisplayName(team)) ? [t] : [])), [project.teams])
  const balance = useMemo(
    () => leagueBalance(withAllStars ? summaries : summaries.filter((s) => !allStars.includes(s.team)), balanceBy),
    [summaries, balanceBy, allStars, withAllStars],
  )
  const names = teamLabels(project.teams, project.game)

  const number = (value: number | null, decimals: number) => (value === null ? '–' : value.toFixed(decimals))
  const split = (summary: TeamSummary, line: number) => {
    const rating = summary.lines[line]
    return rating && `Forwards ${number(rating.forwards, 1)}, defence ${number(rating.defence, 1)}`
  }
  // Strength only where the ROM has it.
  const shownColumns = COLUMNS.filter((column) => column.key !== 'strength' || averages.strength !== null)
  const summaryColumns: Column[] = shownColumns.map((column) => ({
    ...column,
    id: column.key,
    value: (summary) => summary[column.key],
    average: averages[column.key],
    standsOut: STANDS_OUT[column.key],
    cellTitle: column.key === 'startingSkaters' ? (summary) => split(summary, 0) : undefined,
  }))
  // Every line after the first, for leagues that play with line changes.
  const lineColumns: Column[] = project.game.lineLabels.slice(1).map((label, i) => ({
    id: `line${i + 1}`,
    label,
    title: `Average overall of the skaters on the ${label} line. Point at a number to see its forwards and defence apart.`,
    decimals: 1,
    value: (summary) => summary.lines[i + 1]?.skaters ?? null,
    average: linesAverage[i + 1] ?? null,
    standsOut: LINE_STANDS_OUT,
    cellTitle: (summary) => split(summary, i + 1),
  }))
  // The line columns follow the first line's.
  const firstLine = summaryColumns.findIndex((column) => column.id === 'startingSkaters') + 1
  const columns = everyLine ? [...summaryColumns.slice(0, firstLine), ...lineColumns, ...summaryColumns.slice(firstLine)] : summaryColumns

  const sortBy = columns.find((column) => column.id === sort.key)
  const sorted = summaries.slice().sort((a, b) => {
    if (!sortBy) return a.team - b.team
    const [x, y] = [sortBy.value(a) ?? -Infinity, sortBy.value(b) ?? -Infinity]
    return (sort.down ? y - x : x - y) || a.team - b.team
  })
  const mark = (column: Column, value: number | null) => {
    const { standsOut: limit, average } = column
    if (limit === undefined || value === null || average === null) return undefined
    return value - average > limit ? 'high' : average - value > limit ? 'low' : undefined
  }

  return (
    <main className="team help">
      <h2>League</h2>
      <section>
        <h3>Find a player</h3>
        <p>
          <input
            className="wide-input"
            aria-label="Player name to find"
            placeholder="part of a name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />{' '}
          <span className="note">
            {search.trim() === ''
              ? 'Searches every team. Several words can be in any order.'
              : `${found.length === 1 ? '1 player' : `${found.length} players`} found.`}
          </span>
        </p>
        {found.length > 0 && (
          <table className="left">
            <thead>
              <tr>
                <th>Player</th>
                <th>Team</th>
                <th>Pos</th>
                <th>#</th>
                <th>Overall</th>
                <th>Move to</th>
              </tr>
            </thead>
            <tbody>
              {found.slice(0, SEARCH_LIMIT).map((p) => (
                <tr key={`${p.team}-${p.index}`}>
                  <td>{p.player.name}</td>
                  <td>
                    <button className="link" onClick={() => onGoToTeam(p.team)}>
                      {names[p.team]}
                    </button>
                  </td>
                  <td>{p.role}</td>
                  <td>{hex(p.player.jersey)}</td>
                  <td>{p.overall}</td>
                  <td>
                    <select
                      aria-label={`Move ${p.player.name} to`}
                      value=""
                      disabled={p.role === 'G'}
                      title={p.role === 'G' ? 'Goalies move by copying and pasting on the team pages.' : undefined}
                      onChange={(e) => {
                        const to = Number(e.target.value)
                        const problem = onMovePlayers(p.team, [p.index], to)
                        setMoved(
                          problem
                            ? { text: problem, failed: true }
                            : { text: `${p.player.name} moved from ${names[p.team]} to ${names[to]}, after its last ${p.role === 'F' ? 'forward' : 'defenceman'}. Undo takes it back.`, failed: false },
                        )
                      }}
                    >
                      <option value="">{p.role === 'G' ? 'goalie' : 'team…'}</option>
                      {project.teams.map((_, t) =>
                        t === p.team ? null : (
                          <option key={t} value={t}>
                            {names[t]}
                          </option>
                        ),
                      )}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {moved && <p className={moved.failed ? 'error' : 'note'}>{moved.text}</p>}
        {found.length > SEARCH_LIMIT && <p className="note">Only the first {SEARCH_LIMIT} are shown. Type more of the name.</p>}
      </section>

      <section>
        <h3>How the teams compare</h3>
        <p className="note">
          {project.game.overallIsEstimate
            ? 'This ROM works out overall ratings in its own way, so these are plain averages of each player\'s values: good for comparing teams, not what the game shows.'
            : 'Overall ratings as the game shows them, averaged.'} Click a heading to sort by it, and a team to go to it.
          Numbers well above the league average are marked <span className="high">like this</span> and those well
          below <span className="low">like this</span>.
        </p>
        <p>
          <label>
            <input type="checkbox" checked={everyLine} onChange={(e) => setEveryLine(e.target.checked)} /> Show every line,
            for leagues that play with line changes
          </label>
        </p>
        <div className="scroll">
        <table>
          <thead>
            <tr>
              <th className="pin">
                <button className="link" onClick={() => setSort({ key: 'team', down: false })}>
                  Team
                </button>
              </th>
              {columns.map((column) => (
                <th key={column.id} title={column.title}>
                  <button
                    className="link"
                    onClick={() => setSort({ key: column.id, down: sort.key === column.id ? !sort.down : true })}
                  >
                    {column.label}
                    {sort.key === column.id && (sort.down ? ' ▼' : ' ▲')}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((summary) => (
              <tr key={summary.team}>
                <td className="team-name pin">
                  <button className="link" onClick={() => onGoToTeam(summary.team)}>
                    {names[summary.team]}
                  </button>
                </td>
                {columns.map((column) => (
                  <td key={column.id} className={mark(column, column.value(summary))} title={column.cellTitle?.(summary)}>
                    {number(column.value(summary), column.decimals)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th className="pin">League average</th>
              {columns.map((column) => (
                <th key={column.id}>{number(column.average, 1)}</th>
              ))}
            </tr>
          </tfoot>
        </table>
        </div>
      </section>

      <Matchup project={project} summaries={summaries} names={names} pair={pair} onPair={setPair} onGoToTeam={onGoToTeam} />

      <section>
        <h3>League balance</h3>
        <p>
          <label>
            Measured by{' '}
            <select value={balanceBy} onChange={(e) => setBalanceBy(e.target.value as SummaryColumn)}>
              {BALANCE_BY.filter((by) => by.key !== 'strength' || averages.strength !== null).map((by) => (
                <option key={by.key} value={by.key}>
                  {by.label}
                </option>
              ))}
            </select>
          </label>
          {allStars.length > 0 && (
            <>
              {' '}
              <label>
                <input type="checkbox" checked={withAllStars} onChange={(e) => setWithAllStars(e.target.checked)} /> Count the
                All-Star teams
              </label>
            </>
          )}
        </p>
        {balance ? (
          <>
            <p>
              Average <b>{balance.average.toFixed(1)}</b>; the best team is <b>{balance.spread.toFixed(1)}</b> above the
              weakest; standard deviation <b>{balance.deviation.toFixed(1)}</b>.{' '}
              <span className="note">
                The smaller these two are, the more even the league. Teams more than one standard deviation from the
                average are marked.
              </span>
            </p>
            <div className="scroll">
              <table className="balance">
                <thead>
                  <tr>
                    <th className="pin">Team</th>
                    <th>Rating</th>
                    <th>From average</th>
                    <th aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>
                  {balance.ranked.map((entry, _, ranked) => {
                    const widest = Math.max(Math.abs(ranked[0].fromAverage), Math.abs(ranked[ranked.length - 1].fromAverage), 0.1)
                    const share = (Math.abs(entry.fromAverage) / widest) * 50
                    const marked = entry.deviations > 1 ? 'high' : entry.deviations < -1 ? 'low' : undefined
                    return (
                      <tr key={entry.team}>
                        <td className="team-name pin">
                          <button className="link" onClick={() => onGoToTeam(entry.team)}>
                            {names[entry.team]}
                          </button>
                        </td>
                        <td className={marked}>{entry.value.toFixed(1)}</td>
                        <td className={marked}>{(entry.fromAverage >= 0 ? '+' : '') + entry.fromAverage.toFixed(1)}</td>
                        <td aria-hidden="true">
                          <div className="bar-track">
                            <div
                              className={`bar ${entry.fromAverage >= 0 ? 'above' : 'below'}`}
                              style={entry.fromAverage >= 0 ? { left: '50%', width: `${share}%` } : { right: '50%', width: `${share}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="note">Fewer than two teams have this rating.</p>
        )}
      </section>
    </main>
  )
}

interface MatchupProps {
  project: RomProject
  summaries: TeamSummary[]
  names: string[]
  pair: [number, number]
  onPair: (pair: [number, number]) => void
  onGoToTeam: (team: number) => void
}

// Two teams' ratings next to each other: for a playoff series, or a trade's
// effect on the balance between two teams.
function Matchup({ project, summaries, names, pair, onPair, onGoToTeam }: MatchupProps) {
  const [a, b] = pair.map((t) => summaries[Math.min(t, summaries.length - 1)])
  const rows: { label: string; title: string; value: (s: TeamSummary) => number | null; decimals: number }[] = [
    ...(summaries.some((s) => s.strength !== null)
      ? [{ label: 'Strength', title: COLUMNS.find((c) => c.key === 'strength')!.title, value: (s: TeamSummary) => s.strength, decimals: 1 }]
      : []),
    { label: 'Overall', title: COLUMNS[0].title, value: (s) => s.overall, decimals: 1 },
    ...project.game.lineLabels.map((label, l) => ({
      label: `${label} line`,
      title: `Average overall of the skaters on the ${label} line`,
      value: (s: TeamSummary) => s.lines[l]?.skaters ?? null,
      decimals: 1,
    })),
    { label: 'Goalie', title: 'Overall of the goalie on the first line', value: (s) => s.startingGoalie, decimals: 0 },
    { label: 'Forwards', title: 'Average overall of every forward on the roster', value: (s) => s.forwards, decimals: 1 },
    { label: 'Defence', title: 'Average overall of every defenceman on the roster', value: (s) => s.defence, decimals: 1 },
    { label: 'Best goalie', title: 'Highest overall among the goalies', value: (s) => s.bestGoalie, decimals: 0 },
  ]
  const pick = (side: 0 | 1) => (
    <select
      aria-label={side === 0 ? 'First team to compare' : 'Second team to compare'}
      value={pair[side]}
      onChange={(e) => onPair(side === 0 ? [Number(e.target.value), pair[1]] : [pair[0], Number(e.target.value)])}
    >
      {names.map((name, t) => (
        <option key={t} value={t}>
          {name}
        </option>
      ))}
    </select>
  )
  const text = (value: number | null, decimals: number) => (value === null ? '–' : value.toFixed(decimals))
  return (
    <section>
      <h3>Two teams side by side</h3>
      <p>
        {pick(0)} against {pick(1)}
      </p>
      <div className="scroll">
        <table className="matchup">
          <thead>
            <tr>
              <th className="pin" />
              {[a, b].map((s, i) => (
                <th key={i}>
                  <button className="link" onClick={() => onGoToTeam(s.team)}>
                    {names[s.team]}
                  </button>
                </th>
              ))}
              <th title="The first team's rating less the second's">Difference</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const [x, y] = [row.value(a), row.value(b)]
              const difference = x === null || y === null ? null : x - y
              const ahead = (mine: number | null, theirs: number | null) => (mine !== null && theirs !== null && mine > theirs ? 'high' : undefined)
              return (
                <tr key={row.label}>
                  <th className="pin" title={row.title}>
                    {row.label}
                  </th>
                  <td className={ahead(x, y)}>{text(x, row.decimals)}</td>
                  <td className={ahead(y, x)}>{text(y, row.decimals)}</td>
                  <td>{difference === null ? '–' : (difference > 0 ? '+' : '') + difference.toFixed(1)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="note">The higher of the two in each row is marked. Lines are rated by their skaters.</p>
    </section>
  )
}
