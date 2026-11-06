import { useMemo, useState } from 'react'
import { hex } from './core/bytes'
import { findPlayers, leagueAverages, lineAverages, teamSummaries, type SummaryColumn, type TeamSummary } from './core/league'
import type { RomProject } from './core/rom'
import { teamLabels } from './core/team'

const COLUMNS: { key: SummaryColumn; label: string; title: string; decimals: number }[] = [
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
const STANDS_OUT = { startingSkaters: 4, startingGoalie: 8, skaters: 4, forwards: 4, defence: 4, bestGoalie: 8 } as Partial<Record<SummaryColumn, number>>
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

interface Props {
  project: RomProject
  onGoToTeam: (team: number) => void
}

export function LeaguePage({ project, onGoToTeam }: Props) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ key: string; down: boolean }>({ key: 'team', down: false })
  const [everyLine, setEveryLine] = useState(false)
  const summaries = useMemo(() => teamSummaries(project), [project])
  const averages = useMemo(() => leagueAverages(summaries), [summaries])
  const linesAverage = useMemo(() => lineAverages(summaries), [summaries])
  const found = useMemo(() => findPlayers(project, search), [project, search])
  const names = teamLabels(project.teams, project.game)

  const number = (value: number | null, decimals: number) => (value === null ? '–' : value.toFixed(decimals))
  const split = (summary: TeamSummary, line: number) => {
    const rating = summary.lines[line]
    return rating && `Forwards ${number(rating.forwards, 1)}, defence ${number(rating.defence, 1)}`
  }
  const summaryColumns: Column[] = COLUMNS.map((column) => ({
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
  const columns = everyLine ? [summaryColumns[0], ...lineColumns, ...summaryColumns.slice(1)] : summaryColumns

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
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
    </main>
  )
}
