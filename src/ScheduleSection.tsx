import { useMemo, useState } from 'react'
import { formatCsv } from './core/csv'
import { isAllStarTeam } from './core/league'
import type { RomProject } from './core/rom'
import { makeSchedule, ScheduleError, scheduleRows, type Schedule } from './core/schedule'
import { teamDisplayName } from './core/team'
import { download } from './download'

// The League page's schedule maker (schedule.ts): the league's teams, how often each pair meets, optional groups,
// and a schedule of game days to save as a spreadsheet. The ROM is not changed.
export function ScheduleSection({ project }: { project: RomProject }) {
  const offered = project.settings.menuTeams?.offered ?? project.teams.length
  const names = project.teams.map(teamDisplayName)
  const [chosen, setChosen] = useState<Set<number>>(() => new Set(names.flatMap((name, team) => (team < offered && !isAllStarTeam(name) ? [team] : []))))
  const [groups, setGroups] = useState<Record<number, string>>({})
  const [within, setWithin] = useState('4')
  const [between, setBetween] = useState('4')
  const [seed, setSeed] = useState(1)

  const result = useMemo((): { schedule: Schedule } | { error: string } => {
    try {
      const teams = [...chosen].sort((a, b) => a - b).map((team) => ({ team, name: names[team], group: groups[team] ?? '' }))
      return { schedule: makeSchedule({ teams, withinGroup: Number(within), betweenGroups: Number(between), seed }) }
    } catch (e) {
      return { error: e instanceof ScheduleError ? e.message : String(e) }
    }
  }, [chosen, groups, within, between, seed, names])
  const anyGroups = [...chosen].some((team) => (groups[team] ?? '').trim() !== '')

  const toggle = (team: number) => {
    const next = new Set(chosen)
    if (next.has(team)) next.delete(team)
    else next.add(team)
    setChosen(next)
  }
  const number = (label: string, value: string, set: (v: string) => void) => (
    <label>
      {label} <input className="num" inputMode="numeric" aria-label={label} value={value} onChange={(e) => set(e.target.value)} />
    </label>
  )

  return (
    <section>
      <h3>Schedule maker</h3>
      <p className="note">
        Makes a regular season for the teams ticked: each pair of teams meets as many times as you say (more often
        within a group, if you give teams groups), home and away are shared out as evenly as they can be, and the games
        are laid out in game days in which no team plays twice. <b>Mix again</b> gives another order of the same games.{' '}
        <b>Save as a spreadsheet</b> gives a CSV file of the games, numbered, with their day, home team and visitors, for
        your league's site. Nothing in the ROM changes.
      </p>
      <p>
        {number(anyGroups ? 'Times two teams of one group meet' : 'Times each pair of teams meets', within, setWithin)}{' '}
        {anyGroups && number('Times two teams of different groups meet', between, setBetween)}{' '}
        <button onClick={() => setSeed(seed + 1)}>Mix again</button>{' '}
        <button
          disabled={'error' in result}
          onClick={() => 'schedule' in result && download(formatCsv(scheduleRows(result.schedule, (team) => names[team])), 'schedule.csv', 'text/csv')}
        >
          Save as a spreadsheet
        </button>
      </p>
      {'error' in result ? (
        <p className="error">{result.error}</p>
      ) : (
        <p className="note" role="status">
          {result.schedule.games.length} games in {result.schedule.days} game days.{' '}
          {(() => {
            const counts = [...result.schedule.totals.values()].map((t) => t.games)
            const [least, most] = [Math.min(...counts), Math.max(...counts)]
            return least === most ? `Every team plays ${least}.` : `Teams play from ${least} to ${most} games.`
          })()}
        </p>
      )}
      <table className="left">
        <thead>
          <tr>
            <th>In it</th>
            <th>Team</th>
            <th>Group</th>
            <th>Games</th>
            <th>Home</th>
            <th>Away</th>
          </tr>
        </thead>
        <tbody>
          {names.map((name, team) => {
            const totals = 'schedule' in result ? result.schedule.totals.get(team) : undefined
            return (
              <tr key={team}>
                <td>
                  <input type="checkbox" aria-label={`${name} in the schedule`} checked={chosen.has(team)} onChange={() => toggle(team)} />
                </td>
                <td>{name}</td>
                <td>
                  <input
                    className="short"
                    aria-label={`${name}'s group`}
                    placeholder="none"
                    value={groups[team] ?? ''}
                    disabled={!chosen.has(team)}
                    onChange={(e) => setGroups({ ...groups, [team]: e.target.value })}
                  />
                </td>
                <td>{totals?.games ?? ''}</td>
                <td>{totals?.home ?? ''}</td>
                <td>{totals?.away ?? ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
